/** Only visual assets used by live routes; retired media and font slices stay out. */
export const TEAM_VIDEO = '/resource/Source_Team symbol.mp4';
export const HERO_VIDEO = '/resource/Source_Desert.mp4';
export const GRAPH_VIDEO = '/resource/Source_Graph.mp4';
export const MAP_IMAGE = '/resource/Source_World map.webp';
export const THESIS_SLIDE_VIDEOS = Array.from({ length: 6 }, (_, index) =>
  `/resource/Source_About ${String(index + 1).padStart(2, '0')}.mp4`);
export const THESIS_VIDEOS = [HERO_VIDEO, ...THESIS_SLIDE_VIDEOS, GRAPH_VIDEO];
// The 9px sheets hold only the texels a 9-pixel cell samples from the exported
// 7992x1999 sheets (scripts/bake-mosaic-atlases.mjs), so a canvas no longer
// uploads 16 megapixels to draw a 76-110px tile.
export const ATLASES = {
  light: {
    hero: '/resource/Monotone Cell F_1-1.png',
    graph: '/resource/Monotone Cell F_2-1.png',
    thesis: '/resource/Monotone Cell F_4-1 9px.png',
    team: '/resource/Monotone Cell F_5-2 9px.png',
  },
  dark: {
    hero: '/resource/Monotone Cell F_1-2.png',
    graph: '/resource/Monotone Cell F_2-2.png',
    thesis: '/resource/Monotone Cell F_5-1 9px.png',
    team: '/resource/Monotone Cell F_5-1 9px.png',
  },
} as const;
export const SHARED_VISUAL_ASSETS = [...new Set([
  TEAM_VIDEO, ...THESIS_VIDEOS, MAP_IMAGE,
  ...Object.values(ATLASES.light), ...Object.values(ATLASES.dark),
])];

export function isVideoAsset(url: string): boolean {
  return url.endsWith('.mp4');
}

export function routeVisualAssets(pathname: string, theme: 'light' | 'dark'): string[] {
  if (pathname === '/') return [TEAM_VIDEO, ATLASES[theme].team];
  if (pathname === '/thesis') {
    return [...THESIS_VIDEOS, MAP_IMAGE, ATLASES[theme].hero, ATLASES[theme].graph, ATLASES[theme].thesis];
  }
  return [];
}

export function entryVisualAssets(pathname: string, theme: 'light' | 'dark'): string[] {
  if (pathname === '/') return [TEAM_VIDEO, ATLASES[theme].team];
  if (pathname === '/thesis') return [HERO_VIDEO, ATLASES[theme].hero];
  if (pathname === '/thesis#thesis') return [THESIS_SLIDE_VIDEOS[0], ATLASES[theme].thesis];
  if (pathname === '/thesis#products') return [MAP_IMAGE, ATLASES[theme].graph];
  return [];
}


/** Capture before ScrollToTop removes the hash during its passive effect. */
export function entryVisualTarget(pathname: string, hash: string): string {
  if (pathname === '/' && ['#products', '#origins', '#investors', '#contact'].includes(hash)) return pathname + hash;
  if (pathname === '/thesis' && ['#thesis', '#products'].includes(hash)) return pathname + hash;
  return pathname;
}
