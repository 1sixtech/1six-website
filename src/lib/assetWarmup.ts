import { entryVisualAssets, routeVisualAssets, SHARED_VISUAL_ASSETS } from './siteAssets';

// A native iOS 27 probe fetched the full file, then Safari downloaded it again
// as media Range requests. Retain the warmed bytes as document-owned Blob URLs
// so the real texture/video consumer reuses them. No decoder or WebGL is created.
// The allowlist is ~1.14 MB; browser document teardown releases these URLs.
const sources = new Map<string, string>();
let active: AbortController | null = null;

export function warmedAssetSource(url: string): string {
  return sources.get(url) ?? url;
}

/** An entrance hint, never a claim that a canvas has rendered. */
export function hasWarmedEntry(pathname: string, theme: 'light' | 'dark'): boolean {
  const assets = entryVisualAssets(pathname, theme);
  return assets.length > 0 && assets.every((url) => sources.has(url));
}

export function cancelAssetWarmup(): void {
  active?.abort();
  active = null;
}

export async function warmSharedAssets(pathname: string, theme: 'light' | 'dark'): Promise<void> {
  cancelAssetWarmup();
  const run = new AbortController();
  active = run;
  const current = new Set(routeVisualAssets(pathname, theme));
  const queue = SHARED_VISUAL_ASSETS.filter((url) => !current.has(url) && !sources.has(url));
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
        if (!request.signal.aborted && !run.signal.aborted && !sources.has(url)) {
          sources.set(url, URL.createObjectURL(blob));
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
