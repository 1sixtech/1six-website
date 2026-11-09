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

const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const BACKOFF_BASE_MS = 1000;
const RESET_MARGIN_MS = 1000;

/** How long to wait: Retry-After if given; else a growing backoff for a server error, or for a refusal the limit's reset, or a minute. */
function retryDelay(response, retriesUsed) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;
  if (response.status >= 500) return BACKOFF_BASE_MS * 2 ** retriesUsed;
  const resetAt = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && resetAt > 0) {
    return Math.max(resetAt * 1000 - Date.now(), 0) + RESET_MARGIN_MS;
  }
  return MAX_RETRY_WAIT_MS;
}

/** Fetches, retrying a refusal or server error; the caller reads the final answer. */
async function githubFetch(url, headers) {
  for (let retriesUsed = 0; ; retriesUsed += 1) {
    const response = await fetch(url, { headers });
    const transient = response.status === 403 || response.status === 429 || response.status >= 500;
    if (!transient || retriesUsed === MAX_RETRIES) return response;
    // An exhausted hourly limit can be most of an hour away; waiting would only slow the failure.
    const delay = retryDelay(response, retriesUsed);
    if (delay > MAX_RETRY_WAIT_MS) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay));
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
    throw new Error(
      `GitHub commit lookup failed for ${REF}: ${response.status} ${await response.text()}${tokenHint(response)}`,
    );
  }
  return (await response.text()).trim();
}

async function listFiles(commit) {
  const response = await githubFetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`, {
    ...GITHUB_API_HEADERS,
    Accept: 'application/vnd.github+json',
  });
  if (!response.ok) {
    throw new Error(
      `GitHub tree fetch failed: ${response.status} ${await response.text()}${tokenHint(response)}`,
    );
  }
  const tree = await response.json();
  // Past 100,000 entries or 7 MB GitHub returns part of the tree, and the missing
  // articles would leave the site without an error.
  if (tree.truncated) {
    throw new Error(`GitHub truncated the file listing of ${REPO}@${commit.slice(0, 7)}; refusing a partial sync.`);
  }
  return tree.tree.filter((entry) => entry.type === 'blob');
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
  return Buffer.from(await response.arrayBuffer());
}

async function save(bytes, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

function numberedFolders(files) {
  const folders = files.filter((file) => file.includes('/')).map((file) => file.split('/')[0]);
  return [...new Set(folders)].filter((folder) => NUMBERED_FOLDER.test(folder));
}

function folderProblems(folder, entries) {
  const inFolder = entries.filter((entry) => entry.path.startsWith(`${folder}/`));
  const problems = [];
  if (!isArticleSlug(folder)) {
    problems.push(`${folder}: a folder name must be three digits, a hyphen, then lowercase letters, digits, or hyphens`);
  }
  if (!inFolder.some((entry) => entry.path === `${folder}/README.md`)) problems.push(`${folder}: has no README.md`);
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
  if (!Number.isInteger(size)) problems.push(`${file}: the GitHub listing gave no size`);
  else if (size > MAX_ASSET_BYTES) problems.push(`${file}: is over the ${MAX_ASSET_MB} MB limit (${size} bytes)`);
  return problems;
}

function refuse(commit, problems) {
  if (problems.length > 0) {
    throw new Error(`Cannot publish ${REPO}@${commit.slice(0, 7)}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
}

async function main() {
  const commit = await resolveCommit();
  const entries = await listFiles(commit);

  // A misnamed folder would otherwise publish its figures without its article.
  const folders = numberedFolders(entries.map((entry) => entry.path));
  refuse(commit, folders.flatMap((folder) => folderProblems(folder, entries)));

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
  refuse(commit, assets.flatMap(assetProblems));

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
