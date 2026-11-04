/**
 * Theme and intro bootstrap, inlined at the top of <head> so the parser runs
 * it before the first paint. It has to block rendering:
 *
 * - The first frame already carries the visitor's theme, so a dark visitor
 *   never sees a light frame. iOS Safari 26 also tints the status bar from
 *   the page ground at first paint and, under a fixed header (the glass one
 *   on Home and About), keeps that tint for the life of the page: a light
 *   first frame left a light strip above the dark page.
 * - On Home, the intro lock and the content clip (globals.css) apply before
 *   anything can paint or scroll.
 *
 * next/script's `beforeInteractive` does not block in the App Router: it is
 * queued for the Next runtime, which runs once the async chunks load, after
 * the browser may already have painted. The CSP keeps 'unsafe-inline' in
 * script-src for the App Router's own inline scripts, which covers this one.
 */
export const THEME_INIT_SCRIPT = `try {
  var stored = localStorage.getItem('theme');
  var theme;
  if (stored === 'dark' || stored === 'light') {
    theme = stored;
  } else {
    theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
  }
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) {}

if (history.scrollRestoration) history.scrollRestoration = 'manual';

if (window.location.pathname === '/') {
  document.documentElement.classList.add('intro-lock');
  var shouldIntro = true;

  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shouldIntro = false;
    }
    if (sessionStorage.getItem('introSeen') === '1') {
      shouldIntro = false;
    }
  } catch (e) {}

  if (shouldIntro) {
    document.documentElement.dataset.introActive = 'true';
  } else {
    document.documentElement.dataset.introSkip = 'true';
  }
}

window.addEventListener('pageshow', function (e) {
  if (e.persisted) window.location.reload();
});
`;
