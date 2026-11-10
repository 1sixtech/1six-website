#!/usr/bin/env node
// Pull published articles from the public 1six-researchs repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ASSET_EXTENSIONS } from '../src/lib/writingAssets.mjs';
import { isDraftArticle } from '../src/lib/writingDraft.mjs';
import { isArticleSlug } from '../src/lib/writingSlug.mjs';

const REPO = '1sixtech/1six-researchs';
const REF = process.env.WRITING_GIT_REF || 'main';
// Optional and read-only. Without one, GitHub allows 60 API requests an hour per
// address, and a hosted build shares its address with other builds.
const TOKEN = process.env.WRITING_GITHUB_TOKEN?.trim();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content/writing');
const publicRoot = path.join(root, 'public/writing-assets');

const GITHUB_API_HEADERS = {
  'User-Agent': '1six-website',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const NUMBERED_FOLDER = /^[0-9]{3}-/;

// Git lists a symbolic link as a file sized by its target's path, and the two download
// hosts answer differently for one, so the type and size checks could not vouch for it.
const SYMLINK_MODE = '120000';

const MAX_ASSET_MB = 5;
const MAX_ASSET_BYTES = MAX_ASSET_MB * 1024 * 1024;
// Every download is held in memory until the last one arrives, and Git stores a
// repeated file once, so many small entries in the listing can still be many gigabytes.
const MAX_TOTAL_MB = 200;
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;

const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const BACKOFF_BASE_MS = 1000;
const RESET_MARGIN_MS = 1000;
// A request is abandoned once nothing has arrived for this long: no answer yet, or no more of its body.
// A download that keeps arriving runs on however slowly, and the sync's deadline bounds it. Every request
// is a GET, so one abandoned is safe to send again.
const REQUEST_IDLE_MS = 30_000;
// Vercel stops a build at 45 minutes and prints nothing about why. A healthy sync takes seconds, and the
// 200 MB cap arrives in under three minutes even at 11 Mbit/s; past this, GitHub is refusing or failing,
// and the build stops saying so.
const SYNC_DEADLINE_MS = 10 * 60_000;
// GitHub allows 100 concurrent REST requests, and a token build reads every file there. A fetch keeps
// its slot through its retries and waits, so this bounds open requests too.
const MAX_CONCURRENT_FETCHES = 8;
// A GitHub token is printable ASCII, so a space or any other character inside one means a bad
// copy. For a line break, fetch would also quote the whole header, token included, in its error.
const TOKEN_CHARACTERS = /^[\x21-\x7E]+$/;

const backoff = (retriesUsed) => BACKOFF_BASE_MS * 2 ** retriesUsed;
const isRateLimit = (status) => status === 403 || status === 429;

// Node's fetch gives a network failure or a cut-off body the socket or DNS error as its cause,
// and a request its watchdog gave up on the watchdog's TimeoutError. A header that fetch rejects outright
// has neither, and would fail the same way every time. A few lasting failures, such as a redirect
// loop or a bad certificate, carry a cause too, and cost three quick retries before they fail.
const isNetworkFailure = (error) => error?.name === 'TimeoutError' || error?.cause !== undefined;

/** How long to wait: Retry-After if given; else a growing backoff for a server error, or for a refusal the limit's reset, or a minute. */
function retryDelay(response, retriesUsed) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;
  if (response.status >= 500) return backoff(retriesUsed);
  const resetAt = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && resetAt > 0) {
    return Math.max(resetAt * 1000 - Date.now(), 0) + RESET_MARGIN_MS;
  }
  return MAX_RETRY_WAIT_MS;
}

let runningFetches = 0;
const waitingForSlot = [];

// What the sync has done so far, for the report a missed deadline prints.
const progress = { step: 'looking up the commit', files: 0, downloaded: 0, refusals: 0, heldMs: 0, otherRetries: 0 };

// A rate limit holds every request, not only the one refused: GitHub may ban a client that keeps
// asking while it is limited.
let resumeAt = 0;
let resumed = Promise.resolve();
// Node fires a timer set for longer than this (about 24.8 days) after 1 ms instead.
const MAX_TIMER_MS = 2 ** 31 - 1;

function pauseRequests(delay) {
  const wait = Math.min(delay, MAX_TIMER_MS);
  const now = Date.now();
  const until = now + wait;
  if (until <= resumeAt) return;
  // Only the part past any hold already running is new.
  progress.heldMs += until - Math.max(now, resumeAt);
  resumeAt = until;
  resumed = sleep(wait);
}

/** Runs `task` once fewer than MAX_CONCURRENT_FETCHES tasks hold a slot. */
async function inSlot(task) {
  if (runningFetches < MAX_CONCURRENT_FETCHES) runningFetches += 1;
  else await new Promise((resolve) => waitingForSlot.push(resolve));
  try {
    return await task();
  } finally {
    // Hand the slot straight to the next task, or give it back.
    const next = waitingForSlot.shift();
    if (next) next();
    else runningFetches -= 1;
  }
}

/** Reads a body to its end, calling `arrived` each time more of it comes in. */
async function readBody(response, arrived) {
  const parts = [];
  for await (const part of response.body ?? []) {
    parts.push(part);
    arrived();
  }
  return Buffer.concat(parts);
}

/**
 * Reads a final answer within its attempt, so a connection that drops mid-body, or a body that stops
 * arriving, fails here and is retried. A refusal's status is its answer even when its body cannot be read.
 * Its body only adds to the message, so it gets 30 seconds from the answer however it trickles in, and
 * a slow one cannot hold the sync until its deadline and hide the refusal.
 */
async function readAnswer(response, arrived) {
  const { ok, status } = response;
  try {
    return { ok, status, body: await readBody(response, ok ? arrived : () => {}) };
  } catch (error) {
    if (ok) throw error;
    return { ok, status, body: Buffer.from('(body unreadable)') };
  }
}

/** One request: its final answer, or how long to wait before the next try, and why. */
async function attempt(url, headers, retriesUsed) {
  // A fresh watchdog each time, so a retry does not start on a spent one. The answer and every part of
  // its body start its wait again.
  const abandon = new AbortController();
  const watchdog = setTimeout(
    () => abandon.abort(new DOMException(`Nothing arrived for ${REQUEST_IDLE_MS / 1000} s`, 'TimeoutError')),
    REQUEST_IDLE_MS,
  );
  const arrived = () => watchdog.refresh();
  try {
    const response = await fetch(url, { headers, signal: abandon.signal });
    arrived();
    const limited = isRateLimit(response.status);
    const transient = limited || response.status >= 500;
    const wait = transient ? retryDelay(response, retriesUsed) : undefined;
    // Every request waits a rate limit out, even when this one is about to fail on it instead, so
    // nothing more is sent while its body is read; a server error is this request's own.
    if (limited) {
      progress.refusals += 1;
      pauseRequests(wait);
    }
    const delay = retriesUsed < MAX_RETRIES ? wait : undefined;
    // An exhausted hourly limit can be most of an hour away; waiting would only slow the failure.
    if (delay === undefined || delay > MAX_RETRY_WAIT_MS) return { answer: await readAnswer(response, arrived) };
    // Released so it does not hold a connection; a body that already broke keeps the wait above.
    await response.body?.cancel().catch(() => {});
    return { delay, reason: response.status, paused: limited };
  } finally {
    clearTimeout(watchdog);
  }
}

/**
 * Fetches and reads one answer, retrying a refusal, a server error, or a request that fails
 * on the way: no connection, a reset, or nothing arriving. The caller judges the final status.
 * A request keeps its slot through its retries, so a failing one uses them up before the files
 * queued behind it start, and a lasting outage fails as fast however many files are waiting.
 */
function githubFetch(url, headers) {
  return inSlot(async () => {
    for (let retriesUsed = 0; ; retriesUsed += 1) {
      // Waits out the rate-limit pause, including one that grows longer meanwhile. The last check
      // runs in the same step that sends the request, so no pause can begin in between.
      for (let pause; pause !== resumed; ) {
        pause = resumed;
        await pause;
      }
      let outcome;
      try {
        outcome = await attempt(url, headers, retriesUsed);
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        if (retriesUsed === MAX_RETRIES) {
          throw new Error(`GitHub request failed after ${MAX_RETRIES} retries: ${url}`, { cause: error });
        }
        outcome = { delay: backoff(retriesUsed), reason: error.cause?.code ?? error.name };
      }
      if (outcome.answer) return outcome.answer;
      console.warn(`Retry ${retriesUsed + 1} of ${MAX_RETRIES} in ${outcome.delay / 1000} s after ${outcome.reason}: ${url}`);
      // A rate limit's wait is the shared pause, which the next attempt waits out first.
      if (!outcome.paused) {
        progress.otherRetries += 1;
        await sleep(outcome.delay);
      }
    }
  });
}

// Only an anonymous build can raise its limit this way; a token is limited too.
const RATE_LIMIT_ADVICE = TOKEN ? '' : ' Set WRITING_GITHUB_TOKEN to raise the GitHub rate limit.';

function tokenHint(answer) {
  if (TOKEN) return answer.status === 401 ? ' WRITING_GITHUB_TOKEN was rejected: replace or remove it.' : '';
  return isRateLimit(answer.status) ? RATE_LIMIT_ADVICE : '';
}

// raw.githubusercontent.com caches a branch URL for five minutes, and a Deploy
// Hook starts this build seconds after a push. Reading by commit SHA gets the
// pushed files and keeps the listing and every download in one snapshot.
async function resolveCommit() {
  const answer = await githubFetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(REF)}`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github.sha',
  });
  if (!answer.ok) {
    throw new Error(`GitHub commit lookup failed for ${REF}: ${answer.status} ${answer.body}${tokenHint(answer)}`);
  }
  return answer.body.toString().trim();
}

async function listFiles(commit) {
  const answer = await githubFetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github+json',
  });
  if (!answer.ok) {
    throw new Error(`GitHub tree fetch failed: ${answer.status} ${answer.body}${tokenHint(answer)}`);
  }
  const tree = JSON.parse(answer.body.toString());
  // Past 100,000 entries or 7 MB GitHub returns part of the tree, and the missing
  // articles would leave the site without an error.
  if (tree.truncated) {
    throw new Error(`GitHub truncated the file listing of ${REPO}@${commit.slice(0, 7)}; refusing a partial sync.`);
  }
  return tree.tree;
}

// Only the REST API documents a token and its rate limit, so an authenticated build
// reads every file there. Without a token the API's 60 an hour is kept for the listing.
function fileRequest(commit, file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return TOKEN
    ? [
        `https://api.github.com/repos/${REPO}/contents/${encoded}?ref=${commit}`,
        { ...GITHUB_API_HEADERS, Accept: 'application/vnd.github.raw+json' },
      ]
    : [`https://raw.githubusercontent.com/${REPO}/${commit}/${encoded}`, { 'User-Agent': '1six-website' }];
}

async function fetchFile(commit, file) {
  progress.files += 1;
  const answer = await githubFetch(...fileRequest(commit, file));
  if (!answer.ok) {
    throw new Error(`Failed to download ${file}: ${answer.status}${tokenHint(answer)}`);
  }
  progress.downloaded += 1;
  return answer.body;
}

async function save(bytes, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

function numberedFolders(listing) {
  // A file at the top level is not a folder, but a tree or a submodule there is.
  const folders = listing
    .filter((entry) => entry.type !== 'blob' || entry.path.includes('/'))
    .map((entry) => entry.path.split('/')[0]);
  return [...new Set(folders)].filter((folder) => NUMBERED_FOLDER.test(folder));
}

function sizeProblems(file, size) {
  if (!Number.isInteger(size)) return [`${file}: the GitHub listing gave no size`];
  return size > MAX_ASSET_BYTES ? [`${file}: is over the ${MAX_ASSET_MB} MB limit (${size} bytes)`] : [];
}

function folderProblems(folder, entries) {
  const inFolder = entries.filter((entry) => entry.path.startsWith(`${folder}/`));
  const problems = [];
  if (!isArticleSlug(folder)) {
    problems.push(`${folder}: a folder name must be three digits, a hyphen, then lowercase letters, digits, or hyphens`);
  }
  const readme = inFolder.find((entry) => entry.path === `${folder}/README.md`);
  if (!readme) problems.push(`${folder}: has no README.md`);
  else problems.push(...sizeProblems(readme.path, readme.size));
  for (const entry of inFolder) {
    if (entry.mode === SYMLINK_MODE) problems.push(`${entry.path}: a symbolic link cannot be published`);
  }
  return problems;
}

function assetProblems({ path: file, size }) {
  const extension = path.extname(file).toLowerCase();
  const problems = [];
  if (!ASSET_EXTENSIONS.has(extension)) {
    problems.push(`${file}: ${extension || 'a file with no extension'} is not an allowed type (${[...ASSET_EXTENSIONS].join(', ')})`);
  }
  problems.push(...sizeProblems(file, size));
  return problems;
}

function totalProblems(label, entries) {
  const total = entries.reduce((sum, { size }) => sum + size, 0);
  return total > MAX_TOTAL_BYTES
    ? [`${label} total ${total} bytes, over the ${MAX_TOTAL_MB} MB limit for one build`]
    : [];
}

function refuse(commit, problems) {
  if (problems.length > 0) {
    throw new Error(`Cannot publish ${REPO}@${commit.slice(0, 7)}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function duration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return seconds % 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds / 60} min`;
}

// A cause that took less of the deadline than this is not the reason it ran out, so it sends no one to a fix.
const NOTABLE_SHARE_MS = 60_000;

/**
 * What the sync was doing when its time ran out, and where the time went: rate-limit holds, retries, and
 * whatever is left, which went to answers that came slowly or not at all.
 */
function lateReport() {
  const { step, files, downloaded, refusals, heldMs, otherRetries } = progress;
  // A hold still running counts only as far as now. Whole seconds, so the lines add up as printed.
  const held = Math.round((heldMs - Math.max(resumeAt - Date.now(), 0)) / 1000) * 1000;
  const rest = SYNC_DEADLINE_MS - held;
  const causes = [];
  if (refusals > 0) {
    const advice = held >= NOTABLE_SHARE_MS ? RATE_LIMIT_ADVICE : '';
    causes.push(`GitHub's rate limit refused ${plural(refusals, 'request')} and held every request for ${duration(held)} in all.${advice}`);
  }
  if (otherRetries > 0) causes.push(`Server errors and network failures cost ${plural(otherRetries, 'retry', 'retries')}.`);
  if (rest >= NOTABLE_SHARE_MS) causes.push(`GitHub answered slowly for ${held > 0 ? 'the other' : 'all'} ${duration(rest)}.`);
  const done = files > 0 ? `, with ${downloaded} of ${files} files downloaded` : '';
  return `The article sync stopped at its ${SYNC_DEADLINE_MS / 60_000}-minute limit while ${step}${done}:\n${causes.map((cause) => `  - ${cause}`).join('\n')}`;
}

/**
 * Runs `work` for at most SYNC_DEADLINE_MS, then fails saying why. Nothing is written until it returns,
 * so a sync that runs out of time leaves the last good sync in place, and the requests still running end
 * with the build.
 */
async function withinDeadline(work) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(lateReport())), SYNC_DEADLINE_MS);
  });
  try {
    return await Promise.race([work(), late]);
  } finally {
    // Left set, it would keep the build waiting out the rest of its 10 minutes after the sync is done.
    clearTimeout(timer);
  }
}

/** Downloads and checks everything the sync will write, touching nothing on disk. */
async function download() {
  const commit = await resolveCommit();
  progress.step = 'reading the file listing';
  const listing = await listFiles(commit);
  const entries = listing.filter((entry) => entry.type === 'blob');

  // Read from the whole listing, so a submodule in a numbered folder's place is still found.
  // A misnamed folder would otherwise publish its figures without its article.
  const folders = numberedFolders(listing);
  const readmes = entries.filter((entry) => folders.some((folder) => entry.path === `${folder}/README.md`));
  refuse(commit, [...folders.flatMap((folder) => folderProblems(folder, entries)), ...totalProblems('READMEs', readmes)]);

  progress.step = 'downloading READMEs';
  const articles = await Promise.all(
    folders.map(async (slug) => ({ slug, bytes: await fetchFile(commit, `${slug}/README.md`) })),
  );
  // Skipped here, not only when pages are built: anything under public/ has a
  // URL, so a draft's figures must never reach it.
  const published = articles.filter(({ bytes }) => !isDraftArticle(bytes.toString('utf8')));
  if (published.length === 0) {
    throw new Error(`No published articles found in ${REPO}@${REF}`);
  }

  const assets = published.flatMap(({ slug }) =>
    entries.filter((entry) => entry.path.startsWith(`${slug}/`) && entry.path !== `${slug}/README.md`),
  );
  refuse(commit, [...assets.flatMap(assetProblems), ...totalProblems('published assets', assets)]);

  progress.step = 'downloading assets';
  const downloads = await Promise.all([
    ...published.map(({ slug, bytes }) => ({ destination: path.join(contentRoot, slug, 'README.md'), bytes })),
    ...assets.map(async ({ path: file }) => ({
      destination: path.join(publicRoot, file),
      bytes: await fetchFile(commit, file),
    })),
  ]);
  return { commit, downloads, published: published.length, drafts: articles.length - published.length };
}

async function main() {
  if (TOKEN && !TOKEN_CHARACTERS.test(TOKEN)) {
    throw new Error('WRITING_GITHUB_TOKEN has a space, line break, or non-ASCII character in it: copy the token again.');
  }
  // Everything arrives before anything is removed, so a failed or late download leaves
  // the last good sync in place.
  const { commit, downloads, published, drafts } = await withinDeadline(download);

  await rm(contentRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });
  await Promise.all(downloads.map(({ destination, bytes }) => save(bytes, destination)));

  console.log(
    `Synced ${published} writing article(s) from ${REPO}@${REF} (${commit.slice(0, 7)})${drafts ? `, skipped ${drafts} draft(s)` : ''}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
