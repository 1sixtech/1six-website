'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealWrapperProps {
  children: ReactNode;
  /** Initial Y offset in px. Default: 16 */
  y?: number;
  /** Animation duration in seconds. Default: 0.9 */
  duration?: number;
  /** Delay in seconds. Default: 0 */
  delay?: number;
  /** Additional className for the wrapper div */
  className?: string;
  /** Viewport trigger threshold. Default: 'top 85%' */
  start?: string;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Wraps any content with a scroll-triggered entrance: the content settles
 * up from a short offset while it sharpens from a slight blur, so it reads
 * as arriving rather than sliding. One-shot: it never reverses.
 *
 * Reduced motion: the content is simply visible. The media query is read
 * synchronously because `useReducedMotion()` reports `false` on the first
 * client render; trusting it alone used to hide the content first and then
 * strand it at opacity 0 once the hook flipped to `true`. The hidden state
 * is now part of the tween inside the GSAP context, so `ctx.revert()` always
 * restores the element's own styles.
 */
export function ScrollRevealWrapper({
  children,
  y = 16,
  duration = 0.9,
  delay = 0,
  className = '',
  start = 'top 85%',
}: ScrollRevealWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y, filter: 'blur(4px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration,
          delay,
          ease: 'power4.out',
          clearProps: 'filter',
          scrollTrigger: {
            trigger: el,
            start,
            once: true, // Only animate in, don't reverse
          },
        },
      );
    });

    return () => ctx.revert();
  }, [prefersReducedMotion, y, duration, delay, start]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
