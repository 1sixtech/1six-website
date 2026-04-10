'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
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
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // State: 'idle' (normal scroll) | 'captured' (touch blocked by us)
  const stateRef = useRef<'idle' | 'captured'>('idle');
  const touchStartY = useRef(0);
  // Direction-aware cooldown: only blocks the sentinel we just exited toward.
  // Exit down → block top sentinel (so scrolling toward Graph doesn't re-capture)
  // Exit up → block bottom sentinel (so scrolling toward Hero doesn't re-capture)
  // The OTHER sentinel stays unblocked for immediate reverse re-entry.
  const blockedSentinel = useRef<'top' | 'bottom' | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
  }, []);

  // ── Touch capture: block all page-level scrolling ──
  // Registered on document with { passive: false } so preventDefault works.
  // Only blocks touches OUTSIDE the Swiper container — Swiper still handles
  // its own vertical swipe internally.
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

  // ── Release: restore page scroll ──
  // exitDirection: which way we're exiting — blocks THAT sentinel during cooldown
  // so the OTHER sentinel can still capture for immediate reverse re-entry.
  const release = useCallback((exitDirection: 'down' | 'up') => {
    if (stateRef.current !== 'captured') return;
    stateRef.current = 'idle';

    document.removeEventListener('touchmove', preventPageScroll);

    // Block only the sentinel in the exit direction to prevent re-capture
    // during the smooth scroll. The opposite sentinel stays open.
    blockedSentinel.current = exitDirection === 'down' ? 'top' : 'bottom';
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => {
      blockedSentinel.current = null;
    }, 700);
  }, [preventPageScroll]);

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
          && stateRef.current === 'idle'
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

  // ── Bottom sentinel: detect scroll up into thesis from below ──
  // Sentinel sits directly after the thesis section, so when the user scrolls
  // up from ThesisGraph it becomes visible from the bottom of the viewport.
  //
  // rootMargin '0px 0px -50% 0px' shrinks the effective bottom edge to the
  // middle of the viewport. This means the bottom sentinel must travel up
  // past the viewport midline before it's considered "intersecting" — so the
  // user has to scroll back up ~half a viewport before capture triggers.
  // Without this, an accidental tiny upward nudge after exiting down was
  // enough to pull the user back into thesis (the "jump back" feeling).
  //
  // We also read the section's top from `entry.boundingClientRect` instead
  // of calling getBoundingClientRect() inside the callback — IO's snapshot
  // is from the moment it detected intersection, avoiding iOS momentum
  // overshoot that would make a late getBoundingClientRect() read stale.
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const section = sectionRef.current;
    if (!sentinel || !section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting
          && stateRef.current === 'idle'
          && blockedSentinel.current !== 'bottom') {
          // Sentinel's top = section's bottom → subtract section height for section top
          const sectionTopAbs = entry.boundingClientRect.top
            + window.scrollY
            - section.offsetHeight;
          capture('bottom', sectionTopAbs);
        }
      },
      { threshold: 0, rootMargin: '0px 0px -50% 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
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
          document.getElementById('thesis-graph')?.scrollIntoView({ behavior: 'smooth' });
        });
      }

      // UP past first slide → exit to Hero
      if (swiper.activeIndex === 0 && deltaY < -EDGE_THRESHOLD) {
        release('up');
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
    };

    section.addEventListener('touchstart', onTouchStart, { passive: true });
    section.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      section.removeEventListener('touchstart', onTouchStart);
      section.removeEventListener('touchend', onTouchEnd);
    };
  }, [release]);

  // Cleanup on unmount
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

      {/* Bottom sentinel: triggers capture when scrolling up toward thesis */}
      <div ref={bottomSentinelRef} className="h-0 w-full" aria-hidden="true" />
    </>
  );
}
