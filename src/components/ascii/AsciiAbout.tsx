'use client';

import dynamic from 'next/dynamic';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false, loading: () => <div className="w-full h-full" /> }
);


const ABOUT_ASCII_CONFIG: Record<number, { textureUrl: string; minBrightness: number; maxBrightness: number; scale: number }> = {
  1: { textureUrl: '/resource/Source_About 01.mp4', minBrightness: 0, maxBrightness: 33, scale: 4.8 },
  2: { textureUrl: '/resource/Source_About 02.mp4', minBrightness: 0, maxBrightness: 28, scale: 4.8 },
  3: { textureUrl: '/resource/Source_About 03.mp4', minBrightness: 10, maxBrightness: 100, scale: 4.8 },
  4: { textureUrl: '/resource/Source_About 04.mp4', minBrightness: 0, maxBrightness: 30, scale: 4.8 },
  5: { textureUrl: '/resource/Source_About 05.mp4', minBrightness: 38, maxBrightness: 0, scale: 8.8 },
  6: { textureUrl: '/resource/Source_About 06.mp4', minBrightness: 29, maxBrightness: 0, scale: 4.8 },
};

interface AsciiAboutProps {
  stateNumber: 1 | 2 | 3 | 4 | 5 | 6;
}

/** About inline ASCII art — flat plane, mouse avoid */
export function AsciiAbout({ stateNumber }: AsciiAboutProps) {
  const config = ABOUT_ASCII_CONFIG[stateNumber];
  if (!config) return null;

  return (
    <AsciiCanvas
      textureUrl={config.textureUrl}
      mosaicCellUrl="/resource/Monotone Cell F_4-1.png"
      width={110}
      height={110}
      mosaicSize={9}
      shape="plane"
      orthographic={false}
      mouseInteraction
      cellCount={12}
      scale={config.scale}
      setCount={3}
      noiseFPS={1}
      minBrightness={config.minBrightness}
      maxBrightness={config.maxBrightness}
      avoidRadius={90}
      avoidStrength={13}
      planeWidth={4}
      planeHeight={4}
      renderWidth={500}
      renderHeight={500}
    />
  );
}
