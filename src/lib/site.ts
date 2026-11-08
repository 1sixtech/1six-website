/** Public contact for investors, candidates, and press. */
export const CONTACT_EMAIL = 'contact@1six.tech';

/** The copyright line, shared by the footer and the phone menu. */
export const COPYRIGHT = '© 2026 - 2027 1SIX Technologies Inc.';

export const NAV_ITEMS = [
  { label: 'About', href: '/' },
  { label: 'Thesis', href: '/thesis' },
  { label: 'Writing', href: '/writing' },
] as const;

/**
 * Whether a nav href names the page the visitor is on. Hash links such as
 * `/#thesis` point at a section, not a page, so they are never current.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
