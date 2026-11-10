import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const HASH_SCROLL_REQUEST_EVENT = '1six:hash-scroll-request';

/** Not a section id: tells Thesis capture the page is returning to its top. */
export const PAGE_TOP_REQUEST = 'top';

export function emitHashScrollRequest(hash: string) {
  window.dispatchEvent(new CustomEvent(HASH_SCROLL_REQUEST_EVENT, {
    detail: { hash: hash.replace('#', '') },
  }));
}

export function shouldWaitForThesisPin() {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !isMobile && !prefersReducedMotion;
}

export function isThesisPinReady() {
  const thesisEl = document.getElementById('thesis');
  return thesisEl?.parentElement?.classList.contains('pin-spacer') ?? false;
}

/**
 * A Thesis nav link pressed while already on Thesis: go to Hero, as from any
 * other page. Mobile capture lets go first, or its settling would pull the page
 * back to the slider. A section hash is dropped because a reload or Back would
 * otherwise keep starting below Hero. The replace runs even with no hash: Next
 * treats it as a restore, which cancels a navigation still pending from an
 * earlier press, and this press is the newer intent.
 */
export function scrollToPageTop() {
  emitHashScrollRequest(PAGE_TOP_REQUEST);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function scrollToHashTarget(hash: string) {
  const id = hash.replace('#', '');
  const target = document.getElementById(id);
  if (!target) return false;

  ScrollTrigger.refresh();

  requestAnimationFrame(() => {
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: 'auto' });
  });

  return true;
}
