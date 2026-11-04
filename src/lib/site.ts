/** Public contact for investors, candidates, and press. */
export const CONTACT_EMAIL = 'contact@1six.tech';

/**
 * Whether a nav href names the page the visitor is on. Hash links such as
 * `/#thesis` point at a section, not a page, so they are never current.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
