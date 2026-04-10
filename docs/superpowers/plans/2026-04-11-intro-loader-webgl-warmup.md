# Intro Loader + WebGL Pre-Warming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ASCII canvas flicker on scroll by running a branded intro loader that pre-warms all WebGL contexts, videos, and shaders before the user reveals the home page content.

**Architecture:** During intro, `main-content` is gated by `clip-path: circle(0%)` while all homepage AsciiCanvas instances mount with `eager={true}` and initialize their WebGL pipelines. A shared `videoPool` pre-loads all 11 video elements in parallel. An `IntroOrchestrator` GSAP timeline waits on `Promise.all([minTimer(0.7s), allAsciiReady])` (hard-capped at 2.5s), then unclips the content with a circular reveal. The existing hero scramble fires on the `intro:revealed` event instead of on mount. Phase 2 reduces mobile Thesis concurrent contexts from 6 → 3 via an `isNearby` gate and bumps `MAX_ACTIVE_CONTEXTS` from 10 → 14.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind v4, GSAP 3.14, Three.js 0.183 (via custom `AscMosaic` library), Swiper 12.

**Branch:** `giwook-han/improve-performance`

**Design spec:** `docs/superpowers/specs/2026-04-11-intro-loader-webgl-warmup-design.md`

**Testing approach:** This project has no unit test framework. Each task verifies via:
1. `pnpm exec tsc --noEmit` (type check)
2. `pnpm lint` (lint check)
3. Manual browser smoke at key checkpoints (noted inline)
4. Full `pnpm build` at the end of the plan

Commits should use conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`). Never include `Co-Authored-By` lines. Per `~/.claude/CLAUDE.md`.

---

## File Structure

### New files (6)

| Path | Responsibility |
|---|---|
| `src/lib/videoPool.ts` | Global `HTMLVideoElement` cache keyed by URL. Pre-loads with `#t=0.001` trick + `canplay` + `play()` warmup. Exposes `warmup(url)`, `warmupAll(urls)`, `get(url)`, `isPooled(video)`. |
| `src/lib/introState.ts` | Shared ready-key `Set<string>` + `markAsciiReady(key)` + `getReadyKeys()` + `HOMEPAGE_ASCII_TARGETS` + `computeExpectedReadyKeys()`. No React — pure module state + event dispatch. |
| `src/hooks/useIntroState.ts` | React hooks `useIntroRevealed()` and `useIntroDone()` that subscribe to the intro lifecycle events. |
| `src/components/intro/LogoFillSvg.tsx` | SVG logo (reuses `LogoHeader` paths) with animated `<mask>` rect for bottom-to-top fill. Forwards a ref to the fill rect so GSAP can animate `attr.y`. |
| `src/components/intro/IntroOverlay.tsx` | Full-screen fixed container rendered only on homepage. Hosts the centered `LogoFillSvg`. Pure SSR-safe markup. |
| `src/components/intro/IntroOrchestrator.tsx` | Client component that owns the GSAP timeline: logo fill → min-timer+ready gate → circular reveal on `main-content` → fires `intro:revealed`, `intro:done`, and sets `sessionStorage.introSeen`. |

### Modified files (13)

| Path | Change |
|---|---|
| `src/lib/ascmosaic/texturedMesh.ts` | `createVideoTexture` accepts optional `existingVideo?: HTMLVideoElement`. When provided and `readyState >= 2`, wraps it in `THREE.VideoTexture` directly (skip network wait). `createTexturedMesh` forwards the new option. |
| `src/lib/ascmosaic/index.ts` | Two dispose blocks (`addModel` texture-replace path and `dispose()` teardown) skip `video.pause() / src='' / load()` when `videoPool.isPooled(video)` returns true. `addModel` forwards `existingVideo` to `createTexturedMesh`. |
| `src/components/ascii/AsciiCanvas.tsx` | Add `preloadKey?: string` prop. Bump `MAX_ACTIVE_CONTEXTS` from 10 → 14. Before `createTexturedMesh`, call `videoPool.get(textureUrl)` and pass as `existingVideo`. In the `onReady?.()` branch also call `markAsciiReady(preloadKey)` to fire the global event. |
| `src/components/ascii/AsciiHero.tsx` | Add `preloadKey="hero"` and `eager={true}` to inner `AsciiCanvas`. |
| `src/components/ascii/AsciiThesis.tsx` | Add `preloadKey={`thesis-${stateNumber}`}` and `eager={true}`. |
| `src/components/ascii/AsciiGraph.tsx` | Add `preloadKey="graph"` and `eager={true}`. |
| `src/components/ascii/AsciiMap.tsx` | Add `preloadKey="map"` and `eager={true}`. |
| `src/components/ascii/AsciiProduct.tsx` | Add `preloadKey={product}` and `eager={true}`. |
| `src/components/home/HeroSection.tsx` | Replace direct `useEffect` scramble scheduling with an `intro:revealed` event listener. If `data-intro-active` is missing (reduced-motion / session skip), schedule immediately. Keep the 2.5s `unlockPage` safety net unchanged. |
| `src/components/home/ThesisSectionMobile.tsx` | Replace `const isActive = index === activeIndex` with `const isNearby = Math.abs(index - activeIndex) <= 1`. For non-nearby slides render a `PlaceholderSkeleton` placeholder (transparent, same dimensions). Update the block comment to reflect new behavior. |
| `src/app/layout.tsx` | Extend inline script: `prefers-reduced-motion` OR `sessionStorage.introSeen === '1'` skips intro-lock. Add `id="main-content"` ref target (already present on `<main>`). Render `<IntroOverlay />` + `<IntroOrchestrator />` before `<main>` when on home. Remove `<AssetPrefetcher />` import and mount. |
| `src/app/globals.css` | Add `html[data-intro-active="true"] #main-content { clip-path: circle(0% at 50% 50%); ... }` and `.intro-overlay` base styles. |
| `src/components/providers/AssetPrefetcher.tsx` | **Delete.** Replaced by videoPool + eager AsciiCanvas instances. |

### Deleted files (1)

- `src/components/providers/AssetPrefetcher.tsx`

---

## Verification Helpers

Two commands are referenced throughout the plan. Add them to muscle memory:

```bash
# Fast static verification (use after every task)
pnpm exec tsc --noEmit && pnpm lint

# Full production build (use at final checkpoint)
pnpm build
```

Expected clean output from static verification: no errors, no warnings. The project's `.eslintrc` uses `eslint-config-next` defaults.

---

## Task 1 — Create `videoPool` module

**Rationale:** Foundation for real video preload. Must exist before any AsciiCanvas consumer can use it. WeakSet tracking lets dispose paths in AscMosaic skip pooled videos without flag plumbing.

**Files:**
- Create: `src/lib/videoPool.ts`

### Steps

- [ ] **Step 1.1: Create `src/lib/videoPool.ts`**

Create a new file with this exact content:

```ts
/**
 * videoPool — Global HTMLVideoElement cache.
 *
 * Pre-loads video elements during the intro phase so that AsciiCanvas
 * instances can reuse them instead of waiting on network + canplay.
 *
 * The iOS Safari `#t=0.001` URL fragment is appended to force first-frame
 * decode even when the video is off-screen. `play()` then `pause()` is NOT
 * used — Safari pauses videos outside the viewport aggressively, so we
 * leave the video playing after the initial `play()` resolves. The video
 * element stays alive for the life of the page.
 *
 * Pooled videos must NOT be disposed by AscMosaic's teardown paths. Use
 * `isPooled(video)` to guard `video.src = ''; video.load()` calls.
 */

const pool = new Map<string, HTMLVideoElement>();
const warmupPromises = new Map<string, Promise<HTMLVideoElement>>();
const pooledVideos = new WeakSet<HTMLVideoElement>();

const WARMUP_TIMEOUT_MS = 8000;

/**
 * Warm up a single video URL. Returns a cached promise on repeat calls.
 * Resolves with the `HTMLVideoElement` once `canplay` fires AND `play()`
 * succeeds. Rejects on error or after `WARMUP_TIMEOUT_MS`.
 */
export function warmup(url: string): Promise<HTMLVideoElement> {
  const existing = warmupPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
    // #t=0.001 forces iOS Safari to decode the first frame even when hidden
    video.src = url + '#t=0.001';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.loop = true;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`videoPool: warmup timeout for ${url}`));
    }, WARMUP_TIMEOUT_MS);

    const onCanPlay = async () => {
      if (settled) return;
      try {
        await video.play();
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        pool.set(url, video);
        pooledVideos.add(video);
        resolve(video);
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const mediaErr = video.error;
      reject(new Error(`videoPool: load error for ${url}${mediaErr ? ` (code ${mediaErr.code})` : ''}`));
    };

    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();
  });

  warmupPromises.set(url, promise);
  return promise;
}

/**
 * Warm up many URLs in parallel. Uses `Promise.allSettled` so a single
 * failure does not block the rest. Callers should not depend on the
 * returned array for readiness — use `get(url)` to check individually.
 */
export function warmupAll(urls: readonly string[]): Promise<PromiseSettledResult<HTMLVideoElement>[]> {
  return Promise.allSettled(urls.map(warmup));
}

/**
 * Look up a pooled video by URL. Returns `undefined` if not yet warmed.
 */
export function get(url: string): HTMLVideoElement | undefined {
  return pool.get(url);
}

/**
 * True if `video` was created by `warmup()`. Used by AscMosaic's dispose
 * paths to avoid killing shared video elements.
 */
export function isPooled(video: HTMLVideoElement): boolean {
  return pooledVideos.has(video);
}
```

- [ ] **Step 1.2: Verify types and lint**

Run:

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: no output (clean pass). If there are errors, fix them before committing.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/videoPool.ts
git commit -m "feat(videoPool): add global HTMLVideoElement warmup pool

Module-level Map<url, HTMLVideoElement> cache with parallel warmup via
Promise.allSettled. Uses #t=0.001 URL fragment to force iOS Safari first-
frame decode. Pooled videos tracked in a WeakSet so AscMosaic dispose
paths can skip pause/src-reset for shared elements."
```

---

## Task 2 — Create `introState` module + `useIntroState` hook

**Rationale:** Shared state contract between `AsciiCanvas` (producer of ready events) and `IntroOrchestrator` (consumer). Module-level `Set` is race-free: events fired before the orchestrator's `useEffect` runs are still visible via `getReadyKeys()`.

**Files:**
- Create: `src/lib/introState.ts`
- Create: `src/hooks/useIntroState.ts`

### Steps

- [ ] **Step 2.1: Create `src/lib/introState.ts`**

Create the file with this content:

```ts
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
 */

export interface AsciiReadyEventDetail {
  key: string;
}

export interface AsciiTarget {
  readonly key: string;
  readonly textureUrl: string;
}

/** All possible ASCII canvas keys on the homepage. */
export const HOMEPAGE_ASCII_TARGETS: readonly AsciiTarget[] = [
  { key: 'hero',         textureUrl: '/resource/Source_Desert.mp4' },
  { key: 'thesis-1',     textureUrl: '/resource/Source_About 01.mp4' },
  { key: 'thesis-2',     textureUrl: '/resource/Source_About 02.mp4' },
  { key: 'thesis-3',     textureUrl: '/resource/Source_About 03.mp4' },
  { key: 'thesis-4',     textureUrl: '/resource/Source_About 04.mp4' },
  { key: 'thesis-5',     textureUrl: '/resource/Source_About 05.mp4' },
  { key: 'thesis-6',     textureUrl: '/resource/Source_About 06.mp4' },
  { key: 'graph',        textureUrl: '/resource/Source_Graph.mp4' },
  { key: 'map',          textureUrl: '/resource/Source_World map.webp' },
  { key: 'nevada-tv',    textureUrl: '/resource/Source_Nevada TV.mp4' },
  { key: 'nevada-trade', textureUrl: '/resource/Source_Nevada Trade.mp4' },
] as const;

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

/** CustomEvent type registration for TypeScript global window events. */
declare global {
  interface WindowEventMap {
    'ascii:ready': CustomEvent<AsciiReadyEventDetail>;
    'intro:revealed': CustomEvent;
    'intro:done': CustomEvent;
  }
}
```

- [ ] **Step 2.2: Create `src/hooks/useIntroState.ts`**

Create the file with this content:

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * useIntroRevealed — Returns true once the 'intro:revealed' event fires
 * OR immediately if the intro was skipped (no intro-lock on <html>).
 *
 * Designed for components that want to defer work until the intro's
 * circular reveal has started. HeroSection's scramble uses this.
 */
export function useIntroRevealed(): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // If intro was never active (reduced-motion OR session skip), the
    // html element won't have data-intro-active. Treat as already revealed.
    if (document.documentElement.dataset.introActive !== 'true') {
      setRevealed(true);
      return;
    }

    const handler = () => setRevealed(true);
    window.addEventListener('intro:revealed', handler);
    return () => window.removeEventListener('intro:revealed', handler);
  }, []);

  return revealed;
}

/**
 * useIntroDone — Returns true once the 'intro:done' event fires
 * (overlay has fully faded out). Use sparingly — most consumers only
 * need useIntroRevealed().
 */
export function useIntroDone(): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.introActive !== 'true') {
      setDone(true);
      return;
    }

    const handler = () => setDone(true);
    window.addEventListener('intro:done', handler);
    return () => window.removeEventListener('intro:done', handler);
  }, []);

  return done;
}
```

- [ ] **Step 2.3: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/introState.ts src/hooks/useIntroState.ts
git commit -m "feat(introState): add shared ready state + React hooks

Module-level Set<string> of ready keys, markAsciiReady producer,
getReadyKeys consumer, HOMEPAGE_ASCII_TARGETS constant, and
computeExpectedReadyKeys() that accounts for Phase 2 isNearby gating.
Also adds useIntroRevealed/useIntroDone React hooks that subscribe to
the intro lifecycle events and handle the skip case (reduced-motion or
session repeat) by returning true immediately."
```

---

## Task 3 — Modify `ascmosaic` library (texturedMesh + index) to honour videoPool

**Rationale:** Real preload needs AsciiCanvas to reuse warmed video elements instead of creating new ones. The library's dispose paths also need to skip pooled videos so one section's teardown doesn't kill another section's shared video.

**Files:**
- Modify: `src/lib/ascmosaic/texturedMesh.ts`
- Modify: `src/lib/ascmosaic/index.ts`

### Steps

- [ ] **Step 3.1: Extend `TexturedMeshOptions` and `createVideoTexture` in `texturedMesh.ts`**

Open `src/lib/ascmosaic/texturedMesh.ts` and make three edits:

**Edit A — add `existingVideo?` to `TexturedMeshOptions`:**

```ts
// Find this interface and append the new field at the bottom:
export interface TexturedMeshOptions {
  /** 도형 종류 */
  shape?: TexturedMeshShape;
  /** 텍스처 URL (shape가 glb가 아닐 때) */
  textureUrl?: string;
  /** 텍스처 타입: image 또는 video */
  textureType?: 'image' | 'video';
  /** GLB 모델 URL (shape: glb) */
  modelUrl?: string;
  /** 크기 배율 (모든 도형) */
  scale?: number;
  /** 구 반지름 (shape: sphere) */
  radius?: number;
  /** 구 세그먼트 (shape: sphere) */
  widthSegments?: number;
  heightSegments?: number;
  /** 큐브 한 변 길이 (shape: cube) */
  size?: number;
  /** 평면 가로 (shape: plane) */
  width?: number;
  /** 평면 세로 (shape: plane) */
  height?: number;
  /**
   * Pre-warmed video element to reuse instead of fetching the URL.
   * When provided (and its readyState >= HAVE_CURRENT_DATA), the texture
   * wraps this element directly and skips the canplay wait.
   * Used by videoPool integration to eliminate re-download latency.
   */
  existingVideo?: HTMLVideoElement;
}
```

**Edit B — change `createVideoTexture` signature and add the fast path:**

Replace the existing `createVideoTexture` function (starts around line 41) with:

```ts
function createVideoTexture(
  videoUrl: string,
  existingVideo?: HTMLVideoElement,
): Promise<THREE.VideoTexture> {
  // Fast path: reuse a pre-warmed video from videoPool
  if (existingVideo && existingVideo.readyState >= 2) {
    const texture = new THREE.VideoTexture(existingVideo);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return Promise.resolve(texture);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    try {
      const baseUrl = (window.location.origin === 'null' || window.location.protocol === 'blob:')
        ? ((window as any).ASC_MOSAIC_BASE_URL || '')
        : window.location.origin;
      if (baseUrl) {
        const urlObj = new URL(videoUrl, baseUrl + '/');
        const currentOrigin = (window.location.origin === 'null' || window.location.protocol === 'blob:')
          ? new URL(baseUrl).origin
          : window.location.origin;
        if (urlObj.origin !== currentOrigin) {
          video.crossOrigin = 'anonymous';
        }
      }
    } catch {
      // ignore
    }
    video.src = videoUrl;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Video load timeout'));
      }
    }, 10000);

    const cleanup = () => clearTimeout(timeout);

    video.addEventListener('canplay', () => {
      if (resolved) return;
      cleanup();
      video.play().then(() => {
        if (resolved) return;
        resolved = true;
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      }).catch((err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Video play failed: ${err?.message || 'Unknown'}`));
        }
      });
    }, { once: true });

    video.addEventListener('error', () => {
      cleanup();
      if (!resolved) {
        resolved = true;
        const err = video.error;
        reject(new Error(err ? `Video load error (${err.code})` : 'Video load failed'));
      }
    }, { once: true });

    video.load();
  });
}
```

**Edit C — pass `existingVideo` through `createTexturedMesh`:**

Find the `if (textureType === 'video')` branch inside `createTexturedMesh` (around line 180) and change the call from `createVideoTexture(textureUrl)` to `createVideoTexture(textureUrl, options.existingVideo)`:

```ts
  if (textureType === 'video') {
    return createVideoTexture(textureUrl, options.existingVideo).then((texture) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: texture,
        side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'TexturedMesh';
      mesh.scale.setScalar(scale);
      return mesh;
    }).catch(() => {
      // ... existing fallback unchanged ...
```

- [ ] **Step 3.2: Guard `AscMosaic` dispose paths against pooled videos in `index.ts`**

Open `src/lib/ascmosaic/index.ts` and make two edits.

**Edit A — add the import at the top of the file** (after the existing Three.js / local imports around line 7):

```ts
import {
  AsciiMosaicFilter,
  AsciiMosaicFilterOptions,
} from './asciiMosaicFilter';
import { createTexturedMesh, TexturedMeshOptions } from './texturedMesh';
import { OrbitControls, OrbitControlsOptions } from './orbitControls';
import * as THREE from 'three';
import * as videoPool from '@/lib/videoPool';
```

**Edit B — in `addModel`'s dispose block** (around lines 202-223), find:

```ts
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) {
            if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map instanceof THREE.VideoTexture) {
              const videoTexture = obj.material.map as THREE.VideoTexture;
              const video = videoTexture.image as HTMLVideoElement;
              if (video) {
                video.pause();
                video.src = '';
                video.load();
              }
              videoTexture.dispose();
            }
            obj.material.dispose();
          }
        }
      });
      this.model = null;
    }
```

Replace with:

```ts
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) {
            if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map instanceof THREE.VideoTexture) {
              const videoTexture = obj.material.map as THREE.VideoTexture;
              const video = videoTexture.image as HTMLVideoElement;
              // Do NOT kill pooled videos — they are shared across sections.
              if (video && !videoPool.isPooled(video)) {
                video.pause();
                video.src = '';
                video.load();
              }
              videoTexture.dispose();
            }
            obj.material.dispose();
          }
        }
      });
      this.model = null;
    }
```

**Edit C — in `AscMosaic.dispose()`** (around lines 718-735), find the identical block and apply the same `!videoPool.isPooled(video)` guard:

```ts
  dispose(): void {
    this.stopAnimate();

    if (this.model) {
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) {
            if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map instanceof THREE.VideoTexture) {
              const videoTexture = obj.material.map as THREE.VideoTexture;
              const video = videoTexture.image as HTMLVideoElement;
              if (video && !videoPool.isPooled(video)) {
                video.pause();
                video.src = '';
                video.load();
              }
              videoTexture.dispose();
            }
            obj.material.dispose();
          }
        }
      });
    }
    // ... rest of dispose() unchanged ...
```

- [ ] **Step 3.3: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 3.4: Commit**

```bash
git add src/lib/ascmosaic/texturedMesh.ts src/lib/ascmosaic/index.ts
git commit -m "feat(ascmosaic): honour videoPool for texture swap + dispose

texturedMesh.createVideoTexture now accepts an optional existingVideo
parameter that skips network fetch when a pre-warmed HTMLVideoElement
is passed in. AscMosaic.addModel and AscMosaic.dispose now guard the
video pause/src-reset path with videoPool.isPooled() so shared pool
elements survive section unmounts."
```

---

## Task 4 — Upgrade `AsciiCanvas` with `preloadKey`, videoPool lookup, bump MAX, event dispatch

**Rationale:** This is the consumer side of videoPool + introState. Every homepage AsciiCanvas will carry a `preloadKey` that identifies it for the orchestrator. The MAX bump is the safety net for concurrent warmup.

**Files:**
- Modify: `src/components/ascii/AsciiCanvas.tsx`

### Steps

- [ ] **Step 4.1: Add imports, new prop, and bump MAX_ACTIVE_CONTEXTS**

Open `src/components/ascii/AsciiCanvas.tsx`.

**Edit A — update the imports at the top:**

Find:

```tsx
'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
```

Replace with:

```tsx
'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import * as videoPool from '@/lib/videoPool';
import { markAsciiReady } from '@/lib/introState';
```

**Edit B — add `preloadKey` to `AsciiCanvasProps`:**

Find the `AsciiCanvasProps` interface and add at the very end (just above the closing `}`):

```tsx
  /** Called once when the mosaic finishes initializing and starts animating */
  onReady?: () => void;
  /**
   * Stable key used by the intro orchestration to identify this canvas.
   * When provided, videoPool is checked for a pre-warmed video element,
   * and on ready the 'ascii:ready' event fires with this key in the detail.
   * Required for homepage canvases; unused on /about.
   */
  preloadKey?: string;
}
```

**Edit C — bump the context budget:**

Find:

```tsx
// Global WebGL context counter to enforce budget
let activeContextCount = 0;
const MAX_ACTIVE_CONTEXTS = 10;
```

Replace with:

```tsx
// Global WebGL context counter to enforce budget.
// 14 is chosen as a safety margin below WebKit's empirical 16-context limit
// while accommodating the homepage's 11 homepage-target pre-warm + headroom
// for context-loss recovery. See design spec §6.2.
let activeContextCount = 0;
const MAX_ACTIVE_CONTEXTS = 14;
```

- [ ] **Step 4.2: Add `preloadKey` to the component signature and forward to initMosaic**

Find the function signature line (around line 107):

```tsx
export function AsciiCanvas({
  textureUrl,
  textureType,
  width,
  height,
  mosaicSize = 8,
  // ... many more props ...
  eager = false,
  onReady,
}: AsciiCanvasProps) {
```

Add `preloadKey` after `onReady`:

```tsx
export function AsciiCanvas({
  textureUrl,
  textureType,
  width,
  height,
  mosaicSize = 8,
  mosaicCellUrl = '/resource/Monotone Cell F_1-1.png',
  shape = 'plane',
  mouseInteraction = false,
  className = '',
  setSelectionMode = 'first',
  orthographic = true,
  minBrightness = 0,
  maxBrightness = 100,
  noiseIntensity = 0,
  setCount = 1,
  avoidRadius = 29,
  avoidStrength = 9,
  planeWidth = 5.9,
  planeHeight = 4.1,
  scale = 1,
  noiseFPS,
  noiseFPSRandom,
  autoRotate,
  cellCount = 10,
  offsetRowRadius,
  backgroundColor,
  renderWidth,
  renderHeight,
  renderScale = 1,
  cameraOffsetX = 0,
  eager = false,
  onReady,
  preloadKey,
}: AsciiCanvasProps) {
```

- [ ] **Step 4.3: Wire videoPool into `initMosaic` and fire `markAsciiReady` on success**

Find the `initMosaic` `useCallback` block. Inside, locate the `await mosaic.addModel(...)` call (around line 210-217):

```tsx
      // Add model with texture (supports both image and video)
      await mosaic.addModel({
        shape,
        textureUrl,
        textureType: resolvedTextureType,
        width: planeWidth,
        height: planeHeight,
        scale,
      });
```

Replace with:

```tsx
      // Add model with texture (supports both image and video).
      // For video textures, try the videoPool first — if a warmed element
      // exists, AscMosaic reuses it and skips the network fetch path.
      const existingVideo = resolvedTextureType === 'video'
        ? videoPool.get(textureUrl)
        : undefined;
      await mosaic.addModel({
        shape,
        textureUrl,
        textureType: resolvedTextureType,
        width: planeWidth,
        height: planeHeight,
        scale,
        existingVideo,
      });
```

Then find the successful init finish (around line 275-278):

```tsx
      // Start animation
      mosaic.animate();
      setIsInitialized(true);
      onReady?.();
    } catch (err) {
```

Replace with:

```tsx
      // Start animation
      mosaic.animate();
      setIsInitialized(true);
      onReady?.();
      if (preloadKey) {
        markAsciiReady(preloadKey);
      }
    } catch (err) {
```

- [ ] **Step 4.4: Add `preloadKey` to the `initMosaic` dependency array**

Find the `}, [textureUrl, resolvedTextureType, ...])` dependency list at the end of the `useCallback` (around line 282). Add `preloadKey` at the end:

```tsx
  }, [textureUrl, resolvedTextureType, mosaicSize, mosaicCellUrl, shape, mouseInteraction, setSelectionMode, orthographic, minBrightness, maxBrightness, noiseIntensity, setCount, avoidRadius, avoidStrength, planeWidth, planeHeight, scale, noiseFPS, noiseFPSRandom, prefersReducedMotion, resolvedAutoRotate, cellCount, offsetRowRadius, renderWidth, renderHeight, renderScale, cameraOffsetX, preloadKey]);
```

- [ ] **Step 4.5: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/components/ascii/AsciiCanvas.tsx
git commit -m "feat(AsciiCanvas): integrate videoPool + preloadKey + bump context budget

- Add preloadKey prop; homepage canvases use it to identify themselves
- Look up videoPool.get(textureUrl) before addModel so pre-warmed video
  elements skip the canplay wait on init
- Call markAsciiReady(preloadKey) after successful animate() so the
  intro orchestrator can track readiness via 'ascii:ready' events
- Bump MAX_ACTIVE_CONTEXTS 10 -> 14 to safely host the 11 homepage
  targets plus context-loss recovery headroom (WebKit empirical limit 16)"
```

---

## Task 5 — Propagate `preloadKey` and `eager` to all homepage Ascii subcomponents

**Rationale:** Phase 1 needs every homepage canvas to init during intro (bypass IntersectionObserver) and carry its stable key for orchestrator tracking.

**Files:**
- Modify: `src/components/ascii/AsciiHero.tsx`
- Modify: `src/components/ascii/AsciiThesis.tsx`
- Modify: `src/components/ascii/AsciiGraph.tsx`
- Modify: `src/components/ascii/AsciiMap.tsx`
- Modify: `src/components/ascii/AsciiProduct.tsx`

### Steps

- [ ] **Step 5.1: Update `AsciiHero.tsx`**

Open `src/components/ascii/AsciiHero.tsx` and find the `<AsciiCanvas ...>` JSX block (around lines 46-65). Add `preloadKey="hero"` and `eager` alongside the existing props:

```tsx
  return (
    <AsciiCanvas
      textureUrl="/resource/Source_Desert.mp4"
      textureType="video"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={6}
      shape="plane"
      orthographic
      cellCount={4}
      minBrightness={59}
      maxBrightness={0}
      noiseFPS={25}
      noiseFPSRandom={0.6}
      planeWidth={PLANE_W}
      planeHeight={PLANE_H}
      scale={scale}
      onReady={onReady}
      preloadKey="hero"
      eager
    />
  );
```

- [ ] **Step 5.2: Update `AsciiThesis.tsx`**

Open `src/components/ascii/AsciiThesis.tsx`. Add `preloadKey={`thesis-${stateNumber}`}` and `eager`:

```tsx
  return (
    <AsciiCanvas
      textureUrl={config.textureUrl}
      mosaicCellUrl="/resource/Monotone Cell F_4-1.png"
      className="absolute inset-0 h-full w-full"
      mosaicSize={9}
      shape="plane"
      orthographic={false}
      mouseInteraction
      cellCount={12}
      scale={config.scale}
      setCount={3}
      noiseFPS={1}
      minBrightness={config.minBrightness}
      maxBrightness={config.maxBrightness}
      avoidRadius={90}
      avoidStrength={13}
      planeWidth={4}
      planeHeight={4}
      renderScale={4.5}
      preloadKey={`thesis-${stateNumber}`}
      eager
    />
  );
```

- [ ] **Step 5.3: Update `AsciiGraph.tsx`**

Open `src/components/ascii/AsciiGraph.tsx`. Add `preloadKey="graph"` and `eager`:

```tsx
  return (
    <AsciiCanvas
      textureUrl="/resource/Source_Graph.mp4"
      textureType="video"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      shape="plane"
      orthographic
      cameraOffsetX={cameraOffsetX}
      cellCount={3}
      scale={2.3}
      noiseIntensity={0.1}
      noiseFPS={7}
      minBrightness={100}
      maxBrightness={20}
      planeWidth={5.9}
      planeHeight={4}
      preloadKey="graph"
      eager
    />
  );
```

- [ ] **Step 5.4: Update `AsciiMap.tsx`**

Open `src/components/ascii/AsciiMap.tsx`. Add `preloadKey="map"` and `eager`:

```tsx
  return (
    <AsciiCanvas
      textureUrl="/resource/Source_World map.webp"
      textureType="image"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={isMobile ? 7 : 9}
      shape="plane"
      orthographic
      cellCount={3}
      scale={scale}
      setSelectionMode="offsetRow"
      offsetRowRadius={20}
      noiseIntensity={0.02}
      noiseFPS={9}
      minBrightness={62}
      maxBrightness={76}
      planeWidth={PLANE_W}
      planeHeight={PLANE_H}
      preloadKey="map"
      eager
    />
  );
```

- [ ] **Step 5.5: Update `AsciiProduct.tsx`**

Open `src/components/ascii/AsciiProduct.tsx`. Add `preloadKey={product}` and `eager`:

```tsx
  return (
    <AsciiCanvas
      textureUrl={config.textureUrl}
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={7}
      shape="plane"
      orthographic={false}
      mouseInteraction
      cellCount={3}
      scale={config.scale}
      noiseFPS={9}
      noiseIntensity={config.noiseIntensity}
      minBrightness={config.minBrightness}
      maxBrightness={config.maxBrightness}
      avoidRadius={90}
      avoidStrength={13}
      planeWidth={4}
      planeHeight={4}
      renderScale={2}
      preloadKey={product}
      eager
    />
  );
```

- [ ] **Step 5.6: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/ascii/AsciiHero.tsx src/components/ascii/AsciiThesis.tsx src/components/ascii/AsciiGraph.tsx src/components/ascii/AsciiMap.tsx src/components/ascii/AsciiProduct.tsx
git commit -m "feat(ascii): propagate preloadKey + eager to all homepage subcomponents

All homepage ASCII canvases now bypass IntersectionObserver (eager) and
identify themselves to the intro orchestrator via preloadKey. Keys match
HOMEPAGE_ASCII_TARGETS in src/lib/introState.ts."
```

---

## Task 6 — Create `LogoFillSvg` component

**Rationale:** First intro UI piece. Wraps the existing `LogoHeader` SVG paths in an SVG mask that GSAP animates bottom-to-top. Pure presentation — no effects.

**Files:**
- Create: `src/components/intro/LogoFillSvg.tsx`

### Steps

- [ ] **Step 6.1: Create `src/components/intro/LogoFillSvg.tsx`**

Create the file with this content. The six `<path>` entries are copied verbatim from `src/components/ui/Logo.tsx`:

```tsx
'use client';

import { forwardRef } from 'react';

/**
 * LogoFillSvg — Large centered 1SIX logo with a mask-based bottom-to-top
 * fill animation. The orchestrator animates `y` on the mask rect via GSAP.
 *
 * Layer stack:
 *   - Base: dark silhouette of the logo (20% opacity var(--color-text))
 *   - Overlay: accent-colored logo clipped by a mask rect that slides up
 *
 * The viewBox matches LogoHeader (73 x 21.03). The caller sizes via CSS.
 */

interface LogoFillSvgProps {
  className?: string;
}

export const LogoFillSvg = forwardRef<SVGRectElement, LogoFillSvgProps>(
  function LogoFillSvg({ className = '' }, fillRectRef) {
    return (
      <svg
        className={className}
        viewBox="0 0 73 21.03"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <mask id="intro-logo-fill-mask">
            {/* Whole area black by default — nothing shows */}
            <rect x="0" y="0" width="73" height="21.03" fill="black" />
            {/* Animated white rect — starts below the logo, slides up */}
            <rect
              ref={fillRectRef}
              x="0"
              y="21.03"
              width="73"
              height="21.03"
              fill="white"
            />
          </mask>
        </defs>

        {/* Base: dark silhouette (shows the whole logo dim) */}
        <g fill="currentColor" opacity="0.2">
          <path d="M72.96 0.04L73 0H68.52L68.48 0.04L60.3 8.26V12.77L68.52 21.03H73L62.94 10.91C62.72 10.69 62.72 10.33 62.94 10.11L72.96 0.04Z" />
          <path d="M50.69 21.03L58.9 12.77V8.26L50.73 0.04L50.69 0H46.2L46.24 0.04L56.27 10.12C56.48 10.33 56.48 10.69 56.27 10.91L46.2 21.03H50.69Z" />
          <path d="M43.85 0.04H40.68V21.02H43.85V0.04Z" />
          <path d="M29.58 8.32L27.34 10.58L33.84 17.12C34.11 17.39 33.92 17.84 33.55 17.84H16.14V21.03H37.02V15.8L29.58 8.32Z" />
          <path d="M16.14 5.27L23.58 12.75L25.82 10.49L19.31 3.95C19.05 3.68 19.24 3.23 19.61 3.23H37.02V0.04H16.14V5.27Z" />
          <path d="M7.44 0.04L0 7.52L2.24 9.78L8.75 3.24C9.01 2.97 9.46 3.16 9.46 3.53V21.03H12.63V0.04H7.44Z" />
        </g>

        {/* Overlay: accent color, revealed by the animating mask */}
        <g fill="var(--color-accent)" mask="url(#intro-logo-fill-mask)">
          <path d="M72.96 0.04L73 0H68.52L68.48 0.04L60.3 8.26V12.77L68.52 21.03H73L62.94 10.91C62.72 10.69 62.72 10.33 62.94 10.11L72.96 0.04Z" />
          <path d="M50.69 21.03L58.9 12.77V8.26L50.73 0.04L50.69 0H46.2L46.24 0.04L56.27 10.12C56.48 10.33 56.48 10.69 56.27 10.91L46.2 21.03H50.69Z" />
          <path d="M43.85 0.04H40.68V21.02H43.85V0.04Z" />
          <path d="M29.58 8.32L27.34 10.58L33.84 17.12C34.11 17.39 33.92 17.84 33.55 17.84H16.14V21.03H37.02V15.8L29.58 8.32Z" />
          <path d="M16.14 5.27L23.58 12.75L25.82 10.49L19.31 3.95C19.05 3.68 19.24 3.23 19.61 3.23H37.02V0.04H16.14V5.27Z" />
          <path d="M7.44 0.04L0 7.52L2.24 9.78L8.75 3.24C9.01 2.97 9.46 3.16 9.46 3.53V21.03H12.63V0.04H7.44Z" />
        </g>
      </svg>
    );
  }
);
```

- [ ] **Step 6.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/intro/LogoFillSvg.tsx
git commit -m "feat(intro): add LogoFillSvg with mask-based fill animation

Large centered 1SIX logo using the same six SVG paths as LogoHeader.
Forwards a ref to the animated mask rect so IntroOrchestrator can drive
its \`y\` attribute via GSAP's attr plugin (bottom -> top liquid fill)."
```

---

## Task 7 — Create `IntroOverlay` component

**Rationale:** Presentation-only container for the intro. SSR-safe so the first paint already has the logo visible.

**Files:**
- Create: `src/components/intro/IntroOverlay.tsx`

### Steps

- [ ] **Step 7.1: Create `src/components/intro/IntroOverlay.tsx`**

```tsx
'use client';

import { forwardRef, type RefObject } from 'react';
import { LogoFillSvg } from './LogoFillSvg';

/**
 * IntroOverlay — Full-screen fixed container shown on the homepage during
 * the intro. Pure presentation: the actual animation is driven by
 * IntroOrchestrator which receives the fillRectRef via props.
 *
 * z-index 100 sits above the mobile menu (z-60) and below the skip-to-
 * content link (z-100 same, but skip link is translate-y-full until focus).
 */

interface IntroOverlayProps {
  fillRectRef: RefObject<SVGRectElement | null>;
}

export const IntroOverlay = forwardRef<HTMLDivElement, IntroOverlayProps>(
  function IntroOverlay({ fillRectRef }, overlayRef) {
    return (
      <div
        ref={overlayRef}
        className="intro-overlay pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="Loading"
        style={{
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text)',
        }}
      >
        <div className="intro-logo-wrap">
          <LogoFillSvg
            ref={fillRectRef}
            className="intro-logo-svg h-[60px] w-auto md:h-[80px]"
          />
        </div>
      </div>
    );
  }
);
```

- [ ] **Step 7.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/intro/IntroOverlay.tsx
git commit -m "feat(intro): add IntroOverlay presentation container

Full-screen fixed container that hosts the centered LogoFillSvg.
Forwards an overlay ref so IntroOrchestrator can fade it out after
the circular reveal finishes. SSR-safe markup only, no effects."
```

---

## Task 8 — Create `IntroOrchestrator` component

**Rationale:** The brain. Owns the GSAP timeline, the min-timer, the ready aggregation, and the sessionStorage skip flag.

**Files:**
- Create: `src/components/intro/IntroOrchestrator.tsx`

### Steps

- [ ] **Step 8.1: Create `src/components/intro/IntroOrchestrator.tsx`**

```tsx
'use client';

import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import * as videoPool from '@/lib/videoPool';
import {
  HOMEPAGE_ASCII_TARGETS,
  computeExpectedReadyKeys,
  getReadyKeys,
} from '@/lib/introState';

/**
 * IntroOrchestrator — State machine that coordinates the homepage intro.
 *
 * Timeline (best case, webglReady ≤ 0.7s):
 *   t=0.00  videoPool.warmupAll starts; AsciiCanvas instances init in parallel
 *   t=0.05  GSAP: logo fill mask rect y: 21.03 -> 0 over 0.6s (power2.inOut)
 *   t=0.65  fill done
 *   t=0.70  minTimer done -> reveal (if webglReady also done)
 *           -> GSAP: main-content clip-path circle(0%) -> circle(150%) over 0.4s
 *           -> dispatches 'intro:revealed', removes intro-lock, sets sessionStorage.introSeen
 *   t=1.10  reveal done -> GSAP: overlay opacity 1 -> 0 over 0.3s
 *   t=1.40  -> dispatches 'intro:done'
 *
 * Hardcap: 2.5s. Even if webglReady never fires, reveal runs.
 * Reduced-motion / session repeat: intro-lock is absent on mount, so
 * runReveal fires synchronously with skipAnimation=true.
 */

const MIN_DISPLAY_MS = 700;
const HARD_CAP_MS = 2500;
const FILL_DURATION_S = 0.6;
const FILL_DELAY_S = 0.05;
const REVEAL_DURATION_S = 0.4;
const OVERLAY_FADE_S = 0.3;

interface IntroOrchestratorProps {
  fillRectRef: RefObject<SVGRectElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  mainContentRef: RefObject<HTMLElement | null>;
}

export function IntroOrchestrator({
  fillRectRef,
  overlayRef,
  mainContentRef,
}: IntroOrchestratorProps) {
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const html = document.documentElement;
    const introActive = html.classList.contains('intro-lock');

    // Skip case: reduced-motion or session repeat. The inline script in
    // layout.tsx did not set intro-lock, so we fast-forward to reveal.
    if (!introActive) {
      runReveal({ skipAnimation: true });
      return () => {
        disposedRef.current = true;
      };
    }

    // Begin parallel warmup of all 11 video URLs. Promise.allSettled means
    // partial failure is tolerated — the orchestrator relies on per-canvas
    // 'ascii:ready' events rather than this promise's resolution.
    videoPool
      .warmupAll(HOMEPAGE_ASCII_TARGETS.map((t) => t.textureUrl))
      .then((results) => {
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? HOMEPAGE_ASCII_TARGETS[i].key : null))
          .filter((k): k is string => k !== null);
        if (failed.length > 0) {
          console.warn('[intro] videoPool partial failure:', failed);
        }
      });

    // Logo fill animation — GSAP attr plugin animates the mask rect's y
    const fillTween = gsap.to(fillRectRef.current, {
      attr: { y: 0 },
      duration: FILL_DURATION_S,
      ease: 'power2.inOut',
      delay: FILL_DELAY_S,
    });

    // WebGL readiness — aggregate via module-level getReadyKeys() (race-free)
    const expectedKeys = computeExpectedReadyKeys();
    const isAllReady = () => {
      const ready = getReadyKeys();
      for (const key of expectedKeys) {
        if (!ready.has(key)) return false;
      }
      return true;
    };

    let readyResolve: (() => void) | null = null;
    const webglReady = new Promise<void>((resolve) => {
      if (isAllReady()) {
        resolve();
        return;
      }
      readyResolve = resolve;
    });

    const onAsciiReady = () => {
      if (readyResolve && isAllReady()) {
        const r = readyResolve;
        readyResolve = null;
        r();
      }
    };
    window.addEventListener('ascii:ready', onAsciiReady);

    // Race: (minTimer + webglReady) vs hardcap
    const minTimer = new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS));
    const hardCap = new Promise<'hardcap'>((r) =>
      setTimeout(() => r('hardcap'), HARD_CAP_MS),
    );

    Promise.race([
      Promise.all([minTimer, webglReady]).then(() => 'ready' as const),
      hardCap,
    ]).then((reason) => {
      if (disposedRef.current) return;
      if (reason === 'hardcap') {
        const ready = getReadyKeys();
        console.warn('[intro] hardcap reached, forcing reveal', {
          expected: expectedKeys.length,
          ready: expectedKeys.filter((k) => ready.has(k)).length,
        });
      }
      runReveal({ skipAnimation: false });
    });

    return () => {
      disposedRef.current = true;
      window.removeEventListener('ascii:ready', onAsciiReady);
      fillTween.kill();
    };

    // runReveal is declared inside the effect so it closes over refs
    // without needing useCallback dependencies.
    function runReveal({ skipAnimation }: { skipAnimation: boolean }): void {
      const markSeen = () => {
        try {
          sessionStorage.setItem('introSeen', '1');
        } catch {
          // private browsing — ignore, intro will still skip via fail-open
        }
      };

      const unlock = () => {
        html.classList.remove('intro-lock');
        delete html.dataset.introActive;
      };

      if (skipAnimation) {
        unlock();
        markSeen();
        // Fire on next tick so subscribers that mount later (e.g. the
        // HeroSection effect) also see the event.
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('intro:revealed'));
          window.dispatchEvent(new CustomEvent('intro:done'));
        });
        return;
      }

      const main = mainContentRef.current;
      const overlay = overlayRef.current;
      if (!main || !overlay) return;

      gsap.fromTo(
        main,
        {
          clipPath: 'circle(0% at 50% 50%)',
          WebkitClipPath: 'circle(0% at 50% 50%)',
        },
        {
          clipPath: 'circle(150% at 50% 50%)',
          WebkitClipPath: 'circle(150% at 50% 50%)',
          duration: REVEAL_DURATION_S,
          ease: 'power3.out',
          onStart: () => {
            unlock();
            markSeen();
            window.dispatchEvent(new CustomEvent('intro:revealed'));
          },
          onComplete: () => {
            gsap.to(overlay, {
              opacity: 0,
              duration: OVERLAY_FADE_S,
              onComplete: () => {
                window.dispatchEvent(new CustomEvent('intro:done'));
              },
            });
          },
        },
      );
    }
  }, [fillRectRef, overlayRef, mainContentRef]);

  return null;
}
```

- [ ] **Step 8.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass. Note: `queueMicrotask` is a global in Node/DOM since Node 11 — TypeScript recognises it with the DOM lib.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/intro/IntroOrchestrator.tsx
git commit -m "feat(intro): add IntroOrchestrator state machine

Coordinates videoPool warmup, GSAP logo fill, per-canvas ready
aggregation (race-free via module Set + window events), and the
circular clip-path reveal. Emits intro:revealed and intro:done at the
right moments and sets sessionStorage.introSeen on successful reveal.

Handles three entry modes:
- Normal: wait for min(700ms) + all expected keys ready, hardcap 2500ms
- Reduced-motion / session repeat: skip animation, dispatch events on
  next microtask so later subscribers still see them
- Partial videoPool failure: tolerated via Promise.allSettled; affected
  canvases fall back to the existing lazy init path"
```

---

## Task 9 — Add intro styles to `globals.css`

**Rationale:** The clip-path initial state must be applied by CSS (not JS) so it holds during SSR and hydration. Without this, `main-content` would be fully visible for 1 frame before GSAP fromTo runs.

**Files:**
- Modify: `src/app/globals.css`

### Steps

- [ ] **Step 9.1: Append intro styles to `globals.css`**

Open `src/app/globals.css`. Find the existing intro-lock block (around lines 42-54):

```css
/* ══════════════════════════════════════════════════════════
   Intro lock — freeze viewport until hero scramble completes
   ══════════════════════════════════════════════════════════ */
html.intro-lock {
  overflow: hidden !important;
  overscroll-behavior: none;
}
html.intro-lock body {
  overflow: hidden !important;
  pointer-events: none !important;
  touch-action: none;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
}
```

Immediately after that block, insert:

```css
/* ══════════════════════════════════════════════════════════
   Intro overlay — clip-path gate on main-content
   ══════════════════════════════════════════════════════════
   While data-intro-active is set by the inline script, the main
   content is clipped to a zero-radius circle at the viewport center.
   IntroOrchestrator's GSAP timeline expands this to circle(150%) to
   reveal the page. Both clip-path and -webkit-clip-path are declared
   for Safari compatibility. */
html[data-intro-active="true"] #main-content {
  clip-path: circle(0% at 50% 50%);
  -webkit-clip-path: circle(0% at 50% 50%);
}

.intro-overlay {
  /* Hardware-accelerate the overlay so its eventual opacity fade is
     composited rather than repainted. */
  will-change: opacity;
}

.intro-logo-wrap {
  /* Logo wrap exists as a positioning hook; sizing is on LogoFillSvg. */
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 9.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass (CSS is not linted by eslint-config-next but tsc and lint still run for the project).

- [ ] **Step 9.3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(intro): add clip-path gate + overlay styles in globals.css

html[data-intro-active='true'] #main-content starts at circle(0%) so the
first paint hides the content under a zero-radius clip. The orchestrator
expands it to circle(150%) via GSAP during reveal. Both clip-path and
-webkit-clip-path are set for Safari support."
```

---

## Task 10 — Wire `IntroOverlay` + `IntroOrchestrator` into `layout.tsx`, delete `AssetPrefetcher`

**Rationale:** This is the integration point. The inline script gets the sessionStorage + reduced-motion check, the intro components mount in the layout tree, and the old AssetPrefetcher goes away in the same commit to avoid a broken intermediate state.

**Files:**
- Modify: `src/app/layout.tsx`
- Delete: `src/components/providers/AssetPrefetcher.tsx`

### Steps

- [ ] **Step 10.1: Extend the inline script in `layout.tsx`**

Open `src/app/layout.tsx`. Find the inline script block (around lines 127-152) that currently contains the theme setup and the intro-lock add. Replace the `if (window.location.pathname === '/') { ... }` block with the session-aware version:

Find:

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('theme');
                var theme;
                if (stored === 'dark' || stored === 'light') {
                  theme = stored;
                } else {
                  // First visit: dark on mobile, light on desktop
                  theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
                  localStorage.setItem('theme', theme);
                }
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
              if (history.scrollRestoration) history.scrollRestoration = 'manual';
              if (window.location.pathname === '/') {
                document.documentElement.classList.add('intro-lock');
              }
              window.addEventListener('pageshow', function(e) {
                if (e.persisted) window.location.reload();
              });
            `,
          }}
        />
```

Replace with:

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('theme');
                var theme;
                if (stored === 'dark' || stored === 'light') {
                  theme = stored;
                } else {
                  // First visit: dark on mobile, light on desktop
                  theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
                  localStorage.setItem('theme', theme);
                }
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
              if (history.scrollRestoration) history.scrollRestoration = 'manual';
              if (window.location.pathname === '/') {
                var shouldIntro = true;
                try {
                  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    shouldIntro = false;
                  }
                  if (sessionStorage.getItem('introSeen') === '1') {
                    shouldIntro = false;
                  }
                } catch (e) {
                  // sessionStorage may throw in private browsing — fail open (show intro)
                }
                if (shouldIntro) {
                  document.documentElement.classList.add('intro-lock');
                  document.documentElement.dataset.introActive = 'true';
                }
              }
              window.addEventListener('pageshow', function(e) {
                if (e.persisted) window.location.reload();
              });
            `,
          }}
        />
```

- [ ] **Step 10.2: Update imports and the JSX body in `layout.tsx`**

In the same file, find:

```tsx
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Analytics } from '@vercel/analytics/next';
import { AssetPrefetcher } from '@/components/providers/AssetPrefetcher';
```

Replace with:

```tsx
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Analytics } from '@vercel/analytics/next';
import { HomeIntroMount } from '@/components/intro/HomeIntroMount';
```

Then find the `<body>` block (around lines 154-175):

```tsx
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        {/* Skip to content link for keyboard users */}
        <a
          href="#main-content"
          className="fixed top-0 left-0 z-[100] -translate-y-full bg-[var(--color-accent)] px-4 py-2 text-white transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
        </ThemeProvider>
        <AssetPrefetcher />
        <Analytics />
      </body>
```

Replace with:

```tsx
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        {/* Skip to content link for keyboard users */}
        <a
          href="#main-content"
          className="fixed top-0 left-0 z-[100] -translate-y-full bg-[var(--color-accent)] px-4 py-2 text-white transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
        </ThemeProvider>
        <HomeIntroMount />
        <Analytics />
      </body>
```

Note: `HomeIntroMount` is a small client wrapper we'll create in the next step. It exists because `layout.tsx` is a server component and can't directly hold the refs that `IntroOverlay` and `IntroOrchestrator` need.

- [ ] **Step 10.3: Create `HomeIntroMount.tsx` client wrapper**

Create `src/components/intro/HomeIntroMount.tsx`:

```tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';

/**
 * HomeIntroMount — Client wrapper mounted in the root layout. Renders
 * the intro overlay + orchestrator only while on the homepage, and only
 * after the root html has been hydrated (so data-intro-active is stable).
 *
 * Why a wrapper? layout.tsx is a server component and can't hold the
 * refs that IntroOverlay and IntroOrchestrator need to share. It also
 * can't use usePathname to gate the mount. This component bridges that.
 */
export function HomeIntroMount() {
  const pathname = usePathname();
  const fillRectRef = useRef<SVGRectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);

  // Capture #main-content once on mount so the orchestrator has a ref
  // to the element even though it lives outside this subtree.
  useEffect(() => {
    mainContentRef.current = document.getElementById('main-content') as HTMLElement | null;
    setMounted(true);
  }, []);

  if (pathname !== '/') return null;
  if (!mounted) {
    // First render: the overlay still needs to be in the DOM so the
    // inline script's data-intro-active attribute and CSS clip-path
    // gate have a visual target. The orchestrator waits for mount.
    return <IntroOverlay ref={overlayRef} fillRectRef={fillRectRef} />;
  }

  return (
    <>
      <IntroOverlay ref={overlayRef} fillRectRef={fillRectRef} />
      <IntroOrchestrator
        fillRectRef={fillRectRef}
        overlayRef={overlayRef}
        mainContentRef={mainContentRef}
      />
    </>
  );
}
```

- [ ] **Step 10.4: Delete `AssetPrefetcher.tsx`**

```bash
rm src/components/providers/AssetPrefetcher.tsx
```

- [ ] **Step 10.5: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass. If there's a hydration mismatch error in type-check (unlikely), double-check the HomeIntroMount's `mounted` state logic.

- [ ] **Step 10.6: Run a full build to confirm integration**

```bash
pnpm build
```

Expected: Next.js builds successfully. Any missed import or prop mismatch surfaces here.

- [ ] **Step 10.7: Commit**

```bash
git add src/app/layout.tsx src/components/intro/HomeIntroMount.tsx
git rm src/components/providers/AssetPrefetcher.tsx
git commit -m "feat(layout): wire intro overlay + orchestrator, remove AssetPrefetcher

Layout inline script now sets data-intro-active only when intro should
actually run (not reduced-motion, not session repeat). A new client
wrapper HomeIntroMount holds the shared refs and gates the intro
components to pathname === '/'. AssetPrefetcher is removed — its HTTP
cache warmup role is superseded by videoPool's real WebGL warmup."
```

- [ ] **Step 10.8: Manual browser smoke — first visual check**

This is the first point where the intro should be visible end-to-end. Do NOT skip.

```bash
pnpm dev
```

Open `http://localhost:3000` in Chrome and check:
1. On initial load, the page starts with a black/card background and the 1SIX logo centered
2. The logo fills with accent color bottom-to-top over ~0.6s
3. After 0.7s minimum, the circular reveal expands from center
4. The hero scramble then plays (still using the OLD scheduling — Task 11 will fix this)
5. No console errors

If you see the intro working, proceed. If not, debug before continuing — the scramble timing issue is expected at this point, but everything else should work.

---

## Task 11 — Gate `HeroSection` scramble on `intro:revealed`

**Rationale:** Currently scramble starts on mount (unlocking the page after 2.5s fallback). With the intro in place, scramble should wait for the circular reveal to start so the user sees "we haven't crossed the 16% yet" framed by the reveal animation.

**Files:**
- Modify: `src/components/home/HeroSection.tsx`

### Steps

- [ ] **Step 11.1: Update `StaggeredScramble` to accept a deferred start**

Open `src/components/home/HeroSection.tsx`. Find the `StaggeredScramble` function (around line 27):

```tsx
function StaggeredScramble({ onComplete }: { onComplete?: () => void }) {
  const [displayed, setDisplayed] = useState(['', '', '']);
  const [visible, setVisible] = useState([false, false, false]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settledRef = useRef(0);

  const startScramble = useCallback((index: number) => {
    // ... existing implementation unchanged ...
  }, [onComplete]);

  useEffect(() => {
    // Capture the ref arrays at effect-setup time so the cleanup closure
    // does not read `.current` at teardown (which React flags as unsafe
    // because a ref can be reassigned mid-lifecycle). The arrays themselves
    // are shared by identity with `timeoutsRef.current` / `intervalsRef.current`,
    // so `.push` calls made later by `startScramble` are still captured here.
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;

    // Schedule each character's scramble start
    DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => startScramble(i), delay);
      timeouts.push(t);
    });

    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [startScramble]);
```

Replace the entire `useEffect` block inside `StaggeredScramble` with a version that waits for `intro:revealed`:

```tsx
  useEffect(() => {
    // Capture the ref arrays at effect-setup time so the cleanup closure
    // does not read `.current` at teardown (which React flags as unsafe
    // because a ref can be reassigned mid-lifecycle). The arrays themselves
    // are shared by identity with `timeoutsRef.current` / `intervalsRef.current`,
    // so `.push` calls made later by `startScramble` are still captured here.
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;

    const scheduleAllChars = () => {
      DELAYS.forEach((delay, i) => {
        const t = setTimeout(() => startScramble(i), delay);
        timeouts.push(t);
      });
    };

    // If the intro did not run (reduced-motion or session repeat), start
    // the scramble immediately — there is no data-intro-active attribute.
    const introActive = document.documentElement.dataset.introActive === 'true';
    let revealListener: (() => void) | null = null;

    if (!introActive) {
      scheduleAllChars();
    } else {
      revealListener = () => {
        scheduleAllChars();
        if (revealListener) {
          window.removeEventListener('intro:revealed', revealListener);
          revealListener = null;
        }
      };
      window.addEventListener('intro:revealed', revealListener);
    }

    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      if (revealListener) {
        window.removeEventListener('intro:revealed', revealListener);
      }
    };
  }, [startScramble]);
```

- [ ] **Step 11.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 11.3: Manual browser smoke — verify scramble timing**

```bash
pnpm dev
```

Open `http://localhost:3000` and confirm:
1. Intro plays with logo fill
2. Circular reveal begins
3. Scramble starts AT (or shortly after) the reveal, not before
4. Scramble completes, page is interactive
5. No console errors

Also test reduced-motion:
- In Chrome DevTools → Rendering panel → "Emulate CSS media feature prefers-reduced-motion" → `reduce`
- Hard reload. Intro should skip entirely and scramble should start immediately.

- [ ] **Step 11.4: Commit**

```bash
git add src/components/home/HeroSection.tsx
git commit -m "feat(HeroSection): gate scramble on intro:revealed event

Scramble now waits for the circular reveal to start before scheduling
its three-character timer chain. The existing unlockPage safety net
(2.5s fallback) is preserved. When the intro was skipped (reduced-
motion or session repeat), scramble starts immediately on mount as
before."
```

---

## Task 12 — Apply `isNearby` gate to mobile `ThesisSectionMobile`

**Rationale:** Phase 2 core change. Currently all 6 mobile thesis slides mount concurrently (6 WebGL contexts). Mirroring the desktop `isNearby` behavior drops this to max 3 active thesis contexts at any time.

**Files:**
- Modify: `src/components/home/ThesisSectionMobile.tsx`

### Steps

- [ ] **Step 12.1: Replace the `isActive`-only gate with an `isNearby` gate**

Open `src/components/home/ThesisSectionMobile.tsx`. Find the Swiper map block (around lines 423-448):

```tsx
          {THESIS_STATES.map((state, index) => {
            // NOTE on WebGL mounting: the `isActive` gate below is VISUAL only.
            // `state.mobileContent` (including `<MobileAscii>` → `<AsciiCanvas>`)
            // is rendered in BOTH branches — the inactive branch just wraps it in
            // `opacity-0`. AsciiCanvas uses an IntersectionObserver with
            // `rootMargin: '200px'`, which is geometric and ignores opacity, so
            // all 6 canvases initialize concurrently whenever thesis is in view.
            // We rely on AsciiCanvas's `MAX_ACTIVE_CONTEXTS = 10` global budget
            // for headroom. True single-canvas mounting would require a real
            // unmount of inactive subtrees, which would introduce a visible
            // re-init delay on every slide change — avoid unless iPhone-verified.
            const isActive = index === activeIndex;
            return (
              <SwiperSlide key={state.id} className="!flex items-center justify-center">
                <div className="max-w-[1034px] px-[22px] text-center">
                  {isActive ? (
                    state.mobileContent
                  ) : (
                    <div className="opacity-0" aria-hidden="true">
                      {state.mobileContent}
                    </div>
                  )}
                </div>
              </SwiperSlide>
            );
          })}
```

Replace with:

```tsx
          {THESIS_STATES.map((state, index) => {
            // WebGL mounting via isNearby gate (Phase 2, see design spec §6.2-6.3):
            //
            // Previously all 6 slides mounted MobileAscii → AsciiCanvas
            // concurrently, consuming 6 WebGL contexts on mobile even though
            // only one was visible at a time. With the intro preload in
            // place, all 6 videos are pre-warmed in videoPool regardless.
            //
            // Now only the active slide and its immediate neighbors render
            // MobileAscii. Non-nearby slides render an aria-hidden empty
            // placeholder that preserves the Swiper slide footprint without
            // spinning up a canvas.
            //
            // Swiper crossfade is 400ms; new canvas init with a warmed
            // video is ~50-150ms, comfortably under the fade window.
            const isActive = index === activeIndex;
            const isNearby = Math.abs(index - activeIndex) <= 1;
            return (
              <SwiperSlide key={state.id} className="!flex items-center justify-center">
                <div className="max-w-[1034px] px-[22px] text-center">
                  {isNearby ? (
                    <div
                      className={isActive ? '' : 'opacity-0'}
                      aria-hidden={!isActive}
                    >
                      {state.mobileContent}
                    </div>
                  ) : (
                    <div className="opacity-0" aria-hidden="true" />
                  )}
                </div>
              </SwiperSlide>
            );
          })}
```

- [ ] **Step 12.2: Verify types and lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: clean pass.

- [ ] **Step 12.3: Manual browser smoke — mobile thesis swipe behavior**

Critical check — this is the highest-risk change in the plan.

```bash
pnpm dev
```

Open `http://localhost:3000` in Chrome. Use DevTools device emulation (iPhone 14 Pro Max recommended) and:

1. Complete the intro (should be smooth)
2. Scroll down to the thesis section
3. Swipe up through slides 1 → 2 → 3 → 4 → 5 → 6 → 7
4. Verify: each slide's ASCII art appears instantly when becoming active (no pulse placeholder)
5. Swipe back up: 7 → 6 → 5 → 4 → 3 → 2 → 1
6. Verify: same smoothness in reverse
7. Open the Performance tab and reload — confirm WebGL context count in the Memory tab stays ≤ 8
8. Open the Console — verify no errors or context-loss warnings

Also test the edge exit behavior from `ThesisSectionMobile`:
- On slide 7, swipe down → should exit to `ThesisGraph`
- Scroll back up → should re-enter thesis at slide 7

- [ ] **Step 12.4: Commit**

```bash
git add src/components/home/ThesisSectionMobile.tsx
git commit -m "perf(ThesisSectionMobile): gate thesis slides with isNearby (Phase 2)

Replace the per-slide opacity-only gate with a real unmount of non-
nearby slides. The active slide and its immediate neighbors (±1) are
the only ones that render MobileAscii → AsciiCanvas, reducing mobile
concurrent WebGL contexts from 6 to max 3 for the thesis section.

With videoPool pre-warming, a newly-nearby slide's canvas init uses
the cached video element and completes within Swiper's 400ms crossfade
window, so the transition remains flicker-free.

Total mobile contexts after this change: 1 (hero) + 3 (thesis nearby)
+ 1 (graph) + 1 (map) + 2 (products) = 8, well under the bumped 14
budget."
```

---

## Task 13 — Final verification checkpoint

**Rationale:** Full production build + comprehensive manual smoke across browsers and scenarios.

**Files:** None modified — verification only. Any fix surfaces as a follow-up commit.

### Steps

- [ ] **Step 13.1: Run a clean production build**

```bash
pnpm build
```

Expected output: `✓ Compiled successfully`, no type errors, no warnings. Copy any warnings into a note and verify they are pre-existing (not caused by this change).

- [ ] **Step 13.2: Run the production build locally**

```bash
pnpm start
```

Default port 3000. Open `http://localhost:3000`.

- [ ] **Step 13.3: Desktop Chrome smoke test**

Complete this checklist in Chrome desktop (Mac or equivalent):

1. [ ] First visit: intro plays (logo fill → reveal), scramble starts on reveal, completes cleanly
2. [ ] Scroll down through thesis slides — each transitions without pulse placeholders
3. [ ] ThesisGraph section shows ASCII immediately
4. [ ] ProductMap section shows world map ASCII immediately
5. [ ] Nevada TV and Nevada Trade product cards show ASCII immediately
6. [ ] Scroll back up — no re-init pulses
7. [ ] Theme toggle (header) — light ↔ dark works, all ASCII re-renders with new atlas
8. [ ] Click "/about" in header — navigates, no broken intro state
9. [ ] Browser back to "/" — intro skipped (sessionStorage.introSeen), content visible immediately
10. [ ] Open DevTools → Application → Session Storage → `introSeen` is `1`
11. [ ] Clear sessionStorage → hard reload → intro plays again

- [ ] **Step 13.4: Desktop Safari smoke test**

Same checklist as Step 13.3 in Safari desktop. Pay extra attention to:
- Circular reveal smoothness (Safari clip-path occasional stutter)
- Theme toggle after reveal — no atlas flash
- Video playback in thesis (Safari may pause hidden videos)

- [ ] **Step 13.5: Mobile emulation smoke test**

In Chrome DevTools → device toolbar → iPhone 14 Pro Max. Reload. Run the desktop checklist plus:

1. [ ] Thesis Swiper vertical swipe through slides 1-7
2. [ ] Swipe back up through slides 7-1
3. [ ] Edge exit: swipe down past slide 7 → lands on ThesisGraph
4. [ ] Scroll up from ThesisGraph → re-enters thesis at slide 7
5. [ ] Hamburger menu opens, navigation links work, close button works

- [ ] **Step 13.6: Accessibility check**

In Chrome DevTools → Rendering panel:

1. [ ] "Emulate CSS media feature prefers-reduced-motion" → `reduce` → hard reload → intro skipped, content immediately visible
2. [ ] Restore to default
3. [ ] Tab key navigates through header nav items, focus outlines visible
4. [ ] Skip-to-content link appears on focus

- [ ] **Step 13.7: Slow network check**

In Chrome DevTools → Network → throttling → "Slow 4G". Hard reload `http://localhost:3000`:

1. [ ] Intro plays, but longer — reaches closer to 2.5s hardcap
2. [ ] After 2.5s the reveal fires even if some canvases are still warming
3. [ ] No JavaScript errors
4. [ ] Any still-warming canvases fall back to normal lazy init (pulse → canvas) gracefully

Restore throttling to "No throttling" after.

- [ ] **Step 13.8: Investigate and commit any follow-up fixes**

If any checklist item failed, debug and commit each fix as a separate `fix:` commit. Re-run the relevant smoke step after each fix.

If everything passed, no commit needed for this task.

- [ ] **Step 13.9: Summary commit / branch ready for review**

Confirm the branch log is clean and push:

```bash
git log --oneline giwook-han/improve-performance ^main
```

Expected: 13-15 commits (one per task + any fixes). Each commit should have a clear conventional-commit subject.

Do NOT push or open a PR in this step — the user will drive that decision. Just confirm the branch is in a ready state.

---

## Self-Review Checklist

Before handing off to execution, the plan was reviewed against these criteria:

- [x] **Spec coverage:** Each Phase 1 + Phase 2 requirement in the design spec maps to a task. Cross-reference:
  - §5.3 IntroOverlay → Task 7
  - §5.4 LogoFillSvg → Task 6
  - §5.5 circular reveal → Task 9 (CSS) + Task 8 (GSAP)
  - §5.6 IntroOrchestrator → Task 8
  - §5.7 videoPool → Task 1
  - §5.8 AsciiCanvas preloadKey + MAX 14 → Task 4
  - §5.9 texturedMesh + AscMosaic dispose guard → Task 3
  - §5.10 HeroSection intro:revealed gate → Task 11
  - §5.11 layout inline script sessionStorage + reduced-motion → Task 10
  - §6.2 MAX_ACTIVE_CONTEXTS bump → Task 4
  - §6.3 ThesisSectionMobile isNearby → Task 12
  - §7 Side effect audit → manual verification in Task 13
- [x] **No placeholders:** Every task body contains concrete code, exact file paths, and runnable commands.
- [x] **Type consistency:** `preloadKey` is `string` throughout. `markAsciiReady` / `getReadyKeys` / `HOMEPAGE_ASCII_TARGETS` / `computeExpectedReadyKeys` are all exported from `@/lib/introState`. `videoPool` exports `warmup`, `warmupAll`, `get`, `isPooled`. Refs are `RefObject<HTMLElement | null>` / `RefObject<SVGRectElement | null>` etc. (React 19 rules).
- [x] **TDD adaptation:** This project has no test framework (spec §8.4 confirms). Verification at each task is `pnpm exec tsc --noEmit && pnpm lint` plus manual browser smoke at key checkpoints (Tasks 10.8, 11.3, 12.3, 13.x). A full `pnpm build` runs at Tasks 10.6 and 13.1.
- [x] **Frequent commits:** Each task ends with a commit. No task combines more than one logical concern.
- [x] **YAGNI:** The `WebGLWarmup` provider was removed in the spec self-review and does not appear here. No speculative abstractions.
- [x] **Blast radius awareness:** The highest-risk tasks are Task 3 (AscMosaic library mutation) and Task 12 (Thesis mobile gate). Both have explicit manual smoke checkpoints.

---

## Appendix — Commit Summary Expected at End

```
a6201f2 docs: add intro loader + WebGL pre-warming design spec
5c155e9 docs: apply approved changes to intro loader spec
<new>   docs: add intro loader implementation plan
<new>   feat(videoPool): add global HTMLVideoElement warmup pool
<new>   feat(introState): add shared ready state + React hooks
<new>   feat(ascmosaic): honour videoPool for texture swap + dispose
<new>   feat(AsciiCanvas): integrate videoPool + preloadKey + bump context budget
<new>   feat(ascii): propagate preloadKey + eager to all homepage subcomponents
<new>   feat(intro): add LogoFillSvg with mask-based fill animation
<new>   feat(intro): add IntroOverlay presentation container
<new>   feat(intro): add IntroOrchestrator state machine
<new>   feat(intro): add clip-path gate + overlay styles in globals.css
<new>   feat(layout): wire intro overlay + orchestrator, remove AssetPrefetcher
<new>   feat(HeroSection): gate scramble on intro:revealed event
<new>   perf(ThesisSectionMobile): gate thesis slides with isNearby (Phase 2)
<new>   (optional) fix: ... any follow-up fixes from Task 13
```

Total: 13-15 commits on `giwook-han/improve-performance` branch.
