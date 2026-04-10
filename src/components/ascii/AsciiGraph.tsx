'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Graph section — Figma: Light F_2-1, Dark F_2-2 */
export function AsciiGraphCanvas({ cameraOffsetX = 0 }: { cameraOffsetX?: number }) {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_2-2.png'
    : '/resource/Monotone Cell F_2-1.png';

  return (
    <AsciiCanvas
      textureUrl="/resource/Source_Graph.mp4"
      textureType="video"
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      shape="plane"
      orthographic
      cameraOffsetX={cameraOffsetX}
      cellCount={3}
      scale={2.3}
      noiseIntensity={0.1}
      noiseFPS={7}
      minBrightness={100}
      maxBrightness={20}
      planeWidth={5.9}
      planeHeight={4}
      preloadKey="graph"
      eager
    />
  );
}
