/**
 * videoPool — Global HTMLVideoElement cache with reference counting.
 *
 * Pre-loads video elements during the intro phase so that AsciiCanvas
 * instances can reuse them instead of waiting on network + canplay.
 *
 * Lifecycle contract:
 *   1. `warmup(url)` creates a <video>, primes the decoder via a short
 *      play() burst, then pauses it. The video lives in the pool Map but
 *      is NOT playing until acquired.
 *   2. When an AsciiCanvas receives the video (via createVideoTexture's
 *      fast path) it calls `acquire(video)` which bumps the refcount
 *      and resumes playback.
 *   3. When the canvas's mosaic is disposed (AscMosaic.addModel
 *      replace or AscMosaic.dispose), the library calls `release(video)`
 *      which decrements the refcount and pauses the video if the count
 *      reaches zero. The video element is kept for potential reuse.
 *   4. When the user navigates away from the homepage, HomeIntroMount's
 *      route-leave effect calls `teardownVideoPool()` which pauses all
 *      pooled videos, clears their src, and empties the Map.
 *
 * The iOS Safari `#t=0.001` URL fragment is appended to force first-frame
 * decode even when the video is off-screen. The short play() burst during
 * warmup completes the canplay → VideoTexture pipeline; pausing
 * immediately afterward frees the decoder thread for other warmups until
 * a canvas actually acquires the video.
 *
 * AscMosaic's teardown paths must route through `release()` for pooled
 * videos (never `video.src = ''; video.load()`) — `isPooled(video)` tells
 * them which path to take.
 */

const pool = new Map<string, HTMLVideoElement>();
const warmupPromises = new Map<string, Promise<HTMLVideoElement>>();
const pooledVideos = new WeakSet<HTMLVideoElement>();
const refCount = new WeakMap<HTMLVideoElement, number>();

const WARMUP_TIMEOUT_MS = 8000;

/**
 * Warm up a single video URL. Returns a cached promise on repeat calls.
 * Resolves with the `HTMLVideoElement` once `canplay` fires AND `play()`
 * succeeds. Rejects on error or after `WARMUP_TIMEOUT_MS`.
 *
 * On rejection, the cached warmupPromise entry is cleared so a later
 * retry gets a fresh attempt instead of being permanently poisoned by a
 * transient failure (Codex review P2).
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
        // Prime complete — pause immediately. acquire() will resume
        // when a canvas takes ownership. This is the key difference
        // from the original implementation and directly addresses the
        // "10 videos decoding forever" leak: unacquired videos sit in
        // the pool at pause until needed.
        try {
          video.pause();
        } catch {
          // Some mobile browsers reject pause() immediately after
          // play(). Safe to ignore — the video is still in the pool
          // and acquire() will call play() unconditionally.
        }
        pool.set(url, video);
        pooledVideos.add(video);
        refCount.set(video, 0);
        resolve(video);
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        warmupPromises.delete(url);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      warmupPromises.delete(url);
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
 * paths to decide whether to route through `release()` (pooled) or to
 * fully kill the element (not pooled).
 */
export function isPooled(video: HTMLVideoElement): boolean {
  return pooledVideos.has(video);
}

/**
 * Acquire a pooled video for active use (called from the createVideoTexture
 * fast path). Bumps the refcount and resumes playback. Safe to call on
 * non-pooled videos — it is a no-op in that case.
 */
export function acquire(video: HTMLVideoElement): void {
  if (!pooledVideos.has(video)) return;
  refCount.set(video, (refCount.get(video) ?? 0) + 1);
  // Resume playback. play() returns a promise; rejection is ignored
  // (user-gesture policy, Low Power Mode). The VideoTexture will show
  // the last decoded frame if play stays blocked.
  void video.play().catch(() => {});
}

/**
 * Release a pooled video (called from AscMosaic's dispose paths).
 * Decrements the refcount. When the count reaches zero, pauses the video
 * to stop decoder work and GPU uploads. Safe to call on non-pooled videos.
 */
export function release(video: HTMLVideoElement): void {
  if (!pooledVideos.has(video)) return;
  const next = (refCount.get(video) ?? 0) - 1;
  if (next <= 0) {
    refCount.set(video, 0);
    try {
      video.pause();
    } catch {
      // Same as warmup — safe to ignore a transient pause rejection.
    }
  } else {
    refCount.set(video, next);
  }
}

/**
 * Tear down the entire pool — pauses and fully kills every pooled
 * element. Called by HomeIntroMount when the user navigates away from
 * `/`, so the pool does not leak across SPA routes. Safe to call
 * multiple times.
 */
export function teardownVideoPool(): void {
  for (const video of pool.values()) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // Ignore — best-effort cleanup.
    }
  }
  pool.clear();
  warmupPromises.clear();
  // refCount is a WeakMap; entries get collected when the video elements
  // themselves are GC'd. Nothing to clear explicitly.
}
