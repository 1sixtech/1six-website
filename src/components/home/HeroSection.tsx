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
    // Capture the ref arrays at effect-setup time so the cleanup closure
    // does not read `.current` at teardown (which React flags as unsafe
    // because a ref can be reassigned mid-lifecycle). The arrays themselves
    // are shared by identity with `timeoutsRef.current` / `intervalsRef.current`,
    // so `.push` calls made later by `startScramble` are still captured here.
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;

    const scheduleAllChars = () => {
      DELAYS.forEach((delay, i) => {
        const t = setTimeout(() => startScramble(i), delay);
        timeouts.push(t);
      });
    };

    // If the intro did not run (reduced-motion or session repeat), start
    // the scramble immediately — there is no data-intro-active attribute.
    const introActive = document.documentElement.dataset.introActive === 'true';
    let revealListener: (() => void) | null = null;

    if (!introActive) {
      scheduleAllChars();
    } else {
      revealListener = () => {
        scheduleAllChars();
        if (revealListener) {
          window.removeEventListener('intro:revealed', revealListener);
          revealListener = null;
        }
      };
      window.addEventListener('intro:revealed', revealListener);
    }

    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      if (revealListener) {
        window.removeEventListener('intro:revealed', revealListener);
      }
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

  // Safety fallback — unlock intro-lock if the scramble never completes.
  //
  // Timing in the new intro-loader flow:
  //   - HeroSection mounts immediately on first paint
  //   - Intro overlay runs for 0.7–2.5s (hardcap)
  //   - intro:revealed fires → scramble scheduled with 300ms delay
  //   - Scramble runs 1.8s → onComplete → unlockPage()
  //
  // If we started a 2.5s fallback at mount (old behavior) it would fire
  // mid-reveal on slow devices. Instead we start the fallback once we
  // know scramble will actually start — either on intro:revealed in
  // normal mode, or immediately on mount in skip mode. The 2.5s budget
  // then covers only the scramble's expected ~1.8s duration with
  // comfortable headroom.
  //
  // blockScrollKeys is registered unconditionally and only fires when
  // intro-lock is still on, so it self-disables after unlock.
  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const startFallback = () => {
      if (fallback !== null) return;
      fallback = setTimeout(unlockPage, 2500);
    };

    const introActive = document.documentElement.dataset.introActive === 'true';
    let revealListener: (() => void) | null = null;

    if (!introActive) {
      // Skip mode (or reveal already fired before mount) — start now.
      startFallback();
    } else {
      revealListener = () => {
        startFallback();
        if (revealListener) {
          window.removeEventListener('intro:revealed', revealListener);
          revealListener = null;
        }
      };
      window.addEventListener('intro:revealed', revealListener);
    }

    window.addEventListener('keydown', blockScrollKeys, { passive: false });
    return () => {
      if (fallback !== null) clearTimeout(fallback);
      if (revealListener) window.removeEventListener('intro:revealed', revealListener);
      window.removeEventListener('keydown', blockScrollKeys);
    };
  }, []);

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
