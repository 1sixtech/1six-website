'use client';

import { useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { AsciiMapCanvas } from '@/components/ascii/AsciiMap';
import { RollingNumber } from '@/components/ui/RollingNumber';

/**
 * Product Map section with ASCII world map and slot-machine stat counters.
 * Stats continuously spin random digits like a roulette (no real data yet).
 */
export function ProductMap() {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      ref={sectionRef}
      className="mx-auto flex h-[540px] md:h-[756px] max-w-[1344px] flex-col items-center justify-end overflow-hidden"
      style={{
        backgroundColor: 'var(--color-card)',
      }}
    >
      {/* ASCII world map */}
      <div className="relative flex-1 w-full overflow-hidden">
        <AsciiMapCanvas />
      </div>

      {/* Stats row: vertical on mobile (number first, label below per Figma),
          horizontal on desktop */}
      <div className="flex w-full flex-col items-center gap-6 px-[22px] pb-8 md:flex-row md:items-end md:justify-center md:gap-24 md:px-0">
        <div className="text-center">

           
        </div>
      </div>
    </section>
  );
}
