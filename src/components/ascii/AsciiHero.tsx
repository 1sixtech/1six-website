'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Must match AscMosaic's orthoSize (camera half-height in world units) */
const ORTHO_SIZE = 5;
const PLANE_W = 5.9;
const PLANE_H = 4.1;
const BLEED = 1.1; // 10% extra to avoid sub-pixel edge gaps

/**
 * Minimum model scale so the plane fully covers the orthographic frustum.
 * Works for any aspect ratio — standard 16:9, ultrawide 21:9, or 32:9.
 */
function coverScale(aspect: number): number {
  return Math.max(
    (2 * ORTHO_SIZE * aspect) / PLANE_W,
    (2 * ORTHO_SIZE) / PLANE_H,
  ) * BLEED;
}

/** Hero background — Figma: Light F_1-1, Dark F_1-2 */
export function AsciiHero({ onReady }: { onReady?: () => void }) {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_1-2.png'
    : '/resource/Monotone Cell F_1-1.png';

  // Compute scale on mount so the plane covers any viewport aspect ratio.
  // AsciiCanvas is ssr:false (dynamic import), so it won't mount until after
  // this effect fires — the correct scale is always used on first init.
  const [scale, setScale] = useState(0);
  useEffect(() => {
    setScale(coverScale(window.innerWidth / window.innerHeight));
  }, []);

  if (!scale) return null;

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
    />
  );
}
