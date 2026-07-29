'use client';

import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';
import {
  getContainedMapScale,
  MAP_PLANE_HEIGHT,
  MAP_PLANE_WIDTH,
} from './mapGeometry';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

// Match the source texture's effective 3:2 artboard so the whole map remains
// visible. The small difference from 2048:1365 is below one source pixel at
// the rendered size and avoids coupling layout to the asset's raw dimensions.
const CONTAINED_SCALE = getContainedMapScale();
const MOBILE_QUERY = '(max-width: 767px)';

function subscribeToMobileQuery(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getIsMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerIsMobile(): boolean {
  return false;
}

/** World Map — Figma: Light F_2-1, Dark F_2-2 */
export function AsciiMapCanvas() {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_2-2.png'
    : '/resource/Monotone Cell F_2-1.png';

  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    getIsMobile,
    getServerIsMobile,
  );

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
      scale={CONTAINED_SCALE}
      setSelectionMode="offsetRow"
      offsetRowRadius={20}
      noiseIntensity={0.02}
      noiseFPS={9}
      minBrightness={62}
      maxBrightness={76}
      planeWidth={MAP_PLANE_WIDTH}
      planeHeight={MAP_PLANE_HEIGHT}
      preloadKey="map"
      eager
    />
  );
}
