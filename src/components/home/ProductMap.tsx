'use client';

import { AsciiMapCanvas } from '@/components/ascii/AsciiMap';

/**
 * The world map closes the homepage: the ASCII map is the figure, and its
 * caption names who it is for — the next 84%, the line the page title
 * promises. The map panel keeps its contained 3:2 geometry untouched.
 */
export function ProductMap() {
  return (
    <figure className="m-0">
      <div
        className="mx-auto flex max-w-[1344px] items-center justify-center overflow-hidden py-10 md:h-[680px] md:py-0"
        style={{
          backgroundColor: 'var(--color-card)',
        }}
      >
        {/* The source includes its own white safe area. At 75% canvas width the
            visible landmass occupies roughly 70% of the desktop panel. */}
        <div className="relative aspect-[3/2] w-[92%] md:w-[75%] md:max-w-[1010px]" aria-hidden="true">
          <AsciiMapCanvas />
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
