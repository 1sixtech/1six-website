'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

/** Team symbol — Figma: Light F_5-2, Dark F_5-1 (reversed!) */
export function AsciiTeamSymbol({ onReady }: { onReady?: () => void }) {
  const { theme } = useTheme();
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_5-1.png'
    : '/resource/Monotone Cell F_5-2.png';

  return (
    <AsciiCanvas
      eager
      textureUrl="/resource/Source_Team symbol.mp4"
      mosaicCellUrl={cellUrl}
      width={208}
      height={208}
      mosaicSize={9}
      shape="plane"
      orthographic
      cellCount={12}
      scale={4.2}
      setCount={3}
      noiseIntensity={0.03}
      noiseFPS={1}
      noiseFPSRandom={0.8}
      minBrightness={27}
      maxBrightness={0}
      planeWidth={4}
      planeHeight={4}
      renderWidth={500}
      renderHeight={500}
      onReady={onReady}
    />
  );
}
