// Plain JavaScript so scripts/sync-writing.mjs can run it under node without a build step.

// The date line of the article header, in either form it can take:
//   Date: 2026-11-08 (draft)
//   date: "2026-11-08 (draft)"
const DRAFT_DATE = /^date:\s*["']?\d{4}-\d{2}-\d{2}\s*\(draft\)["']?\s*$/i;

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
  // A date in the frontmatter is the article's date, as it is when the article is read.
  const dated = lines.slice(1, Math.max(closing, 1)).find((line) => /^date:\s*\S/i.test(line));
  if (dated) return DRAFT_DATE.test(dated);

  // Otherwise it is the line under the title and byline, each at most once.
  let index = closing + 1;
  const skipBlanks = () => {
    while (lines[index]?.trim() === '') index += 1;
  };
  skipBlanks();
  if (/^#\s/.test(lines[index] ?? '')) {
    index += 1;
    skipBlanks();
  }
  if (/^author:/i.test(lines[index] ?? '')) {
    index += 1;
    skipBlanks();
  }
  return DRAFT_DATE.test(lines[index] ?? '');
}
