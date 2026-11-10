import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { ASSET_EXTENSIONS } from './writingAssets.mjs';
import { getWriterByName, isWritingCategory, type WritingCategory } from './writingCatalog.ts';
import { isDraftArticle } from './writingDraft.mjs';
import { isArticleSlug } from './writingSlug.mjs';

const CONTENT_DIR = path.join(process.cwd(), 'content/writing');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

export type WritingHeading = {
  id: string;
  text: string;
};

export type WritingArticle = {
  slug: string;
  number: string;
  title: string;
  author: string;
  authorSlug: string | null;
  category: WritingCategory;
  date: string;
  dateLabel: string;
  summary: string;
  headings: WritingHeading[];
  html: string;
};

type Frontmatter = {
  title?: string;
  author?: string;
  date?: string;
  summary?: string;
  category?: string;
};

function splitFrontmatter(markdown: string): { data: Frontmatter; body: string } {
  if (!markdown.startsWith('---\n')) {
    return { data: {}, body: markdown };
  }
  const end = markdown.indexOf('\n---\n', 3);
  if (end < 0) {
    return { data: {}, body: markdown };
  }
  const data: Frontmatter = {};
  for (const line of markdown.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (key === 'title' || key === 'author' || key === 'date' || key === 'summary' || key === 'category') {
      data[key] = value;
    }
  }
  return { data, body: markdown.slice(end + 5) };
}

function extractArticle(markdown: string): {
  title: string;
  author: string;
  date: string;
  summary: string;
  category: WritingCategory;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const { data, body: rawBody } = splitFrontmatter(normalized);
  let body = rawBody.replace(/^\n+/, '');

  // One character class per line: synced Markdown is untrusted, and a pattern that
  // can split padding two ways backtracks for minutes on a long line.
  const titleLine = body.match(/^#[ \t]([^\n]*)\n+/);
  if (titleLine) body = body.slice(titleLine[0].length);

  const authorLine = body.match(/^Author:([^\n]*)\n/);
  if (authorLine) body = body.slice(authorLine[0].length);

  // Frontmatter already dates the article, so only a plain date here is a byline:
  // any other "Date:" opening is the article's own text. Without frontmatter the whole
  // line counts, so a bad value fails the build by name instead of reading as no date.
  const dateLine = body.match(data.date ? /^Date:\s*(\d{4}-\d{2}-\d{2})\s*\n+/ : /^Date:([^\n]*)\n+/);
  if (dateLine) body = body.slice(dateLine[0].length);

  body = body.replace(/^\n+/, '');
  const title = data.title || titleLine?.[1]?.trim() || 'Untitled';
  const author = data.author || authorLine?.[1]?.trim() || '1SIX';
  const date = data.date || dateLine?.[1]?.trim() || '';
  // Research is the default publication type. Explicit categories are
  // validated so a typo cannot silently place an op-ed in the wrong section.
  const category = data.category?.toLowerCase() || 'research';
  if (!isWritingCategory(category)) {
    throw new Error(`Unknown writing category: ${data.category}`);
  }

  return {
    title,
    author,
    date,
    summary: data.summary || summaryFrom(body),
    category,
    body,
  };
}

function summaryFrom(body: string): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(
      (part) =>
        part.length > 0 &&
        !part.startsWith('#') &&
        !part.startsWith('![') &&
        !part.startsWith('|') &&
        !part.startsWith('```') &&
        !part.startsWith('-') &&
        !part.startsWith('*'),
    );
  if (!paragraph) return '';
  return paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A real calendar day. Date.parse alone rolls 2026-02-31 over into March. */
function isWritingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(date);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date;
}

export function formatWritingDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_]/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** &amp; goes last, so an escaped entity (&amp;lt;) decodes once, to &lt;. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The link targets an article may use, besides relative paths and #fragments. */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Whether a link target is safe to emit: a relative path, a #fragment, or
 * one of SAFE_SCHEMES. The scheme is read the way a browser reads it:
 * after character references are decoded ("java&#x09;script:",
 * "&#106;avascript:") and tabs and newlines dropped, with leading controls
 * and spaces trimmed.
 */
export function isSafeLinkTarget(href: string): boolean {
  const codePoint = (value: number) => (value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '');
  const decoded = href
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&(colon|tab|newline);/gi, (_, name: string) => ({ colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()] ?? '');
  // A URL parser drops tabs and newlines anywhere and trims leading controls and spaces.
  const normalized = decoded.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase();
  return scheme === undefined || SAFE_SCHEMES.has(scheme);
}

/**
 * Articles are synced at build time from another repository
 * (scripts/sync-writing.mjs), so they are rendered as untrusted input: raw
 * HTML inside them is shown as text, never emitted as markup, and a link
 * to anything but the web, mail, a #fragment or a relative path (a
 * javascript: link, an autolink to one, a reference to one) keeps its words
 * and loses its link. A script slipped into an article cannot run on the
 * site. Markdown itself renders as before. (Image sources need no scheme
 * check: renderBody accepts only an image that is a file under public/,
 * and a figure's link reuses it.) renderBody then checks the result
 * against what this renderer can emit (unsafeArticleHtml), and refuses to
 * publish anything else.
 */
const markdown = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    // After an inline <pre>, <code>, <kbd> or <script> tag, marked keeps the
    // text that follows raw (escaped: true), expecting the tag itself to be
    // emitted as markup. Here the tag is shown as text, so that text is too.
    text(token) {
      if ('escaped' in token && token.escaped && !('tokens' in token && token.tokens)) {
        return escapeHtml(token.text);
      }
      return false;
    },
    link(token) {
      if (isSafeLinkTarget(token.href)) return false; // marked's own rendering
      return this.parser.parseInline(token.tokens);
    },
  },
});

/** How much of an article's own text an error message quotes. */
const EXCERPT_LENGTH = 160;

/**
 * Article text for an error message, cut short. Control characters stay
 * encoded: printed raw, an article's %0A or %1B could forge a line (such as
 * an Actions "::error") or a terminal escape in the build log.
 */
function excerpt(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, encodeURIComponent).slice(0, EXCERPT_LENGTH);
}

/** A URL for an error message: percent-decoded where the escapes are well formed. */
function readable(url: string): string {
  try {
    return excerpt(decodeURI(url));
  } catch {
    return excerpt(url);
  }
}

/** A stand-in origin, to resolve an image path the way a browser does. */
const ARTICLE_ORIGIN = 'https://article.invalid';

/**
 * Directory listings under public/ for one getArticles() call: every page
 * of the build renders every article, and their images walk the same few
 * directories. getArticles() starts each call with a fresh map, so a file
 * added between calls is seen.
 */
let listings = new Map<string, Set<string>>();

function directoryEntries(dir: string): Set<string> {
  let entries = listings.get(dir);
  if (!entries) {
    try {
      entries = new Set(readdirSync(dir));
    } catch {
      entries = new Set(); // Not a directory: a path through a file names nothing.
    }
    listings.set(dir, entries);
  }
  return entries;
}

/**
 * The entry with this name, or with one that differs only in Unicode
 * normalization, which looks identical: a name copied from a Mac's Finder
 * is decomposed, while Git on a Mac stores it composed.
 */
function sameName(entries: Set<string>, name: string): string | undefined {
  if (entries.has(name)) return name;
  const composed = name.normalize('NFC');
  return [...entries].find((entry) => entry.normalize('NFC') === composed);
}

/** On a miss, the entry whose name differs only in case: what the author most likely meant. */
function caseVariant(entries: Set<string>, name: string): string | undefined {
  const folded = name.normalize('NFC').toLowerCase();
  return [...entries].find((entry) => entry.normalize('NFC').toLowerCase() === folded);
}

/**
 * The names on disk of the file under public/ that a URL path leads to,
 * with `pick` choosing the entry for each decoded segment; or null. Each
 * segment is percent-decoded, as the server reads it. "." and ".." are
 * never entries, so the walk cannot leave public/, and an encoded "/" names
 * no single entry.
 */
function walkPublic(
  pathname: string,
  pick: (entries: Set<string>, name: string) => string | undefined,
): string[] | null {
  const names: string[] = [];
  let dir = PUBLIC_DIR;
  for (const segment of pathname.slice(1).split('/')) {
    let name: string;
    try {
      name = decodeURIComponent(segment);
    } catch {
      return null; // A malformed escape such as "100%.png" names no file.
    }
    const entry = pick(directoryEntries(dir), name);
    if (entry === undefined) return null;
    names.push(entry);
    dir = path.join(dir, entry);
  }
  return statSync(dir, { throwIfNoEntry: false })?.isFile() ? names : null;
}

/**
 * The file under public/ that an article image shows, and the src that
 * names it, given the source as written and as rewritten for the site.
 * Anything else fails the build and names the article: a missing file would
 * ship as a broken image, the site's CSP (img-src 'self') blocks an image
 * from another site, and a page shows only an image file. Names must match
 * exactly, because 1six.tech answers 404 for a name that differs only in
 * case, which a Mac's disk would still open.
 *
 * The src is rebuilt from the file's own names, each encoded in full: the
 * form Next's static server matches (it misses, for one, "R&D's%20chart.svg"),
 * and one that decodes back to exactly those names. The source is read as
 * written, so a character reference marked leaves in it (&#47;) cannot be
 * decoded into a path other than the one that ships.
 */
function articleImage(slug: string, written: string, local: string): { file: string; src: string } {
  const failure = (reason: string) =>
    new Error(`writing: ${slug} shows the image "${readable(written)}"${reason}; refusing to publish it.`);
  // Read the path as a browser requests it: dot segments resolved, no query or fragment.
  let url: URL | undefined;
  try {
    url = new URL(local, ARTICLE_ORIGIN);
  } catch {
    // Only a source that names a host can fail to parse.
  }
  // The origin check still holds if marked stops encoding "\", which a browser reads as "/".
  if (/^(?:https?:|\/\/)/i.test(local) || url?.origin !== ARTICLE_ORIGIN) {
    throw failure(
      " from a web address; an article image must be a file in its folder (the site's content security policy blocks other sites)",
    );
  }
  const shown = `public${readable(url.pathname)}`;
  const names = walkPublic(url.pathname, sameName);
  if (!names) {
    const variant = walkPublic(url.pathname, caseVariant);
    const hint = variant ? ` (names are case-sensitive: did you mean public/${excerpt(variant.join('/'))}?)` : '';
    throw failure(`, but ${shown} is not a file${hint}`);
  }
  const name = names[names.length - 1];
  // Next's static server ignores a dotfile, as its send module does by default.
  if (name.startsWith('.')) throw failure(`, but the site does not serve ${shown}: its name starts with "."`);
  if (!ASSET_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    throw failure(`, but ${shown} is not an allowed type (${[...ASSET_EXTENSIONS].join(', ')})`);
  }
  return { file: path.join(PUBLIC_DIR, ...names), src: `/${names.map(encodeURIComponent).join('/')}` };
}

/** The intrinsic size of an SVG file, read from its root element. */
function svgSize(file: string): { width: string; height: string } | null {
  if (!file.endsWith('.svg')) return null;
  const root = readFileSync(file, 'utf8').match(/<svg\b[^>]*>/)?.[0];
  const width = root?.match(/\swidth="(\d+(?:\.\d+)?)"/)?.[1];
  const height = root?.match(/\sheight="(\d+(?:\.\d+)?)"/)?.[1];
  return width && height ? { width, height } : null;
}

/** The "open at full size" mark on a figure: two arrows pointing out. */
const ENLARGE_ICON =
  '<span class="writing-figure__hint" aria-hidden="true">' +
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
  '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>' +
  '</svg></span>';

/**
 * The tags and attributes an article's HTML can hold: what marked's GFM
 * renderer emits (marked 18, its Renderer class), plus the ids, classes,
 * figure links, image sizes and enlarge icon renderBody adds.
 */
const ARTICLE_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img',
  'input', 'li', 'ol', 'p', 'path', 'pre', 'span', 'strong', 'svg', 'table', 'tbody', 'td', 'th', 'thead',
  'tr', 'ul',
]);
const ARTICLE_ATTRIBUTES = new Set([
  'align', 'alt', 'aria-hidden', 'aria-label', 'checked', 'class', 'd', 'decoding', 'disabled', 'fill',
  'focusable', 'height', 'href', 'id', 'loading', 'rel', 'src', 'start', 'stroke', 'stroke-linecap',
  'stroke-linejoin', 'stroke-width', 'target', 'title', 'type', 'viewbox', 'width',
]);
/** A start or end tag; a quoted attribute value may hold ">". */
const HTML_TAG = /<(\/?)([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/gi;

/**
 * The first thing in an article's rendered HTML that its renderer never
 * emits, or null: a tag or attribute outside the lists above (an event
 * handler, a <script>, an <iframe>, a style), an unquoted value, a "<" that
 * opens no tag, or a link or image that isSafeLinkTarget refuses. The last
 * line of defence for untrusted articles: whatever a new way through
 * marked's parser produces, it is not on these lists.
 */
export function unsafeArticleHtml(html: string): string | null {
  let end = 0;
  for (const match of html.matchAll(HTML_TAG)) {
    if (html.slice(end, match.index).includes('<')) return 'a "<" that opens no tag';
    end = match.index + match[0].length;
    const [tag, closing, name, attributes] = match;
    if (!ARTICLE_TAGS.has(name.toLowerCase())) return tag;
    // With the quoted values gone, only names, "=" and separators may remain.
    const names = attributes.replace(/"[^"]*"|'[^']*'/g, ' ').split(/[\s/]+/).filter(Boolean);
    if (closing && names.length > 0) return tag;
    for (const attribute of names) {
      const known = /^[a-z][a-z-]*=?$/i.test(attribute) && ARTICLE_ATTRIBUTES.has(attribute.replace(/=$/, '').toLowerCase());
      if (!known) return tag;
    }
    for (const [, url] of attributes.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)) {
      if (!isSafeLinkTarget(url)) return tag;
    }
  }
  return html.slice(end).includes('<') ? 'a "<" that opens no tag' : null;
}

function renderBody(slug: string, body: string): { html: string; headings: WritingHeading[] } {
  const parsed = markdown.parse(body) as string;
  const headings: WritingHeading[] = [];
  const used = new Set<string>();

  let html = parsed.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    const base = slugify(text) || 'section';
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    if (level === '2') headings.push({ id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  html = html.replace(
    /<h2 id="key-takeaways">([\s\S]*?)<\/h2>\s*<ul>/,
    '<h2 id="key-takeaways">$1</h2><ul class="takeaways">',
  );
  html = html.replace(/<p><em>(Figure [\s\S]*?)<\/em><\/p>/g, '<p class="caption">$1</p>');
  // An empty source is matched too: it shows no file either.
  html = html.replace(/<img\b([^>]*?)src="([^"]*)"([^>]*)>/g, (match, before: string, src: string, after: string) => {
    const local = /^(?:https?:|\/)/i.test(src) ? src : `/writing-assets/${slug}/${src.replace(/^\.\//, '')}`;
    // marked escapes the attribute (& as &amp;): undo that to read the source as written.
    const image = articleImage(slug, decodeEntities(src), decodeEntities(local));
    let tag = `<img${before}src="${image.src}"${after}>`;
    // A lazy image with no size takes no space until it loads, and the text
    // below jumps when it does; the SVG's own size reserves its box.
    // An author-given width or height stands: the SVG's own size would add a
    // second height (or width) attribute, and the first one would win.
    const size = !/\b(?:width|height)=/.test(tag) ? svgSize(image.file) : null;
    if (size) tag = tag.replace('<img', `<img width="${size.width}" height="${size.height}"`);
    if (tag.includes('loading=')) return tag;
    return tag.replace('<img', '<img loading="lazy" decoding="async"');
  });
  // A figure (an image alone in its paragraph) links to its own file, so a
  // tap shows it at full size: the charts are drawn 760-900 units wide with
  // 14-17px labels, which a phone column shrinks to 5-7px. FigureViewer
  // opens the link in place; without script it opens the file itself.
  html = html.replace(/<p>(<img\b[^>]*>)<\/p>/g, (match, img: string) => {
    const src = img.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) return match;
    const alt = img.match(/\balt="([^"]*)"/)?.[1] ?? '';
    const label = alt ? `Enlarge figure: ${alt}` : 'Enlarge figure';
    return `<p class="figure"><a class="writing-figure" href="${src}" aria-label="${label}">${img}${ENLARGE_ICON}</a></p>`;
  });
  html = html.replace(
    /<a href="(https?:[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noreferrer noopener"',
  );
  html = html.replace(/<table>/g, '<div class="table-scroll"><table>');
  html = html.replace(/<\/table>/g, '</table></div>');

  // Fail the build rather than publish markup this renderer cannot produce.
  const unsafe = unsafeArticleHtml(html);
  if (unsafe) {
    throw new Error(`writing: ${slug} rendered ${excerpt(unsafe)}, which the article renderer never emits; refusing to publish it.`);
  }
  return { html, headings };
}

function loadArticle(slug: string): WritingArticle | null {
  const markdown = readFileSync(path.join(CONTENT_DIR, slug, 'README.md'), 'utf8');
  // The sync already skips drafts; a checkout synced before it did can still hold one.
  if (isDraftArticle(markdown)) return null;
  const extracted = extractArticle(markdown);
  if (!isWritingDate(extracted.date)) {
    const found = extracted.date ? `"${excerpt(extracted.date)}"` : 'none';
    throw new Error(`writing: ${slug} needs a date like 2026-11-08, found ${found}; refusing to publish it.`);
  }
  const rendered = renderBody(slug, extracted.body);
  return {
    slug,
    number: slug.slice(0, 3),
    title: extracted.title,
    author: extracted.author,
    authorSlug: getWriterByName(extracted.author)?.slug ?? null,
    category: extracted.category,
    date: extracted.date,
    dateLabel: formatWritingDate(extracted.date),
    summary: extracted.summary,
    headings: rendered.headings,
    html: rendered.html,
  };
}

export function getArticles(): WritingArticle[] {
  if (!existsSync(CONTENT_DIR)) {
    throw new Error('Missing content/writing. Run node scripts/sync-writing.mjs before building.');
  }
  listings = new Map();
  const slugs = readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isArticleSlug(entry.name))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(CONTENT_DIR, slug, 'README.md')));
  const articles = slugs.map(loadArticle).filter((article) => article !== null);
  if (articles.length === 0) {
    throw new Error('content/writing has no published articles.');
  }
  return articles.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}

export function getArticle(slug: string): WritingArticle | null {
  if (!isArticleSlug(slug)) return null;
  return getArticles().find((article) => article.slug === slug) ?? null;
}
