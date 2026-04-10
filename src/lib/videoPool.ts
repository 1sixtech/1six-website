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
