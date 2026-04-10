'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { THESIS_STATES, TOTAL } from './thesisData';

import 'swiper/css';
import 'swiper/css/effect-fade';

/**
 * ThesisSectionMobile — Swiper vertical fade with sentinel-based scroll lock.
 *
 * ── Flow ──
 * 1. Top sentinel (0px div before section) leaves viewport while scrolling down
 *    → section top is at viewport top → instant snap + body lock
 * 2. Swiper handles vertical touch for page-by-page crossfade
 * 3. Edge exit: last slide + swipe down → instant unlock + scroll to ThesisGraph
 *    First slide + swipe up → instant unlock + scroll to Hero
 * 4. Exit cooldown (800ms) prevents re-lock from stale IO callbacks
 *
 * ── Lock mechanism ──
 * Primary: body overflow:hidden + position:fixed (preserves scroll position)
 * Safari fallback: touchmove preventDefault on document during lock
 * (iOS 16.3+ supports overflow:hidden on body, but belt-and-suspenders)
 *
 * ── WebGL ──
 * Only active slide mounts canvas. +-1 neighbors use placeholder.
 * More aggressive than desktop (which does +-1) to save mobile GPU.
 */
export function ThesisSectionMobile() {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // State machine: 'idle' | 'locked' | 'exiting'
  const stateRef = useRef<'idle' | 'locked' | 'exiting'>('idle');
  const savedScrollY = useRef(0);
  const touchStartY = useRef(0);
  const exitCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.activeIndex);
  }, []);

  // ── Safari fallback: block touchmove on body while locked ──
  const bodyTouchHandler = useCallback((e: TouchEvent) => {
    // Only block if the touch target is outside the Swiper container
    const section = sectionRef.current;
    if (section && !section.contains(e.target as Node)) {
      e.preventDefault();
    }
  }, []);

  // ── Lock: freeze page scroll at current position ──
  const lockScroll = useCallback(() => {
    if (stateRef.current === 'locked') return;
    stateRef.current = 'locked';

    // Smooth scroll thesis to viewport top, then lock after scroll completes
    const section = sectionRef.current;
    if (section) {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      savedScrollY.current = sectionTop;
      section.scrollIntoView({ behavior: 'smooth' });

      // Wait for smooth scroll to finish before applying position:fixed lock
      // (applying fixed mid-scroll would interrupt the animation)
      const checkScrollDone = () => {
        const currentY = window.scrollY;
        const diff = Math.abs(currentY - sectionTop);
        if (diff < 2) {
          // Scroll arrived — apply lock
          document.body.style.overflow = 'hidden';
          document.body.style.position = 'fixed';
          document.body.style.top = `-${sectionTop}px`;
          document.body.style.left = '0';
          document.body.style.right = '0';
          document.addEventListener('touchmove', bodyTouchHandler, { passive: false });
        } else {
          requestAnimationFrame(checkScrollDone);
        }
      };
      requestAnimationFrame(checkScrollDone);
    }
  }, [bodyTouchHandler]);

  // ── Unlock: restore page scroll ──
  const unlockScroll = useCallback(() => {
    if (stateRef.current !== 'locked') return;
    stateRef.current = 'exiting';

    // Remove lock
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.removeEventListener('touchmove', bodyTouchHandler);

    // Restore scroll position
    window.scrollTo(0, savedScrollY.current);

    // Cooldown: prevent re-lock from stale IO callbacks
    if (exitCooldownTimer.current) clearTimeout(exitCooldownTimer.current);
    exitCooldownTimer.current = setTimeout(() => {
      stateRef.current = 'idle';
    }, 800);
  }, [bodyTouchHandler]);

  // ── Sentinel observer: detect when thesis top reaches viewport top ──
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    // Observe sentinel. When it's NOT intersecting (scrolled above viewport),
    // thesis top is at or past viewport top → lock.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Sentinel just left viewport (scrolling down) → lock
        if (!entry.isIntersecting && stateRef.current === 'idle') {
          lockScroll();
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      if (exitCooldownTimer.current) clearTimeout(exitCooldownTimer.current);
    };
  }, [lockScroll]);

  // ── Edge exit: touch delta detection at first/last slide ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const EDGE_THRESHOLD = 50;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (stateRef.current !== 'locked') return;

      const swiper = swiperRef.current;
      if (!swiper) return;

      const deltaY = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current);

      // DOWN past last slide → smooth exit to ThesisGraph
      if (swiper.activeIndex === TOTAL - 1 && deltaY > EDGE_THRESHOLD) {
        unlockScroll();
        requestAnimationFrame(() => {
          document.getElementById('thesis-graph')?.scrollIntoView({ behavior: 'smooth' });
        });
      }

      // UP past first slide → smooth exit to Hero
      if (swiper.activeIndex === 0 && deltaY < -EDGE_THRESHOLD) {
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.removeEventListener('touchmove', bodyTouchHandler);
      if (exitCooldownTimer.current) clearTimeout(exitCooldownTimer.current);
    };
  }, [bodyTouchHandler]);

  return (
    <>
      {/* Top sentinel — 0px element that triggers lock when it leaves viewport */}
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
            // Aggressive: only active slide mounts WebGL canvas
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
