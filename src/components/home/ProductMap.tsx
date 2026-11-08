'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { setRouteVisualReady } from '@/lib/introState';
import { AsciiMapCanvas } from '@/components/ascii/AsciiMap';

/**
 * The world map closes the homepage: the ASCII map is the figure, and its
 * caption names who it is for — the next 84%, the line the page title
 * promises.
 *
 * The canvas always shows the whole 3:2 source at its contained scale
 * (mapGeometry); only the box around it changes, so the framing never
 * depends on the window's aspect.
 * - Phones (Figma 834:2920): no panel. The map lies on the page ground,
 *   larger than the screen and cropped at both sides, framed as the design
 *   frames it (fitted to the Figma frame: the canvas 181vw wide, its centre
 *   14.9vw right of the screen's, so the Americas stay in view and Asia runs
 *   off the edge). The stage (89vw tall) is cut to the landmass band, which
 *   spans 70% of the source's height, so the empty safe area takes no room.
 * - Desktop (Figma 834:2992, ratio only): the panel is 16:9, the map centred
 *   in it at 75% of its width.
 */
export function ProductMap() {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    setRouteVisualReady('/thesis#products', false);
    return () => { mounted.current = false; setRouteVisualReady('/thesis#products', false); };
  }, []);
  const handleReady = useCallback(() => {
    if (mounted.current) setRouteVisualReady('/thesis#products', true);
  }, []);
  return (
    <figure className="m-0">
      <div className="relative h-[89vw] overflow-hidden md:mx-auto md:flex md:h-auto md:max-w-[1344px] md:items-center md:justify-center md:aspect-[16/9] md:bg-[var(--color-card)]">
        {/* The source includes its own white safe area. At 75% canvas width the
            visible landmass occupies roughly 65% of the desktop panel. */}
        <div
          className="world-map-canvas absolute top-1/2 left-[calc(50%+14.9vw)] aspect-[3/2] w-[181vw] -translate-x-1/2 -translate-y-1/2 md:relative md:top-auto md:left-auto md:w-[75%] md:max-w-[1010px] md:translate-x-0 md:translate-y-0"
          aria-hidden="true"
        >
          <AsciiMapCanvas onReady={handleReady} />
        </div>
      </div>
      <figcaption
        className="px-[22px] pt-6 pb-24 text-center text-[24px] font-normal leading-[1.25] tracking-[-0.02em] text-balance md:pt-10 md:pb-32 md:text-[36px]"
        style={{ color: 'var(--color-text)' }}
      >
        internet-native finance for <span className="text-[var(--color-accent)]">the next 84%.</span>
      </figcaption>
    </figure>
  );
}
