'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CROSSING_LEVELS } from './aboutData';

/**
 * A one-pixel reading line at 45% of the viewport. The band that crosses it
 * is the band being read; bands are contiguous, so one is always on it.
 */
const READING_LINE = '-45% 0px -54% 0px';

/**
 * Drives the crossing fill from native scroll position. No scroll capture:
 * two IntersectionObservers write a step index and a fill level onto the
 * root, and CSS animates everything that reads them (the mark's ink mask,
 * its level line, and the mobile meter).
 *
 * - Band observer: the band on the reading line sets the step.
 * - End observer: once the end of the last band is on screen, the crossing
 *   is complete even if a tall viewport never brings it to the line.
 *
 * Reduced motion is handled in CSS, which pins the fill at 100%.
 */
export function CrossingRoot({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const bands = Array.from(root.querySelectorAll<HTMLElement>('[data-crossing-band]'));
    const end = root.querySelector<HTMLElement>('[data-crossing-end]');
    const lastStep = CROSSING_LEVELS.length - 1;
    const onLine = new Set<number>();
    let atEnd = false;
    let current = 0;

    const apply = () => {
      const lineStep = onLine.size > 0 ? Math.max(...onLine) : current;
      const step = Math.min(lastStep, atEnd ? lastStep : lineStep);
      if (step === current && root.dataset.step !== undefined) return;
      current = step;
      root.dataset.step = String(step);
      root.style.setProperty('--crossing-fill', String(CROSSING_LEVELS[step]));
    };

    const bandObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.crossingBand);
          if (Number.isNaN(index)) continue;
          if (entry.isIntersecting) onLine.add(index);
          else onLine.delete(index);
        }
        apply();
      },
      { rootMargin: READING_LINE, threshold: 0 },
    );
    bands.forEach((band) => bandObserver.observe(band));

    const endObserver = end
      ? new IntersectionObserver(
          ([entry]) => {
            atEnd = entry.isIntersecting;
            apply();
          },
          { threshold: 0 },
        )
      : null;
    if (end && endObserver) endObserver.observe(end);

    return () => {
      bandObserver.disconnect();
      endObserver?.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className="crossing">
      {children}
    </div>
  );
}
