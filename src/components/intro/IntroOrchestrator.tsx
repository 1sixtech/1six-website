'use client';

import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { isRouteVisualReady, markIntroSeen, needsVisualReadiness } from '@/lib/introState';

const MIN_DISPLAY_MS = 1200;
const HARD_CAP_MS = 5000;
const FILL_START_Y = 21.03;

interface IntroOrchestratorProps {
  pathname: string;
  onWarmup: () => void;
  fillRectRef: RefObject<SVGRectElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  mainContentRef: RefObject<HTMLElement | null>;
}

/** Gate only the current screen; shared downloads never hold the entrance. */
export function IntroOrchestrator({
  pathname,
  onWarmup,
  fillRectRef,
  overlayRef,
  mainContentRef,
}: IntroOrchestratorProps) {
  useEffect(() => {
    const html = document.documentElement;
    const entryId = html.dataset.entryId;
    const target = html.dataset.entryTarget ?? pathname;
    const main = mainContentRef.current;
    const overlay = overlayRef.current;
    const active = html.dataset.introActive === 'true';
    let disposed = false;
    let started = false;
    let minimumElapsed = false;
    let fontsReady = false;
    let screenReady = false;
    let warmed = false;
    let revealTween: gsap.core.Tween | null = null;
    let fillTween: gsap.core.Tween | null = null;
    let minimumTimer: ReturnType<typeof setTimeout> | undefined;
    let hardCapTimer: ReturnType<typeof setTimeout> | undefined;
    const ownsEntry = () => !disposed && html.dataset.entryId === entryId;

    const startWarmup = () => {
      if (warmed || !ownsEntry()) return;
      warmed = true;
      onWarmup();
    };
    const finish = () => {
      if (!ownsEntry()) return;
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
      }
      main?.style.removeProperty('clip-path');
      main?.style.removeProperty('-webkit-clip-path');
      delete html.dataset.introActive;
      delete html.dataset.introSkip;
      html.classList.remove('intro-lock');
      // A text-only Writing visit does not consume the visual entrance.
      if (needsVisualReadiness(target)) markIntroSeen();
      // HeroSection owns a separate lock while its now-visible text enters.
      window.dispatchEvent(new CustomEvent('entry:intro-done'));
    };

    const reveal = () => {
      if (!ownsEntry() || started || !active) return;
      started = true;
      clearTimeout(minimumTimer);
      clearTimeout(hardCapTimer);
      window.removeEventListener('entry:ready', checkReady);
      if (!main || !overlay) {
        finish();
        return;
      }
      // The fill is an entrance, not a byte percentage. Complete it only
      // when this screen is ready (or the bounded deadline expires).
      fillTween?.kill();
      const fill = { y: Number(fillRectRef.current?.getAttribute('y') ?? 0) };
      fillTween = gsap.to(fill, {
        y: 0, duration: 0.15, ease: 'power2.out',
        onUpdate: () => fillRectRef.current?.setAttribute('y', String(fill.y)),
      });
      revealTween = gsap.fromTo(main, {
        clipPath: 'circle(0% at 50% 50%)', WebkitClipPath: 'circle(0% at 50% 50%)',
      }, {
        clipPath: 'circle(150% at 50% 50%)', WebkitClipPath: 'circle(150% at 50% 50%)',
        delay: 0.15, duration: 0.5, ease: 'power3.out',
        onComplete: () => {
          if (!ownsEntry()) return;
          revealTween = gsap.to(overlay, { opacity: 0, duration: 0.3, onComplete: finish });
        },
      });
    };

    function checkReady() {
      if (!ownsEntry()) return;
      if (fontsReady && isRouteVisualReady(target)) {
        screenReady = true;
        startWarmup();
        clearTimeout(hardCapTimer);
        hardCapTimer = undefined;
        window.removeEventListener('entry:ready', checkReady);
      }
      if (minimumElapsed && screenReady) reveal();
    }

    window.addEventListener('entry:ready', checkReady);
    document.fonts.ready.then(() => {
      if (!ownsEntry()) return;
      fontsReady = true;
      checkReady();
    });
    // Even a failed current asset must not prevent best-effort background work.
    hardCapTimer = setTimeout(() => { startWarmup(); reveal(); }, HARD_CAP_MS);

    if (!active) {
      queueMicrotask(finish);
    } else {
      const fillProxy = { y: FILL_START_Y };
      fillRectRef.current?.setAttribute('y', String(FILL_START_Y));
      fillTween = gsap.to(fillProxy, {
        y: FILL_START_Y * 0.1, duration: 0.95, ease: 'power2.inOut', delay: 0.05,
        onUpdate: () => fillRectRef.current?.setAttribute('y', String(fillProxy.y)),
      });
      minimumTimer = setTimeout(() => { minimumElapsed = true; checkReady(); }, MIN_DISPLAY_MS);
    }

    const blockKeys = (event: KeyboardEvent) => {
      if (html.dataset.introActive === 'true'
        && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', blockKeys, { passive: false });
    return () => {
      disposed = true;
      clearTimeout(minimumTimer);
      clearTimeout(hardCapTimer);
      window.removeEventListener('entry:ready', checkReady);
      window.removeEventListener('keydown', blockKeys);
      fillTween?.kill();
      revealTween?.kill();
    };
  }, [pathname, onWarmup, fillRectRef, overlayRef, mainContentRef]);
  return null;
}
