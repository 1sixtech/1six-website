'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribes to device pixel ratio changes: a window moved to a screen of
 * another density (a 1x monitor and a Retina one side by side), or a page
 * zoom. The query matches only the current ratio, so its 'change' fires on
 * any move away from it; each change re-arms it at the new ratio.
 */
function subscribeToPixelRatio(onStoreChange: () => void): () => void {
  let query: MediaQueryList | null = null;

  function watch() {
    query?.removeEventListener('change', handleChange);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', handleChange);
  }

  function handleChange() {
    watch();
    onStoreChange();
  }

  watch();
  return () => query?.removeEventListener('change', handleChange);
}

function getPixelRatio(): number {
  return window.devicePixelRatio || 1;
}

function getServerPixelRatio(): number {
  return 1;
}

/** The device pixel ratio, kept current. 1 on the server and through hydration. */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribeToPixelRatio, getPixelRatio, getServerPixelRatio);
}
