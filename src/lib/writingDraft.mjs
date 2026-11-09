// Plain JavaScript so scripts/sync-writing.mjs can run it under node without a build step.

// The date line of the article header, in either form it can take:
//   Date: 2026-11-08 (draft)
//   date: "2026-11-08 (draft)"
const DRAFT_DATE = /^date:\s*["']?\d{4}-\d{2}-\d{2}\s*\(draft\)["']?\s*$/i;

// What can stand above the article text: a title, the byline, blank lines.
const HEADER_LINE = /^(?:#\s|author:|date:|\s*$)/i;

/**
 * Whether an article is marked as unpublished in its date line. Only the header
 * counts: the same words further down are the article's own text, and reading them
 * as a marker would silently take a published article off the site.
 * @param {string} markdown The article's README.md.
 * @returns {boolean}
 */
export function isDraftArticle(markdown) {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const frontmatter = closing > 0 ? lines.slice(1, closing) : [];
  if (frontmatter.some((line) => DRAFT_DATE.test(line))) return true;
  for (const line of lines.slice(closing + 1)) {
    if (DRAFT_DATE.test(line)) return true;
    if (!HEADER_LINE.test(line)) return false;
  }
  return false;
}
