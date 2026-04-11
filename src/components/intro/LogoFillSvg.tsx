'use client';

import { forwardRef } from 'react';

/**
 * LogoFillSvg — Large centered 1SIX logo with a mask-based bottom-to-top
 * fill animation. The orchestrator animates `y` on the mask rect via GSAP.
 *
 * Layer stack:
 *   - Base: dark silhouette of the logo (20% opacity var(--color-text))
 *   - Overlay: accent-colored logo clipped by a mask rect that slides up
 *
 * The viewBox matches LogoHeader (73 x 21.03). The caller sizes via CSS.
 */

interface LogoFillSvgProps {
  className?: string;
}

export const LogoFillSvg = forwardRef<SVGRectElement, LogoFillSvgProps>(
  function LogoFillSvg({ className = '' }, fillRectRef) {
    return (
      <svg
        className={className}
        viewBox="0 0 73 21.03"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <mask id="intro-logo-fill-mask">
            {/* Whole area black by default — nothing shows */}
            <rect x="0" y="0" width="73" height="21.03" fill="black" />
            {/* Animated white rect — starts below the logo, slides up */}
            <rect
              ref={fillRectRef}
              x="0"
              y="21.03"
              width="73"
              height="21.03"
              fill="white"
            />
          </mask>
        </defs>

        {/* Base: dark silhouette (shows the whole logo dim) */}
        <g fill="currentColor" opacity="0.2">
          <path d="M72.96 0.04L73 0H68.52L68.48 0.04L60.3 8.26V12.77L68.52 21.03H73L62.94 10.91C62.72 10.69 62.72 10.33 62.94 10.11L72.96 0.04Z" />
          <path d="M50.69 21.03L58.9 12.77V8.26L50.73 0.04L50.69 0H46.2L46.24 0.04L56.27 10.12C56.48 10.33 56.48 10.69 56.27 10.91L46.2 21.03H50.69Z" />
          <path d="M43.85 0.04H40.68V21.02H43.85V0.04Z" />
          <path d="M29.58 8.32L27.34 10.58L33.84 17.12C34.11 17.39 33.92 17.84 33.55 17.84H16.14V21.03H37.02V15.8L29.58 8.32Z" />
          <path d="M16.14 5.27L23.58 12.75L25.82 10.49L19.31 3.95C19.05 3.68 19.24 3.23 19.61 3.23H37.02V0.04H16.14V5.27Z" />
          <path d="M7.44 0.04L0 7.52L2.24 9.78L8.75 3.24C9.01 2.97 9.46 3.16 9.46 3.53V21.03H12.63V0.04H7.44Z" />
        </g>

        {/* Overlay: accent color, revealed by the animating mask */}
        <g fill="var(--color-accent)" mask="url(#intro-logo-fill-mask)">
          <path d="M72.96 0.04L73 0H68.52L68.48 0.04L60.3 8.26V12.77L68.52 21.03H73L62.94 10.91C62.72 10.69 62.72 10.33 62.94 10.11L72.96 0.04Z" />
          <path d="M50.69 21.03L58.9 12.77V8.26L50.73 0.04L50.69 0H46.2L46.24 0.04L56.27 10.12C56.48 10.33 56.48 10.69 56.27 10.91L46.2 21.03H50.69Z" />
          <path d="M43.85 0.04H40.68V21.02H43.85V0.04Z" />
          <path d="M29.58 8.32L27.34 10.58L33.84 17.12C34.11 17.39 33.92 17.84 33.55 17.84H16.14V21.03H37.02V15.8L29.58 8.32Z" />
          <path d="M16.14 5.27L23.58 12.75L25.82 10.49L19.31 3.95C19.05 3.68 19.24 3.23 19.61 3.23H37.02V0.04H16.14V5.27Z" />
          <path d="M7.44 0.04L0 7.52L2.24 9.78L8.75 3.24C9.01 2.97 9.46 3.16 9.46 3.53V21.03H12.63V0.04H7.44Z" />
        </g>
      </svg>
    );
  }
);
