#!/usr/bin/env node
// Pull published articles from the public noctis-articles repo.
// The site CSP only allows images from this origin, so SVGs are copied into public/.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = '1sixtech/noctis-articles';
const REF = process.env.RESEARCH_GIT_REF ?? 'main';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content/research');
const publicRoot = path.join(root, 'public/research');

function rawUrl(file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${REPO}/${REF}/${encoded}`;
}

async function download(file, destination) {
  const response = await fetch(rawUrl(file), {
    headers: { 'User-Agent': '1six-website' },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
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
  if (readmes.length === 0) {
    throw new Error(`No numbered articles found in ${REPO}@${REF}`);
  }

  await rm(contentRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });

  await Promise.all(
    readmes.flatMap((readme) => {
      const slug = readme.split('/')[0];
      const assets = files.filter(
        (file) => file.startsWith(`${slug}/`) && file !== readme,
      );
      return [
        download(readme, path.join(contentRoot, slug, 'README.md')),
        ...assets.map((file) =>
          download(file, path.join(publicRoot, slug, file.slice(slug.length + 1))),
        ),
      ];
    }),
  );

  console.log(`Synced ${readmes.length} research article(s) from ${REPO}@${REF}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
