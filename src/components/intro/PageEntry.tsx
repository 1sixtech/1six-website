'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cancelAssetWarmup, hasWarmedEntry, warmSharedAssets } from '@/lib/assetWarmup';
import { hasSeenIntro, needsVisualReadiness } from '@/lib/introState';
import { entryVisualTarget } from '@/lib/siteAssets';
import { teardownVideoPool } from '@/lib/videoPool';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';

/** Coordinate the brand entrance, route-local text lock, and non-blocking downloads. */
export function PageEntry() {
  const pathname = usePathname();
  const router = useRouter();
  const sequence = useRef(0);
  const warmupEligible = useRef(false);
  const fillRectRef = useRef<SVGRectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const main = document.getElementById('main-content');
    mainContentRef.current = main;
    html.dataset.entryHydrated = 'true';
    html.dataset.entryId = String(++sequence.current);
    const target = entryVisualTarget(pathname, window.location.hash);
    html.dataset.entryTarget = target;
    warmupEligible.current = false;
    cancelAssetWarmup(); // Foreground navigation always gets priority.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const theme = html.dataset.theme === 'dark' ? 'dark' : 'light';
    const visualRoute = needsVisualReadiness(target);
    if (target === '/thesis' && !reduced && html.dataset.introExpired !== 'true') html.classList.add('thesis-entry-lock');
    if (!html.dataset.introActive && !html.dataset.introSkip) {
      if (!visualRoute || reduced || hasSeenIntro() || hasWarmedEntry(target, theme)) {
        html.dataset.introSkip = 'true';
      } else {
        html.classList.add('intro-lock');
        html.dataset.introActive = 'true';
      }
    }
    return () => {
      cancelAssetWarmup();
      html.classList.remove('intro-lock', 'thesis-entry-lock');
      delete html.dataset.introActive;
      delete html.dataset.introSkip;
      delete html.dataset.entryId;
      delete html.dataset.entryTarget;
      main?.style.removeProperty('clip-path');
      main?.style.removeProperty('-webkit-clip-path');
      teardownVideoPool();
    };
  }, [pathname]);

  const startWarmup = useCallback(() => {
    warmupEligible.current = true;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (document.hidden || connection?.saveData
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Byte-only. Decoders belong to mounted canvases, never to a warmup.
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    void warmSharedAssets(pathname, theme);
    for (const route of ['/', '/thesis', '/writing']) {
      if (route !== pathname) router.prefetch(route);
    }
  }, [pathname, router]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cancelAssetWarmup();
      else if (warmupEligible.current) startWarmup();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pathname, startWarmup]);

  return (
    <>
      <IntroOverlay key={pathname} ref={overlayRef} fillRectRef={fillRectRef} />
      <IntroOrchestrator
        key={pathname}
        pathname={pathname}
        onWarmup={startWarmup}
        fillRectRef={fillRectRef}
        overlayRef={overlayRef}
        mainContentRef={mainContentRef}
      />
    </>
  );
}
