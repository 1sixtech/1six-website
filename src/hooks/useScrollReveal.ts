'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true after the user's first scroll event.
 * Used for the header slide-down reveal.
 * Removes the listener after first trigger (one-shot).
 */
export function useScrollReveal(): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return; // already triggered

    const onScroll = () => {
      setIsVisible(true);
      window.removeEventListener('scroll', onScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isVisible]);

  return isVisible;
}
