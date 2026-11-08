'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';
import { teardownVideoPool, warmupAll } from '@/lib/videoPool';

// Keep the Thesis decoder warmup independent of the About logo loader.
const THESIS_VIDEOS = [
  '/resource/Source_Desert.mp4',
  '/resource/Source_About 01.mp4',
  '/resource/Source_About 02.mp4',
  '/resource/Source_About 03.mp4',
  '/resource/Source_About 04.mp4',
  '/resource/Source_About 05.mp4',
  '/resource/Source_About 06.mp4',
  '/resource/Source_Graph.mp4',
];

/** Prepare route entry before child passive effects, matching the head bootstrap. */
export function PageEntry() {
  const pathname = usePathname();
  const fillRectRef = useRef<SVGRectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (pathname !== '/' && pathname !== '/thesis') return;
    const html = document.documentElement;
    const main = document.getElementById('main-content');
    mainContentRef.current = main;
    if (pathname === '/thesis') {
      // HeroSection owns this lock until its text scramble completes.
      html.classList.add('intro-lock');
    } else if (!html.dataset.introActive && !html.dataset.introSkip) {
      let skip = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        skip ||= sessionStorage.getItem('aboutIntroSeen') === '1';
      } catch {
        // Storage is optional; the motion preference still applies.
      }
      if (skip) {
        html.dataset.introSkip = 'true';
      } else {
        html.classList.add('intro-lock');
        html.dataset.introActive = 'true';
      }
    }

    return () => {
      // The layout persists. Never leave the next route masked or locked.
      html.classList.remove('intro-lock');
      delete html.dataset.introActive;
      delete html.dataset.introSkip;
      main?.style.removeProperty('clip-path');
      main?.style.removeProperty('-webkit-clip-path');
      if (pathname === '/thesis') teardownVideoPool();
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/thesis') return;
    void warmupAll(THESIS_VIDEOS);
  }, [pathname]);

  if (pathname !== '/') return null;

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
