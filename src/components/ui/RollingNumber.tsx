'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * A single digit column that never stops spinning — like a roulette wheel.
 * Each cycle picks a new random target and immediately begins the next spin.
 */
function RollingDigit({
  delay = 0,
  active,
  speed = 1,
}: {
  delay?: number;
  active: boolean;
  speed?: number;
}) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!stripRef.current || !active) return;

    const el = stripRef.current;

    const spinOnce = () => {
      const target = Math.floor(Math.random() * 10);
      const cycles = 2;
      const landingIndex = cycles * 10 + target;
      const pct = landingIndex * (100 / 30);

      gsap.set(el, { yPercent: 0 });

      tweenRef.current = gsap.to(el, {
        yPercent: -pct,
        duration: (1.6 + delay * 0.3) * speed,
        delay: tweenRef.current ? 0 : delay,
        ease: 'power2.inOut',
        onComplete: spinOnce,
      });
    };

    spinOnce();

    return () => {
      tweenRef.current?.kill();
    };
  }, [active, delay, speed]);

  return (
    <span className="inline-block overflow-hidden" style={{ height: '1em' }}>
      <span
        ref={stripRef}
        className="flex flex-col"
        style={{ lineHeight: 1, display: 'flex' }}
      >
        {Array.from({ length: 3 }, (_, setIdx) =>
          DIGITS.map((d) => (
            <span
              key={`${setIdx}-${d}`}
              className="block text-center"
              style={{ height: '1em' }}
            >
              {d}
            </span>
          ))
        )}
      </span>
    </span>
  );
}

interface RollingNumberProps {
  /** Number of digit columns to show */
  digitCount: number;
  /** Prefix displayed before the number, e.g. "$ " */
  prefix?: string;
  /** Suffix displayed after the number, e.g. "K" or "B" */
  suffix?: string;
  /** Additional suffix with different styling */
  extraSuffix?: string;
  /** CSS classes for the prefix */
  prefixClassName?: string;
  /** CSS classes for the extra suffix */
  extraSuffixClassName?: string;
  /** Whether to respect reduced motion */
  prefersReducedMotion?: boolean;
  /** Trigger element ref for ScrollTrigger */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Separator character and position, e.g. { char: '.', after: 0 } puts '.' after 1st digit */
  separator?: { char: string; after: number };
}

export function RollingNumber({
  digitCount,
  prefix,
  suffix,
  extraSuffix,
  prefixClassName,
  extraSuffixClassName,
  prefersReducedMotion,
  triggerRef,
  separator,
}: RollingNumberProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const trigger = triggerRef?.current;
    if (!trigger) return;

    const st = ScrollTrigger.create({
      trigger,
      start: 'top 70%',
      once: true,
      onEnter: () => setActive(true),
    });

    return () => {
      st.kill();
    };
  }, [prefersReducedMotion, triggerRef]);

  if (prefersReducedMotion) {
    return (
      <>
        {prefix && <span className={prefixClassName}>{prefix}</span>}
        <span>---{suffix}</span>
        {extraSuffix && <span className={extraSuffixClassName}>{extraSuffix}</span>}
      </>
    );
  }

  // Build digits with optional separator
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < digitCount; i++) {
    elements.push(
      <RollingDigit key={i} delay={i * 0.12} active={active} />
    );
    if (separator && separator.after === i) {
      elements.push(
        <span key={`sep-${i}`} className="inline-block">{separator.char}</span>
      );
    }
  }

  return (
    <>
      {prefix && <span className={prefixClassName}>{prefix}</span>}
      <span className="inline-flex items-baseline" style={{ lineHeight: 1 }}>
        {elements}
        {suffix && <span className="inline-block">{suffix}</span>}
      </span>
      {extraSuffix && <span className={extraSuffixClassName}>{extraSuffix}</span>}
    </>
  );
}
