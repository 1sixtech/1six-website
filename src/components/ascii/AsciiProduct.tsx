'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false }
);

interface AsciiProductProps {
  product: 'nevada-tv' | 'nevada-trade';
}

const PRODUCT_CONFIG = {
  'nevada-tv': {
    textureUrl: '/resource/Source_Nevada TV.mp4',
    scale: 4.1,
    minBrightness: 100,
    maxBrightness: 18,
    noiseIntensity: 1,
  },
  'nevada-trade': {
    textureUrl: '/resource/Source_Nevada Trade.mp4',
    scale: 2.5,
    minBrightness: 100,
    maxBrightness: 12,
    noiseIntensity: 0.22,
  },
} as const;

/** Product card ASCII — Figma: Light F_3-1, Dark F_3-2 */
export function AsciiProductCanvas({ product }: AsciiProductProps) {
  const { theme } = useTheme();
  const config = PRODUCT_CONFIG[product];
  const cellUrl = theme === 'dark'
    ? '/resource/Monotone Cell F_3-2.png'
    : '/resource/Monotone Cell F_3-1.png';

  return (
    <AsciiCanvas
      textureUrl={config.textureUrl}
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
      mosaicSize={7}
      shape="plane"
      orthographic={false}
      mouseInteraction
      cellCount={3}
      scale={config.scale}
      noiseFPS={9}
      noiseIntensity={config.noiseIntensity}
      minBrightness={config.minBrightness}
      maxBrightness={config.maxBrightness}
      avoidRadius={90}
      avoidStrength={13}
      planeWidth={4}
      planeHeight={4}
      renderScale={2}
      preloadKey={product}
      eager
    />
  );
}
