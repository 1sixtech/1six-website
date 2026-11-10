// Plain JavaScript so scripts/sync-writing.mjs can run it under node without a build step.

/**
 * The file types an article can show. Anything under public/ has a URL, so the
 * sync refuses to publish an article whose folder holds any other type, and the
 * site refuses an article image of any other type, even one already under public/.
 * @type {ReadonlySet<string>}
 */
export const ASSET_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
