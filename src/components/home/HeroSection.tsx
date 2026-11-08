'use client';

import { useCallback, useEffect, useRef, useState, useLayoutEffect, useSyncExternalStore } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isIntroDone, subscribeIntroDone, setRouteVisualReady } from '@/lib/introState';
import { AsciiHero } from '@/components/ascii/AsciiHero';

/**
 * Hero Section — Full viewport with ASCII mosaic background + centered text
 *
 * Text: "we haven't crossed the 16% yet."
 * Each character of "16%" reveals with staggered timing:
 *   "1" at 0.3s, "6" at 0.6s, "%" at 1.0s
 * Each character scrambles through random ASCII before settling.
 */

const CHARS = ['1', '6', '%'];
const DELAYS = [300, 600, 1000]; // ms
const SCRAMBLE_DURATION = 800; // ms per character scramble
const SCRAMBLE_INTERVAL = 50; // ms between random character swaps
const CHAR_RANGE = [33, 126]; // printable ASCII

function randomChar() {
  return String.fromCharCode(
    CHAR_RANGE[0] + Math.floor(Math.random() * (CHAR_RANGE[1] - CHAR_RANGE[0]))
  );
}

function StaggeredScramble({ start, onComplete }: { start: boolean; onComplete: () => void }) {
  const [displayed, setDisplayed] = useState(['', '', '']);
  const [visible, setVisible] = useState([false, false, false]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settledRef = useRef(0);

  const startScramble = useCallback((index: number) => {
    // Make character visible
    setVisible((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });

    // Start scrambling random characters
    const scrambleInterval = setInterval(() => {
      setDisplayed((prev) => {
        const next = [...prev];
        next[index] = randomChar();
        return next;
      });
    }, SCRAMBLE_INTERVAL);
    intervalsRef.current[index] = scrambleInterval;

    // After SCRAMBLE_DURATION, settle on the real character
    const settleTimeout = setTimeout(() => {
      clearInterval(scrambleInterval);
      setDisplayed((prev) => {
        const next = [...prev];
        next[index] = CHARS[index];
        return next;
      });
      settledRef.current += 1;
      if (settledRef.current === CHARS.length) {
        onComplete?.();
      }
    }, SCRAMBLE_DURATION);
    timeoutsRef.current.push(settleTimeout);
  }, [onComplete]);

  useEffect(() => {
    if (!start) return;
    // Capture the ref arrays at effect-setup time so the cleanup closure
    // does not read `.current` at teardown (which React flags as unsafe
    // because a ref can be reassigned mid-lifecycle). The arrays themselves
    // are shared by identity with `timeoutsRef.current` / `intervalsRef.current`,
    // so `.push` calls made later by `startScramble` are still captured here.
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;

    // The text entrance starts when the site logo has finished.
    settledRef.current = 0;
    DELAYS.forEach((delay, i) => {
      timeouts.push(setTimeout(() => startScramble(i), delay));
    });

    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [start, startScramble]);

  return (
    <span className="inline text-[var(--color-accent)]">
      {displayed.map((char, i) => (
        <span
          key={i}
          style={{
            opacity: visible[i] ? 1 : 0,
            transition: 'opacity 0.05s',
            display: 'inline',
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

/** Remove the intro-lock class from <html>, re-enabling scroll & interaction */
function unlockPage() {
  document.documentElement.classList.remove('thesis-entry-lock');
}

/** Block keyboard-based scrolling while intro-lock is active */
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', ' ', 'PageUp', 'PageDown', 'Home', 'End',
  'Tab',
]);

function blockScrollKeys(e: KeyboardEvent) {
  if (document.documentElement.classList.contains('thesis-entry-lock') && SCROLL_KEYS.has(e.key)) {
    e.preventDefault();
  }
}

export function HeroSection() {
  const [bgReady, setBgReady] = useState(false);
  const mountedRef = useRef(false);
  const introDone = useSyncExternalStore(subscribeIntroDone, isIntroDone, () => false);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    mountedRef.current = true;
    setRouteVisualReady('/thesis', false);
    return () => {
      mountedRef.current = false;
      setRouteVisualReady('/thesis', false);
    };
  }, []);

  const handleReady = useCallback(() => {
    if (!mountedRef.current) return;
    setBgReady(true);
    setRouteVisualReady('/thesis', true);
  }, []);

  // This lock belongs only to the text entrance; it cannot release the
  // site logo or the mobile slide capture. Start its safety timer with the text.
  useEffect(() => {
    if (!introDone) return;
    if (reducedMotion) {
      unlockPage();
      return;
    }
    const fallback = setTimeout(unlockPage, 2500);
    window.addEventListener('keydown', blockScrollKeys, { passive: false });
    return () => {
      clearTimeout(fallback);
      window.removeEventListener('keydown', blockScrollKeys);
    };
  }, [introDone, reducedMotion]);

  return (
    <section
      className="relative flex h-svh w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/* ASCII mosaic background — fades in once loaded */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{ opacity: bgReady ? 0.6 : 0 }}
      >
        <AsciiHero onReady={handleReady} />
      </div>

      {/* Center text overlay */}
      <h1
        className="relative z-10 max-w-[249px] md:max-w-none text-center text-[26px] md:text-[36px] font-normal leading-[1.25] tracking-[-0.52px] md:tracking-[-0.72px]"
        style={{ color: 'var(--color-text)' }}
      >
        we haven&apos;t crossed the {reducedMotion ? (
          <span className="text-[var(--color-accent)]">16%</span>
        ) : <StaggeredScramble start={introDone} onComplete={unlockPage} />} yet.
      </h1>
    </section>
  );
}
