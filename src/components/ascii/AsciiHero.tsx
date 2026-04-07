'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Hero background — Figma: Light F_1-1, Dark F_1-2 */
export function AsciiHero({ onReady }: { onReady?: () => void }) {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_1-2.png'
    : '/resource/Monotone Cell F_1-1.png';

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
      planeWidth={5.9}
      planeHeight={4.1}
      scale={3.1}
      onReady={onReady}
    />
  );
}
