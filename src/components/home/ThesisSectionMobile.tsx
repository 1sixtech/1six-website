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
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // State: 'idle' (normal scroll) | 'captured' (touch blocked by us)
  const stateRef = useRef<'idle' | 'captured'>('idle');
  const touchStartY = useRef(0);
  const prevScrollYRef = useRef(0);
  const captureSuspendedUntilRef = useRef(0);
  // Boundary cooldown: block the sentinel on the edge we just crossed until the
  // smooth exit settles. This prevents the exit animation from immediately
  // re-triggering capture at the same boundary.
  const blockedSentinel = useRef<'top' | 'bottom' | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
  }, []);

  const suspendCapture = useCallback((duration = CAPTURE_SUSPEND_MS) => {
    captureSuspendedUntilRef.current = Date.now() + duration;
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

  // ── Reverse re-entry from below: detect upward scroll crossing the threshold ──
  // Using scroll deltas here avoids the "first intersect at 0px" edge case of a
  // zero-height sentinel, which was too eager on mobile Safari.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    prevScrollYRef.current = window.scrollY;

    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const prevScrollY = prevScrollYRef.current;
      prevScrollYRef.current = currentScrollY;

      if (currentScrollY >= prevScrollY) return;
      if (stateRef.current !== 'idle') return;
      if (Date.now() < captureSuspendedUntilRef.current) return;
      if (blockedSentinel.current === 'bottom') return;

      const sectionTopAbs = section.getBoundingClientRect().top + currentScrollY;
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

  // ── Edge exit: swipe past first/last slide ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const EDGE_THRESHOLD = 50;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (stateRef.current !== 'captured') return;

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

    return () => {
      section.removeEventListener('touchstart', onTouchStart);
      section.removeEventListener('touchend', onTouchEnd);
    };
  }, [release, smoothScrollToExit]);

  // Cleanup on unmount
  useEffect(() => {
    const onHashScrollRequest = (event: Event) => {
      const nextHash = (event as CustomEvent<{ hash?: string }>).detail?.hash;
      if (!nextHash || nextHash === 'thesis') return;
      releaseForProgrammaticNavigation();
    };

    window.addEventListener(HASH_SCROLL_REQUEST_EVENT, onHashScrollRequest as EventListener);

    return () => {
      window.removeEventListener(HASH_SCROLL_REQUEST_EVENT, onHashScrollRequest as EventListener);
    };
  }, [releaseForProgrammaticNavigation]);

  useEffect(() => {
    return () => {
      document.removeEventListener('touchmove', preventPageScroll);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
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
            // Only active slide mounts WebGL canvas (aggressive for mobile GPU)
            const isActive = index === activeIndex;
            return (
              <SwiperSlide key={state.id} className="!flex items-center justify-center">
                <div className="max-w-[1034px] px-[22px] text-center">
                  {isActive ? (
                    state.mobileContent
                  ) : (
                    <div className="opacity-0" aria-hidden="true">
                      {state.mobileContent}
                    </div>
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
