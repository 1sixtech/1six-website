import { ICON_VERSION } from './site.ts';

export type ColorScheme = 'light' | 'dark';

/** public/favicon.svg, whose mark follows the browser's color scheme. */
export const ADAPTIVE_FAVICON = `/favicon.svg?v=${ICON_VERSION}`;

/** The fixed-color copies of favicon.svg that scripts/make-icons.mjs derives. */
export const SCHEME_FAVICONS: Record<ColorScheme, string> = {
  light: `/favicon-light.svg?v=${ICON_VERSION}`,
  dark: `/favicon-dark.svg?v=${ICON_VERSION}`,
};
