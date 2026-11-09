#!/usr/bin/env node
// Pull published articles from the public noctis-articles repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDraftArticle } from '../src/lib/writingDraft.mjs';

const REPO = '1sixtech/noctis-articles';
const REF = process.env.WRITING_GIT_REF ?? 'main';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content/writing');
const publicRoot = path.join(root, 'public/writing-assets');

function rawUrl(file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${REPO}/${REF}/${encoded}`;
}

async function fetchFile(file) {
  const response = await fetch(rawUrl(file), {
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
  const treeResponse = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': '1six-website',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
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
    readmes.map(async (readme) => ({ readme, bytes: await fetchFile(readme) })),
  );
  // Skipped here, not only when pages are built: anything under public/ has a
  // URL, so a draft's figures must never reach it.
  const published = articles.filter(({ bytes }) => !isDraftArticle(bytes.toString('utf8')));
  if (published.length === 0) {
    throw new Error(`No published articles found in ${REPO}@${REF}`);
  }

  await rm(contentRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });

  await Promise.all(
    published.flatMap(({ readme, bytes }) => {
      const slug = readme.split('/')[0];
      const assets = files.filter(
        (file) => file.startsWith(`${slug}/`) && file !== readme,
      );
      return [
        save(bytes, path.join(contentRoot, slug, 'README.md')),
        ...assets.map(async (file) =>
          save(await fetchFile(file), path.join(publicRoot, slug, file.slice(slug.length + 1))),
        ),
      ];
    }),
  );

  const drafts = articles.length - published.length;
  console.log(
    `Synced ${published.length} writing article(s) from ${REPO}@${REF}${drafts ? `, skipped ${drafts} draft(s)` : ''}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
