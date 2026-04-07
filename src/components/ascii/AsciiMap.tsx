'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** World Map — Figma: Light F_2-1, Dark F_2-2 */
export function AsciiMapCanvas() {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_2-2.png'
    : '/resource/Monotone Cell F_2-1.png';

  // Responsive scale: on mobile (narrow viewports) zoom in more so the map
  // fills the shorter/narrower canvas. Desktop keeps the original 3.3 scale.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <AsciiCanvas
      textureUrl="/resource/Source_World map.png"
      textureType="image"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={isMobile ? 7 : 9}
      shape="plane"
      orthographic
      cellCount={3}
      scale={3.3}
      setSelectionMode="offsetRow"
      offsetRowRadius={20}
      noiseIntensity={0.02}
      noiseFPS={9}
      minBrightness={62}
      maxBrightness={76}
      planeWidth={5.9}
      planeHeight={4}
    />
  );
}
