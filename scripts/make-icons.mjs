#!/usr/bin/env node
// Derive the site's other icon files from public/favicon.svg, the one source:
// the 16 mark (LogoFooter in src/components/ui/Logo.tsx) on the logo red, in a
// slightly rounded square. The mark is black, and white where the browser is
// in dark mode (the SVG's prefers-color-scheme block). The SVG sets the corner
// radius (its one rx, 15% today) and the mark's size (64% wide, the size that
// still reads in a 16px tab), so adjusting either is an edit to favicon.svg alone.
//
// - favicon-light.svg, favicon-dark.svg: favicon.svg with that block resolved,
//   each in one mark color and with no media query. Chrome and Firefox draw an
//   SVG favicon once, in the scheme of the moment it loads, so FaviconSync
//   (src/components/providers) points the tab at one of these when the scheme
//   changes later.
// - favicon.png (192): the rounded square with the black mark, for browsers
//   without SVG favicons, the web app manifest, and the Organization logo in
//   the root layout.
// - apple-icon.png (180): the same square without its corners, so it fills the
//   viewBox, saved without an alpha channel. iOS rounds a home-screen icon
//   itself and paints every transparent pixel black.
//
// Re-run after editing favicon.svg (or this script), then bump ICON_VERSION in
// src/lib/site.ts and record the five files' digests (favicon.svg and the four
// written here) in ICON_DIGESTS in src/app/icons.test.mjs (the test prints what
// changed):
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

// The dark-mode block and the rules inside it (one level of braces).
const DARK_SCHEME = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/**
 * favicon.svg as a browser in `scheme` draws it, with no media query left:
 * light drops the dark-mode block, dark puts its rules where the block was,
 * after the rules they override.
 */
export function schemeSvg(svg, scheme) {
  const blocks = svg.match(DARK_SCHEME)?.length ?? 0;
  if (blocks !== 1) throw new Error(`favicon.svg: expected one @media (prefers-color-scheme:dark) block, found ${blocks}`);
  const fixed = svg.replace(DARK_SCHEME, scheme === 'dark' ? '$1' : '');
  if (fixed.includes('@media')) throw new Error('favicon.svg: only the prefers-color-scheme:dark media query can be resolved');
  return fixed;
}

/** Both PNG icons for a favicon SVG, as buffers. */
export async function renderIcons(svg) {
  assertRoundedSquare(svg);
  // From the light copy, so the PNGs never depend on whether the rasterizer reads the media query.
  const light = schemeSvg(svg, 'light');
  const favicon = await render(light, FAVICON_SIZE).png({ compressionLevel: 9 }).toBuffer();
  const appleIcon = await render(light.replace(RADIUS, ''), APPLE_ICON_SIZE).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
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
  const svg = await readFile(path.join(publicDir, 'favicon.svg'), 'utf8');
  for (const scheme of ['light', 'dark']) {
    await writeFile(path.join(publicDir, `favicon-${scheme}.svg`), schemeSvg(svg, scheme));
  }
  const { favicon, appleIcon } = await renderIcons(svg);
  await writeFile(path.join(publicDir, 'favicon.png'), favicon);
  await writeFile(path.join(publicDir, 'apple-icon.png'), appleIcon);
  console.log(`Wrote public/favicon-light.svg, public/favicon-dark.svg, public/favicon.png (${FAVICON_SIZE}) and public/apple-icon.png (${APPLE_ICON_SIZE})`);
}
