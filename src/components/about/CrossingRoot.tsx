'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { crossingProgress } from './crossingProgress';

/** One passive scroll listener keeps the mark, level and both counts in sync. */
export function CrossingRoot({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const end = root.querySelector<HTMLElement>('[data-crossing-end]');
    const counts = root.querySelectorAll<HTMLElement>('[data-crossing-count]');
    const fillTargets = root.querySelectorAll<HTMLElement>('.crossing-mark, .crossing-meter__fill');
    const meter = root.querySelector<HTMLElement>('.crossing-meter');
    const label = root.querySelector<HTMLElement>('[data-crossing-label-target]');
    const bands = Array.from(root.querySelectorAll<HTMLElement>('[data-crossing-band]'));
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let start = 0;
    let finish = 1;
    let strip = 0;
    let lastFill = '';
    let lastCount = '';

    const paint = () => {
      frame = 0;
      const value = motion.matches ? 100 : crossingProgress(window.scrollY, start, finish);
      const fill = value.toFixed(3);
      if (fill !== lastFill) {
        fillTargets.forEach((element) => element.style.setProperty('--crossing-fill', fill));
        const complete = String(value >= 100);
        if (root.dataset.complete !== complete) root.dataset.complete = complete;
        lastFill = fill;
      }
      const count = `${Math.round(value)}%`;
      if (count !== lastCount) {
        counts.forEach((element) => { element.textContent = count; });
        lastCount = count;
      }

      // Keep a stable section cue beside the adoption/reading progress.
      if (!meter || !label || strip === 0) return;
      let current = 0;
      bands.forEach((band, index) => {
        if (band.getBoundingClientRect().top <= strip + 24) current = index;
      });
      const name = bands[current]?.dataset.crossingLabel;
      if (name && label.textContent !== name) label.textContent = name;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const measure = () => {
      const scroll = window.scrollY;
      start = root.getBoundingClientRect().top + scroll;
      finish = (end ?? root).getBoundingClientRect().bottom + scroll - window.innerHeight + 64;
      const meterRect = meter?.getBoundingClientRect();
      strip = meterRect && meterRect.height > 0 ? meterRect.bottom : 0;
      schedule();
    };

    const resize = new ResizeObserver(measure);
    resize.observe(root);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    motion.addEventListener('change', schedule);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      motion.removeEventListener('change', schedule);
    };
  }, []);

  return <div ref={rootRef} className="crossing">{children}</div>;
}
