'use client';

import dynamic from 'next/dynamic';
import { ATLASES, GRAPH_VIDEO } from '@/lib/siteAssets';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Graph section — Figma: Light F_2-1, Dark F_2-2 */
export function AsciiGraphCanvas({ cameraOffsetX = 0 }: { cameraOffsetX?: number }) {
  const { theme } = useTheme();
  const cellUrl = ATLASES[theme].graph;

  return (
    <AsciiCanvas
      textureUrl={GRAPH_VIDEO}
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
      eager
    />
  );
}
