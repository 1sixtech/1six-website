'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';
import { teardownVideoPool } from '@/lib/videoPool';

/**
 * Own the Thesis intro across both direct loads and client navigation.
 * The head bootstrap prepares direct loads before paint; this layout effect
 * does the same before child passive effects when arriving from another page.
 */
export function ThesisIntroMount() {
  const pathname = usePathname();
  const fillRectRef = useRef<SVGRectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (pathname !== '/thesis') return;
    const html = document.documentElement;
    const main = document.getElementById('main-content');
    mainContentRef.current = main;
    html.classList.add('intro-lock');

    // Preserve an already prepared direct load. On client entry, decide
    // whether this tab has seen the intro without relying on stale flags.
    if (!html.dataset.introActive && !html.dataset.introSkip) {
      let skip = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        skip ||= sessionStorage.getItem('introSeen') === '1';
      } catch {
        // Storage is optional; the motion preference still applies.
      }
      if (skip) html.dataset.introSkip = 'true';
      else html.dataset.introActive = 'true';
    }

    return () => {
      // The layout persists across routes. A route change during the hero
      // scramble or circular reveal must leave the next page fully visible.
      html.classList.remove('intro-lock');
      delete html.dataset.introActive;
      delete html.dataset.introSkip;
      main?.style.removeProperty('clip-path');
      main?.style.removeProperty('-webkit-clip-path');
      teardownVideoPool();
    };
  }, [pathname]);

  if (pathname !== '/thesis') return null;

  return (
    <>
      <IntroOverlay ref={overlayRef} fillRectRef={fillRectRef} />
      <IntroOrchestrator
        fillRectRef={fillRectRef}
        overlayRef={overlayRef}
        mainContentRef={mainContentRef}
      />
    </>
  );
}
