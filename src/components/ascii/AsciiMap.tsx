'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Must match AscMosaic's orthoSize */
const ORTHO_SIZE = 5;
const PLANE_W = 5.9;
const PLANE_H = 4;
const BLEED = 1.1;

function coverScale(aspect: number): number {
  return Math.max(
    (2 * ORTHO_SIZE * aspect) / PLANE_W,
    (2 * ORTHO_SIZE) / PLANE_H,
  ) * BLEED;
}

/** World Map — Figma: Light F_2-1, Dark F_2-2 */
export function AsciiMapCanvas() {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_2-2.png'
    : '/resource/Monotone Cell F_2-1.png';

  const [isMobile, setIsMobile] = useState(false);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    // Desktop renders the map into a fixed 2.2:1 contained box (Figma
    // 1010×460), so cover-fit to THAT aspect. Feeding the window aspect here —
    // while the camera frustum uses the container's — was the source of the
    // map/background ratio mismatch. Mobile keeps the full-bleed panel fit.
    const DESKTOP_MAP_ASPECT = 1010 / 460;
    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      const aspect = mobile ? window.innerWidth / window.innerHeight : DESKTOP_MAP_ASPECT;
      setScale(coverScale(aspect));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (!scale) return null;

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
}
