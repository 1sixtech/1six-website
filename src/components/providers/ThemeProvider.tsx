'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
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
 * The theme lives on <html data-theme>: the blocking script in <head>
 * (lib/themeInit.ts) sets it from storage, or dark on a phone and light on
 * a desktop, before the first paint. React reads it as an external store
 * rather than copying it into state in an effect. The server and the
 * hydration render see 'light' (no mismatch); the client then re-renders
 * with the attribute's value, exactly when the old mount effect did.
 */
const themeListeners = new Set<() => void>();

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function readServerTheme(): Theme {
  return 'light';
}

/** False on the server and through hydration, true from the first client render after it. */
const subscribeToNothing = () => () => {};
const readMounted = () => true;
const readServerMounted = () => false;

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
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, readServerTheme);
  const mounted = useSyncExternalStore(subscribeToNothing, readMounted, readServerMounted);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const apply = () => {
      try { localStorage.setItem('theme', next); } catch { /* private browsing */ }
      root.setAttribute('data-theme', next);
      // Commit the React side (toggle icon, theme-aware canvases) inside the
      // same frame as the attribute flip so the transition's "new" snapshot
      // is the finished state.
      flushSync(() => {
        themeListeners.forEach((listener) => listener());
      });
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

  const value = useMemo(() => ({ theme, mounted, toggleTheme }), [theme, mounted, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
