'use client';

import { useEffect } from 'react';
import { SCHEME_FAVICONS } from '@/lib/favicon';

/** Keeps the SVG tab icon in the visitor's color scheme while the page is open. */
export function FaviconSync() {
  useEffect(() => {
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    // Chrome keeps the image it drew for an icon URL and shows it again on later
    // visits without fetching, so favicon.svg can arrive drawn in the other
    // scheme. Each fixed copy is right whenever it was drawn.
    const sync = () => {
      const next = SCHEME_FAVICONS[dark.matches ? 'dark' : 'light'];
      if (link.getAttribute('href') !== next) link.setAttribute('href', next);
    };
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    sync();
    dark.addEventListener('change', sync);
    document.addEventListener('visibilitychange', onVisibility);
    // A page that renders no frame (a background tab, a window under System
    // Settings) misses the change event, while `matches` stays current.
    const timer = window.setInterval(sync, 1000);
    return () => {
      dark.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
