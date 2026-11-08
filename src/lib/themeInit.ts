/**
 * Theme and intro bootstrap, inlined at the top of <head> so the parser runs
 * it before the first paint. It has to block rendering:
 *
 * - The first frame already carries the visitor's theme, so a dark visitor
 *   never sees a light frame. iOS Safari 26 also tints the status bar from
 *   the page ground at first paint and, under a fixed header (the glass one
 *   on Home and About), keeps that tint for the life of the page: a light
 *   first frame left a light strip above the dark page.
 * - The first site entry carries the logo mask before paint on About or Thesis; text-only entry stays immediate.
 *   Thesis's text scramble has a separate lock that cannot release the logo.
 *
 * next/script's `beforeInteractive` does not block in the App Router: it is
 * queued for the Next runtime, which runs once the async chunks load, after
 * the browser may already have painted. The CSP keeps 'unsafe-inline' in
 * script-src for the App Router's own inline scripts, which covers this one.
 *
 * Storage access can throw (site data blocked, storage disabled), so only the
 * storage calls sit in a try: the device default and the attribute still
 * apply without it.
 */
export const THEME_INIT_SCRIPT = `var theme;
try {
  var stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') theme = stored;
} catch (e) {}
if (!theme) {
  try {
    theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
  } catch (e) {
    theme = 'light';
  }
  try {
    localStorage.setItem('theme', theme);
  } catch (e) {}
}
document.documentElement.setAttribute('data-theme', theme);

if (history.scrollRestoration) history.scrollRestoration = 'manual';

var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var path = window.location.pathname;
var hash = window.location.hash;
var textAnchor = path === '/' && ['#products', '#origins', '#investors', '#contact'].indexOf(hash) !== -1;
var thesisAnchor = path === '/thesis' && (hash === '#thesis' || hash === '#products');
var shouldIntro = !reduced && !textAnchor && (path === '/' || path === '/thesis');
try {
  if (sessionStorage.getItem('siteIntroSeen') === '1') shouldIntro = false;
} catch (e) {}
if (shouldIntro) {
  document.documentElement.classList.add('intro-lock');
  document.documentElement.dataset.introActive = 'true';
} else {
  document.documentElement.dataset.introSkip = 'true';
}
if (path === '/thesis' && !thesisAnchor && !reduced) {
  document.documentElement.classList.add('thesis-entry-lock');
}

// This watchdog does not depend on the Next.js chunks arriving or hydrating.
setTimeout(function () {
  var root = document.documentElement;
  if (root.dataset.entryHydrated === 'true') return;
  root.classList.remove('intro-lock', 'thesis-entry-lock');
  delete root.dataset.introActive;
  root.dataset.introSkip = 'true';
  root.dataset.introExpired = 'true';
}, 8000);

window.addEventListener('pageshow', function (e) {
  if (e.persisted) window.location.reload();
});
`;
