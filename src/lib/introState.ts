/** Readiness belongs to the current About mark, not a previous route visit. */
let ready = false;

export function isAboutMarkReady(): boolean {
  return ready;
}

export function markAboutMarkReady(): void {
  if (ready) return;
  ready = true;
  window.dispatchEvent(new CustomEvent('about-mark:ready'));
}

export function resetAboutMarkReady(): void {
  ready = false;
}

declare global {
  interface WindowEventMap {
    'about-mark:ready': CustomEvent;
  }
}
