import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const HASH_SCROLL_REQUEST_EVENT = '1six:hash-scroll-request';

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
