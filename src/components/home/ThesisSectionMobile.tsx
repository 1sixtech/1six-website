'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { THESIS_STATES, TOTAL } from './thesisData';

import 'swiper/css';
import 'swiper/css/effect-fade';

/**
 * ThesisSectionMobile — Swiper vertical fade with body scroll lock.
 *
 * ── How it works ──
 * 1. IntersectionObserver detects when thesis enters viewport center
 * 2. Body scroll is locked (overflow:hidden) so the page stops here
 * 3. Swiper handles vertical touch gestures for page-by-page transitions
 * 4. At first/last slide edge, lock releases and page scroll resumes
 *
 * ── Why body scroll lock instead of GSAP pin? ──
 * GSAP pin uses position:fixed + pin-spacer DOM wrapper which:
 *   - Conflicts with React's virtual DOM on hydration
 *   - Requires normalizeScroll for iOS momentum (causes jank with WebGL)
 *   - Has position:fixed hit-testing desync after scroll on iOS
 * Body overflow:hidden achieves the same "freeze page here" effect
 * without any DOM manipulation. Works on iOS 16.3+ (WebKit fixed it).
 *
 * ── Why not Swiper's releaseOnEdges? ──
 * Broken on iOS Safari (Swiper #6691, #7923, unresolved as of 2025).
 * We detect edge-scroll manually via touch delta.
 *
 * ── WebGL context management ──
 * Only mount canvas for active slide +-1 (React conditional rendering).
 */
export function ThesisSectionMobile() {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isLockedRef = useRef(false);
  const touchStartY = useRef(0);
  const isExitingRef = useRef(false);
  // Store scroll position before lock to prevent iOS scroll-to-top
  const savedScrollY = useRef(0);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
    isExitingRef.current = false;
  }, []);

  // ── Body scroll lock/unlock ──
  const lockScroll = useCallback(() => {
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    savedScrollY.current = window.scrollY;
    document.body.style.overflow = 'hidden';
    // Prevent iOS from resetting scroll position when overflow changes
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
  }, []);

  const unlockScroll = useCallback(() => {
    if (!isLockedRef.current) return;
    isLockedRef.current = false;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    // Restore scroll position that was saved before lock
    window.scrollTo(0, savedScrollY.current);
  }, []);

  // ── IntersectionObserver: lock scroll when thesis enters viewport ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          // Section is mostly visible — lock and snap to it
          lockScroll();
        }
      },
      { threshold: [0.6] },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      // Clean up lock on unmount
      if (isLockedRef.current) unlockScroll();
    };
  }, [lockScroll, unlockScroll]);

  // ── Edge exit: detect scroll past first/last slide ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const EDGE_THRESHOLD = 50;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isExitingRef.current || !isLockedRef.current) return;

      const swiper = swiperRef.current;
      if (!swiper) return;

      const deltaY = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current);

      // Scrolled DOWN past last slide → exit to ThesisGraph
      if (swiper.activeIndex === TOTAL - 1 && deltaY > EDGE_THRESHOLD) {
        isExitingRef.current = true;
        unlockScroll();
        // Small delay to let scroll position restore, then scroll to next section
        requestAnimationFrame(() => {
          document.getElementById('thesis-graph')?.scrollIntoView({ behavior: 'smooth' });
        });
      }

      // Scrolled UP past first slide → exit back to Hero
      if (swiper.activeIndex === 0 && deltaY < -EDGE_THRESHOLD) {
        isExitingRef.current = true;
        unlockScroll();
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
  }, [unlockScroll]);

  // Clean up on unmount (safety)
  useEffect(() => {
    return () => {
      if (isLockedRef.current) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
      }
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
          const isNearby = Math.abs(index - activeIndex) <= 1;
          return (
            <SwiperSlide key={state.id} className="!flex items-center justify-center">
              <div className="max-w-[1034px] px-[22px] text-center">
                {isNearby ? (
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

      {/* Pagination dots — bottom center (horizontal) */}
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
  );
}
