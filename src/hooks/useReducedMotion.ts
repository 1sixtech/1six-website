'use client';

import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function getReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotion(): boolean {
  return false;
}

/**
 * Whether the user asks for reduced motion, kept current. Read as an external
 * store rather than copied into state in an effect: false on the server and
 * through hydration, as before, while a component that mounts after
 * hydration (the ssr:false canvases) reads the real value on its first render.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, getReducedMotion, getServerReducedMotion);
}
