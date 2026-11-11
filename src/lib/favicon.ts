import { ICON_VERSION } from './site.ts';

export type ColorScheme = 'light' | 'dark';

/** public/favicon.svg, whose mark follows the browser's color scheme. */
export const ADAPTIVE_FAVICON = `/favicon.svg?v=${ICON_VERSION}`;

/** The fixed-color copies of favicon.svg that scripts/make-icons.mjs derives. */
export const SCHEME_FAVICONS: Record<ColorScheme, string> = {
  light: `/favicon-light.svg?v=${ICON_VERSION}`,
  dark: `/favicon-dark.svg?v=${ICON_VERSION}`,
};

/**
 * The href the SVG icon link should have, from the scheme when the page loaded,
 * the scheme now, and the link's href now. Chrome and Firefox draw an SVG
 * favicon once, so favicon.svg is right only in the scheme it loaded in, and
 * only a new URL makes them draw again: from the first change on, the link
 * names the current scheme's fixed copy, also once the scheme returns.
 */
export function faviconHref(loadScheme: ColorScheme, scheme: ColorScheme, href: string): string {
  if (href === ADAPTIVE_FAVICON && scheme === loadScheme) return href;
  return SCHEME_FAVICONS[scheme];
}
