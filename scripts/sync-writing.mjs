#!/usr/bin/env node
// Pull published articles from the public 1six-researchs repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Every wait goes through sleep; the global setTimeout is only for the watchdog and the deadline. The tests
// tell the two apart by that.
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
// Each download is held to its listed size as it arrives, so this caps what arrives too.
// SYNC_DEADLINE_MS is sized for this cap.
const MAX_TOTAL_MB = 200;
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;
// The lookup answers with a commit SHA, 40 characters (64 in a SHA-256 repository). A listing is cut off at
// 100,000 entries or GitHub's 7 MB limit, which is not the size of its JSON: one cut off there measured 17.6 MB
// (71,474 entries, 2026-11-10), and a cut-off listing fails the sync. Anything longer than these is not
// GitHub's answer: it is given up on as soon as it passes them, and retried. A refusal's body only adds to the
// error message, so it may hold far less.
const MAX_COMMIT_BYTES = 1024;
const MAX_LISTING_BYTES = 32 * 1024 * 1024;
const MAX_REFUSAL_BYTES = 4096;

const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const BACKOFF_BASE_MS = 1000;
const RESET_MARGIN_MS = 1000;
// A request is abandoned once nothing has arrived for this long: no answer yet, or no more of its body.
// A download that keeps arriving runs on however slowly, and the sync's deadline bounds it. Every request
// is a GET, so one abandoned is safe to send again.
const REQUEST_IDLE_MS = 30_000;
// Vercel stops a build at 45 minutes and prints nothing about why. A healthy sync takes seconds. The most the
// checks allow, MAX_TOTAL_MB of READMEs and as much again of assets, arrives in about five minutes at 11 Mbit/s,
// the rate eight 5 MB files needed to beat the 30-second request limit this replaced; raise MAX_TOTAL_MB and raise
// this with it. Past this, GitHub is refusing, failing, or crawling, and the build stops saying so.
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

// What the sync has done so far, for the report a missed deadline prints. `held` and `waiting` are spans
// [start, end) of the time a rate limit held every request and of each wait to retry after a server error,
// a network failure, or a body of the wrong size, on the monotonic clock, so a step in the wall clock cannot
// bend them. `silences` counts the requests the watchdog gave up on, `wrongSizes` the retries after a body of
// the wrong size, and `asking` holds the requests waiting for an answer.
const progress = { step: 'looking up the commit', files: 0, downloaded: 0, refusals: 0, held: [], waiting: [], silences: 0, wrongSizes: 0, asking: new Set() };

/** The span of the next `length` ms, on the monotonic clock. */
function spanFromNow(length) {
  const start = performance.now();
  return [start, start + length];
}

// A rate limit holds every request, not only the one refused: GitHub may ban a client that keeps
// asking while it is limited.
let resumeAt = 0;
let resumed = Promise.resolve();
// Node fires a timer set for longer than this (about 24.8 days) after 1 ms instead.
const MAX_TIMER_MS = 2 ** 31 - 1;

function pauseRequests(delay) {
  const wait = Math.min(delay, MAX_TIMER_MS);
  // On the monotonic clock, as the pause's timer is, so a step in the wall clock cannot cut a hold short
  // or let a shorter one replace it.
  const span = spanFromNow(wait);
  if (span[1] <= resumeAt) return;
  resumeAt = span[1];
  resumed = sleep(wait);
  progress.held.push(span);
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

/**
 * A body that ran past the most its request allows, or a file's that ended short of the size the listing gave
 * it. Its attempt failed, as if the connection had broken, and is retried. A refusal's body is the exception:
 * its status stands, unretried (see readAnswer).
 */
class WrongSize extends Error {
  constructor(received, size) {
    super(received > size ? `a body over ${size} bytes` : `a body of ${received} bytes, not ${size}`);
    this.name = 'WrongSize';
    this.received = received;
    this.size = size;
  }
}

/**
 * Reads a body to its end, calling `arrived` each time more of it comes in. It is given up on as soon as it holds
 * more than `size` bytes, and with `exact` it fails if it ends with fewer. Bytes are counted as fetch hands them
 * over, after it has decoded any gzip, so a host sending without end cannot fill the build's memory first.
 */
async function readBody(response, arrived, { size, exact = false }) {
  // Each part is copied into one buffer of the most the body may hold and let go. Kept as they came, the parts
  // of a body sent a byte at a time would cost hundreds of bytes of memory for each byte of it, and run the build
  // out of memory far below any of these limits.
  const body = Buffer.allocUnsafe(size);
  let received = 0;
  for await (const part of response.body ?? []) {
    if (received + part.length > size) throw new WrongSize(received + part.length, size);
    body.set(part, received);
    received += part.length;
    arrived();
  }
  if (exact && received !== size) throw new WrongSize(received, size);
  return body.subarray(0, received);
}

/**
 * Reads a final answer within its attempt, so a connection that drops mid-body, or a body that stops
 * arriving or arrives at the wrong size, fails here and is retried. A refusal's status is its answer even when
 * its body cannot be read. Its body only adds to the message, so it gets 30 seconds from the answer however it
 * trickles in, and a slow one cannot hold the sync until its deadline and hide the refusal. It may hold
 * MAX_REFUSAL_BYTES, whatever the request allows an answer.
 */
async function readAnswer(response, arrived, expected) {
  const { ok, status } = response;
  try {
    return { ok, status, body: await readBody(response, ok ? arrived : () => {}, ok ? expected : { size: MAX_REFUSAL_BYTES }) };
  } catch (error) {
    if (ok) throw error;
    return { ok, status, body: Buffer.from(error instanceof WrongSize ? `(body over ${error.size} bytes)` : '(body unreadable)') };
  }
}

/** One request: its final answer, or how long to wait before the next try, and why. */
async function attempt(url, headers, expected, retriesUsed) {
  // A fresh watchdog each time, so a retry does not start on a spent one. The answer starts its wait
  // again, and so does each part of its body, unless it is a refusal (see readAnswer).
  const abandon = new AbortController();
  const watchdog = setTimeout(() => {
    progress.silences += 1;
    abandon.abort(new DOMException(`Nothing arrived for ${REQUEST_IDLE_MS / 1000} s`, 'TimeoutError'));
  }, REQUEST_IDLE_MS);
  const arrived = () => watchdog.refresh();
  progress.asking.add(url);
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
    if (delay === undefined || delay > MAX_RETRY_WAIT_MS) return { answer: await readAnswer(response, arrived, expected) };
    // Released so it does not hold a connection; a body that already broke keeps the wait above.
    await response.body?.cancel().catch(() => {});
    return { delay, reason: response.status, paused: limited };
  } finally {
    clearTimeout(watchdog);
    progress.asking.delete(url);
  }
}

/**
 * Fetches and reads one answer, retrying a refusal, a server error, or a request that fails
 * on the way: no connection, a reset, nothing arriving, or a body of the wrong size (`expected`,
 * see readBody). The caller judges the final status.
 * A request keeps its slot through its retries, so a failing one uses them up before the files
 * queued behind it start, and a lasting outage fails as fast however many files are waiting.
 */
function githubFetch(url, headers, expected) {
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
        outcome = await attempt(url, headers, expected, retriesUsed);
      } catch (error) {
        const wrongSize = error instanceof WrongSize;
        if (!wrongSize && !isNetworkFailure(error)) throw error;
        if (retriesUsed === MAX_RETRIES) {
          const failure = wrongSize ? `sent ${error.message}` : 'request failed';
          throw new Error(`GitHub ${failure} after ${MAX_RETRIES} retries: ${url}`, { cause: error });
        }
        if (wrongSize) progress.wrongSizes += 1;
        outcome = { delay: backoff(retriesUsed), reason: wrongSize ? error.message : error.cause?.code ?? error.name };
      }
      if (outcome.answer) return outcome.answer;
      console.warn(`Retry ${retriesUsed + 1} of ${MAX_RETRIES} in ${outcome.delay / 1000} s after ${outcome.reason}: ${url}`);
      // A rate limit's wait is the shared pause, which the next attempt waits out first.
      if (!outcome.paused) {
        progress.waiting.push(spanFromNow(outcome.delay));
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
  }, { size: MAX_COMMIT_BYTES });
  if (!answer.ok) {
    throw new Error(`GitHub commit lookup failed for ${REF}: ${answer.status} ${answer.body}${tokenHint(answer)}`);
  }
  return answer.body.toString().trim();
}

async function listFiles(commit) {
  const answer = await githubFetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github+json',
  }, { size: MAX_LISTING_BYTES });
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

/** Downloads a listed file, which must arrive at exactly the size the listing gave it. */
async function fetchFile(commit, { path: file, size }) {
  progress.files += 1;
  let answer;
  try {
    answer = await githubFetch(...fileRequest(commit, file), { size, exact: true });
  } catch (error) {
    // A file whose last attempt arrived at the wrong size is named, with both sizes, rather than by its URL.
    if (!(error?.cause instanceof WrongSize)) throw error;
    const { received } = error.cause;
    const sent = received > size ? `at least ${received}` : received;
    throw new Error(`Failed to download ${file} after ${MAX_RETRIES} retries: the listing gives it ${size} bytes, and GitHub sent ${sent}`, { cause: error.cause });
  }
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

/**
 * The files under each top-level folder, in listing order. Built once, so the checks below take time in
 * proportion to the listing rather than to its folders times its files, which on a listing of hundreds of
 * thousands of entries would hold the build past its deadline, unable to fire while they ran.
 */
function filesByFolder(entries) {
  const byFolder = new Map();
  for (const entry of entries) {
    const slash = entry.path.indexOf('/');
    if (slash < 0) continue;
    const folder = entry.path.slice(0, slash);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(entry);
  }
  return byFolder;
}

function sizeProblems(file, size) {
  // A negative size would lower the total checked below while the files beside it still arrive in full.
  if (!Number.isInteger(size) || size < 0) return [`${file}: the GitHub listing gave no valid size`];
  return size > MAX_ASSET_BYTES ? [`${file}: is over the ${MAX_ASSET_MB} MB limit (${size} bytes)`] : [];
}

/** The README a folder is checked and downloaded by: the first the listing gives. */
const readmeOf = (folder, inFolder) => inFolder.find((entry) => entry.path === `${folder}/README.md`);

function folderProblems(folder, inFolder) {
  const problems = [];
  if (!isArticleSlug(folder)) {
    problems.push(`${folder}: a folder name must be three digits, a hyphen, then lowercase letters, digits, or hyphens`);
  }
  const readme = readmeOf(folder, inFolder);
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

/** How much of the time up to `until` the spans cover, each moment counted once. */
function covered(spans, until) {
  let total = 0;
  let reached = -Infinity;
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    total += Math.max(Math.min(end, until) - Math.max(start, reached), 0);
    reached = Math.max(reached, end);
  }
  return total;
}

/**
 * What the sync was doing when its time ran out, and where the time went, each moment counted once: a rate
 * limit holding every request, else a request waiting to be retried, else answers that came slowly or not
 * at all. Then the requests still waiting for an answer, so a slow one is named.
 */
function lateReport() {
  const { step, files, downloaded, refusals, held: holds, waiting, silences, wrongSizes, asking } = progress;
  const now = performance.now();
  // Whole seconds, so the lines add up as printed. A hold or a wait still running counts only as far as now.
  const seconds = (spans) => Math.round(covered(spans, now) / 1000) * 1000;
  const held = seconds(holds);
  const waited = seconds([...holds, ...waiting]) - held;
  const rest = SYNC_DEADLINE_MS - held - waited;
  const lines = [];
  if (refusals > 0) {
    const advice = held >= NOTABLE_SHARE_MS ? RATE_LIMIT_ADVICE : '';
    lines.push(`GitHub's rate limit refused ${plural(refusals, 'request')} and held every request for ${duration(held)} in all.${advice}`);
  }
  if (waiting.length > 0) {
    const wait = waited > 0 ? `, and waiting to retry took ${duration(waited)}${held > 0 ? ' more' : ''}` : '';
    // Each wrong-size retry is one of these waits, so a body the wrong size is named as the cause.
    const causes = wrongSizes === 0
      ? 'Server errors and network failures'
      : wrongSizes === waiting.length ? 'Bodies of the wrong size' : 'Server errors, network failures, and bodies of the wrong size';
    lines.push(`${causes} cost ${plural(waiting.length, 'retry', 'retries')}${wait}.`);
  }
  if (rest >= NOTABLE_SHARE_MS) {
    const how = silences > 0 ? 'slowly, or not at all,' : 'slowly';
    lines.push(`GitHub answered ${how} for ${held + waited > 0 ? 'the other' : 'all'} ${duration(rest)}.`);
  }
  // With no request out, time put down to slow answers may have gone somewhere else, such as the sync itself.
  if (asking.size > 0) lines.push(`Still waiting on ${plural(asking.size, 'answer')}, from ${[...asking].join(', ')}.`);
  else if (rest >= NOTABLE_SHARE_MS) lines.push('No request was waiting for an answer when time ran out.');
  const done = files > 0 ? `, with ${downloaded} of ${files} files downloaded` : '';
  return `The article sync stopped at its ${SYNC_DEADLINE_MS / 60_000}-minute limit while ${step}${done}:\n${lines.map((line) => `  - ${line}`).join('\n')}`;
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
  const byFolder = filesByFolder(entries);
  const inFolder = (folder) => byFolder.get(folder) ?? [];
  // One README per folder, the one checked and downloaded, so the total counts exactly what will arrive.
  const readmes = folders.map((folder) => readmeOf(folder, inFolder(folder)));
  refuse(commit, [
    ...folders.flatMap((folder) => folderProblems(folder, inFolder(folder))),
    ...totalProblems('READMEs', readmes.filter(Boolean)),
  ]);

  progress.step = 'downloading READMEs';
  const articles = await Promise.all(
    folders.map(async (slug, index) => ({ slug, bytes: await fetchFile(commit, readmes[index]) })),
  );
  // Skipped here, not only when pages are built: anything under public/ has a
  // URL, so a draft's figures must never reach it.
  const published = articles.filter(({ bytes }) => !isDraftArticle(bytes.toString('utf8')));
  if (published.length === 0) {
    throw new Error(`No published articles found in ${REPO}@${REF}`);
  }

  const assets = published.flatMap(({ slug }) => inFolder(slug).filter((entry) => entry.path !== `${slug}/README.md`));
  refuse(commit, [...assets.flatMap(assetProblems), ...totalProblems('published assets', assets)]);

  progress.step = 'downloading assets';
  const downloads = await Promise.all([
    ...published.map(({ slug, bytes }) => ({ destination: path.join(contentRoot, slug, 'README.md'), bytes })),
    ...assets.map(async (entry) => ({
      destination: path.join(publicRoot, entry.path),
      bytes: await fetchFile(commit, entry),
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
