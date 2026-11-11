import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { APPLE_ICON_SIZE, FAVICON_SIZE, isMain, renderIcons, schemeSvg } from '../../scripts/make-icons.mjs';
import { SCHEME_FAVICONS } from '../lib/favicon.ts';
import { ICON_VERSION } from '../lib/site.ts';

const PUBLIC = new URL('../../public/', import.meta.url);
const SVG = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8');
// The logo red (PRODUCT.md), which favicon.svg alone sets for the icons.
const RED = '#FF3700';
const RED_RGB = [255, 55, 0];
// Every icon file the site serves, and the SVG ones among them.
const ICON_FILES = readdirSync(PUBLIC).filter((name) => /^(favicon|apple-icon)\b/.test(name));
const FAVICON_SVGS = ICON_FILES.filter((name) => name.endsWith('.svg'));
const publicFile = (href) => new URL(new URL(href, 'https://1six.tech').pathname.slice(1), PUBLIC);

const pixels = async (input) => sharp(input).raw().toBuffer({ resolveWithObject: true });
const at = ({ data, info }, x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x + 1) * info.channels)];
// How many opaque pixels are black, and how many white: the mark's two colors.
function markPixels({ data, info }) {
  const count = { black: 0, white: 0 };
  for (let i = 0; i < data.length; i += info.channels) {
    if (info.channels === 4 && data[i + 3] < 255) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    if (rgb.every((value) => value < 16)) count.black++;
    if (rgb.every((value) => value > 239)) count.white++;
  }
  return count;
}

// The share of channels more than 8/255 apart. Rasterizers differ by a step or
// two along antialiased edges between platforms, which the 8/255 absorbs; an
// edit to the SVG, even a one-unit change of radius, moves far more.
function drift(a, b) {
  let far = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 8) far++;
  return far / a.length;
}
const STALE = 0.001; // a one-unit change of today's radius moves about 0.3%
const radius = (svg) => Number(/ rx="([\d.]+)"/.exec(svg)[1]);
const withRadius = (svg, r) => svg.replace(/ rx="[\d.]+"/, ` rx="${r}"`);
const viewBoxWidth = (svg) => Number(/viewBox="\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)/.exec(svg)[1]);

test('favicon.svg: a logo red square whose mark follows the browser\'s color scheme', () => {
  assert.match(SVG, new RegExp(`<rect [^>]*fill="${RED}"`), 'the square is the logo red');
  assert.match(SVG, /<style>[^<]*@media \(prefers-color-scheme:\s*dark\)[^<]*<\/style>/, 'a dark-mode rule in the SVG\'s own style');
});

test('favicon.svg is the source: the light and dark copies are what make-icons derives from it', () => {
  assert.deepEqual(Object.keys(SCHEME_FAVICONS).sort(), ['dark', 'light']);
  for (const [scheme, href] of Object.entries(SCHEME_FAVICONS)) {
    const shipped = readFileSync(publicFile(href), 'utf8');
    assert.equal(shipped, schemeSvg(SVG, scheme), `${href} differs from favicon.svg: run node scripts/make-icons.mjs`);
    assert.doesNotMatch(shipped, /@media/, `${href} draws one scheme`);
  }
});

test('favicon copies: the mark is black on light and white on dark, and the PNGs carry the light one', async () => {
  const light = markPixels(await pixels(fileURLToPath(publicFile(SCHEME_FAVICONS.light))));
  const dark = markPixels(await pixels(fileURLToPath(publicFile(SCHEME_FAVICONS.dark))));
  assert.ok(light.black > 0 && light.white === 0, `light: ${JSON.stringify(light)}`);
  assert.ok(dark.white > 0 && dark.black === 0, `dark: ${JSON.stringify(dark)}`);
  for (const name of ['favicon.png', 'apple-icon.png']) {
    const png = markPixels(await pixels(fileURLToPath(new URL(name, PUBLIC))));
    assert.ok(png.black > 0 && png.white === 0, `${name}: ${JSON.stringify(png)}`);
  }
});

test('favicon.svg is the source: the shipped PNGs are what make-icons renders from it', async () => {
  const rendered = await renderIcons(SVG);
  for (const [name, buffer] of [['favicon.png', rendered.favicon], ['apple-icon.png', rendered.appleIcon]]) {
    const expected = await pixels(fileURLToPath(new URL(name, PUBLIC)));
    const actual = await pixels(buffer);
    assert.deepEqual(actual.info, expected.info, name);
    const share = drift(actual.data, expected.data);
    assert.ok(share < STALE, `public/${name} differs from favicon.svg in ${(share * 100).toFixed(2)}% of channels: run node scripts/make-icons.mjs`);
  }
});

test('favicon: the tab icon keeps its rounded corners, and the iOS icon is full-bleed and opaque', async () => {
  const tab = await pixels(fileURLToPath(new URL('favicon.png', PUBLIC)));
  assert.deepEqual([tab.info.width, tab.info.channels], [FAVICON_SIZE, 4]);
  assert.equal(at(tab, 0, 0)[3], 0, 'a rounded corner is transparent');
  assert.deepEqual(at(tab, FAVICON_SIZE / 2, 0), [...RED_RGB, 255], 'the edge between the corners is the logo red');

  // iOS rounds a home-screen icon itself and paints transparent pixels black.
  const apple = await pixels(fileURLToPath(new URL('apple-icon.png', PUBLIC)));
  assert.deepEqual([apple.info.width, apple.info.channels], [APPLE_ICON_SIZE, 3], 'no alpha channel');
  const last = APPLE_ICON_SIZE - 1;
  for (const [x, y] of [[0, 0], [last, 0], [0, last], [last, last]]) {
    assert.deepEqual(at(apple, x, y), RED_RGB, `corner ${x},${y}`);
  }
});

test('make-icons: the radius is the SVG\'s to set, but the square must be rounded exactly once', async () => {
  assert.equal(SVG.match(/ rx="[\d.]+"/g).length, 1, 'favicon.svg has one rounded square');

  // A rounder square needs no change to the script. Along the diagonal, a corner
  // of radius r (in viewBox units) cuts r(1 - 1/√2) of the square away; the
  // probe sits between today's cut and a clearly rounder one.
  const width = viewBoxWidth(SVG);
  const today = radius(SVG);
  const rounder = Math.min(today * 1.5 + width * 0.04, width / 2);
  assert.ok(rounder > today, 'favicon.svg is a rounded square, not a circle');
  const cut = (r) => r * (1 - Math.SQRT1_2) * (FAVICON_SIZE / width);
  const probe = Math.floor((cut(today) + cut(rounder)) / 2);
  const alpha = async (svg) => at(await pixels((await renderIcons(svg)).favicon), probe, probe)[3];
  assert.deepEqual([await alpha(SVG), await alpha(withRadius(SVG, rounder))], [255, 0], 'the larger radius cuts deeper into the corner');

  await assert.rejects(renderIcons(SVG.replace(/ rx="[\d.]+"/, '')), /expected one rounded square \(rx\), found 0/);
  await assert.rejects(renderIcons(SVG.replace('<g ', '<rect rx="5"/><g ')), /expected one rounded square \(rx\), found 2/);
});

test('make-icons: the copies resolve favicon.svg\'s one dark-mode block and keep no media query', () => {
  const block = /@media \(prefers-color-scheme:dark\)\{[^]*?\}\}/;
  assert.match(SVG, block);
  const [rules] = SVG.match(block);
  assert.throws(() => schemeSvg(SVG.replace(block, ''), 'dark'), /expected one @media \(prefers-color-scheme:dark\) block, found 0/);
  assert.throws(() => schemeSvg(SVG.replace(block, rules + rules), 'dark'), /found 2/);
  assert.throws(() => schemeSvg(SVG.replace(block, `${rules}@media (min-width:32px){.m{fill:red}}`), 'light'), /only the prefers-color-scheme:dark media query/);
});

test('make-icons: writes the PNGs only when run as the script, also through a symlink', () => {
  const script = fileURLToPath(new URL('../../scripts/make-icons.mjs', import.meta.url));
  const scriptUrl = pathToFileURL(script).href;
  const dir = mkdtempSync(path.join(tmpdir(), 'make-icons-'));
  try {
    const link = path.join(dir, 'make-icons.mjs');
    symlinkSync(script, link);
    assert.equal(isMain(script, scriptUrl), true, 'node scripts/make-icons.mjs');
    assert.equal(isMain(link, scriptUrl), true, 'through a symlink');
    // node --test runs a test file, which imports the script.
    assert.equal(isMain(fileURLToPath(import.meta.url), scriptUrl), false, 'imported by a test');
    assert.equal(isMain(undefined, scriptUrl), false, 'no script (node -e)');
    assert.equal(isMain(path.join(dir, 'missing.mjs'), scriptUrl), false, 'a path that does not exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('make-icons: a radius written as rx and ry still gives iOS a full-bleed icon', async () => {
  // Design tools often export both; with only rx removed, the SVG reads it from ry.
  const both = SVG.replace(/ rx="([\d.]+)"/, ' rx="$1" ry="$1"');
  const { favicon, appleIcon } = await renderIcons(both);
  assert.equal(at(await pixels(favicon), 0, 0)[3], 0, 'the tab icon stays rounded');
  assert.deepEqual(at(await pixels(appleIcon), 0, 0), RED_RGB, 'the iOS corner is red, not black');
});

test('favicon SVGs: opened by their URLs, each gets the sandboxed policy, not the site\'s', async () => {
  const { default: config } = await import('../../next.config.ts');
  const rules = await config.headers();
  const at = (source) => rules.findIndex((rule) => rule.source === source);
  assert.deepEqual([...FAVICON_SVGS].sort(), ['favicon-dark.svg', 'favicon-light.svg', 'favicon.svg']);
  for (const name of FAVICON_SVGS) {
    // A header's last matching rule wins, so the favicon's comes after the site-wide one.
    assert.ok(at(`/${name}`) > at('/(.*)'), `a rule for /${name} follows the site-wide rule`);
    const csp = rules[at(`/${name}`)].headers.find(({ key }) => key === 'Content-Security-Policy').value;
    assert.match(csp, /default-src 'none'/, name);
    assert.match(csp, /\bsandbox\b/, name);
    assert.doesNotMatch(csp, /script-src/, name);
  }
});

// The SHA-256 of every icon file served under each ICON_VERSION. Browsers and
// search engines keep an icon by its URL, so changed icon bytes, whether from
// favicon.svg or from make-icons.mjs, need a new version to reach them.
const ICON_DIGESTS = {
  2: {
    'favicon.svg': '6cf51414a4cfdc100044f79557a95b00b6bd85068dc8ff29df203ad0cad7c428',
    'favicon.png': '6dc7117340ce6824745a3bdd4b495ca60ab13c6fc194f5b68a056cb90e852cf1',
    'apple-icon.png': '35368d457f955073c6c17a811d4e82701c390916d2c2270a01038d1e1ffaa8b6',
  },
  3: {
    'favicon.svg': 'a43f32839402bbfd073beaf316c172c9bd57da0ea123a7cb701969919b8bf0d8',
    'favicon-light.svg': 'dc9c7d55acd51dc4f576a16fd504a1a0d499cad679c363b7cfd2da5b641c348f',
    'favicon-dark.svg': '29942c582281e966a0e90401661235a990ee4aa2a88550815a675acac47e5e62',
    'favicon.png': '6dc7117340ce6824745a3bdd4b495ca60ab13c6fc194f5b68a056cb90e852cf1',
    'apple-icon.png': '35368d457f955073c6c17a811d4e82701c390916d2c2270a01038d1e1ffaa8b6',
  },
};

test('ICON_VERSION: changed or added icon files ship under a new version', () => {
  const digests = Object.fromEntries(ICON_FILES.map((name) => [
    name,
    createHash('sha256').update(readFileSync(new URL(name, PUBLIC))).digest('hex'),
  ]));
  assert.deepEqual(
    digests,
    ICON_DIGESTS[ICON_VERSION],
    'an icon changed: bump ICON_VERSION in src/lib/site.ts and record the files\' digests in ICON_DIGESTS',
  );
});
