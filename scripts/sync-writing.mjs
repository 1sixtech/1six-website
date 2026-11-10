#!/usr/bin/env node
// Pull published articles from the public 1six-researchs repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Anything under public/ has a URL, and an article can only show images.
const ASSET_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
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
// A deadline for the whole request, body included, not a stall detector. Every request is a GET,
// so one abandoned at the deadline is safe to send again. Eight files at the 5 MB cap, arriving
// together, need about 11 Mbit/s between them to finish in time.
const REQUEST_TIMEOUT_MS = 30_000;
// GitHub allows 100 concurrent REST requests, and a token build reads every file there.
const MAX_OPEN_REQUESTS = 8;
// A header cannot carry a line break or a non-ASCII character, and fetch quotes the whole
// rejected header in its error, which would print the token in the build log.
const TOKEN_CHARACTERS = /^[\x21-\x7E]+$/;

const backoff = (retriesUsed) => BACKOFF_BASE_MS * 2 ** retriesUsed;

// Node's fetch gives a network failure or a cut-off body the socket or DNS error as its cause,
// and a stall its signal's TimeoutError. A request it could not even build has neither, and
// would fail the same way every time.
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

let openRequests = 0;
const waitingForSlot = [];

/** Runs one request once fewer than MAX_OPEN_REQUESTS are open. A request waiting to retry holds no slot. */
async function inSlot(request) {
  if (openRequests < MAX_OPEN_REQUESTS) openRequests += 1;
  else await new Promise((resolve) => waitingForSlot.push(resolve));
  try {
    return await request();
  } finally {
    // Hand the slot straight to the next request, or give it back.
    const next = waitingForSlot.shift();
    if (next) next();
    else openRequests -= 1;
  }
}

/**
 * Reads a final answer within its attempt, so a connection that drops or stalls mid-body fails
 * here and is retried. A refusal's status is its answer even when its body cannot be read.
 */
async function readAnswer(response) {
  const { ok, status } = response;
  try {
    return { ok, status, body: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    if (ok) throw error;
    return { ok, status, body: Buffer.alloc(0) };
  }
}

/** One request: its final answer, or how long to wait before the next try, and why. */
async function attempt(url, headers, retriesUsed) {
  // A fresh signal each time, so a retry does not inherit a spent timeout.
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const transient = response.status === 403 || response.status === 429 || response.status >= 500;
  const delay = transient && retriesUsed < MAX_RETRIES ? retryDelay(response, retriesUsed) : undefined;
  // An exhausted hourly limit can be most of an hour away; waiting would only slow the failure.
  if (delay === undefined || delay > MAX_RETRY_WAIT_MS) return { answer: await readAnswer(response) };
  // Released so it does not hold a connection; a body that already broke keeps the wait above.
  await response.body?.cancel().catch(() => {});
  return { delay, reason: response.status };
}

/**
 * Fetches and reads one answer, retrying a refusal, a server error, or a request that fails
 * on the way: no connection, a reset, or a stall. The caller judges the final status.
 */
async function githubFetch(url, headers) {
  for (let retriesUsed = 0; ; retriesUsed += 1) {
    let outcome;
    try {
      outcome = await inSlot(() => attempt(url, headers, retriesUsed));
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      if (retriesUsed === MAX_RETRIES) {
        throw new Error(`GitHub request failed after ${MAX_RETRIES} retries: ${url}`, { cause: error });
      }
      outcome = { delay: backoff(retriesUsed), reason: error.cause?.code ?? error.name };
    }
    if (outcome.answer) return outcome.answer;
    console.warn(`Retry ${retriesUsed + 1} of ${MAX_RETRIES} in ${outcome.delay / 1000} s after ${outcome.reason}: ${url}`);
    await new Promise((resolve) => setTimeout(resolve, outcome.delay));
  }
}

function tokenHint(response) {
  if (TOKEN) return response.status === 401 ? ' WRITING_GITHUB_TOKEN was rejected: replace or remove it.' : '';
  return response.status === 403 || response.status === 429
    ? ' Set WRITING_GITHUB_TOKEN to raise the GitHub rate limit.'
    : '';
}

// raw.githubusercontent.com caches a branch URL for five minutes, and a Deploy
// Hook starts this build seconds after a push. Reading by commit SHA gets the
// pushed files and keeps the listing and every download in one snapshot.
async function resolveCommit() {
  const response = await githubFetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(REF)}`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github.sha',
  });
  if (!response.ok) {
    throw new Error(`GitHub commit lookup failed for ${REF}: ${response.status} ${response.body}${tokenHint(response)}`);
  }
  return response.body.toString().trim();
}

async function listFiles(commit) {
  const response = await githubFetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github+json',
  });
  if (!response.ok) {
    throw new Error(`GitHub tree fetch failed: ${response.status} ${response.body}${tokenHint(response)}`);
  }
  const tree = JSON.parse(response.body.toString());
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
  const response = await githubFetch(...fileRequest(commit, file));
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.status}${tokenHint(response)}`);
  }
  return response.body;
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

async function main() {
  if (TOKEN && !TOKEN_CHARACTERS.test(TOKEN)) {
    throw new Error('WRITING_GITHUB_TOKEN has a space, line break, or non-ASCII character in it: copy the token again.');
  }
  const commit = await resolveCommit();
  const listing = await listFiles(commit);
  const entries = listing.filter((entry) => entry.type === 'blob');

  // Read from the whole listing, so a submodule in a numbered folder's place is still found.
  // A misnamed folder would otherwise publish its figures without its article.
  const folders = numberedFolders(listing);
  const readmes = entries.filter((entry) => folders.some((folder) => entry.path === `${folder}/README.md`));
  refuse(commit, [...folders.flatMap((folder) => folderProblems(folder, entries)), ...totalProblems('READMEs', readmes)]);

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

  // Everything arrives before anything is removed, so a failed download leaves
  // the last good sync in place.
  const downloads = await Promise.all([
    ...published.map(({ slug, bytes }) => ({ destination: path.join(contentRoot, slug, 'README.md'), bytes })),
    ...assets.map(async ({ path: file }) => ({
      destination: path.join(publicRoot, file),
      bytes: await fetchFile(commit, file),
    })),
  ]);

  await rm(contentRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });
  await Promise.all(downloads.map(({ destination, bytes }) => save(bytes, destination)));

  const drafts = articles.length - published.length;
  console.log(
    `Synced ${published.length} writing article(s) from ${REPO}@${REF} (${commit.slice(0, 7)})${drafts ? `, skipped ${drafts} draft(s)` : ''}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
