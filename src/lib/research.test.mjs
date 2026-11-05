import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

// research.ts reads content/research and public/ under the working directory,
// which the build syncs from another repository: run it on a fixture instead.
const SLUG = '001-fixture';
const root = mkdtempSync(path.join(tmpdir(), 'research-test-'));
const write = (file, text) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const svg = (attributes) => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="1" height="1"/></svg>`;
write(`public/research/${SLUG}/assets/chart.svg`, svg('viewBox="0 0 760 330" width="760" height="330"'));
write(`public/research/${SLUG}/assets/stroked.svg`, svg('stroke-width="2" width="12.5" height="40"'));
write(`public/research/${SLUG}/assets/fluid.svg`, svg('viewBox="0 0 10 10" width="100%" height="100%"'));
write(`public/research/${SLUG}/top.svg`, svg('width="10" height="20"'));
// Outside public/: a ../ path in the article must not reach it.
write('outside.svg', svg('width="1234" height="5678"'));
// A directory named like an SVG is not a file to read.
mkdirSync(path.join(root, `public/research/${SLUG}/assets/folder.svg`), { recursive: true });
write(
  `content/research/${SLUG}/README.md`,
  `---
title: Fixture
author: Tester
date: 2026-01-02
---

## Results

## Why \`&lt;\` is escaped

![Lag by stream](assets/chart.svg)

*Figure 1. Lag by stream.*

![](./assets/stroked.svg)

![Fluid](assets/fluid.svg)

![Photo](assets/photo.png)

![Gone](assets/missing.svg)

![Top](/research/${SLUG}/top.svg)

![Say "hi"](assets/chart.svg)

<img src="assets/chart.svg" width="50" alt="Sized">

<img src=x onerror="alert(1)"><script>alert(2)</script>

![Escape](../../../outside.svg)

![Folder](assets/folder.svg)

An inline ![icon](assets/chart.svg) in a sentence, and [a source](https://example.com/data).

![lead](assets/chart.svg) leads a sentence.
`,
);

const cwd = process.cwd();
process.chdir(root);
const { getArticle } = await import('./research.ts');
after(() => {
  process.chdir(cwd);
  rmSync(root, { recursive: true, force: true });
});

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const imgTags = (html) => html.match(/<img\b[^>]*>/g) ?? [];

/** Each figure link, with the image it wraps. */
function figures(html) {
  return Array.from(
    html.matchAll(/<p class="figure"><a class="research-figure"([^>]*)>(<img\b[^>]*>)(<span class="research-figure__hint" aria-hidden="true">[\s\S]*?<\/span>)<\/a><\/p>/g),
    ([, link, img, hint]) => ({ href: attr(link, 'href'), label: attr(link, 'aria-label'), target: attr(link, 'target'), img, hint }),
  );
}

test('an image alone in its paragraph becomes a figure that links to its own file', () => {
  const { html } = getArticle(SLUG);
  const found = figures(html);
  const base = `/research/${SLUG}`;

  assert.deepEqual(
    found.map(({ href, label }) => [href, label]),
    [
      [`${base}/assets/chart.svg`, 'Enlarge figure: Lag by stream'],
      [`${base}/assets/stroked.svg`, 'Enlarge figure'],
      [`${base}/assets/fluid.svg`, 'Enlarge figure: Fluid'],
      [`${base}/assets/photo.png`, 'Enlarge figure: Photo'],
      [`${base}/assets/missing.svg`, 'Enlarge figure: Gone'],
      [`${base}/top.svg`, 'Enlarge figure: Top'],
      [`${base}/assets/chart.svg`, 'Enlarge figure: Say &quot;hi&quot;'],
      [`${base}/../../../outside.svg`, 'Enlarge figure: Escape'],
      [`${base}/assets/folder.svg`, 'Enlarge figure: Folder'],
    ],
  );
  for (const { href, img, target, hint } of found) {
    assert.equal(attr(img, 'src'), href, 'the link opens the image it shows');
    assert.equal(attr(img, 'loading'), 'lazy');
    assert.equal(attr(img, 'decoding'), 'async');
    assert.equal(target, undefined, 'figures open in place, not in a new tab');
    assert.match(hint, /<svg viewBox="0 0 24 24"[^>]*focusable="false">/);
  }

  // Captions, inline images and external links keep their own treatment.
  assert.match(html, /<p class="caption">Figure 1\. Lag by stream\.<\/p>/);
  assert.match(html, /<p>An inline <img [^>]*alt="icon"> in a sentence/);
  assert.ok(!found.some(({ img }) => ['icon', 'lead', 'Sized'].includes(attr(img, 'alt'))));
  assert.match(html, /<p><img [^>]*alt="lead"> leads a sentence\.<\/p>/);
  assert.match(html, /<a href="https:\/\/example\.com\/data" target="_blank" rel="noreferrer noopener">/);
});

test('a local SVG reserves its box from its root width and height; anything else is left unsized', () => {
  const { html } = getArticle(SLUG);
  const size = (alt) => {
    const tag = imgTags(html).find((img) => attr(img, 'alt') === alt);
    assert.ok(tag, `no image with alt ${alt}`);
    return [attr(tag, 'width'), attr(tag, 'height')];
  };

  assert.deepEqual(size('Lag by stream'), ['760', '330']);
  assert.deepEqual(size('icon'), ['760', '330'], 'inline images are sized too');
  assert.deepEqual(size(''), ['12.5', '40'], 'decimals; stroke-width is not width');
  assert.deepEqual(size('Top'), ['10', '20'], 'absolute public paths');
  assert.deepEqual(size('Fluid'), [undefined, undefined], 'percentages are not a size');
  assert.deepEqual(size('Photo'), [undefined, undefined], 'only SVGs are read');
  assert.deepEqual(size('Gone'), [undefined, undefined], 'a missing file');
  assert.deepEqual(size('Escape'), [undefined, undefined], 'a path that leaves public/ is not read');
  assert.deepEqual(size('Folder'), [undefined, undefined], 'a directory is not read (and does not throw)');
});

test('raw HTML in an article (synced from another repository) is shown as text, never run', () => {
  const { html } = getArticle(SLUG);
  assert.ok(!imgTags(html).some((img) => /\sonerror=/i.test(img)), 'no live event handler');
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /&lt;img src=x onerror="alert\(1\)"&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.ok(!imgTags(html).some((img) => attr(img, 'alt') === 'Sized'), 'a raw <img> is text too');
});

test('an escaped entity in a heading decodes once for the contents list', () => {
  const { headings } = getArticle(SLUG);
  assert.ok(headings.some(({ text }) => text === 'Why &lt; is escaped'), JSON.stringify(headings));
});
