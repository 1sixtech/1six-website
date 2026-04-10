'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { THESIS_STATES, TOTAL } from './thesisData';

import 'swiper/css';
import 'swiper/css/effect-fade';

/**
 * ThesisSectionMobile — Swiper vertical fade slider for mobile.
 *
 * Uses vertical direction so scrolling down/up naturally flips thesis pages,
 * matching the desktop UX. EffectFade provides the same crossfade transition.
 *
 * ── Why not rely on Swiper's releaseOnEdges? ──
 * iOS Safari has a known, unresolved bug where releaseOnEdges does NOT
 * release scroll control at slider edges on mobile (Swiper #6691, #7923,
 * confirmed broken on iOS 18.3.1 as of March 2025). Instead, we manually
 * detect edge-scroll via touch delta and programmatically scrollIntoView
 * to the adjacent section.
 *
 * ── Why not GSAP pin? ──
 * GSAP ScrollTrigger pin inserts a pin-spacer DOM wrapper and uses
 * position:fixed, which conflicts with React's virtual DOM on hydration
 * and with iOS Safari's compositor-thread momentum scroll. Swiper manages
 * its own container with touch-action CSS, avoiding both problems.
 *
 * ── WebGL context management ──
 * Swiper fade keeps all slides in DOM with opacity:0. IntersectionObserver
 * considers opacity:0 elements "visible", so we control canvas lifecycle
 * via React conditional rendering (mount only active +-1 slides' canvases).
 */
export function ThesisSectionMobile() {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);

  // ── Manual edge-exit detection (replaces broken releaseOnEdges on iOS) ──
  // Track touch start/end Y to detect "scroll past edge" gestures.
  const touchStartY = useRef(0);
  const isExiting = useRef(false);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
  }, []);

  // Touch handlers for edge exit — registered on the section element
  // (not Swiper) so they fire even when Swiper absorbs the gesture.
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const EDGE_THRESHOLD = 50; // px of overscroll needed to trigger exit

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      isExiting.current = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isExiting.current) return;

      const swiper = swiperRef.current;
      if (!swiper) return;

      const deltaY = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current);

      // Scrolled DOWN past last slide → exit to ThesisGraph
      if (swiper.activeIndex === TOTAL - 1 && deltaY > EDGE_THRESHOLD) {
        isExiting.current = true;
        document.getElementById('thesis-graph')?.scrollIntoView({ behavior: 'smooth' });
      }
      // Scrolled UP past first slide → exit to Hero (scroll up)
      if (swiper.activeIndex === 0 && deltaY < -EDGE_THRESHOLD) {
        isExiting.current = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    section.addEventListener('touchstart', onTouchStart, { passive: true });
    section.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      section.removeEventListener('touchstart', onTouchStart);
      section.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
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
          // Only mount WebGL canvases for active slide and neighbors
          const isNearby = Math.abs(index - activeIndex) <= 1;
          return (
            <SwiperSlide key={state.id} className="!flex items-center justify-center">
              <div className="max-w-[1034px] px-[22px] text-center">
                {isNearby ? (
                  state.mobileContent
                ) : (
                  // Placeholder: preserve layout without WebGL canvas
                  <div className="opacity-0" aria-hidden="true">
                    {state.mobileContent}
                  </div>
                )}
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>

      {/* Vertical pagination dots — right side, matching desktop dot position */}
      <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
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
  );
}
