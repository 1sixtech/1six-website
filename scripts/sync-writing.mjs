#!/usr/bin/env node
// Pull published articles from the public 1six-researchs repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDraftArticle } from '../src/lib/writingDraft.mjs';

const REPO = '1sixtech/1six-researchs';
const REF = process.env.WRITING_GIT_REF || 'main';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content/writing');
const publicRoot = path.join(root, 'public/writing-assets');

const GITHUB_API_HEADERS = {
  'User-Agent': '1six-website',
  'X-GitHub-Api-Version': '2022-11-28',
};

// raw.githubusercontent.com caches a branch URL for five minutes, and a Deploy
// Hook starts this build seconds after a push. Reading by commit SHA gets the
// pushed files and keeps the listing and every download in one snapshot.
async function resolveCommit() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(REF)}`, {
    headers: { ...GITHUB_API_HEADERS, Accept: 'application/vnd.github.sha' },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub commit lookup failed for ${REF}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.text()).trim();
}

function rawUrl(commit, file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${REPO}/${commit}/${encoded}`;
}

async function fetchFile(commit, file) {
  const response = await fetch(rawUrl(commit, file), {
    headers: { 'User-Agent': '1six-website' },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function save(bytes, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

async function main() {
  const commit = await resolveCommit();
  const treeResponse = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`,
    { headers: { ...GITHUB_API_HEADERS, Accept: 'application/vnd.github+json' } },
  );
  if (!treeResponse.ok) {
    throw new Error(
      `GitHub tree fetch failed: ${treeResponse.status} ${await treeResponse.text()}`,
    );
  }

  const tree = await treeResponse.json();
  const files = tree.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path);
  const readmes = files.filter((file) => /^[0-9]{3}-[^/]+\/README\.md$/.test(file));
  const articles = await Promise.all(
    readmes.map(async (readme) => ({ readme, bytes: await fetchFile(commit, readme) })),
  );
  // Skipped here, not only when pages are built: anything under public/ has a
  // URL, so a draft's figures must never reach it.
  const published = articles.filter(({ bytes }) => !isDraftArticle(bytes.toString('utf8')));
  if (published.length === 0) {
    throw new Error(`No published articles found in ${REPO}@${REF}`);
  }

  // Everything arrives before anything is removed, so a failed download leaves
  // the last good sync in place.
  const downloads = await Promise.all(
    published.flatMap(({ readme, bytes }) => {
      const slug = readme.split('/')[0];
      const assets = files.filter(
        (file) => file.startsWith(`${slug}/`) && file !== readme,
      );
      return [
        { destination: path.join(contentRoot, slug, 'README.md'), bytes },
        ...assets.map(async (file) => ({
          destination: path.join(publicRoot, slug, file.slice(slug.length + 1)),
          bytes: await fetchFile(commit, file),
        })),
      ];
    }),
  );

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
