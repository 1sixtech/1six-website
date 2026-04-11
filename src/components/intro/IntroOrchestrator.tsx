'use client';

import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import * as videoPool from '@/lib/videoPool';
import {
  HOMEPAGE_ASCII_TARGETS,
  computeExpectedReadyKeys,
  getReadyKeys,
} from '@/lib/introState';

/**
 * IntroOrchestrator — State machine that coordinates the homepage intro.
 *
 * Timeline (best case, webglReady ≤ 0.7s):
 *   t=0.00  videoPool.warmupAll starts; AsciiCanvas instances init in parallel
 *   t=0.05  GSAP: logo fill mask rect y: 21.03 -> 0 over 0.6s (power2.inOut)
 *   t=0.65  fill done
 *   t=0.70  minTimer done -> reveal (if webglReady also done)
 *           -> GSAP: main-content clip-path circle(0%) -> circle(150%) over 0.4s
 *           -> dispatches 'intro:revealed', removes intro-lock, sets sessionStorage.introSeen
 *   t=1.10  reveal done -> GSAP: overlay opacity 1 -> 0 over 0.3s
 *   t=1.40  -> dispatches 'intro:done'
 *
 * Hardcap: 2.5s. Even if webglReady never fires, reveal runs.
 * Reduced-motion / session repeat: intro-lock is absent on mount, so
 * runReveal fires synchronously with skipAnimation=true.
 */

// Timing — tuned so that even on a warm-cache reload (where webglReady
// resolves in <100ms) the user still sees a deliberate fill + brief
// hold at 100% + smooth reveal, not a logo flash. The previous 700ms
// min + 0.6s fill gave almost no visible hold at peak fill and felt
// abrupt on refresh.
//
//   t=0.05  fill starts
//   t=1.00  fill ends           (0.95s fill duration)
//   t=1.20  min timer done      (0.20s hold at 100% fill)
//   t=1.70  reveal done         (0.50s circular reveal)
//   t=2.00  overlay faded       (0.30s overlay fade)
//
// Total ≈ 2.0s on fast loads. Hard cap at 2.5s still covers the worst
// case where webglReady stalls.
const MIN_DISPLAY_MS = 1200;
const HARD_CAP_MS = 2500;
const FILL_DURATION_S = 0.95;
const FILL_DELAY_S = 0.05;
const REVEAL_DURATION_S = 0.5;
const OVERLAY_FADE_S = 0.3;

interface IntroOrchestratorProps {
  fillRectRef: RefObject<SVGRectElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  mainContentRef: RefObject<HTMLElement | null>;
}

export function IntroOrchestrator({
  fillRectRef,
  overlayRef,
  mainContentRef,
}: IntroOrchestratorProps) {
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    // Track the active reveal tween (clip-path or overlay fade) so the
    // cleanup can kill it if the orchestrator unmounts mid-reveal.
    let revealTween: gsap.core.Tween | null = null;

    const html = document.documentElement;
    const introActive = html.classList.contains('intro-lock');

    // Skip case: reduced-motion or session repeat. The inline script in
    // layout.tsx did not set intro-lock, so we fast-forward to reveal.
    if (!introActive) {
      runReveal({ skipAnimation: true });
      return () => {
        disposedRef.current = true;
      };
    }

    // Begin parallel warmup of the video targets. Only 'video' assetTypes
    // go through videoPool — image targets (e.g. the world map .webp)
    // cannot be loaded into a <video> element and would silently reject.
    // They are loaded lazily by Three.js TextureLoader when AsciiCanvas
    // mounts. Promise.allSettled means partial failure is tolerated — the
    // orchestrator relies on per-canvas 'ascii:ready' events rather than
    // this promise's resolution.
    const videoTargets = HOMEPAGE_ASCII_TARGETS.filter(
      (t) => t.assetType === 'video',
    );
    videoPool
      .warmupAll(videoTargets.map((t) => t.textureUrl))
      .then((results) => {
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? videoTargets[i].key : null))
          .filter((k): k is string => k !== null);
        if (failed.length > 0) {
          console.warn('[intro] videoPool partial failure:', failed);
        }
      });

    // Logo fill animation — GSAP attr plugin animates the mask rect's y
    const fillTween = gsap.to(fillRectRef.current, {
      attr: { y: 0 },
      duration: FILL_DURATION_S,
      ease: 'power2.inOut',
      delay: FILL_DELAY_S,
    });

    // WebGL readiness — aggregate via module-level getReadyKeys() (race-free)
    const expectedKeys = computeExpectedReadyKeys();
    const isAllReady = () => {
      const ready = getReadyKeys();
      for (const key of expectedKeys) {
        if (!ready.has(key)) return false;
      }
      return true;
    };

    let readyResolve: (() => void) | null = null;
    const webglReady = new Promise<void>((resolve) => {
      if (isAllReady()) {
        resolve();
        return;
      }
      readyResolve = resolve;
    });

    const onAsciiReady = () => {
      if (readyResolve && isAllReady()) {
        const r = readyResolve;
        readyResolve = null;
        r();
      }
    };
    window.addEventListener('ascii:ready', onAsciiReady);

    // Race: (minTimer + webglReady) vs hardcap
    const minTimer = new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS));
    const hardCap = new Promise<'hardcap'>((r) =>
      setTimeout(() => r('hardcap'), HARD_CAP_MS),
    );

    Promise.race([
      Promise.all([minTimer, webglReady]).then(() => 'ready' as const),
      hardCap,
    ]).then((reason) => {
      if (disposedRef.current) return;
      if (reason === 'hardcap') {
        const ready = getReadyKeys();
        console.warn('[intro] hardcap reached, forcing reveal', {
          expected: expectedKeys.length,
          ready: expectedKeys.filter((k) => ready.has(k)).length,
        });
      }
      runReveal({ skipAnimation: false });
    });

    return () => {
      disposedRef.current = true;
      window.removeEventListener('ascii:ready', onAsciiReady);
      fillTween.kill();
      revealTween?.kill();
    };

    // runReveal is declared inside the effect so it closes over refs
    // without needing useCallback dependencies.
    function runReveal({ skipAnimation }: { skipAnimation: boolean }): void {
      const markSeen = () => {
        try {
          sessionStorage.setItem('introSeen', '1');
        } catch {
          // private browsing — ignore, intro will still skip via fail-open
        }
      };

      // Remove the CSS clip-path gate (data-intro-active) so main-content
      // is no longer visually clipped. This is ALWAYS safe to remove as
      // soon as reveal starts because GSAP's inline clipPath takes over.
      const removeCssGate = () => {
        delete html.dataset.introActive;
      };

      // Remove the hard scroll/touch lock. intro-lock blocks overflow,
      // pointer events, and touch actions. In normal mode we keep it ON
      // until HeroSection's scramble completes (HeroSection's unlockPage()
      // does this via the StaggeredScramble onComplete callback). In
      // skip / fallback paths where the orchestrator owns the full
      // unlock, this function is called here directly.
      const unlockScroll = () => {
        html.classList.remove('intro-lock');
      };

      // Hide the overlay instantly (no GSAP). Used by the skip path and
      // the null-ref fallback path — both need the overlay gone but
      // don't run the fade-out tween.
      const hideOverlayInstant = () => {
        const overlay = overlayRef.current;
        if (overlay) {
          overlay.style.opacity = '0';
          overlay.style.visibility = 'hidden';
        }
      };

      if (skipAnimation) {
        // Skip mode = reduced-motion OR session repeat. The inline script
        // did NOT set intro-lock, so scroll is already unlocked. But the
        // IntroOverlay is still in the DOM covering the page, so we have
        // to hide it here — otherwise the user sees a stuck dim logo.
        removeCssGate();
        unlockScroll(); // no-op if already unlocked, cheap defense
        hideOverlayInstant();
        markSeen();
        // Fire on next tick so subscribers that mount later (e.g. the
        // HeroSection effect) also see the event. Guard against
        // StrictMode double-invoke: if the effect has been cleaned up
        // by the time the microtask runs (second mount cycles through
        // cleanup + re-mount very fast in dev), skip the dispatch.
        queueMicrotask(() => {
          if (disposedRef.current) return;
          window.dispatchEvent(new CustomEvent('intro:revealed'));
          window.dispatchEvent(new CustomEvent('intro:done'));
        });
        return;
      }

      const main = mainContentRef.current;
      const overlay = overlayRef.current;
      if (!main || !overlay) {
        // Defensive fallback: refs should be populated by the parent
        // HomeIntroMount before this effect runs. If they're null for any
        // reason, do NOT leave the intro stuck — fully unlock, mark seen,
        // and dispatch both events immediately so downstream consumers can
        // proceed. This path should never run in practice.
        removeCssGate();
        unlockScroll();
        hideOverlayInstant();
        markSeen();
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('intro:revealed'));
          window.dispatchEvent(new CustomEvent('intro:done'));
        });
        return;
      }

      revealTween = gsap.fromTo(
        main,
        {
          clipPath: 'circle(0% at 50% 50%)',
          WebkitClipPath: 'circle(0% at 50% 50%)',
        },
        {
          clipPath: 'circle(150% at 50% 50%)',
          WebkitClipPath: 'circle(150% at 50% 50%)',
          duration: REVEAL_DURATION_S,
          ease: 'power3.out',
          onStart: () => {
            // Only drop the CSS clip-path gate here. intro-lock is
            // deliberately kept ON so the user cannot scroll until
            // HeroSection's scramble finishes and calls unlockPage()
            // (via the StaggeredScramble onComplete callback). This
            // matches the original pre-intro-loader behavior where
            // scramble completion was the gate for interactivity.
            removeCssGate();
            markSeen();
            window.dispatchEvent(new CustomEvent('intro:revealed'));
          },
          onComplete: () => {
            revealTween = gsap.to(overlay, {
              opacity: 0,
              duration: OVERLAY_FADE_S,
              onComplete: () => {
                window.dispatchEvent(new CustomEvent('intro:done'));
              },
            });
          },
        },
      );
    }
  }, [fillRectRef, overlayRef, mainContentRef]);

  return null;
}
