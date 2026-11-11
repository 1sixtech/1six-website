'use client';

import { useEffect } from 'react';
import { faviconHref, type ColorScheme } from '@/lib/favicon';

/** Keeps the SVG tab icon in the visitor's color scheme while the page is open. */
export function FaviconSync() {
  useEffect(() => {
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const scheme = (): ColorScheme => (dark.matches ? 'dark' : 'light');
    const loadScheme = scheme();
    const sync = () => {
      const href = link.getAttribute('href') ?? '';
      const next = faviconHref(loadScheme, scheme(), href);
      if (next !== href) link.setAttribute('href', next);
    };
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
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
