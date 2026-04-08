'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function StaggeredScramble({ onComplete }: { onComplete?: () => void }) {
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
    // Schedule each character's scramble start
    DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => startScramble(i), delay);
      timeoutsRef.current.push(t);
    });

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
    };
  }, [startScramble]);

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
  document.documentElement.classList.remove('intro-lock');
}

/** Block keyboard-based scrolling while intro-lock is active */
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', ' ', 'PageUp', 'PageDown', 'Home', 'End',
  'Tab',
]);

function blockScrollKeys(e: KeyboardEvent) {
  if (document.documentElement.classList.contains('intro-lock') && SCROLL_KEYS.has(e.key)) {
    e.preventDefault();
  }
}

export function HeroSection() {
  const [bgReady, setBgReady] = useState(false);

  // Safety fallback — always unlock after 2.5s even if scramble callback fails
  // Also block keyboard scrolling during the lock period
  useEffect(() => {
    const fallback = setTimeout(unlockPage, 2500);
    window.addEventListener('keydown', blockScrollKeys, { passive: false });
    return () => {
      clearTimeout(fallback);
      window.removeEventListener('keydown', blockScrollKeys);
    };
  }, []);

  return (
    <section
      className="relative flex h-dvh w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/* ASCII mosaic background — fades in once loaded */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{ opacity: bgReady ? 0.6 : 0 }}
      >
        <AsciiHero onReady={() => setBgReady(true)} />
      </div>

      {/* Center text overlay */}
      <h1
        className="relative z-10 max-w-[249px] md:max-w-none text-center text-[26px] md:text-[36px] font-normal leading-[1.25] tracking-[-0.52px] md:tracking-[-0.72px]"
        style={{ color: 'var(--color-text)' }}
      >
        we haven&apos;t crossed the <StaggeredScramble onComplete={unlockPage} /> yet.
      </h1>
    </section>
  );
}
