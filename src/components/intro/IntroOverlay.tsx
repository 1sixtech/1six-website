'use client';

import { forwardRef, type RefObject } from 'react';
import { LogoFillSvg } from './LogoFillSvg';

/**
 * IntroOverlay — Full-screen fixed container shown on the homepage during
 * the intro. Pure presentation: the actual animation is driven by
 * IntroOrchestrator which receives the fillRectRef via props.
 *
 * z-index 100 sits above the mobile menu (z-60) and below the skip-to-
 * content link (z-100 same, but skip link is translate-y-full until focus).
 */

interface IntroOverlayProps {
  fillRectRef: RefObject<SVGRectElement | null>;
}

export const IntroOverlay = forwardRef<HTMLDivElement, IntroOverlayProps>(
  function IntroOverlay({ fillRectRef }, overlayRef) {
    return (
      <div
        ref={overlayRef}
        className="intro-overlay pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="Loading"
        style={{
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text)',
        }}
      >
        <div className="intro-logo-wrap">
          <LogoFillSvg
            ref={fillRectRef}
            className="intro-logo-svg h-[60px] w-auto md:h-[80px]"
          />
        </div>
      </div>
    );
  }
);
