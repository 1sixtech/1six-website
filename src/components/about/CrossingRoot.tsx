'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CROSSING_LEVELS } from './aboutData';

/**
 * A one-pixel reading line at 45% of the viewport. The band that crosses it
 * is the band being read; bands are contiguous, so one is always on it.
 */
const READING_LINE = '-45% 0px -54% 0px';

/**
 * The share of the viewport, from the top, in which a section title counts
 * as on screen for the meter label (below that it is still to come).
 */
const TITLE_ZONE = 0.6;

/** The fill's CSS transition length (about.css, `.crossing`). */
const COUNT_MS = 1200;

/** easeOutQuint, the curve --crossing-ease, cubic-bezier(0.23, 1, 0.32, 1), traces. */
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

/**
 * Drives the crossing fill from native scroll position. No scroll capture:
 * IntersectionObservers write a step index and a fill level onto the root,
 * and CSS animates everything that reads them (the mark's ink mask, its
 * level line, and the mobile meter's line). The meter's count is stepped
 * here on the same curve (see countTo), and the meter's label is shown only
 * once a section's title has gone up under the strip (see syncLabel).
 *
 * - Band observer: the band on the reading line sets the step.
 * - End observer: once the end of the last band is on screen, the crossing
 *   is complete even if a tall viewport never brings it to the line.
 * - Title observer: tracks which section titles are on screen, below the
 *   strip, and wakes syncLabel when that changes.
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lastStep = CROSSING_LEVELS.length - 1;
    const onLine = new Set<number>();
    let atEnd = false;
    let current = 0;

    // Mobile meter count. A CSS transition on the registered <integer> would
    // count on its own in Chromium, but WebKit prints the counter as 0 for
    // the whole transition, so the count steps through whole numbers here.
    // It writes to the count element itself: a frame restyles one element,
    // not the page under the root. Interrupted, it carries on from the
    // number on screen, as the fill's CSS transition does.
    const count = root.querySelector<HTMLElement>('.crossing-meter__count');
    let shown: number = CROSSING_LEVELS[0];
    let countFrame = 0;

    const countTo = (target: number) => {
      cancelAnimationFrame(countFrame);
      if (!count) return;
      const from = shown;
      // Already there, hidden (desktop has no meter), or under reduced motion
      // (the CSS pins the shown count at 100 while it holds): land without a
      // tween, so the right value is in place if the preference lifts.
      if (reduceMotion || from === target || count.getClientRects().length === 0) {
        shown = target;
        count.style.setProperty('--crossing-pct', String(target));
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / COUNT_MS);
        shown = Math.round(from + (target - from) * easeOutQuint(progress));
        count.style.setProperty('--crossing-pct', String(shown));
        if (progress < 1) countFrame = requestAnimationFrame(tick);
      };
      countFrame = requestAnimationFrame(tick);
    };

    // Mobile meter label. It names the section being read, but only once
    // that section's title has gone up under the strip. While a title is on
    // screen, the title names its section and the label stays hidden, so
    // the strip never repeats a title in view or names a section whose
    // title the reader has not reached.
    // - On screen: the title observer's own verdict (it reports every change
    //   of state, jumps included, and counts a title touching the zone's
    //   edge as inside it, which a second geometry test would disagree with).
    // - Gone up: read from the titles' positions on every wake-up, so a jump
    //   (a hash link, a tap on the status bar) cannot leave it stale.
    // Written straight to the DOM (decorative, aria-hidden): no re-renders.
    const meter = root.querySelector<HTMLElement>('.crossing-meter');
    const label = root.querySelector<HTMLElement>('[data-crossing-label-target]');
    const titles = bands.map((band) => band.querySelector<HTMLElement>('h1, h2'));
    const titlesOnScreen = new Set<number>();
    // Until the title observer has reported once, "on screen" is unknown.
    let titlesReported = false;
    // The strip's bottom edge: header plus meter (54 + 30 on a phone, 45 on
    // desktop). Read again when the layout crosses 768px (a rotation).
    const readStrip = () => {
      const rootStyle = getComputedStyle(root);
      return (
        (parseFloat(rootStyle.getPropertyValue('--crossing-header')) || 0) +
        (parseFloat(rootStyle.getPropertyValue('--crossing-meter-h')) || 0)
      );
    };
    let strip = readStrip();

    const syncLabel = () => {
      if (!meter || !label || !titlesReported) return;
      let passed = -1;
      titles.forEach((title, index) => {
        if (title && title.getBoundingClientRect().bottom <= strip) passed = index;
      });
      const hidden = titlesOnScreen.size > 0 || passed < 0;
      meter.dataset.title = hidden ? 'shown' : 'passed';
      const name = passed >= 0 ? bands[passed]?.dataset.crossingLabel : undefined;
      if (!name || label.textContent === name) return;
      label.textContent = name;
      // A name that changes in view sharpens in rather than snapping (blur
      // masks the swap); a hidden one simply fades in with the strip's CSS.
      if (!hidden && !reduceMotion && typeof label.animate === 'function') {
        label.animate(
          [
            { opacity: 0, filter: 'blur(3px)', transform: 'translateY(3px)' },
            { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
          ],
          { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        );
      }
    };

    const apply = () => {
      const lineStep = onLine.size > 0 ? Math.max(...onLine) : current;
      const step = Math.min(lastStep, atEnd ? lastStep : lineStep);
      if (step === current && root.dataset.step !== undefined) return;
      current = step;
      root.dataset.step = String(step);
      // The crossing is complete: about.css inks the mark in the accent.
      root.dataset.complete = String(step === lastStep);
      root.style.setProperty('--crossing-fill', String(CROSSING_LEVELS[step]));
      countTo(CROSSING_LEVELS[step]);
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
        syncLabel();
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

    // The zone below the strip and above TITLE_ZONE: a title on screen.
    const observeTitles = () => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const index = titles.indexOf(entry.target as HTMLElement);
            if (index < 0) continue;
            if (entry.isIntersecting) titlesOnScreen.add(index);
            else titlesOnScreen.delete(index);
          }
          titlesReported = true;
          syncLabel();
        },
        {
          rootMargin: `-${strip}px 0px -${Math.round((1 - TITLE_ZONE) * 100)}% 0px`,
          threshold: 0,
        },
      );
      titles.forEach((title) => title && observer.observe(title));
      return observer;
    };
    let titleObserver = observeTitles();

    // The strip changes height at 768px: rebuild the title zone under it.
    const layout = window.matchMedia('(min-width: 768px)');
    const onLayoutChange = () => {
      strip = readStrip();
      titleObserver.disconnect();
      titlesOnScreen.clear();
      titlesReported = false;
      titleObserver = observeTitles();
    };
    layout.addEventListener('change', onLayoutChange);

    return () => {
      bandObserver.disconnect();
      endObserver?.disconnect();
      titleObserver.disconnect();
      layout.removeEventListener('change', onLayoutChange);
      cancelAnimationFrame(countFrame);
    };
  }, []);

  return (
    <div ref={rootRef} className="crossing">
      {children}
    </div>
  );
}
