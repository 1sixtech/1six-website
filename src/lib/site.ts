/** Public contact for investors, candidates, and press. */
export const CONTACT_EMAIL = 'contact@1six.tech';

/** The copyright line, shared by the footer and the phone menu. */
export const COPYRIGHT = '© 2026 - 2027 1SIX Technologies Inc.';

/**
 * The favicon files' version, added to their URLs as `?v=`. Browsers and search
 * engines keep an icon by its URL, so bump it whenever an icon file changes;
 * src/app/icons.test.mjs pins each version's file digests.
 */
export const ICON_VERSION = '3';

export const NAV_ITEMS = [
  { label: 'About', href: '/' },
  { label: 'Thesis', href: '/thesis' },
  { label: 'Writing', href: '/writing' },
] as const;

/** A plain left click. Any other click on a link belongs to the browser. */
export function isPlainLeftClick(
  event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Whether a nav href names the page the visitor is on. Hash links such as
 * `/#thesis` point at a section, not a page, so they are never current.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
