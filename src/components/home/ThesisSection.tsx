'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Observer } from 'gsap/Observer';
import { useGSAP } from '@gsap/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { AsciiThesis } from '@/components/ascii/AsciiThesis';

gsap.registerPlugin(ScrollTrigger, Observer, useGSAP);

// Prevent ScrollTrigger auto-refresh on mobile address bar height changes.
// Only refresh when viewport WIDTH changes (real resize / orientation change).
// Width-only gating replaces the global ignoreMobileResize which would break
// all other ScrollTrigger instances (ScrollRevealWrapper, RollingNumber).
if (typeof window !== 'undefined') {
  let _lastW = 0;
  ScrollTrigger.config({
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
  });
  const onResize = () => {
    const w = window.innerWidth;
    if (_lastW && w !== _lastW) ScrollTrigger.refresh();
    _lastW = w;
  };
  window.addEventListener('resize', onResize);
  if (document.readyState === 'complete') {
    _lastW = window.innerWidth;
  } else {
    window.addEventListener('load', () => { _lastW = window.innerWidth; }, { once: true });
  }
}

interface ThesisState {
  id: string;
  /** Desktop layout: inline ASCII within text flow */
  desktopContent: React.ReactNode;
  /** Mobile layout: ASCII as separate block, two-tier text sizing */
  mobileContent: React.ReactNode;
}

/* ─── Desktop: Inline ASCII (same as before) ─── */
function InlineAscii({ n, extend }: {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  extend: 'up' | 'down';
}) {
  return (
    <span
      className="relative inline-block w-[110px] align-middle mx-2"
      style={{ height: '1em' }}
    >
      <span
        className="absolute inset-x-0 h-[110px] overflow-hidden"
        style={extend === 'up' ? { bottom: 0 } : { top: 0 }}
      >
        <AsciiThesis stateNumber={n} />
      </span>
    </span>
  );
}

/* ─── Mobile: Block-level ASCII art ─── */
function MobileAscii({ n, align = 'center' }: {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right';
}) {
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div className={`flex ${justifyClass} w-full`}>
      <div className="relative w-[76px] h-[76px] overflow-hidden">
        <AsciiThesis stateNumber={n} />
      </div>
    </div>
  );
}

/* ─── Shared sub-text style for mobile ─── */
const subTextClass = "text-[var(--color-sub-text1)] text-[18px] leading-[1.25] tracking-[-0.36px]";

const THESIS_STATES: ThesisState[] = [
  {
    id: 'thesis-01',
    desktopContent: (
      <>
        <span>the internet was built on </span>
        <InlineAscii n={1} extend="up" />
        <span> an </span>
        <span className="text-[var(--color-accent)]">ideal</span>
        <span className="text-[var(--color-accent)]">:</span>
        <br />
        <span>a free and open space for information, ideas, and value.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={1} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          the internet was built on an <span className="text-[var(--color-accent)]">ideal:</span>
        </p>
        <p className={subTextClass}>
          a free and open space for<br />information, ideas, and value.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-02',
    desktopContent: (
      <>
        <span>but that vision remains </span>
        <InlineAscii n={2} extend="up" />
        <span> </span>
        <span className="text-[var(--color-accent)]">unfinished.</span>
        <br />
        <span>ownership is centralized. incentives are misaligned.</span>
        <br />
        <span>value is trapped in closed loops.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={2} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          but that vision remains <span className="text-[var(--color-accent)]">unfinished.</span>
        </p>
        <p className={subTextClass}>
          ownership is centralized.<br />incentives are misaligned.<br />value is trapped in closed loops.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-03',
    desktopContent: (
      <>
        <span>blockchains are </span>
        <InlineAscii n={3} extend="up" />
        <span> the </span>
        <span className="text-[var(--color-accent)]">missing piece.</span>
        <br />
        <span>the bridge to reclaim the internet&apos;s original promise.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={3} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          blockchains are the <span className="text-[var(--color-accent)]">missing piece.</span>
        </p>
        <p className={subTextClass}>
          the bridge to reclaim the internet&apos;s<br />original promise.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-04',
    desktopContent: (
      <>
        <span>yet the technology is still early,</span>
        <br />
        <span>not even past the first </span>
        <InlineAscii n={4} extend="down" />
        <span> </span>
        <span className="text-[var(--color-accent)]">16%</span>
        <span> of adoption.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <p className={subTextClass}>
          yet the technology is still early,<br />not even past the first
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          <span className="text-[var(--color-accent)]">16%</span> of adoption.
        </p>
        <MobileAscii n={4} align="left" />
      </div>
    ),
  },
  {
    id: 'thesis-05',
    desktopContent: (
      <>
        <span>we are here to </span>
        <InlineAscii n={5} extend="up" />
        <span> </span>
        <span className="text-[var(--color-accent)]">change</span>
        <span> that.</span>
        <br />
        <span>to move blockchain from experiment to infrastructure.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={5} align="center" />
        <p className={subTextClass}>
          we are here to <span className="text-[var(--color-accent)]">change</span> that.<br />to move blockchain
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          from experiment to infrastructure.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-06',
    desktopContent: (
      <>
        <span>from possibility to default.</span>
        <br />
        <span>from the edges to </span>
        <InlineAscii n={6} extend="down" />
        <span> </span>
        the <span className="text-[var(--color-accent)]">center</span> of the world.
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <p className={subTextClass}>
          from possibility to default.<br />from the edges to
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px] text-[var(--color-text)]">
          the <span className="text-[var(--color-accent)]">center</span> of the world.
        </p>
        <MobileAscii n={6} align="center" />
      </div>
    ),
  },
  {
    id: 'thesis-07',
    desktopContent: (
      <>
        <span>this is why we are </span>
        <span className="text-[var(--color-accent)]">1six.</span>
      </>
    ),
    mobileContent: (
      <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
        this is why we are <span className="text-[var(--color-accent)]">1six.</span>
      </p>
    ),
  },
];

const TOTAL = THESIS_STATES.length;

export function ThesisSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Refs for Observer logic (no re-renders needed)
  const indexRef = useRef(0);
  const animatingRef = useRef(false);
  const observerRef = useRef<Observer | null>(null);
  const stRef = useRef<ScrollTrigger | null>(null);

  const setContentRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      contentRefs.current[index] = el;
    },
    []
  );

  // Core transition: discrete page-by-page with crossfade
  const gotoPage = useCallback((direction: 1 | -1) => {
    // Gate ALL transitions (including boundary exit) while animating.
    // Without this, momentum scroll during a page 5→6 transition would
    // fire the exit code (toIndex=7) before the animation completes,
    // and the animation's onComplete would then scrollTo(st.end),
    // pulling the user back into the section.
    if (animatingRef.current) return;

    const idx = indexRef.current;
    const toIndex = idx + direction;

    // Boundary: exit thesis section
    if (toIndex < 0 || toIndex >= TOTAL) {
      animatingRef.current = true;

      // Disable Observer so it stops intercepting input and calling preventDefault.
      // This frees native scroll for the exit scrollTo.
      observerRef.current?.disable();

      // Defer scrollTo to next frame so Observer disable fully takes effect.
      // Use +50px offset (not +2) to survive sub-pixel rounding, pin-spacer
      // unpin reflow, and ensure ScrollTrigger's onLeave/onLeaveBack fires.
      requestAnimationFrame(() => {
        if (stRef.current) {
          const st = stRef.current;
          if (toIndex >= TOTAL) {
            window.scrollTo({ top: Math.ceil(st.end) + 50, behavior: 'auto' });
          } else {
            window.scrollTo({ top: Math.floor(st.start) - 50, behavior: 'auto' });
          }
        }
      });

      // Safety net: if ScrollTrigger's onLeave/onLeaveBack didn't fire,
      // recover from the broken state instead of leaving the user trapped.
      setTimeout(() => {
        animatingRef.current = false;
        // If still inside pin range with Observer disabled → re-enable
        const st = stRef.current;
        if (st && !observerRef.current?.isEnabled) {
          const scrollY = window.scrollY;
          if (scrollY >= st.start && scrollY <= st.end) {
            // Exit scrollTo failed — restore Observer so user isn't stuck
            const progress = (scrollY - st.start) / (st.end - st.start);
            const nearestPage = Math.round(progress * (TOTAL - 1));
            showPage(Math.min(Math.max(nearestPage, 0), TOTAL - 1));
            observerRef.current?.enable();
          }
        }
      }, 600);

      return;
    }

    animatingRef.current = true;
    // Observer stays ENABLED during animation so that preventDefault
    // continues to block native scroll on mobile touch devices.
    // animatingRef guards the callbacks from firing during animation.

    const fromEl = contentRefs.current[idx];
    const toEl = contentRefs.current[toIndex];
    if (!fromEl || !toEl) {
      animatingRef.current = false;
      return;
    }

    indexRef.current = toIndex;
    setCurrentIndex(toIndex);

    const tl = gsap.timeline({
      onComplete: () => {
        // Flush residual momentum by disabling then re-enabling Observer.
        // disable() resets GSAP's internal delta accumulator, so lingering
        // trackpad/touch inertia events restart from zero and must exceed
        // tolerance again before triggering another page transition.
        // This is more reliable than a timer-only cooldown because momentum
        // duration varies wildly across devices (150ms–1.5s+).
        const obs = observerRef.current;
        obs?.disable();

        const atBoundary = toIndex === 0 || toIndex === TOTAL - 1;
        setTimeout(() => {
          animatingRef.current = false;
          obs?.enable();
        }, atBoundary ? 600 : 350);
      },
    });

    // Fade out current
    tl.to(fromEl, {
      autoAlpha: 0,
      yPercent: direction * -8,
      duration: 0.4,
      ease: 'power2.in',
    });

    // Fade in next (crossfade with slight overlap)
    tl.fromTo(
      toEl,
      { autoAlpha: 0, yPercent: direction * 8 },
      { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: 'power2.out' },
      '<0.05'
    );
  }, []);

  // Jump to specific page (for dot clicks)
  const jumpToPage = useCallback((targetIndex: number) => {
    const idx = indexRef.current;
    if (targetIndex === idx || animatingRef.current) return;
    if (targetIndex < 0 || targetIndex >= TOTAL) return;

    animatingRef.current = true;

    const fromEl = contentRefs.current[idx];
    const toEl = contentRefs.current[targetIndex];
    if (!fromEl || !toEl) {
      animatingRef.current = false;
      return;
    }

    const direction = targetIndex > idx ? 1 : -1;
    indexRef.current = targetIndex;
    setCurrentIndex(targetIndex);

    const tl = gsap.timeline({
      onComplete: () => {
        animatingRef.current = false;
        if (stRef.current) {
          const progress = targetIndex / (TOTAL - 1);
          const scrollTarget = stRef.current.start + (stRef.current.end - stRef.current.start) * progress;
          window.scrollTo({ top: scrollTarget, behavior: 'auto' });
        }
      },
    });

    tl.to(fromEl, {
      autoAlpha: 0,
      yPercent: direction * -8,
      duration: 0.4,
      ease: 'power2.in',
    });

    tl.fromTo(
      toEl,
      { autoAlpha: 0, yPercent: direction * 8 },
      { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: 'power2.out' },
      '<0.05'
    );
  }, []);

  // Set up a specific page as visible (for entering from a direction)
  const showPage = useCallback((index: number) => {
    contentRefs.current.forEach((el, i) => {
      if (el) {
        gsap.set(el, { autoAlpha: i === index ? 1 : 0, yPercent: 0 });
      }
    });
    indexRef.current = index;
    setCurrentIndex(index);
  }, []);

  useGSAP(() => {
    if (prefersReducedMotion) return;

    const section = sectionRef.current;
    if (!section) return;

    // Initialize: first page visible
    showPage(0);

    // Pin the section for the full scroll range.
    // anticipatePin monitors scroll velocity and applies the pin slightly
    // before the trigger, preventing the 1-frame flash of unpinned content
    // caused by the browser's render thread painting before JS pins.
    const st = ScrollTrigger.create({
      trigger: section,
      pin: true,
      anticipatePin: 1,
      start: 'top top',
      end: '+=' + ((TOTAL - 1) * 100) + '%',
      onEnter: () => {
        animatingRef.current = false;
        showPage(0);
        observerRef.current?.enable();
      },
      onEnterBack: () => {
        animatingRef.current = false;
        showPage(TOTAL - 1);
        observerRef.current?.enable();
      },
      onLeave: () => {
        observerRef.current?.disable();
        animatingRef.current = false;
      },
      onLeaveBack: () => {
        observerRef.current?.disable();
        animatingRef.current = false;
      },
    });
    stRef.current = st;

    // ── Single Observer ──
    // Replaces the previous Two-Observer pattern (preventScroll + intentObserver)
    // which caused a critical bug: the viewport-level preventScroll consumed
    // wheel events before the section-level intentObserver could process them,
    // freezing page advancement on desktop.
    //
    // A single Observer handles BOTH scroll prevention (preventDefault: true
    // blocks native scroll while pinned) AND page-intent detection.
    // No target → viewport-level, catches all events regardless of cursor
    // position (header, section, etc.) while the full-screen pin is active.
    //
    // wheelSpeed:-1 inverts ONLY wheel deltas. Combined with swapped
    // callbacks this normalises both input methods:
    //   Desktop wheel: inverted by wheelSpeed × swapped cb = no net change
    //   iOS touch:     only swapped cb = fixes the inverted direction
    const observer = Observer.create({
      type: 'wheel,touch',
      tolerance: 10,
      preventDefault: true,
      lockAxis: true,
      wheelSpeed: -1,
      onUp: () => gotoPage(1),
      onDown: () => gotoPage(-1),
    });
    observerRef.current = observer;
    observer.disable();

    return () => {
      observer.disable();
      st.kill(true);
    };
  }, { scope: sectionRef, dependencies: [prefersReducedMotion, gotoPage, showPage] });

  // Keyboard navigation
  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!observerRef.current?.isEnabled) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          gotoPage(1);
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          gotoPage(-1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prefersReducedMotion, gotoPage]);

  if (prefersReducedMotion) {
    return (
      <section id="thesis">
        {THESIS_STATES.map((state) => (
          <div
            key={state.id}
            className="flex min-h-[60vh] w-full items-center justify-center px-6"
            style={{ backgroundColor: 'var(--color-card)' }}
          >
            <div className="max-w-[1034px] text-center">
              {isMobile ? (
                <div className="text-center">
                  {state.mobileContent}
                </div>
              ) : (
                <div className="text-[36px] font-normal leading-[1.25] tracking-[-0.72px]"
                  style={{ color: 'var(--color-text)' }}>
                  {state.desktopContent}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="thesis"
      className="relative h-dvh w-full overflow-hidden z-10"
      style={{ backgroundColor: 'var(--color-card)' }}
      aria-live="polite"
    >
      {/* Page indicator dots */}
      <div className="absolute right-8 top-1/2 z-10 hidden md:flex -translate-y-1/2 flex-col gap-2">
        {THESIS_STATES.map((_, i) => (
          <button
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all duration-300 cursor-pointer"
            style={{
              backgroundColor: i === currentIndex ? 'var(--color-accent)' : 'var(--color-sub-text2)',
              opacity: i === currentIndex ? 1 : 0.3,
              transform: i === currentIndex ? 'scale(1.5)' : 'scale(1)',
            }}
            onClick={() => jumpToPage(i)}
            aria-label={`Go to section ${i + 1} of ${TOTAL}`}
          />
        ))}
      </div>

      {/* All states stacked in center — only render ASCII art for nearby states
           to avoid exhausting WebGL context limits (browsers allow ~8-16 contexts) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {THESIS_STATES.map((state, index) => {
          const isNearby = Math.abs(index - currentIndex) <= 1;
          return (
            <div
              key={state.id}
              ref={setContentRef(index)}
              className="absolute max-w-[1034px] px-[22px] md:px-6"
              style={index !== 0 ? { visibility: 'hidden', opacity: 0 } : undefined}
            >
              {isNearby && (
                isMobile ? (
                  <div className="text-center">
                    {state.mobileContent}
                  </div>
                ) : (
                  <div className="text-center text-[36px] font-normal leading-[1.25] tracking-[-0.72px]"
                    style={{ color: 'var(--color-text)' }}>
                    {state.desktopContent}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
