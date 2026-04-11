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
 * Timeline (full intro, best case webglReady ≤ 0.7s):
 *   t=0.00  videoPool.warmupAll starts; AsciiCanvas instances init in parallel
 *   t=0.05  logo fill mask rect y: 21.03 -> 0 over 0.95s (power2.inOut)
 *   t=1.00  fill done
 *   t=1.20  minTimer done -> reveal (if webglReady also done)
 *           -> GSAP: main-content clip-path circle(0%) -> circle(150%) over 0.5s
 *           -> dispatches 'intro:revealed', sets sessionStorage.introSeen
 *   t=1.70  reveal done -> GSAP: overlay opacity 1 -> 0 over 0.3s
 *   t=2.00  -> dispatches 'intro:done'
 *
 * Hardcap: 2.5s. Even if webglReady never fires, reveal runs.
 *
 * intro-lock is set by the inline script in layout.tsx in BOTH modes and
 * is the sole responsibility of HeroSection's unlockPage() to remove
 * (via the StaggeredScramble onComplete callback or the 2.5 s safety
 * fallback). This keeps the lock active during the hero scramble in
 * skip mode too, so the user cannot scroll past "we haven't crossed
 * the 16% yet." before the 16% has finished scrambling.
 *
 * Reduced-motion / session repeat (skip mode): data-intro-active is NOT
 * set, so this effect takes the early-return skip path below. The
 * overlay is additionally hidden via CSS (data-intro-skip) so no logo
 * flash is visible.
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

// Initial y of the fill rect (matches LogoFillSvg rect y). At start, the
// rect sits entirely below the logo viewBox so the overlay reveals 0% of
// the accent-filled logo. As y tweens to 0 the rect climbs up and the
// masked accent fill rises from the bottom.
const FILL_START_Y = 21.03;
const FILL_END_Y = 0;

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
    // Full intro runs only when the inline script set data-intro-active=true.
    // intro-lock by itself is NOT a reliable full-vs-skip signal — as of the
    // inline-script rework, intro-lock is now applied in BOTH modes to block
    // scroll during the hero scramble (see layout.tsx). The two modes are
    // distinguished by the data attribute.
    const introActive = html.dataset.introActive === 'true';

    // Skip case: reduced-motion or session repeat. data-intro-active was not
    // set by the inline script, so we fast-forward to reveal.
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

    // ── Logo fill animation ──
    //
    // Tween the mask rect's y attribute from 21.03 (logo fully hidden)
    // to 0 (logo fully filled) via a GSAP proxy-object tween.
    //
    // Why NOT `gsap.to(rect, { attr: { y: 0 } })`?
    //
    // `attr` is provided by GSAP's AttrPlugin, which Turbopack's
    // tree-shaker strips from the bundle: the plugin's module-level
    // `gsap.registerPlugin(AttrPlugin)` side effect is dead-code-
    // eliminated. When AttrPlugin is absent GSAP silently falls
    // through and sets the target property at the END of the
    // duration with no interpolation — the fill "runs" but nothing
    // animates, so the user sees the dim silhouette for the entire
    // duration and then a sudden jump to fully filled.
    //
    // A plain object passed to `gsap.to()` goes through GSAP core's
    // property tweener, which doesn't require any plugin. We then
    // mirror the proxy's interpolated value onto the SVG attribute in
    // the onUpdate callback. No plugin, no tree-shake fragility.
    const fillProxy = { y: FILL_START_Y };
    const fillRect = fillRectRef.current;
    if (fillRect) fillRect.setAttribute('y', String(FILL_START_Y));
    const fillTween = gsap.to(fillProxy, {
      y: FILL_END_Y,
      duration: FILL_DURATION_S,
      ease: 'power2.inOut',
      delay: FILL_DELAY_S,
      onUpdate: () => {
        // Re-read the ref every frame — cheap, and safe against the
        // DOM node being re-mounted (e.g. React StrictMode dev cycle).
        const el = fillRectRef.current;
        if (el) el.setAttribute('y', String(fillProxy.y));
      },
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

      // NOTE: the orchestrator deliberately does NOT own intro-lock
      // removal. HeroSection.unlockPage() (via StaggeredScramble's
      // onComplete, or its 2.5s safety fallback) is the sole owner in both
      // modes — this keeps the lock active during the hero scramble so the
      // user cannot scroll past "we haven't crossed the 16% yet." before
      // the 16% has finished scrambling. A route-leave safety net in
      // HomeIntroMount clears a genuinely stuck lock if HeroSection never
      // unmounts normally (e.g. the user clicks Header About mid-scramble
      // in skip mode, which this review fix closes).

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
        // Skip mode = reduced-motion OR session repeat.
        //
        // As of the inline-script rework, intro-lock IS still set in skip
        // mode — it blocks scroll until the hero scramble finishes so the
        // user cannot scroll past "we haven't crossed the 16% yet." before
        // the 16% has even rendered. HeroSection's unlockPage() (called
        // either by the scramble onComplete or by its 2.5 s safety
        // fallback) is now the sole owner of intro-lock removal in both
        // modes — DO NOT call unlockScroll here or we race HeroSection's
        // scramble and let scroll leak through.
        //
        // The overlay is additionally hidden via CSS
        // (html[data-intro-skip='true'] .intro-overlay { display:none })
        // so it never produces a visible logo flash. hideOverlayInstant
        // is kept as defense-in-depth in case the data attribute is not
        // yet applied (e.g. a downstream change removes it).
        removeCssGate();
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
        // reason, do NOT leave the intro stuck — drop the clip-path gate,
        // hide the overlay, mark seen, and dispatch both events so
        // downstream consumers can proceed. This path should never run in
        // practice.
        //
        // We deliberately do NOT call unlockScroll() here. HeroSection owns
        // intro-lock removal (via unlockPage() from the scramble onComplete
        // or its 2.5s safety fallback) in both modes; calling unlockScroll
        // from the defensive path would race HeroSection's scramble and let
        // the user scroll past "we haven't crossed the 16% yet." before the
        // 16% has even rendered. The route-leave cleanup in HomeIntroMount
        // is the global safety net against a genuine stuck lock.
        removeCssGate();
        hideOverlayInstant();
        markSeen();
        queueMicrotask(() => {
          if (disposedRef.current) return;
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
