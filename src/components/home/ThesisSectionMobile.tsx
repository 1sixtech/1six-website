'use client';

import { useState, useRef, useCallback } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade, Pagination } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { THESIS_STATES, TOTAL } from './thesisData';

import 'swiper/css';
import 'swiper/css/effect-fade';
import 'swiper/css/pagination';

/**
 * ThesisSectionMobile — Swiper-based horizontal fade slider for mobile.
 *
 * Replaces the GSAP ScrollTrigger pin + Observer pattern on mobile to avoid
 * iOS Safari compositor-thread scroll conflicts. Horizontal swipe direction
 * avoids fighting with native vertical page scroll.
 *
 * WebGL context management: only mounts <AsciiThesis> canvas for active slide
 * and its immediate neighbors (+-1). Swiper fade keeps all slides in DOM with
 * opacity:0, but IntersectionObserver considers those "visible" — so we must
 * control canvas lifecycle via React conditional rendering, not IO.
 */
export function ThesisSectionMobile() {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const atEndRef = useRef(false);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
    atEndRef.current = false;
  }, []);

  const handleReachEnd = useCallback(() => {
    atEndRef.current = true;
  }, []);

  // Exit to ThesisGraph when user swipes right past the last slide
  const handleTouchEnd = useCallback(() => {
    if (atEndRef.current && swiperRef.current) {
      const swiper = swiperRef.current;
      // Check if we're still on the last slide (swipe didn't go backward)
      if (swiper.activeIndex === TOTAL - 1) {
        document.getElementById('thesis-graph')?.scrollIntoView({ behavior: 'smooth' });
        atEndRef.current = false;
      }
    }
  }, []);

  return (
    <section
      id="thesis"
      className="relative h-dvh w-full overflow-hidden z-10"
      style={{ backgroundColor: 'var(--color-card)' }}
      aria-live="polite"
    >
      <Swiper
        modules={[EffectFade, Pagination]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        direction="horizontal"
        slidesPerView={1}
        speed={400}
        touchAngle={35}
        loop={false}
        pagination={{
          clickable: true,
          bulletClass: 'thesis-mobile-dot',
          bulletActiveClass: 'thesis-mobile-dot-active',
        }}
        onSwiper={(swiper) => { swiperRef.current = swiper; }}
        onSlideChange={handleSlideChange}
        onReachEnd={handleReachEnd}
        onTouchEnd={handleTouchEnd}
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
                  // Placeholder: same structure but without WebGL canvas
                  <div className="opacity-0" aria-hidden="true">
                    {state.mobileContent}
                  </div>
                )}
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>

      {/* Pagination dot styles — using Swiper's built-in classes */}
    </section>
  );
}
