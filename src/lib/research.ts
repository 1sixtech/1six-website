import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'marked';

const CONTENT_DIR = path.join(process.cwd(), 'content/research');
const SLUG = /^[0-9]{3}-[a-z0-9-]+$/;

export type ResearchHeading = {
  id: string;
  text: string;
};

export type ResearchArticle = {
  slug: string;
  number: string;
  title: string;
  author: string;
  date: string;
  dateLabel: string;
  summary: string;
  headings: ResearchHeading[];
  html: string;
};

type Frontmatter = {
  title?: string;
  author?: string;
  date?: string;
  summary?: string;
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
    if (key === 'title' || key === 'author' || key === 'date' || key === 'summary') {
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
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const { data, body: rawBody } = splitFrontmatter(normalized);
  let body = rawBody.replace(/^\n+/, '');

  const titleLine = body.match(/^#\s+(.+)\n+/);
  if (titleLine) body = body.slice(titleLine[0].length);

  const authorLine = body.match(/^Author:\s*(.+)\n/);
  if (authorLine) body = body.slice(authorLine[0].length);

  const dateLine = body.match(/^Date:\s*(\d{4}-\d{2}-\d{2})\s*\n+/);
  if (dateLine) body = body.slice(dateLine[0].length);

  body = body.replace(/^\n+/, '');
  const title = data.title || titleLine?.[1]?.trim() || 'Untitled';
  const author = data.author || authorLine?.[1]?.trim() || '1SIX';
  const date = data.date || dateLine?.[1] || '';

  return {
    title,
    author,
    date,
    summary: data.summary || summaryFrom(body),
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

export function formatResearchDate(iso: string): string {
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

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderBody(slug: string, body: string): { html: string; headings: ResearchHeading[] } {
  const parsed = parse(body, { async: false, gfm: true });
  const headings: ResearchHeading[] = [];
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
  html = html.replace(/<img\b([^>]*?)src="([^"]+)"([^>]*)>/g, (match, before: string, src: string, after: string) => {
    const local = /^(https?:|\/)/.test(src) ? src : `/research/${slug}/${src.replace(/^\.\//, '')}`;
    const tag = `<img${before}src="${local}"${after}>`;
    if (tag.includes('loading=')) return tag;
    return tag.replace('<img', '<img loading="lazy" decoding="async"');
  });
  html = html.replace(
    /<a href="(https?:[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noreferrer noopener"',
  );
  html = html.replace(/<table>/g, '<div class="table-scroll"><table>');
  html = html.replace(/<\/table>/g, '</table></div>');

  return { html, headings };
}

function loadArticle(slug: string): ResearchArticle {
  const markdown = readFileSync(path.join(CONTENT_DIR, slug, 'README.md'), 'utf8');
  const extracted = extractArticle(markdown);
  const rendered = renderBody(slug, extracted.body);
  return {
    slug,
    number: slug.slice(0, 3),
    title: extracted.title,
    author: extracted.author,
    date: extracted.date,
    dateLabel: formatResearchDate(extracted.date),
    summary: extracted.summary,
    headings: rendered.headings,
    html: rendered.html,
  };
}

export function getArticles(): ResearchArticle[] {
  if (!existsSync(CONTENT_DIR)) {
    throw new Error('Missing content/research. Run node scripts/sync-research.mjs before building.');
  }
  const slugs = readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(CONTENT_DIR, slug, 'README.md')));
  if (slugs.length === 0) {
    throw new Error('content/research has no articles.');
  }
  return slugs.map(loadArticle).sort((a, b) => a.number.localeCompare(b.number));
}

export function getArticle(slug: string): ResearchArticle | null {
  if (!SLUG.test(slug)) return null;
  return getArticles().find((article) => article.slug === slug) ?? null;
}
