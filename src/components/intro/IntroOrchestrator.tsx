'use client';

import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { isAboutMarkReady } from '@/lib/introState';

// Preserve the existing logo fill and reveal timing on a ready page. A slow
// canvas gets up to five seconds; a failed asset must not trap the visitor.
const MIN_DISPLAY_MS = 1200;
const HARD_CAP_MS = 5000;
const FILL_START_Y = 21.03;

interface IntroOrchestratorProps {
  fillRectRef: RefObject<SVGRectElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  mainContentRef: RefObject<HTMLElement | null>;
}

/** Reveal About once its rotating 16 has rendered, then release its scroll lock. */
export function IntroOrchestrator({
  fillRectRef,
  overlayRef,
  mainContentRef,
}: IntroOrchestratorProps) {
  useEffect(() => {
    const html = document.documentElement;
    const main = mainContentRef.current;
    const overlay = overlayRef.current;
    let disposed = false;
    let started = false;
    let minimumElapsed = false;
    let revealTween: gsap.core.Tween | null = null;
    let fillTween: gsap.core.Tween | null = null;
    let minimumTimer: ReturnType<typeof setTimeout> | undefined;
    let hardCapTimer: ReturnType<typeof setTimeout> | undefined;

    const markSeen = () => {
      try {
        sessionStorage.setItem('aboutIntroSeen', '1');
      } catch {
        // Storage is optional.
      }
    };

    const finish = () => {
      if (disposed) return;
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
      }
      // Remove the animation's containing block so About's sticky mark and
      // mobile meter return to their normal page geometry.
      main?.style.removeProperty('clip-path');
      main?.style.removeProperty('-webkit-clip-path');
      delete html.dataset.introActive;
      delete html.dataset.introSkip;
      html.classList.remove('intro-lock');
      markSeen();
    };

    const reveal = () => {
      if (disposed || started) return;
      started = true;
      clearTimeout(minimumTimer);
      clearTimeout(hardCapTimer);
      window.removeEventListener('about-mark:ready', checkReady);
      if (!main || !overlay) {
        finish();
        return;
      }
      revealTween = gsap.fromTo(main, {
        clipPath: 'circle(0% at 50% 50%)',
        WebkitClipPath: 'circle(0% at 50% 50%)',
      }, {
        clipPath: 'circle(150% at 50% 50%)',
        WebkitClipPath: 'circle(150% at 50% 50%)',
        duration: 0.5,
        ease: 'power3.out',
        onComplete: () => {
          if (disposed) return;
          revealTween = gsap.to(overlay, {
            opacity: 0,
            duration: 0.3,
            onComplete: finish,
          });
        },
      });
    };

    function checkReady() {
      if (minimumElapsed && isAboutMarkReady()) reveal();
    }

    if (html.dataset.introActive !== 'true') {
      // Repeat visits and reduced motion have no logo or interaction delay.
      // A replayed or unmounted effect must not finish a later route's intro.
      queueMicrotask(finish);
    } else {
      const fillProxy = { y: FILL_START_Y };
      fillRectRef.current?.setAttribute('y', String(FILL_START_Y));
      // Tween a plain proxy: AttrPlugin is not reliably retained by Turbopack.
      fillTween = gsap.to(fillProxy, {
        y: 0,
        duration: 0.95,
        ease: 'power2.inOut',
        delay: 0.05,
        onUpdate: () => fillRectRef.current?.setAttribute('y', String(fillProxy.y)),
      });
      window.addEventListener('about-mark:ready', checkReady);
      minimumTimer = setTimeout(() => {
        minimumElapsed = true;
        checkReady();
      }, MIN_DISPLAY_MS);
      hardCapTimer = setTimeout(reveal, HARD_CAP_MS);
    }

    // Overflow blocks pointer scrolling; also prevent keyboard scrolling or
    // focusing hidden content while the full-screen About loader is active.
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
      window.removeEventListener('about-mark:ready', checkReady);
      window.removeEventListener('keydown', blockKeys);
      fillTween?.kill();
      revealTween?.kill();
    };
  }, [fillRectRef, overlayRef, mainContentRef]);

  return null;
}
