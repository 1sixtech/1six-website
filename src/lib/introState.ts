/**
 * introState — Shared state for the homepage intro orchestration.
 *
 * Produces:
 *   - AsciiCanvas instances call markAsciiReady(key) when their WebGL
 *     pipeline is animating.
 *
 * Consumes:
 *   - IntroOrchestrator reads getReadyKeys() on mount (race-free) and
 *     listens for the 'ascii:ready' CustomEvent to trigger reveal.
 *
 * Events:
 *   - 'ascii:ready' — detail: { key: string }
 *   - 'intro:revealed' — (no detail) fired when circular reveal starts
 *   - 'intro:done' — (no detail) fired after overlay fades out
 *
 * Intro lifecycle module-level flags (revealedFlag, doneFlag) are
 * mutated by one-time window event listeners installed at import time
 * on the client. Hooks in `@/hooks/useIntroState` read these via
 * `useSyncExternalStore` for race-free subscription.
 */

export interface AsciiReadyEventDetail {
  key: string;
}

export interface AsciiTarget {
  readonly key: string;
  readonly textureUrl: string;
  /**
   * Asset type. 'video' targets go through videoPool warmup (which uses
   * a real <video> element). 'image' targets are loaded lazily by
   * Three.js TextureLoader inside AscMosaic — they do NOT need videoPool
   * and will silently fail if passed to it (webp/jpg/png can't be loaded
   * into a <video> element).
   */
  readonly assetType: 'video' | 'image';
}

/** All possible ASCII canvas keys on the homepage. */
export const HOMEPAGE_ASCII_TARGETS: readonly AsciiTarget[] = [
  { key: 'hero',         textureUrl: '/resource/Source_Desert.mp4',     assetType: 'video' },
  { key: 'thesis-1',     textureUrl: '/resource/Source_About 01.mp4',   assetType: 'video' },
  { key: 'thesis-2',     textureUrl: '/resource/Source_About 02.mp4',   assetType: 'video' },
  { key: 'thesis-3',     textureUrl: '/resource/Source_About 03.mp4',   assetType: 'video' },
  { key: 'thesis-4',     textureUrl: '/resource/Source_About 04.mp4',   assetType: 'video' },
  { key: 'thesis-5',     textureUrl: '/resource/Source_About 05.mp4',   assetType: 'video' },
  { key: 'thesis-6',     textureUrl: '/resource/Source_About 06.mp4',   assetType: 'video' },
  { key: 'graph',        textureUrl: '/resource/Source_Graph.mp4',      assetType: 'video' },
  { key: 'map',          textureUrl: '/resource/Source_World map.webp', assetType: 'image' },
  { key: 'nevada-tv',    textureUrl: '/resource/Source_Nevada TV.mp4',  assetType: 'video' },
  { key: 'nevada-trade', textureUrl: '/resource/Source_Nevada Trade.mp4', assetType: 'video' },
] as const;

// ─── AsciiCanvas ready tracking ───────────────────────────────────────

const readyKeys = new Set<string>();

/**
 * Mark a canvas key as ready. Idempotent — duplicate calls are ignored
 * and do NOT re-dispatch the event. Also dispatches a 'ascii:ready'
 * CustomEvent on the window for subscribers mounted after the fact.
 */
export function markAsciiReady(key: string): void {
  if (readyKeys.has(key)) return;
  readyKeys.add(key);
  if (typeof window !== 'undefined') {
    const event = new CustomEvent<AsciiReadyEventDetail>('ascii:ready', {
      detail: { key },
    });
    window.dispatchEvent(event);
  }
}

/**
 * Read-only snapshot of the currently-ready keys. Returns the internal
 * set directly — do not mutate. Callers should treat it as a snapshot
 * even though it will live-update.
 */
export function getReadyKeys(): ReadonlySet<string> {
  return readyKeys;
}

/**
 * Compute which ASCII keys the orchestrator should wait for before
 * triggering the circular reveal. Phase 2's isNearby gate means not all
 * HOMEPAGE_ASCII_TARGETS are mounted on initial render.
 *
 * Mobile (≤ 767px): thesis-1 + thesis-2 (Swiper active + isNearby next)
 * Desktop:           thesis-1 (isNearby from index 0 on the stacked layout)
 *
 * All non-thesis keys (hero, graph, map, nevada-tv, nevada-trade) are
 * always mounted on the homepage.
 */
export function computeExpectedReadyKeys(): string[] {
  const isMobile = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 767px)').matches;
  const thesisKeys = isMobile
    ? ['thesis-1', 'thesis-2']
    : ['thesis-1'];
  return ['hero', ...thesisKeys, 'graph', 'map', 'nevada-tv', 'nevada-trade'];
}

// ─── Intro lifecycle tracking (for useSyncExternalStore hooks) ────────

let revealedFlag = false;
let doneFlag = false;
const revealedListeners = new Set<() => void>();
const doneListeners = new Set<() => void>();

function notify(listeners: Set<() => void>): void {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  // One-time module-load listeners — set the flag and notify any
  // subscribers. `{ once: true }` removes them after first fire.
  window.addEventListener(
    'intro:revealed',
    () => {
      revealedFlag = true;
      notify(revealedListeners);
    },
    { once: true },
  );
  window.addEventListener(
    'intro:done',
    () => {
      doneFlag = true;
      notify(doneListeners);
    },
    { once: true },
  );
}

/**
 * Subscribe to revealed-state changes. Used by `useIntroRevealed`
 * via `useSyncExternalStore`. Returns an unsubscribe function.
 */
export function subscribeRevealed(listener: () => void): () => void {
  revealedListeners.add(listener);
  return () => {
    revealedListeners.delete(listener);
  };
}

/**
 * Current revealed snapshot. Returns true if either (a) the
 * 'intro:revealed' event has fired in this session, or (b) the intro
 * was never active (`data-intro-active` absent on <html>), which covers
 * non-home pages and the skip case (reduced-motion or session repeat).
 */
export function getRevealedSnapshot(): boolean {
  if (revealedFlag) return true;
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.introActive !== 'true';
}

/**
 * Subscribe to done-state changes. Used by `useIntroDone` via
 * `useSyncExternalStore`. Returns an unsubscribe function.
 */
export function subscribeDone(listener: () => void): () => void {
  doneListeners.add(listener);
  return () => {
    doneListeners.delete(listener);
  };
}

/**
 * Current done snapshot. Returns true if the 'intro:done' event has
 * fired in this session. Does NOT shortcut via `data-intro-active`
 * because there is a brief window (reveal animation + overlay fade)
 * where the attribute is removed but 'intro:done' has not yet fired.
 *
 * For the skip case (non-home OR reduced-motion/session repeat), the
 * orchestrator fires 'intro:done' from a microtask after calling
 * `runReveal({ skipAnimation: true })`, so this snapshot becomes true
 * shortly after mount without any DOM shortcut.
 */
export function getDoneSnapshot(): boolean {
  return doneFlag;
}

// ─── TypeScript global WindowEventMap augmentation ────────────────────

declare global {
  interface WindowEventMap {
    'ascii:ready': CustomEvent<AsciiReadyEventDetail>;
    'intro:revealed': CustomEvent;
    'intro:done': CustomEvent;
  }
}
