#!/usr/bin/env node
// Render the site's PNG icons from public/favicon.svg, the one source:
// the 16 mark (LogoFooter in src/components/ui/Logo.tsx) in black on the logo
// red, in a slightly rounded square. The SVG sets the corner radius (its one
// rx, 15% today) and the mark's size (64% wide, the size that still reads in a
// 16px tab), so adjusting either is an edit to favicon.svg alone.
//
// - favicon.png (192): the rounded square, for browsers without SVG favicons,
//   the web app manifest, and the Organization logo in the root layout.
// - apple-icon.png (180): the same square without its corners, so it fills the
//   viewBox, saved without an alpha channel. iOS rounds a home-screen icon
//   itself and paints every transparent pixel black.
//
// Re-run after editing favicon.svg (or this script), then bump ICON_VERSION in
// src/lib/site.ts and record the three files' digests in ICON_DIGESTS in
// src/app/icons.test.mjs (the test prints what changed):
//   node scripts/make-icons.mjs

import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const FAVICON_SIZE = 192;
export const APPLE_ICON_SIZE = 180;

const SVG_DPI = 72; // the density sharp reads an SVG at by default
const SUPERSAMPLE = 4; // render this many times larger, then downsample, so curves are smooth

function viewBoxWidth(svg) {
  const match = /viewBox="\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)\s+[\d.]+\s*"/.exec(svg);
  if (!match) throw new Error('favicon.svg: expected a viewBox');
  return Number(match[1]);
}

// The one rounded square. The iOS icon drops its radius: rx, and the ry that
// design tools often write beside it (an SVG reads a missing rx from ry).
const RADIUS = / r[xy]="[\d.]+"/g;

function assertRoundedSquare(svg) {
  const corners = svg.match(/ rx="[\d.]+"/g) ?? [];
  if (corners.length !== 1) {
    throw new Error(`favicon.svg: expected one rounded square (rx), found ${corners.length}`);
  }
}

function render(svg, size) {
  const density = SVG_DPI * (size / viewBoxWidth(svg)) * SUPERSAMPLE;
  return sharp(Buffer.from(svg), { density }).resize(size, size);
}

/** Both PNG icons for a favicon SVG, as buffers. */
export async function renderIcons(svg) {
  assertRoundedSquare(svg);
  const favicon = await render(svg, FAVICON_SIZE).png({ compressionLevel: 9 }).toBuffer();
  const appleIcon = await render(svg.replace(RADIUS, ''), APPLE_ICON_SIZE).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  return { favicon, appleIcon };
}

/** Whether node was asked to run the module at `moduleUrl` (also through a symlink), rather than import it. */
export function isMain(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isMain(process.argv[1], import.meta.url)) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
  const { favicon, appleIcon } = await renderIcons(await readFile(path.join(publicDir, 'favicon.svg'), 'utf8'));
  await writeFile(path.join(publicDir, 'favicon.png'), favicon);
  await writeFile(path.join(publicDir, 'apple-icon.png'), appleIcon);
  console.log(`Wrote public/favicon.png (${FAVICON_SIZE}) and public/apple-icon.png (${APPLE_ICON_SIZE})`);
}
