import { entryVisualAssets, isVideoAsset, routeVisualAssets, SHARED_VISUAL_ASSETS } from './siteAssets';

// Images keep their warmed bytes as document-owned Blob URLs, so the real texture
// loader reuses them. Video never takes a Blob source: iOS Safari is unreliable
// with blob-backed media (WebKit 270772, 232076), and a canvas whose video cannot
// load has nothing to draw. No decoder or WebGL is created here.
const sources = new Map<string, string>();
const fetched = new Set<string>();
let active: AbortController | null = null;

export function warmedAssetSource(url: string): string {
  return sources.get(url) ?? url;
}

/** An entrance hint, never a claim that a canvas has rendered. */
export function hasWarmedEntry(pathname: string, theme: 'light' | 'dark'): boolean {
  const assets = entryVisualAssets(pathname, theme);
  return assets.length > 0 && assets.every((url) => fetched.has(url));
}

export function cancelAssetWarmup(): void {
  active?.abort();
  active = null;
}

/**
 * Whether a fetched video will be reused by a later <video>. Desktop media
 * stacks read the HTTP cache. A native iOS 27 probe downloaded the whole file
 * again as media Range requests, so warming video on a phone only spends data.
 */
function reusesFetchedVideo(): boolean {
  return !window.matchMedia('(pointer: coarse)').matches;
}

export async function warmSharedAssets(pathname: string, theme: 'light' | 'dark'): Promise<void> {
  cancelAssetWarmup();
  const run = new AbortController();
  active = run;
  const current = new Set(routeVisualAssets(pathname, theme));
  const warmsVideo = reusesFetchedVideo();
  const queue = SHARED_VISUAL_ASSETS.filter((url) => !current.has(url)
    && !fetched.has(url)
    && (warmsVideo || !isVideoAsset(url)));
  let next = 0;

  const worker = async () => {
    while (!run.signal.aborted && next < queue.length) {
      const url = queue[next++];
      const request = new AbortController();
      const abort = () => request.abort();
      run.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 8000);
      try {
        const response = await fetch(url, { signal: request.signal, priority: 'low' });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!request.signal.aborted && !run.signal.aborted && !fetched.has(url)) {
          fetched.add(url);
          if (!isVideoAsset(url)) sources.set(url, URL.createObjectURL(blob));
        }
      } catch {
        // Best effort only. A later route's normal loader still handles a miss.
      } finally {
        clearTimeout(timer);
        run.signal.removeEventListener('abort', abort);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (active === run) active = null;
}
