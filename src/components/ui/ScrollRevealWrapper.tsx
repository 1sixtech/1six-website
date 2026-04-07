'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealWrapperProps {
  children: ReactNode;
  /** Initial Y offset in px. Default: 40 */
  y?: number;
  /** Animation duration in seconds. Default: 0.8 */
  duration?: number;
  /** Delay in seconds. Default: 0 */
  delay?: number;
  /** Additional className for the wrapper div */
  className?: string;
  /** Viewport trigger threshold. Default: 'top 85%' */
  start?: string;
}

/**
 * Wraps any content with a scroll-triggered fade + slide-up entrance animation.
 * On scroll into view, the content fades from opacity 0 → 1 and slides up.
 * One-shot: only triggers once, not reversed on scroll back.
 * Respects prefers-reduced-motion.
 */
export function ScrollRevealWrapper({
  children,
  y = 40,
  duration = 0.8,
  delay = 0,
  className = '',
  start = 'top 85%',
}: ScrollRevealWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !ref.current) return;

    const el = ref.current;

    gsap.set(el, { opacity: 0, y });

    const ctx = gsap.context(() => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration,
        delay,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start,
          once: true, // Only animate in, don't reverse
        },
      });
    });

    return () => ctx.revert();
  }, [prefersReducedMotion, y, duration, delay, start]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
