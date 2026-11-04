'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mounted: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  mounted: false,
  toggleTheme: () => {},
});

/**
 * iOS Safari 26 tints its status bar from the page ground, and while a fixed
 * header sits at the top it keeps the tint it took at first paint: after a
 * theme switch the bar stays the old color until a reload (iOS 26.5,
 * simulator). Taking the header out of rendering for two frames makes Safari
 * sample the ground again. Touch devices only (the status bar is a phone and
 * tablet surface): on a phone the toggle lives in the menu, which covers the
 * header, and inside the View Transition the cross-fade covers the gap.
 */
function retintBrowserChrome() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  header.style.display = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      header.style.removeProperty('display');
    });
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always initialize as 'light' on both SSR and client to avoid hydration mismatch.
  // The blocking script in <head> handles CSS variables via data-theme attribute,
  // so visual styling is correct immediately. React state syncs in useEffect below.
  const [theme, setTheme] = useState<Theme>('light');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Sync React state with the theme the blocking script already applied.
    // For first-time visitors, the script defaults to dark on mobile, light on desktop.
    try {
      const stored = localStorage.getItem('theme') as Theme | null;
      if (stored === 'dark' || stored === 'light') {
        setTheme(stored);
        document.documentElement.setAttribute('data-theme', stored);
      } else {
        // First visit: match blocking script logic
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const defaultTheme: Theme = isMobile ? 'dark' : 'light';
        setTheme(defaultTheme);
        localStorage.setItem('theme', defaultTheme);
        document.documentElement.setAttribute('data-theme', defaultTheme);
      }
    } catch {
      // localStorage may throw in private browsing
    }
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const apply = () => {
      try { localStorage.setItem('theme', next); } catch { /* private browsing */ }
      root.setAttribute('data-theme', next);
      // Commit the React side (toggle icon, theme-aware canvases) inside the
      // same frame as the attribute flip so the transition's "new" snapshot
      // is the finished state.
      flushSync(() => setTheme(next));
      retintBrowserChrome();
    };

    // Cross-fade the whole page as one surface (see ::view-transition-* in
    // globals.css). Without support, or under reduced motion, switch at once.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }
    document.startViewTransition(apply);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mounted, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
