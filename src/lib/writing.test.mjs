import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { isDraftArticle } from './writingDraft.mjs';

// writing.ts reads content/writing and public/ under the working directory,
// which the build syncs from another repository: run it on a fixture instead.
const SLUG = '001-fixture';
const root = mkdtempSync(path.join(tmpdir(), 'writing-test-'));
const write = (file, text) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const svg = (attributes) => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="1" height="1"/></svg>`;
write(`public/writing-assets/${SLUG}/assets/chart.svg`, svg('viewBox="0 0 760 330" width="760" height="330"'));
write(`public/writing-assets/${SLUG}/assets/stroked.svg`, svg('stroke-width="2" width="12.5" height="40"'));
write(`public/writing-assets/${SLUG}/assets/fluid.svg`, svg('viewBox="0 0 10 10" width="100%" height="100%"'));
write(`public/writing-assets/${SLUG}/assets/photo.png`, 'not read: only an SVG is sized');
write(`public/writing-assets/${SLUG}/top.svg`, svg('width="10" height="20"'));
// Outside public/: a ../ path in an article, plain or encoded, must not reach it.
write('outside.svg', svg('width="1234" height="5678"'));
// A directory named like an SVG is not a file to show.
mkdirSync(path.join(root, `public/writing-assets/${SLUG}/assets/folder.svg`), { recursive: true });
// Files under public/ that no page can show as an article image.
write(`public/writing-assets/${SLUG}/assets/.hidden.svg`, svg('width="1" height="1"'));
write(`public/writing-assets/${SLUG}/assets/a\\b.svg`, svg('width="1" height="1"'));
write('public/clip.mp4', 'not an image');
write(
  `content/writing/${SLUG}/README.md`,
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

![Top](/writing-assets/${SLUG}/top.svg)

![Say "hi"](assets/chart.svg)

<img src="assets/chart.svg" width="50" alt="Sized">

<img src=x onerror="alert(1)"><script>alert(2)</script>

Links: [the dataset](javascript:alert(document.domain)), <javascript:alert(2)>, [a ref][bad],
[tabbed](java&#x09;script:alert(4)), [coded](&#106;avascript:alert(5)), [named](java&Tab;script:alert(11)),
[upper](&#X6A;avascript:alert(12)), [web](https://example.com/web),
[mail](mailto:contact@1six.tech), [section](#results) and [notes](./notes.md).

[bad]: javascript:alert(3)

Raw blocks: x <script><svg/onload=alert(6)></script>, <pre><img/src/onerror=alert(7)></pre>,
<code><svg/onload=alert(8)></code> and <kbd><svg/onload=alert(9)></kbd>.

| Cell |
|------|
| <code><img/src/onerror=alert(10)> |

An inline ![icon](assets/chart.svg) in a sentence, and [a source](https://example.com/data).

![lead](assets/chart.svg) leads a sentence.
`,
);

const cwd = process.cwd();
process.chdir(root);
const { getArticle, isSafeLinkTarget, unsafeArticleHtml } = await import('./writing.ts');
after(() => {
  process.chdir(cwd);
  rmSync(root, { recursive: true, force: true });
});

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const imgTags = (html) => html.match(/<img\b[^>]*>/g) ?? [];

/** Each figure link, with the image it wraps. */
function figures(html) {
  return Array.from(
    html.matchAll(/<p class="figure"><a class="writing-figure"([^>]*)>(<img\b[^>]*>)(<span class="writing-figure__hint" aria-hidden="true">[\s\S]*?<\/span>)<\/a><\/p>/g),
    ([, link, img, hint]) => ({ href: attr(link, 'href'), label: attr(link, 'aria-label'), target: attr(link, 'target'), img, hint }),
  );
}

test('an image alone in its paragraph becomes a figure that links to its own file', () => {
  const { html } = getArticle(SLUG);
  const found = figures(html);
  const base = `/writing-assets/${SLUG}`;

  assert.deepEqual(
    found.map(({ href, label }) => [href, label]),
    [
      [`${base}/assets/chart.svg`, 'Enlarge figure: Lag by stream'],
      [`${base}/assets/stroked.svg`, 'Enlarge figure'],
      [`${base}/assets/fluid.svg`, 'Enlarge figure: Fluid'],
      [`${base}/assets/photo.png`, 'Enlarge figure: Photo'],
      [`${base}/top.svg`, 'Enlarge figure: Top'],
      [`${base}/assets/chart.svg`, 'Enlarge figure: Say &quot;hi&quot;'],
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
});

const removeArticle = (slug) => {
  rmSync(path.join(root, 'content/writing', slug), { recursive: true, force: true });
  rmSync(path.join(root, 'public/writing-assets', slug), { recursive: true, force: true });
};

test('an image source names its file as the server reads it', () => {
  const slug = '002-paths';
  try {
    write(`public/writing-assets/${slug}/assets/지연 차트.svg`, svg('width="30" height="40"'));
    write(`public/writing-assets/${slug}/assets/R&D's chart.svg`, svg('width="50" height="60"'));
    write(`public/writing-assets/${slug}/assets/q3 chart #1?.svg`, svg('width="70" height="90"'));
    write(`public/writing-assets/${slug}/assets/Shot.PNG`, 'an image type in capitals');
    write(`public/writing-assets/${slug}/assets/Chart.SVG`, svg('width="80" height="20"'));
    write(
      `content/writing/${slug}/README.md`,
      `---\ntitle: Paths\ndate: 2026-11-08\n---\n\n` +
        [
          '![Spaced](<assets/지연 차트.svg>)',
          '![Encoded](assets/%EC%A7%80%EC%97%B0%20%EC%B0%A8%ED%8A%B8.svg)',
          '![Query](assets/지연%20차트.svg?v=2#top)',
          '![Dotted](./assets/../assets/./지연%20차트.svg)',
          `![Decomposed](<assets/${'지연 차트'.normalize('NFD')}.svg>)`,
          `![Sibling](../${SLUG}/assets/chart.svg)`,
          `![Absolute](/writing-assets/${SLUG}/top.svg)`,
          "![Escaped](<assets/R&D's chart.svg>)",
          '![Reserved](assets/q3%20chart%20%231%3F.svg)',
          '![Capitals](assets/Shot.PNG)',
          '![Upper](assets/Chart.SVG)',
          '![Doubled](<assets//지연 차트.svg>)',
          `![Trailing](/writing-assets/${SLUG}/top.svg/)`,
        ].join('\n\n'),
    );
    const tags = imgTags(getArticle(slug).html);
    const found = Object.fromEntries(tags.map((tag) => [attr(tag, 'alt'), [attr(tag, 'width'), attr(tag, 'height')]]));
    assert.deepEqual(found, {
      Spaced: ['30', '40'],
      Encoded: ['30', '40'],
      Query: ['30', '40'],
      Dotted: ['30', '40'],
      Decomposed: ['30', '40'],
      Sibling: ['760', '330'],
      Absolute: ['10', '20'],
      Escaped: ['50', '60'],
      Reserved: ['70', '90'],
      Capitals: [undefined, undefined],
      Upper: ['80', '20'],
      Doubled: ['30', '40'],
      Trailing: ['10', '20'],
    });
    // The src names the file by its own name on disk, each segment encoded in full, whatever form the
    // source took: Next's static server matches only that form for a name such as R&D's chart.svg.
    const assets = `/writing-assets/${slug}/assets`;
    const korean = `${assets}/%EC%A7%80%EC%97%B0%20%EC%B0%A8%ED%8A%B8.svg`;
    const srcs = Object.fromEntries(tags.map((tag) => [attr(tag, 'alt'), attr(tag, 'src')]));
    assert.deepEqual(srcs, {
      Spaced: korean,
      Encoded: korean,
      Query: korean,
      Dotted: korean,
      Decomposed: korean,
      Sibling: `/writing-assets/${SLUG}/assets/chart.svg`,
      Absolute: `/writing-assets/${SLUG}/top.svg`,
      Escaped: `${assets}/R%26D's%20chart.svg`,
      Reserved: `${assets}/q3%20chart%20%231%3F.svg`,
      Capitals: `${assets}/Shot.PNG`,
      Upper: `${assets}/Chart.SVG`,
      // Next's static server collapses "//" and drops a trailing "/"; the src ships without them.
      Doubled: korean,
      Trailing: `/writing-assets/${SLUG}/top.svg`,
    });
  } finally {
    removeArticle(slug);
  }
});

test('an image with no file under public/, or from a web address, fails the build and names the article', () => {
  const slug = '002-broken-figure';
  const fixture = `/writing-assets/${SLUG}`;
  const missing = [
    ['assets/missing.svg', `public/writing-assets/${slug}/assets/missing.svg`],
    [`${fixture}/assets/folder.svg`, `public${fixture}/assets/folder.svg`, 'a directory'],
    ['..%2F..%2F..%2Foutside.svg', `public/writing-assets/${slug}/..%2F..%2F..%2Foutside.svg`, 'an encoded ../ names no entry'],
    [`${fixture}/top.svg/inner.svg`, `public${fixture}/top.svg/inner.svg`, 'a path through a file'],
    ['assets/없는 차트.svg', `public/writing-assets/${slug}/assets/없는 차트.svg`, 'a missing name is shown as written, not percent-encoded'],
    ['../../../outside.svg', 'public/outside.svg', 'a ../ path stops at the site root, as in a browser'],
    [`${fixture}/assets%2Fchart.svg`, `public${fixture}/assets%2Fchart.svg`, 'an encoded slash'],
    ["assets/R&D's missing.svg", `public/writing-assets/${slug}/assets/R&D's missing.svg`, 'a name with & and an apostrophe is quoted as written'],
    [`${fixture}/`, `public${fixture}/`, 'a folder path'],
    ['', `public/writing-assets/${slug}/`, 'an empty source'],
    ['data:image/png;base64,AAAA', `public/writing-assets/${slug}/data:image/png;base64,AAAA`, 'a data URL'],
  ];
  const external = [
    'https://example.com/chart.png',
    'http://example.com/chart.png',
    'HTTPS://EXAMPLE.COM/CHART.PNG',
    '//example.com/chart.png',
    `https://1six.tech${fixture}/assets/chart.svg`,
  ];
  const fails = (markdown, expected, label) => {
    try {
      write(`content/writing/${slug}/README.md`, `---\ntitle: Broken\ndate: 2026-11-08\n---\n\nText.\n\n${markdown}\n`);
      assert.throws(
        () => getArticle(slug),
        (error) => error.message.startsWith(`writing: ${slug} shows the image `) && error.message.includes(expected) && error.message.endsWith('; refusing to publish it.'),
        label,
      );
    } finally {
      removeArticle(slug);
    }
  };
  for (const [source, file, label = source] of missing) {
    // No file differs from these only in case, so the message offers no other name.
    fails(`![Figure](<${source}>)`, `"${source}", but ${file} is not a file; refusing to publish it.`, label);
  }
  const meant = (source, file) =>
    `"${source}", but public${source} is not a file (names are case-sensitive: did you mean public${file}?)`;
  fails(`![Figure](${fixture}/assets/Chart.svg)`, meant(`${fixture}/assets/Chart.svg`, `${fixture}/assets/chart.svg`), 'a name differing only in case');
  fails('![Figure](/Writing-Assets/001-FIXTURE/top.svg)', meant('/Writing-Assets/001-FIXTURE/top.svg', `${fixture}/top.svg`), 'folders differing only in case');
  fails(`![Figure](${fixture}/assets/.hidden.svg)`, `but the site does not serve public${fixture}/assets/.hidden.svg: its name starts with "."`, 'a dotfile');
  fails('![Figure](/clip.mp4)', 'but public/clip.mp4 is not an allowed type (.avif, .gif, .jpeg, .jpg, .png, .svg, .webp)', 'a file that is not an image');
  fails(`![Figure](${fixture}/assets/a%5Cb.svg)`, `but the site does not serve public${fixture}/assets/a\\b.svg: a name in it holds "\\"`, 'a backslash, which Next reads as a slash');
  fails(`![Figure](<${fixture}/100%.png>)`, 'but a "%" in its path starts no valid escape (write a literal % as %25)', 'a malformed escape');
  // marked leaves these for the browser to decode; the check would read a cut-short path instead.
  for (const [source, reference] of [['assets/a&#x20;b.svg', '&#x20;'], ['assets/a&nbsp;b.svg', '&nbsp;'], ['/&#47;example.com/x.png', '&#47;']]) {
    fails(`![Figure](${source})`, `"${source}", which spells a character as ${reference}: type the character itself`, reference);
  }
  for (const source of external) {
    fails(`![Figure](${source})`, `"${source}" from a web address; an article image must be one of the site's own files`, source);
  }
  fails('An inline ![icon](assets/missing.svg) image.', `"assets/missing.svg", but public/writing-assets/${slug}/assets/missing.svg`, 'an inline image');
  fails('![Figure][chart]\n\n[chart]: https://example.com/chart.png', '"https://example.com/chart.png" from a web address', 'a reference image');
  const long = `assets/${'a'.repeat(300)}.svg`;
  const cut = (text) => text.slice(0, 160);
  fails(`![Figure](${long})`, `"${cut(long)}", but public${cut(`/writing-assets/${slug}/${long}`)} is not a file`, 'a long name is cut short');
});

test('a build error quotes an article with its control characters still encoded', () => {
  const slug = '002-control';
  const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
  const cases = [
    // Decoded raw, %0A would start a line the Actions log reads as a command, and %1B a terminal escape.
    ['Date: 2026-11-08\n\n![Figure](<assets/a%0A::error title=x::y%1B[2K.svg>)', '"assets/a%0A::error title=x::y%1B[2K.svg"'],
    ['Date: 2026-11-08\u001b]0;title\u0007', 'needs a date like 2026-11-08, found "2026-11-08%1B]0;title%07"'],
  ];
  for (const [line, quoted] of cases) {
    try {
      write(`content/writing/${slug}/README.md`, `# Control\n\n${line}\n\nText.\n`);
      assert.throws(
        () => getArticle(slug),
        (error) => error.message.startsWith(`writing: ${slug} `) && error.message.includes(quoted) && !controls.test(error.message),
        quoted,
      );
    } finally {
      removeArticle(slug);
    }
  }
  try {
    // The category error and a case hint quote article text too; the hint quotes a synced file name.
    write(`content/writing/${slug}/README.md`, '---\ntitle: C\ndate: 2026-11-08\ncategory: x\u001b]0;t\u0007\n---\n\nText.\n');
    assert.throws(() => getArticle(slug), (error) => error.message === 'Unknown writing category: x%1B]0;t%07');
    write(`public/writing-assets/${slug}/assets/a\u001b[2K.svg`, svg('width="1" height="1"'));
    write(`content/writing/${slug}/README.md`, '---\ntitle: C\ndate: 2026-11-08\n---\n\n![Figure](<assets/A%1B[2K.svg>)\n');
    assert.throws(
      () => getArticle(slug),
      (error) => error.message.includes(`did you mean public/writing-assets/${slug}/assets/a%1B[2K.svg?`) && !controls.test(error.message),
    );
  } finally {
    removeArticle(slug);
  }
});

test('a file added between getArticles() calls is seen, because each call lists public/ afresh', () => {
  const slug = '002-late';
  try {
    write(`content/writing/${slug}/README.md`, '---\ntitle: Late\ndate: 2026-11-08\n---\n\n![Late](assets/late.svg)\n');
    assert.throws(() => getArticle(slug), /late\.svg is not a file/);
    write(`public/writing-assets/${slug}/assets/late.svg`, svg('width="1" height="2"'));
    assert.match(getArticle(slug).html, /src="\/writing-assets\/002-late\/assets\/late\.svg"/);
  } finally {
    removeArticle(slug);
  }
});

test('a decomposed name on disk ships under its own bytes', () => {
  const slug = '002-nfd';
  const decomposed = '지연'.normalize('NFD');
  try {
    write(`public/writing-assets/${slug}/assets/${decomposed}.svg`, svg('width="3" height="4"'));
    write(`content/writing/${slug}/README.md`, `---\ntitle: NFD\ndate: 2026-11-08\n---\n\n![Composed](<assets/${'지연'.normalize('NFC')}.svg>)\n`);
    const [tag] = imgTags(getArticle(slug).html);
    assert.equal(attr(tag, 'src'), `/writing-assets/${slug}/assets/${encodeURIComponent(decomposed)}.svg`);
    assert.deepEqual([attr(tag, 'width'), attr(tag, 'height')], ['3', '4']);
  } finally {
    removeArticle(slug);
  }
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

test('a link to anything but the web, mail, a #fragment or a relative path keeps its words, not its link', () => {
  const { html } = getArticle(SLUG);
  const hrefs = Array.from(html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g), ([, href]) => href);
  assert.ok(!hrefs.some((href) => /script|alert/i.test(href)), JSON.stringify(hrefs));
  for (const words of ['the dataset', 'a ref', 'tabbed', 'coded', 'named', 'upper']) {
    assert.match(html, new RegExp(`[\\s,(]${words}[,.)\\s]`), `"${words}" stays as text`);
  }
  for (const href of ['https://example.com/web', 'mailto:contact@1six.tech', '#results', './notes.md']) {
    assert.ok(hrefs.includes(href), `${href} keeps its link`);
  }
});

test('isSafeLinkTarget reads the scheme as a browser would', () => {
  for (const safe of ['https://a.b', 'http://a.b', 'MAILTO:x@y.z', '#top', '/writing', './x.md', 'x/y', '?q=1']) {
    assert.equal(isSafeLinkTarget(safe), true, safe);
  }
  for (const unsafe of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\u0001javascript:alert(1)',
    'java\tscript:alert(1)',
    'java&#x09;script:alert(1)',
    'java&Tab;script:alert(1)',
    'java&NewLine;script:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    '&#X6a;avascript:alert(1)',
    'javascript&colon;alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]) {
    assert.equal(isSafeLinkTarget(unsafe), false, JSON.stringify(unsafe));
  }
});

test('text after an inline <pre>, <code>, <kbd> or <script> stays text (marked keeps it raw)', () => {
  const { html } = getArticle(SLUG);
  assert.doesNotMatch(html, /<(svg|img)\//i, 'no live <svg/onload> or <img/onerror>');
  for (const shown of [
    '&lt;script&gt;&lt;svg/onload=alert(6)&gt;&lt;/script&gt;',
    '&lt;pre&gt;&lt;img/src/onerror=alert(7)&gt;&lt;/pre&gt;',
    '&lt;code&gt;&lt;svg/onload=alert(8)&gt;&lt;/code&gt;',
    '&lt;kbd&gt;&lt;svg/onload=alert(9)&gt;&lt;/kbd&gt;',
    '<td>&lt;code&gt;&lt;img/src/onerror=alert(10)&gt;</td>',
  ]) {
    assert.ok(html.includes(shown), shown);
  }
  // Everything the fixture renders is what the renderer emits.
  assert.equal(unsafeArticleHtml(html), null);
});

test('unsafeArticleHtml passes what the renderer emits and flags anything else', () => {
  for (const safe of [
    '<h2 id="results">Results</h2>\n<p>a <em>b</em> <strong>c</strong> <del>d</del> <code>x &lt; y</code><br></p>',
    '<p><a href="https://a.b" target="_blank" rel="noreferrer noopener" title="t &quot;q&quot;">x</a> <a href="#top">y</a></p>',
    '<pre><code class="language-ts">let a = b &gt; c;\n</code></pre>\n<blockquote>\n<p>q</p>\n</blockquote>\n<hr>',
    '<ol start="3">\n<li><input checked="" disabled="" type="checkbox"> done</li>\n</ol>',
    '<div class="table-scroll"><table>\n<thead>\n<tr>\n<th align="center">a</th>\n</tr>\n</thead>\n</table></div>',
    '<p class="figure"><a class="writing-figure" href="/writing/x/a.svg" aria-label="Enlarge figure: it&#39;s"><img loading="lazy" decoding="async" width="10" height="20" src="/writing/x/a.svg" alt="it&#39;s"><span class="writing-figure__hint" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M14 4h6v6"/></svg></span></a></p>',
  ]) {
    assert.equal(unsafeArticleHtml(safe), null, safe);
  }
  for (const unsafe of [
    '<p>x <svg/onload=alert(1)></p>',
    '<p><img/src/onerror=alert(2)></p>',
    '<p><img src="x"onerror="alert(3)"></p>',
    '<p><SVG ONLOAD="alert(4)"></p>',
    '<p><a href="javascript:alert(5)">x</a></p>',
    '<p><a href="java&#x09;script:alert(6)">x</a></p>',
    '<p><a href=x>y</a></p>',
    '<script>alert(7)</script>',
    '<p><iframe src="https://a.b"></iframe></p>',
    '<p style="position:fixed">x</p>',
    '<p><img src="https://a.b/x.png" srcset="y 2x"></p>',
    '<!-- x --><p>y</p>',
    '<p>x</p onclick="alert(8)">',
    '<p>a < b</p>',
  ]) {
    assert.notEqual(unsafeArticleHtml(unsafe), null, unsafe);
  }
});

test('publication metadata connects categories and authors and orders newest writing first', async () => {
  const { getArticles } = await import('./writing.ts');
  const samples = [
    ['002-opinion', 'op-ed', '2026-02-01'],
    ['003-news', 'announcements', '2026-01-15'],
    ['004-opinion', 'OP-ED', '2026-02-01'],
  ];
  try {
    for (const [slug, category, date] of samples) {
      write(`content/writing/${slug}/README.md`, `---\ntitle: ${slug}\nauthor: Dean N.\ndate: ${date}\ncategory: ${category}\n---\n\nA published piece.`);
    }
    const opinion = getArticle('002-opinion');
    assert.equal(opinion.category, 'op-ed');
    assert.equal(opinion.authorSlug, 'dean-n');
    assert.equal(getArticle('003-news').category, 'announcements');
    assert.equal(getArticle('004-opinion').category, 'op-ed');
    assert.equal(getArticle(SLUG).category, 'research');
    assert.equal(getArticle(SLUG).authorSlug, null);
    assert.deepEqual(getArticles().slice(0, 3).map((article) => article.slug), ['004-opinion', '002-opinion', '003-news']);
    write('content/writing/005-invalid/README.md', '---\ntitle: Invalid\ncategory: oped\n---\n\nText.');
    assert.throws(() => getArticle('005-invalid'), /Unknown writing category: oped/);
  } finally {
    for (const slug of ['002-opinion', '003-news', '004-opinion', '005-invalid']) {
      rmSync(path.join(root, 'content/writing', slug), { recursive: true, force: true });
    }
  }
});

test('a draft date keeps an article off the site in every header form', async () => {
  const { getArticles } = await import('./writing.ts');
  const drafts = {
    '002-byline-draft': '# Byline draft\n\nAuthor: Dean N.\nDate: 2026-11-08 (draft)\n\nNot yet.\n',
    '003-front-draft': '---\ntitle: Front draft\nauthor: Dean N.\ndate: "2026-11-09 (Draft)"\n---\n\nNot yet.\n',
    '004-crlf-draft': '# CRLF draft\r\n\r\nDate: 2026-11-10 (draft)\r\n\r\nNot yet.\r\n',
  };
  try {
    for (const [slug, markdown] of Object.entries(drafts)) write(`content/writing/${slug}/README.md`, markdown);
    const listed = getArticles().map((article) => article.slug);
    for (const slug of Object.keys(drafts)) {
      assert.equal(listed.includes(slug), false, `${slug} is not listed`);
      assert.equal(getArticle(slug), null, `${slug} has no article page`);
    }
    assert.ok(listed.includes(SLUG), 'published articles are unaffected');
  } finally {
    Object.keys(drafts).forEach(removeArticle);
  }
});

test('a checkout with no published article fails the build rather than shipping an empty Writing', async () => {
  const { getArticles } = await import('./writing.ts');
  const published = path.join(root, 'content/writing', SLUG);
  const parked = path.join(root, 'parked-fixture');
  renameSync(published, parked);
  try {
    write('content/writing/002-only-draft/README.md', '# Only draft\n\nDate: 2026-11-08 (draft)\n\nNot yet.\n');
    assert.throws(() => getArticles(), /content\/writing has no published articles\./);
    assert.throws(() => getArticle('002-only-draft'), /no published articles/);
    removeArticle('002-only-draft');
    assert.throws(() => getArticles(), /no published articles/, 'an empty folder fails the same way');
  } finally {
    removeArticle('002-only-draft');
    renameSync(parked, published);
  }
});

test('a plain date line is read as the date and left out of the article', () => {
  try {
    write('content/writing/002-dated/README.md', '# Dated\n\nAuthor: Dean N.\nDate: 2026-11-08\n\nThe body.\n');
    const article = getArticle('002-dated');
    assert.equal(article.date, '2026-11-08');
    assert.equal(article.dateLabel, '8 Nov 2026');
    assert.equal(article.html.includes('Date:'), false);
    assert.match(article.html, /The body/);
  } finally {
    removeArticle('002-dated');
  }
});

test('with a date in frontmatter, a leading Date line stays in the article unless it is a date', () => {
  const opening = (line) => `---\ntitle: Front\ndate: 2026-11-01\n---\n\n${line}\n\nThe body.\n`;
  try {
    write('content/writing/002-prose/README.md', opening('Date: of record is next Tuesday.'));
    const prose = getArticle('002-prose');
    assert.equal(prose.date, '2026-11-01');
    assert.match(prose.html, /Date: of record is next Tuesday\./);
    assert.match(prose.html, /The body/);

    write('content/writing/002-both/README.md', opening('Date: 2026-11-01'));
    const both = getArticle('002-both');
    assert.equal(both.date, '2026-11-01');
    assert.equal(both.html.includes('Date:'), false);
    assert.match(both.html, /The body/);
  } finally {
    removeArticle('002-prose');
    removeArticle('002-both');
  }
});

test('a missing or impossible date fails the build and names the article', () => {
  const invalid = [
    ['002-no-date', '# No date\n\nAuthor: Dean N.\n\nText.\n', 'none'],
    ['002-empty-date', '# Empty\n\nDate:\n\nText.\n', 'none'],
    ['002-words', '# Words\n\nDate: soon\n\nText.\n', '"soon"'],
    ['002-month', '---\ntitle: Month\ndate: 2026-13-45\n---\n\nText.\n', '"2026-13-45"'],
    ['002-rollover', '# Rollover\n\nDate: 2026-02-31\n\nText.\n', '"2026-02-31"'],
    ['002-other-note', '# Note\n\nDate: 2026-11-08 (tentative)\n\nText.\n', '"2026-11-08 (tentative)"'],
  ];
  for (const [slug, markdown, found] of invalid) {
    try {
      write(`content/writing/${slug}/README.md`, markdown);
      assert.throws(
        () => getArticle(slug),
        (error) => error.message.includes(`writing: ${slug} needs a date like 2026-11-08, found ${found}`),
        slug,
      );
    } finally {
      removeArticle(slug);
    }
  }
});

test('a date line padded to the end of the file fails at once', () => {
  const slug = '002-padded';
  const padding = ' '.repeat(2000);
  try {
    write(`content/writing/${slug}/README.md`, `# Padded\n\nDate:${padding}x${padding}`);
    const started = Date.now();
    assert.throws(() => getArticle(slug), /002-padded needs a date like 2026-11-08, found none/);
    assert.ok(Date.now() - started < 1000, 'parsing a date line stays linear in its length');
  } finally {
    removeArticle(slug);
  }
});

test('a title or author line padded to the end of the file fails at once', () => {
  const padding = ' '.repeat(80000);
  for (const [slug, markdown] of [['002-padded-title', `#${padding}`], ['002-padded-author', `# T\n\nAuthor:${padding}`]]) {
    try {
      write(`content/writing/${slug}/README.md`, markdown);
      const started = Date.now();
      assert.throws(() => getArticle(slug), new RegExp(`${slug} needs a date`));
      assert.ok(Date.now() - started < 1000, `${slug}: parsing stays linear in the line length`);
    } finally {
      removeArticle(slug);
    }
  }
});

test('a heading and byline are read without their padding, and an empty byline leaves the date alone', () => {
  try {
    write('content/writing/002-byline/README.md', '#   A title  \n\nAuthor:   Dean N.  \nDate: 2026-11-08\n\nThe body.\n');
    const padded = getArticle('002-byline');
    assert.equal(padded.title, 'A title');
    assert.equal(padded.author, 'Dean N.');
    write('content/writing/002-byline/README.md', '# T\n\nAuthor:\nDate: 2026-11-08\n\nThe body.\n');
    const empty = getArticle('002-byline');
    assert.equal(empty.author, '1SIX');
    assert.equal(empty.date, '2026-11-08');
  } finally {
    removeArticle('002-byline');
  }
});

test('a padded value is read without its padding', () => {
  try {
    write('content/writing/002-roomy/README.md', '# Roomy\n\nDate:   2026-11-08   \n\nThe body.\n');
    assert.equal(getArticle('002-roomy').date, '2026-11-08');
  } finally {
    removeArticle('002-roomy');
  }
});

test('only the date line of an article can mark it as a draft', () => {
  for (const markdown of [
    'Date: 2026-11-08 (draft)',
    'date: 2026-11-08 (DRAFT)',
    "date: '2026-11-08 (draft)'",
    '# Title\r\n\r\nDate: 2026-11-08  (draft)\r\n\r\nBody',
    '# Title\n\nAuthor: Dean N.\nDate: 2026-11-08 (draft)\n\nBody',
    '\uFEFF# Title\n\nDate: 2026-11-08 (draft)\n\nBody',
    '---\ntitle: T\ndate: 2026-11-08 (draft)\n---\n\nBody',
    '---\ntitle: T\n---\n\n# T\n\nAuthor: Dean N.\nDate: 2026-11-08 (draft)\n\nBody',
    '---\r\ntitle: T\r\ndate: 2026-11-08 (draft)\r\n---\r\n\r\nBody',
  ]) assert.equal(isDraftArticle(markdown), true, markdown);
  for (const markdown of [
    'Date: 2026-11-08',
    'The Date: 2026-11-08 (draft) was moved.',
    'Date: 2026-11-08 (draft) of the note',
    'Updated: 2026-11-08 (draft)',
    '# Title\n\nAuthor: Dean N.\nDate: 2026-11-01\n\nThe body.\n\nDate: 2026-12-01 (draft)\n',
    '# Title\n\nDate: 2026-11-01\n\n```\nDate: 2026-12-01 (draft)\n```\n',
    '---\ntitle: T\ndate: 2026-11-01\n---\n\nThe body.\n\ndate: 2026-12-01 (draft)\n',
    '---\nThe body never closes its fence.\n\nDate: 2026-12-01 (draft)\n',
    '# Title\n\nDate: 2026-11-01\n\n# Proposed schedule\nDate: 2026-12-01 (draft)\n',
    '---\ntitle: T\ndate: 2026-11-01\n---\n\nDate: 2026-12-01 (draft)\n\nBody',
    '---\r\ntitle: T\r\ndate: 2026-11-01\r\n---\r\n\r\nBody\r\n\r\nDate: 2026-12-01 (draft)\r\n',
  ]) assert.equal(isDraftArticle(markdown), false, markdown);
});
