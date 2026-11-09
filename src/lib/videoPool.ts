/**
 * videoPool — one HTMLVideoElement per URL, refcounted by the canvases using it.
 *
 * Lifecycle contract:
 *   1. `warmup(url)` creates a <video> and resolves once it has a decoded
 *      frame. Only a mounted canvas asks for one, so the page never decodes
 *      more videos than it shows: iOS has a limited number of hardware
 *      decoders, shared with whatever else the phone is doing.
 *   2. An AsciiCanvas receives the video (createVideoTexture) and calls
 *      `acquire(video)`, which bumps the refcount and resumes playback.
 *   3. When its mosaic is disposed, AscMosaic calls `release(video)`. The last
 *      release destroys the element, because a merely paused video still holds
 *      its decoder.
 *   4. On a route change PageEntry calls `teardownVideoPool()`, which cancels
 *      loads nobody will consume and destroys the rest.
 *
 * The #t=0.001 fragment makes iOS Safari decode the first frame of a video that
 * cannot play (Low Power Mode): a static frame still draws a correct mosaic.
 */

const pool = new Map<string, HTMLVideoElement>();
const warmupPromises = new Map<string, Promise<HTMLVideoElement>>();
const pooledVideos = new WeakSet<HTMLVideoElement>();
const refCount = new WeakMap<HTMLVideoElement, number>();

const pendingCancels = new Map<string, () => void>();
const WARMUP_TIMEOUT_MS = 8000;

function destroy(video: HTMLVideoElement): void {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Load a single video URL. Returns the cached promise on repeat calls. Resolves
 * with a decoded frame, even when autoplay is blocked. Rejects on error,
 * timeout, or route teardown, and clears the cached entry so a later retry gets
 * a fresh attempt.
 */
export function warmup(url: string): Promise<HTMLVideoElement> {
  const existing = warmupPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
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
      clearPending();
      warmupPromises.delete(url);
      destroy(video);
      reject(new Error(`videoPool: warmup timeout for ${url}`));
    }, WARMUP_TIMEOUT_MS);

    const clearPending = () => {
      clearTimeout(timeout);
      pendingCancels.delete(url);
      video.removeEventListener('canplay', onFrame);
      video.removeEventListener('loadeddata', onFrame);
      video.removeEventListener('error', onError);
    };
    // Any of these means a frame exists. Which one fires first varies: iOS can
    // hold `canplay` until playback starts, and frame callbacks can precede it.
    const onFrame = () => {
      if (settled) return;
      settled = true;
      clearPending();
      pool.set(url, video);
      pooledVideos.add(video);
      refCount.set(video, 0);
      resolve(video);
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      clearPending();
      warmupPromises.delete(url);
      const mediaErr = video.error;
      reject(new Error(`videoPool: load error for ${url}${mediaErr ? ` (code ${mediaErr.code})` : ''}`));
    };

    pendingCancels.set(url, () => {
      if (settled) return;
      settled = true;
      clearPending();
      destroy(video);
      reject(new Error(`videoPool: cancelled warmup for ${url}`));
    });
    video.addEventListener('canplay', onFrame, { once: true });
    video.addEventListener('loadeddata', onFrame, { once: true });
    video.addEventListener('error', onError, { once: true });
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(onFrame);
    video.load();
    // Ask to play before waiting for a frame: iOS may not buffer a video that
    // has not been asked to play, and waiting for `canplay` first can wait
    // forever. A blocked request (Low Power Mode) falls back to the #t frame.
    video.play().then(() => {
      try { if ((refCount.get(video) ?? 0) === 0) video.pause(); } catch {
        // Some mobile browsers reject pause() right after play(); acquire()
        // calls play() unconditionally when a canvas takes over.
      }
    }).catch(() => {});
  });

  warmupPromises.set(url, promise);
  return promise;
}

/**
 * True if `video` was created by `warmup()`. Used by AscMosaic's dispose paths
 * to decide whether to route through `release()` (pooled) or to fully kill the
 * element (not pooled).
 */
export function isPooled(video: HTMLVideoElement): boolean {
  return pooledVideos.has(video);
}

/**
 * Acquire a pooled video for active use (called from createVideoTexture). Bumps
 * the refcount and resumes playback. Safe to call on non-pooled videos — it is
 * a no-op in that case.
 */
export function acquire(video: HTMLVideoElement): void {
  if (!pooledVideos.has(video)) return;
  refCount.set(video, (refCount.get(video) ?? 0) + 1);
  // play() rejection is ignored (user-gesture policy, Low Power Mode). The
  // mosaic keeps uploading the decoded frame of a paused video.
  void video.play().catch(() => {});
}

/**
 * Release a pooled video (called from AscMosaic's dispose paths). The last
 * release destroys it. Safe to call on non-pooled videos.
 */
export function release(video: HTMLVideoElement): void {
  if (!pooledVideos.has(video)) return;
  const next = (refCount.get(video) ?? 0) - 1;
  if (next > 0) {
    refCount.set(video, next);
    return;
  }
  refCount.set(video, 0);
  for (const [url, pooled] of pool) {
    if (pooled === video) {
      pool.delete(url);
      warmupPromises.delete(url);
    }
  }
  destroy(video);
}

/**
 * Tear down the entire pool: cancel pending loads and destroy every pooled
 * element. Called by PageEntry on every route change. Safe to call repeatedly.
 */
export function teardownVideoPool(): void {
  for (const cancel of pendingCancels.values()) cancel();
  pendingCancels.clear();
  for (const video of pool.values()) destroy(video);
  pool.clear();
  warmupPromises.clear();
}
