'use client';

import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useDevicePixelRatio } from '@/hooks/useDevicePixelRatio';
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

/**
 * Glyph pitch in CSS px. The phone follows its design (Figma 834:2920). On
 * desktop the 9px of the design read as a coarse grid of large glyphs; 6px
 * gives the map 168 glyphs across instead of 112, about 1.5x the detail, and
 * costs the same to draw: the fill is set by the canvas's pixels, not by how
 * many cells cut it up.
 */
const MOBILE_CELL = 5;
const DESKTOP_CELL = 6;

/**
 * Glyph weight (AsciiMosaicFilterOptions.cellGain). The strokes are about 6%
 * of a cell wide, so a 6px cell on a 1x screen draws them at a third of a
 * pixel: they need more lift there to read than at 12 device pixels on a 2x
 * screen. Between 1x and 2x the gain follows the pixel ratio. Tuned by eye
 * and by ink: at 1.9 the 1x strokes read as dark rings while the map stays
 * within a third of the 2x tone (2.2 made it half again as dark).
 */
const MOBILE_GAIN = 1.3;
const DESKTOP_GAIN_1X = 1.9;
const DESKTOP_GAIN_2X = 1.6;

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
  const devicePixelRatio = useDevicePixelRatio();
  const density = Math.min(1, Math.max(0, devicePixelRatio - 1));
  const desktopGain = DESKTOP_GAIN_1X + (DESKTOP_GAIN_2X - DESKTOP_GAIN_1X) * density;

  return (
    <AsciiCanvas
      textureUrl="/resource/Source_World map.webp"
      textureType="image"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={isMobile ? MOBILE_CELL : DESKTOP_CELL}
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
      // The atlas glyphs are 666px each: nearest-sampled into 5-6px cells on
      // a 1x canvas and stretched 2-3x by a phone or Retina screen, they broke
      // up and blurred. Output at up to 2x the CSS size (the scene target
      // stays at CSS pixels), draw each glyph at its exact pixel coverage,
      // and lift the strokes thin cells leave faint.
      pixelRatioCap={2}
      smoothCells
      cellGain={isMobile ? MOBILE_GAIN : desktopGain}
      // A still image: redraw on the noise ticks (9 a second), not on every
      // frame of a 120-240 Hz display.
      renderOnDemand
      preloadKey="map"
      eager
    />
  );
}
