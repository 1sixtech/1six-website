import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const PUBLIC = new URL('../../../public/', import.meta.url);
const css = read('./pretendard-variable.css');

function parseRanges(value) {
  return value.split(',').map((part) => {
    const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(from, 16), parseInt(to, 16)];
  });
}

const slices = Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/g), ([, body]) => body)
  .filter((body) => /font-family:\s*'Pretendard Variable'/.test(body))
  .map((body) => ({
    url: body.match(/src:\s*url\(([^)]+)\)/)?.[1],
    ranges: parseRanges(body.match(/unicode-range:\s*([^;]+);/)?.[1] ?? ''),
    display: body.match(/font-display:\s*([^;]+);/)?.[1],
    weight: body.match(/font-weight:\s*([^;]+);/)?.[1],
  }));

test('Pretendard slices are all served, the preloads cover every page, and the folder caches for good', async () => {
  assert.equal(slices.length, 92);
  for (const { url, display, weight } of slices) {
    assert.match(url, /^\/fonts\/pretendard-1\.3\.9\/PretendardVariable\.subset\.\d+\.woff2$/);
    assert.ok(existsSync(new URL(`.${url}`, PUBLIC)), `public${url} is missing`);
    assert.equal(display, 'swap', url);
    assert.equal(weight, '45 920', url);
  }

  // The root layout preloads the slices every page sets: Latin text, the %
  // of 16% and 84%, the footer's ©, and the @ of the contact address.
  const sliceUrl = (n) => `/fonts/pretendard-1.3.9/PretendardVariable.subset.${n}.woff2`;
  const listed = read('../layout.tsx').match(/PRETENDARD_PAGE_SLICES = \[([\d,\s]+)\]/)?.[1];
  assert.ok(listed, 'the layout lists the slices it preloads');
  const preloaded = listed.split(',').map((n) => slices.find(({ url }) => url === sliceUrl(n.trim())));
  assert.ok(preloaded.every(Boolean), 'every preloaded slice is one of the slices');
  const covered = (char) => {
    const code = char.codePointAt(0);
    return preloaded.some(({ ranges }) => ranges.some(([from, to]) => code >= from && code <= to));
  };
  for (const char of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;?!%©@–—“”') {
    assert.ok(covered(char), `the preloads lack ${JSON.stringify(char)}`);
  }

  // About adds the slice with the curly apostrophe of its h1 (we don’t dream).
  const about = read('../about/page.tsx').match(/APOSTROPHE_SLICE = '([^']+)'/)?.[1];
  const apostrophe = slices.find(({ url }) => url === about);
  assert.ok(apostrophe, `About's ${about} is not one of the slices`);
  assert.ok(apostrophe.ranges.some(([from, to]) => 0x2019 >= from && 0x2019 <= to), 'it carries U+2019');

  // A metric-matched fallback covers the swap, and the stack names both.
  assert.match(css, /font-family: 'Pretendard Fallback';\s*src: local\('Arial'\);/);
  assert.match(read('../globals.css'), /--font-sans: 'Pretendard Variable', 'Pretendard Fallback',/);

  // Slices live in a versioned folder, so they are cached as immutable.
  const { default: config } = await import('../../../next.config.ts');
  const fonts = (await config.headers()).find(({ source }) => source === '/fonts/:path*');
  assert.deepEqual(fonts?.headers, [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
});
