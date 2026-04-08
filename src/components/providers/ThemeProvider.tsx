'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('theme', next); } catch { /* private browsing */ }
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
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
