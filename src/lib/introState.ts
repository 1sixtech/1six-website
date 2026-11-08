/** The logo's session frequency is independent of media/cache readiness. */
let seen = false;
const visualReady = new Map<string, boolean>([['/', false], ['/thesis', false], ['/thesis#thesis', false], ['/thesis#products', false]]);

export function hasSeenIntro(): boolean {
  if (seen || document.documentElement.dataset.introExpired === 'true') return true;
  try { return sessionStorage.getItem('siteIntroSeen') === '1'; } catch { return false; }
}

export function markIntroSeen(): void {
  seen = true;
  try { sessionStorage.setItem('siteIntroSeen', '1'); } catch { /* This document still remembers. */ }
}

export function isRouteVisualReady(pathname: string): boolean {
  // Writing, authors, and error pages have server-rendered text above the fold.
  return visualReady.get(pathname) ?? true;
}

export function setRouteVisualReady(pathname: string, ready: boolean): void {
  if (visualReady.get(pathname) === ready) return;
  visualReady.set(pathname, ready);
  window.dispatchEvent(new CustomEvent('entry:ready'));
}

export function subscribeIntroDone(listener: () => void): () => void {
  window.addEventListener('entry:intro-done', listener);
  return () => window.removeEventListener('entry:intro-done', listener);
}

export function isIntroDone(): boolean {
  return document.documentElement.dataset.introActive !== 'true';
}

declare global {
  interface WindowEventMap {
    'entry:ready': CustomEvent;
    'entry:intro-done': CustomEvent;
  }
}

export function needsVisualReadiness(target: string): boolean {
  return visualReady.has(target);
}
