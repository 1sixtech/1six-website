import { createContext } from 'react';

/**
 * Whether the Thesis slide around this subtree is the one on screen. Neighbors
 * stay mounted so a slide change shows art at once, but a canvas in a hidden
 * slide holds still instead of decoding video and drawing for nobody.
 */
export const ThesisSlideActive = createContext(true);
