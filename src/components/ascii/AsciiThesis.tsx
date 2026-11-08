'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { setRouteVisualReady } from '@/lib/introState';
import { ATLASES, THESIS_SLIDE_VIDEOS } from '@/lib/siteAssets';
import { useTheme } from '@/components/providers/ThemeProvider';

const AsciiCanvas = dynamic(
  () => import('./AsciiCanvas').then((mod) => ({ default: mod.AsciiCanvas })),
  { ssr: false, loading: () => <div className="w-full h-full" /> }
);


const THESIS_ASCII_CONFIG: Record<number, { textureUrl: string; minBrightness: number; maxBrightness: number; scale: number }> = {
  1: { textureUrl: THESIS_SLIDE_VIDEOS[0], minBrightness: 0, maxBrightness: 33, scale: 4.8 },
  2: { textureUrl: THESIS_SLIDE_VIDEOS[1], minBrightness: 0, maxBrightness: 28, scale: 4.8 },
  3: { textureUrl: THESIS_SLIDE_VIDEOS[2], minBrightness: 10, maxBrightness: 100, scale: 4.8 },
  4: { textureUrl: THESIS_SLIDE_VIDEOS[3], minBrightness: 0, maxBrightness: 30, scale: 4.8 },
  5: { textureUrl: THESIS_SLIDE_VIDEOS[4], minBrightness: 38, maxBrightness: 0, scale: 8.8 },
  6: { textureUrl: THESIS_SLIDE_VIDEOS[5], minBrightness: 29, maxBrightness: 0, scale: 4.8 },
};

interface AsciiThesisProps {
  stateNumber: 1 | 2 | 3 | 4 | 5 | 6;
}

/** Thesis inline ASCII art — flat plane, mouse avoid */
export function AsciiThesis({ stateNumber }: AsciiThesisProps) {
  const { theme } = useTheme();
  const liveState = useRef<number | null>(null);
  useLayoutEffect(() => {
    liveState.current = stateNumber;
    if (stateNumber === 1) setRouteVisualReady('/thesis#thesis', false);
    return () => {
      liveState.current = null;
      if (stateNumber === 1) setRouteVisualReady('/thesis#thesis', false);
    };
  }, [stateNumber]);
  const handleReady = useCallback(() => {
    if (liveState.current === 1 && stateNumber === 1) setRouteVisualReady('/thesis#thesis', true);
  }, [stateNumber]);
  const config = THESIS_ASCII_CONFIG[stateNumber];
  if (!config) return null;

  // Light: the filled-cell sheet prints each tile as a halftone square on the
  // card. Dark: those light fills read as white stickers on the charcoal card,
  // so dark uses the transparent dark sheet (same 12x3 layout as F_4-1).
  const cellUrl = ATLASES[theme].thesis;

  return (
    <AsciiCanvas
      textureUrl={config.textureUrl}
      mosaicCellUrl={cellUrl}
      className="absolute inset-0 h-full w-full"
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
      renderScale={4.5}
      onReady={handleReady}
      eager
    />
  );
}
