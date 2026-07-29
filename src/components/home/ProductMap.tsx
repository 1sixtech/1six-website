'use client';

import { AsciiMapCanvas } from '@/components/ascii/AsciiMap';

/**
 * Product Map section with a contained ASCII world map.
 */
export function ProductMap() {
  return (
    <section
      className="mx-auto flex h-[540px] max-w-[1344px] items-center justify-center overflow-hidden md:h-[680px]"
      style={{
        backgroundColor: 'var(--color-card)',
      }}
    >
      {/* The source includes its own white safe area. At 75% canvas width the
          visible landmass occupies roughly 70% of the desktop panel. */}
      <div className="relative aspect-[3/2] w-[92%] md:w-[75%] md:max-w-[1010px]">
        <AsciiMapCanvas />
      </div>
    </section>
  );
}
