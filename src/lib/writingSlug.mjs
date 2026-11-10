// Plain JavaScript so scripts/sync-writing.mjs can run it under node without a build step.

const ARTICLE_SLUG = /^[0-9]{3}-[a-z0-9-]+$/;

/**
 * Whether a folder name can be an article's URL. The sync refuses a numbered folder
 * that fails this and the site loads only folders that pass it, so one rule decides both.
 * @param {string} name The folder name.
 * @returns {boolean}
 */
export function isArticleSlug(name) {
  return ARTICLE_SLUG.test(name);
}
