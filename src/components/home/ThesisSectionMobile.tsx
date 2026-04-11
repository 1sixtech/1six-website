'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { HASH_SCROLL_REQUEST_EVENT } from '@/lib/hashScroll';
import { THESIS_STATES, TOTAL } from './thesisData';

import 'swiper/css';
import 'swiper/css/effect-fade';

/**
 * ThesisSectionMobile — fullpage-style vertical slide with scroll capture.
 *
 * ── Architecture ──
 *
 *   Hero (normal scroll)
 *     │ scroll down
 *     ▼
 *   ┌─ sentinel (h-0) ───────────────────────────┐
 *   │  IO detects: sentinel left viewport         │
 *   │  → scrollTo(thesis top, instant)            │
 *   │  → capture touchmove on document            │
 *   └────────────────────────────────────────────┘
 *     │
 *     ▼
 *   ┌─ Thesis (100dvh, Swiper vertical + fade) ──┐
 *   │  All page-level scroll is blocked via       │
 *   │  touchmove.preventDefault() on document.    │
 *   │  Swiper handles vertical swipe internally.  │
 *   │                                             │
 *   │  Slide 1 + swipe UP 50px  → release + Hero │
 *   │  Slide 7 + swipe DOWN 50px → release + Graph│
 *   └────────────────────────────────────────────┘
 *     │
 *     ▼
 *   ThesisGraph (normal scroll resumes)
 *
 * ── Why touchmove.preventDefault instead of body lock? ──
 * body overflow:hidden + position:fixed has timing issues on iOS:
 *   - Applying mid-momentum doesn't stop compositor-thread scroll
 *   - scrollY desync between JS and compositor during smooth scroll
 *   - position:fixed causes visible layout shift
 * touchmove.preventDefault directly tells the browser "don't scroll"
 * at the event level, before the compositor decides. This is what
 * fullpage.js uses internally. It's synchronous and reliable.
 *
 * ── Re-entry from below ──
 * A bottom sentinel before ThesisGraph detects upward scroll.
 * When triggered: snap to thesis, show last slide, capture touch.
 */
export function ThesisSectionMobile() {
  const CAPTURE_SUSPEND_MS = 1200;
  // Pixel gap allowed between window.scrollY and sectionTopAbs when a hash
  // nav finishes before pending-hash capture will fire. Must absorb
  // subpixel rounding from getBoundingClientRect()/scrollY (1-2 device px
  // at 2x/3x DPR) plus small layout shifts from ScrollTrigger.refresh()
  // and iOS dynamic address bar. 1px was too tight (hash captures silent-
  // failed on mobile Safari when subpixel rounding pushed the value by
  // a single pixel). 4px is the smallest value that reliably survives
  // observed rounding without accidentally capturing when the user is
  // near-but-not-at thesis top.
  const HASH_CAPTURE_ALIGNMENT_TOLERANCE = 4;
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // State: 'idle' (normal scroll) | 'captured' (touch blocked by us)
  const stateRef = useRef<'idle' | 'captured'>('idle');
  const touchStartY = useRef(0);
  // Marks whether touchStartY is a valid swipe baseline. Set true on
  // touchstart, false on touchcancel. onTouchEnd only processes the swipe
  // when this is true, preventing a stray touchend that fires after an
  // OS-cancelled gesture (incoming call, notification) from computing a
  // bogus deltaY against a stale start position. A boolean flag is
  // unambiguous — clientY = 0 is itself a valid coordinate, so resetting
  // touchStartY to 0 as a sentinel was not a reliable signal.
  const touchValidRef = useRef(false);
  const prevScrollYRef = useRef(0);
  const captureSuspendedUntilRef = useRef(0);
  const pendingHashCaptureRef = useRef(false);
  // Boundary cooldown: block the sentinel on the edge we just crossed until the
  // smooth exit settles. This prevents the exit animation from immediately
  // re-triggering capture at the same boundary.
  const blockedSentinel = useRef<'top' | 'bottom' | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cached absolute Y of section top. Computed ONLY at layout-stable moments
  // (mount, resize, load, intro-lock removal) — NEVER inside a scroll event.
  //
  // Why: `getBoundingClientRect()` returns STALE values on iOS during momentum
  // scroll — see commit 8b9312e and THESIS_SCROLL_HISTORY.md §2.9, §4.6. On
  // Android the same call fires LATE through the IntersectionObserver path,
  // causing `entry.boundingClientRect.bottom + window.scrollY` to compute a
  // wrong sectionTopAbs (scrollY has moved on since the snapshot), so the IO
  // capture snaps the user into ThesisGraph instead of Thesis top. A cached
  // value computed off the scroll path dodges both iOS-stale-rect AND
  // Android-late-IO failure modes in one shot.
  const sectionTopAbsRef = useRef<number | null>(null);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
  }, []);

  // ── Touch capture: block all page-level scrolling ──
  // Registered on document with { passive: false } so preventDefault works.
  // Swiper still receives the gesture first on the section element, then the
  // bubbling document listener cancels native page scrolling underneath it.
  const preventPageScroll = useCallback((e: TouchEvent) => {
    if (stateRef.current !== 'captured') return;
    e.preventDefault();
  }, []);

  // ── Capture: snap to thesis and block page scroll ──
  // sectionTopAbs: absolute Y of thesis top at the moment IO detected intersection.
  // Passing this in avoids calling getBoundingClientRect() inside the callback,
  // which would read a stale value after iOS momentum overshoots past the sentinel.
  const capture = useCallback((fromDirection: 'top' | 'bottom', sectionTopAbs: number) => {
    if (stateRef.current !== 'idle') return;
    stateRef.current = 'captured';
    pendingHashCaptureRef.current = false;

    // Instant snap using the pre-computed position (no momentum-induced offset)
    window.scrollTo({ top: sectionTopAbs, behavior: 'auto' as ScrollBehavior });
    prevScrollYRef.current = sectionTopAbs;

    // Set correct starting slide based on entry direction
    if (fromDirection === 'bottom') {
      swiperRef.current?.slideTo(TOTAL - 1, 0);
      setActiveIndex(TOTAL - 1);
    } else {
      swiperRef.current?.slideTo(0, 0);
      setActiveIndex(0);
    }

    // Block page scroll at document level
    document.addEventListener('touchmove', preventPageScroll, { passive: false });
  }, [preventPageScroll]);

  const flushPendingCapture = useCallback(() => {
    const section = sectionRef.current;
    if (!section || stateRef.current !== 'idle') return;

    const currentScrollY = window.scrollY;
    const sectionTopAbs = section.getBoundingClientRect().top + currentScrollY;

    // Only pending hash-captures are flushed here. A pending reverse-capture
    // was previously queued during the suspend window and replayed at flush
    // time, but the replay semantic was wrong: re-checking the scroll
    // position ~1.2s after a threshold crossing does not tell us whether the
    // user still intends to re-enter thesis (they may have continued past
    // it, reversed again, or simply stopped above it). Trusting the flag
    // caused unintended snap-backs to the last slide. We now let the reverse
    // re-entry rely purely on the next real onScroll event after the suspend
    // window expires, which matches the behavior that shipped in d14f610.
    if (pendingHashCaptureRef.current
      && Math.abs(currentScrollY - sectionTopAbs) <= HASH_CAPTURE_ALIGNMENT_TOLERANCE) {
      capture('top', sectionTopAbs);
      return;
    }

    pendingHashCaptureRef.current = false;
  }, [capture]);

  const suspendCapture = useCallback((duration = CAPTURE_SUSPEND_MS) => {
    captureSuspendedUntilRef.current = Date.now() + duration;
    if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    suspendTimerRef.current = setTimeout(() => {
      flushPendingCapture();
    }, duration + 32);
  }, [flushPendingCapture]);

  const stopCapture = useCallback((blockedBoundary: 'top' | 'bottom' | null) => {
    stateRef.current = 'idle';
    document.removeEventListener('touchmove', preventPageScroll);

    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    blockedSentinel.current = blockedBoundary;

    if (!blockedBoundary) return;

    cooldownTimer.current = setTimeout(() => {
      blockedSentinel.current = null;
    }, CAPTURE_SUSPEND_MS);
  }, [preventPageScroll]);

  // ── Release: restore page scroll ──
  // exitDirection: which way we're exiting — blocks THAT boundary sentinel
  // while the smooth exit scroll is still moving past it.
  const release = useCallback((exitDirection: 'down' | 'up') => {
    if (stateRef.current !== 'captured') return;
    stopCapture(exitDirection === 'down' ? 'bottom' : 'top');
    suspendCapture();
  }, [stopCapture, suspendCapture]);

  const releaseForProgrammaticNavigation = useCallback(() => {
    stopCapture(null);
    suspendCapture();
  }, [stopCapture, suspendCapture]);

  const smoothScrollToExit = useCallback((exitDirection: 'down' | 'up') => {
    if (exitDirection === 'down') {
      const graph = document.getElementById('thesis-graph');
      if (!graph) return;

      // End one pixel inside ThesisGraph so the bottom sentinel is out of view.
      // This prevents an immediate re-capture at the exact section boundary.
      const graphTop = graph.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: graphTop + 1, behavior: 'smooth' });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── Cache sectionTopAbs at layout-stable moments ──
  //
  // The section's absolute Y in the document is stable throughout a session
  // unless content above it reflows (image / font load, resize, intro lock
  // removal). Computing it off the scroll path sidesteps the iOS stale-rect
  // window that bit Phase 2.9.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const computeTopAbs = () => {
      // Safe to read here: we are NOT inside a scroll event handler, so iOS
      // Safari returns a fresh rect.
      sectionTopAbsRef.current = section.getBoundingClientRect().top + window.scrollY;
    };

    computeTopAbs();
    window.addEventListener('resize', computeTopAbs);
    window.addEventListener('load', computeTopAbs);

    // The intro overlay can delay content layout until intro-lock lifts,
    // which on slow devices is after this effect first runs. Recompute when
    // the lock class is removed so the cache reflects the post-intro layout.
    const html = document.documentElement;
    const mo = new MutationObserver(() => {
      if (!html.classList.contains('intro-lock')) {
        // Defer one frame so the browser has applied any layout shift from
        // removing `overflow: hidden` before we measure.
        requestAnimationFrame(computeTopAbs);
      }
    });
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', computeTopAbs);
      window.removeEventListener('load', computeTopAbs);
      mo.disconnect();
    };
  }, []);

  // ── Top sentinel: detect scroll down into thesis ──
  // Sentinel sits directly above the thesis section, so when it leaves the
  // viewport (scrolling down), thesis top is at the viewport top.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const section = sectionRef.current;
    if (!sentinel || !section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting
          && entry.boundingClientRect.bottom < 0
          && stateRef.current === 'idle'
          && Date.now() >= captureSuspendedUntilRef.current
          && blockedSentinel.current !== 'top') {
          // Section top at IO detection time: sentinel bottom = section top
          const sectionTopAbs = entry.boundingClientRect.bottom + window.scrollY;
          capture('top', sectionTopAbs);
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [capture]);

  // ── Scroll-event forward + reverse crossing detection ──
  //
  // Two entry paths are handled here:
  //
  //   FORWARD (Hero → Thesis): the IntersectionObserver on the top sentinel
  //   remains the primary trigger on iOS (where it fires with acceptable
  //   latency). On Android Chrome the IO callback is throttled hard during
  //   inertial scrolls — by the time it runs, the user can already be
  //   several hundred pixels past Thesis, and because the IO path computes
  //   `entry.boundingClientRect.bottom + window.scrollY` the callback-time
  //   scrollY has moved on from the snapshot scrollY, producing a wrong
  //   `sectionTopAbs` that scrollTo() snaps into ThesisGraph. Adding a
  //   scroll-event forward check with a CACHED `sectionTopAbs` lets us
  //   catch the crossing in real time on Android without the wrong-target
  //   class of bug.
  //
  //   CRITICAL — iOS safety: we MUST NOT read `getBoundingClientRect()`
  //   inside a scroll event on iOS (stale-rect window, see §2.9 +
  //   commit 8b9312e). The cached `sectionTopAbsRef` is computed at
  //   layout-stable moments (mount / resize / load / intro-lock lift)
  //   and consulted here read-only. If the cache has not been populated
  //   yet, we skip forward detection entirely and let the IO path handle
  //   it — same behaviour as before this change, so no iPhone regression.
  //
  //   REVERSE (ThesisGraph → Thesis): unchanged. The existing logic
  //   reads a fresh rect and has been iPhone-verified through Phase 3.
  //   Do not switch this to the cache without re-verifying on device.
  //
  // The IntersectionObserver above remains as a safety net for both paths.
  // Whichever fires first wins; the second one no-ops because
  // `stateRef.current !== 'idle'`.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    prevScrollYRef.current = window.scrollY;

    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const prevScrollY = prevScrollYRef.current;
      prevScrollYRef.current = currentScrollY;

      // Fresh rect is used only for the existing pending-hash and reverse
      // re-entry paths. The forward path below uses the cached value.
      const sectionTopAbs = section.getBoundingClientRect().top + currentScrollY;

      if (pendingHashCaptureRef.current
        && stateRef.current === 'idle'
        && Math.abs(currentScrollY - sectionTopAbs) <= HASH_CAPTURE_ALIGNMENT_TOLERANCE) {
        capture('top', sectionTopAbs);
        return;
      }

      // ── Downward crossing: Hero → Thesis (forward, iOS-safe) ──
      if (currentScrollY > prevScrollY) {
        if (stateRef.current !== 'idle') return;
        if (Date.now() < captureSuspendedUntilRef.current) return;
        if (blockedSentinel.current === 'top') return;
        const cachedTopAbs = sectionTopAbsRef.current;
        // If the cache hasn't been computed yet (very early mount timing,
        // before the cache effect ran), bail out and let the IO path handle
        // the entry. This preserves the pre-change behaviour on iOS.
        if (cachedTopAbs == null) return;
        if (prevScrollY < cachedTopAbs && currentScrollY >= cachedTopAbs) {
          capture('top', cachedTopAbs);
        }
        return;
      }

      // No change → nothing to do. Prevents a rare same-value scroll event
      // from slipping into the reverse re-entry branch below.
      if (currentScrollY === prevScrollY) return;

      // ── Upward crossing: ThesisGraph → Thesis (reverse, unchanged) ──
      if (stateRef.current !== 'idle') return;
      if (Date.now() < captureSuspendedUntilRef.current) return;
      if (blockedSentinel.current === 'bottom') return;

      // Match the forward Hero -> Thesis handoff: only capture once Thesis
      // fully occupies the viewport again (section top reaches viewport top).
      const reverseCaptureThreshold = sectionTopAbs;
      if (prevScrollY > reverseCaptureThreshold && currentScrollY <= reverseCaptureThreshold) {
        capture('bottom', sectionTopAbs);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [capture]);

  useEffect(() => {
    if (window.location.hash !== '#thesis') return;

    const section = sectionRef.current;
    if (!section) return;

    const startTime = Date.now();
    const maxWait = 500;
    const poll = setInterval(() => {
      if (stateRef.current !== 'idle') {
        clearInterval(poll);
        return;
      }

      const currentScrollY = window.scrollY;
      const sectionTopAbs = section.getBoundingClientRect().top + currentScrollY;
      if (Math.abs(currentScrollY - sectionTopAbs) <= HASH_CAPTURE_ALIGNMENT_TOLERANCE) {
        clearInterval(poll);
        capture('top', sectionTopAbs);
      } else if (Date.now() - startTime > maxWait) {
        clearInterval(poll);
      }
    }, 50);

    return () => clearInterval(poll);
  }, [capture]);

  // ── Edge exit: swipe past first/last slide ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const EDGE_THRESHOLD = 50;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchValidRef.current = true;
    };

    // Invalidate the swipe baseline if the OS cancels the touch (incoming
    // call, notification, etc). A stray touchend that fires after the cancel
    // would otherwise compute a bogus deltaY against a stale start position
    // and trigger a false edge exit. onTouchEnd checks touchValidRef before
    // processing, so flipping the flag here is sufficient — we deliberately
    // leave touchStartY untouched so there is no dependency on a sentinel
    // value that could collide with a real coordinate.
    const onTouchCancel = () => {
      touchValidRef.current = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (stateRef.current !== 'captured') return;
      // Ignore stray touchend events that arrive after an OS-cancelled
      // gesture. Without this guard, a cancelled swipe's trailing touchend
      // would compute deltaY against a stale touchStartY and could trigger
      // a false edge exit on the first or last slide.
      if (!touchValidRef.current) return;
      touchValidRef.current = false;

      const swiper = swiperRef.current;
      if (!swiper) return;

      const deltaY = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current);

      // DOWN past last slide → exit to ThesisGraph
      if (swiper.activeIndex === TOTAL - 1 && deltaY > EDGE_THRESHOLD) {
        release('down');
        requestAnimationFrame(() => {
          smoothScrollToExit('down');
        });
        return;
      }

      // UP past first slide → exit to Hero
      if (swiper.activeIndex === 0 && deltaY < -EDGE_THRESHOLD) {
        release('up');
        requestAnimationFrame(() => {
          smoothScrollToExit('up');
        });
      }
    };

    section.addEventListener('touchstart', onTouchStart, { passive: true });
    section.addEventListener('touchend', onTouchEnd, { passive: true });
    section.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      section.removeEventListener('touchstart', onTouchStart);
      section.removeEventListener('touchend', onTouchEnd);
      section.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [release, smoothScrollToExit]);

  // Cleanup on unmount
  useEffect(() => {
    const onHashScrollRequest = (event: Event) => {
      const nextHash = (event as CustomEvent<{ hash?: string }>).detail?.hash;
      if (!nextHash) return;
      if (nextHash === 'thesis') {
        if (stateRef.current !== 'captured') {
          pendingHashCaptureRef.current = true;
          suspendCapture();
        }
        return;
      }

      pendingHashCaptureRef.current = false;
      releaseForProgrammaticNavigation();
    };

    window.addEventListener(HASH_SCROLL_REQUEST_EVENT, onHashScrollRequest as EventListener);

    return () => {
      window.removeEventListener(HASH_SCROLL_REQUEST_EVENT, onHashScrollRequest as EventListener);
    };
  }, [releaseForProgrammaticNavigation, suspendCapture]);

  useEffect(() => {
    return () => {
      document.removeEventListener('touchmove', preventPageScroll);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    };
  }, [preventPageScroll]);

  return (
    <>
      {/* Top sentinel: triggers capture when scrolling down past it */}
      <div ref={topSentinelRef} className="h-0 w-full" aria-hidden="true" />

      <section
        ref={sectionRef}
        id="thesis"
        className="relative h-dvh w-full overflow-hidden z-10"
        style={{ backgroundColor: 'var(--color-card)' }}
        aria-live="polite"
      >
        <Swiper
          modules={[EffectFade]}
          effect="fade"
          fadeEffect={{ crossFade: true }}
          direction="vertical"
          slidesPerView={1}
          speed={400}
          loop={false}
          allowTouchMove={true}
          onSwiper={(swiper) => { swiperRef.current = swiper; }}
          onSlideChange={handleSlideChange}
          className="h-full w-full"
        >
          {THESIS_STATES.map((state, index) => {
            // WebGL mounting via isNearby gate (Phase 2, see design spec §6.2-6.3):
            //
            // Previously all 6 slides mounted MobileAscii → AsciiCanvas
            // concurrently, consuming 6 WebGL contexts on mobile even though
            // only one was visible at a time. With the intro preload in
            // place, all 6 videos are pre-warmed in videoPool regardless.
            //
            // Now only the active slide and its immediate neighbors render
            // MobileAscii. Non-nearby slides render an aria-hidden empty
            // placeholder that preserves the Swiper slide footprint without
            // spinning up a canvas.
            //
            // Swiper crossfade is 400ms; new canvas init with a warmed
            // video is ~50-150ms, comfortably under the fade window.
            const isActive = index === activeIndex;
            const isNearby = Math.abs(index - activeIndex) <= 1;
            return (
              <SwiperSlide key={state.id} className="!flex items-center justify-center">
                <div className="max-w-[1034px] px-[22px] text-center">
                  {isNearby ? (
                    <div
                      className={isActive ? '' : 'opacity-0'}
                      aria-hidden={!isActive}
                    >
                      {state.mobileContent}
                    </div>
                  ) : (
                    <div className="opacity-0" aria-hidden="true" />
                  )}
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {/* Pagination dots — bottom center */}
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {THESIS_STATES.map((_, i) => (
            <button
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: i === activeIndex ? 'var(--color-accent)' : 'var(--color-sub-text2)',
                opacity: i === activeIndex ? 1 : 0.3,
                transform: i === activeIndex ? 'scale(1.5)' : 'scale(1)',
              }}
              onClick={() => swiperRef.current?.slideTo(i)}
              aria-label={`Go to section ${i + 1} of ${TOTAL}`}
            />
          ))}
        </div>
      </section>
    </>
  );
}
