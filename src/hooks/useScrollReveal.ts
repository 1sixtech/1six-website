'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Returns true after the user's first scroll event that moves the page. The
 * route's own reset to the top also fires a scroll event, when the visitor
 * arrives from further down another page, and that must not count.
 * Used for the header slide-down reveal.
 * Removes the listener after first trigger (one-shot).
 *
 * Resets on route change so the header visibility lifecycle restarts
 * when navigating between pages. Without the reset, navigating from
 * About back to Thesis leaves hasScrolled=true (Header never unmounts),
 * which prevents the GSAP reveal effect from re-running and leaves
 * the header stuck at translateY(-100%).
 *
 * Uses both a native scroll listener AND a requestAnimationFrame
 * fallback that checks window.scrollY. The fallback is needed because
 * GSAP's normalizeScroll (active on touch devices) cancels native
 * scroll events while still updating the scroll position.
 */
export function useScrollReveal(): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();

  // Reset on route change. Outside Thesis the header is always
  // visible via the `!isThesisRoute` guard in Header.tsx.
  // Returning to Thesis re-enables the scroll
  // listener so the header slide-in animation can fire again. Done while
  // rendering (React's pattern for adjusting state when a prop changes),
  // so the new route's first render already has it reset.
  const [routePath, setRoutePath] = useState(pathname);
  if (routePath !== pathname) {
    setRoutePath(pathname);
    setIsVisible(false);
  }

  useEffect(() => {
    if (isVisible) return; // already triggered

    const reveal = () => {
      if (window.scrollY <= 0) return;
      setIsVisible(true);
      window.removeEventListener('scroll', reveal);
    };

    // Primary: native scroll event (reliable on desktop / without normalizeScroll)
    window.addEventListener('scroll', reveal, { passive: true });

    // Fallback: poll scrollY for touch devices where normalizeScroll
    // suppresses native scroll events but still updates the position.
    let rafId: number;
    const checkScroll = () => {
      if (window.scrollY > 0) {
        reveal();
        return;
      }
      rafId = requestAnimationFrame(checkScroll);
    };
    rafId = requestAnimationFrame(checkScroll);

    return () => {
      window.removeEventListener('scroll', reveal);
      cancelAnimationFrame(rafId);
    };
  }, [isVisible]);

  return isVisible;
}
