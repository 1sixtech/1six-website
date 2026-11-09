// Plain JavaScript so scripts/sync-writing.mjs can run it under node without a build step.

// The date line of the article header, in either form it can take:
//   Date: 2026-11-08 (draft)
//   date: "2026-11-08 (draft)"
const DRAFT_DATE = /^date:\s*["']?\d{4}-\d{2}-\d{2}\s*\(draft\)["']?\s*$/im;

/**
 * Whether an article is marked as unpublished in its date line.
 * @param {string} markdown The article's README.md.
 * @returns {boolean}
 */
export function isDraftArticle(markdown) {
  return DRAFT_DATE.test(markdown);
}
