'use client';

import { useSyncExternalStore } from 'react';
import { ScrollRevealWrapper } from '@/components/ui/ScrollRevealWrapper';
import { AsciiGraphCanvas } from '@/components/ascii/AsciiGraph';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribeToMobileQuery(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

const getIsMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerIsMobile = () => false;

export function ThesisGraph() {
  const isMobile = useSyncExternalStore(subscribeToMobileQuery, getIsMobile, getServerIsMobile);

  return (
    <section
      id="thesis-graph"
      className="relative flex h-svh w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/* ASCII graph background — on mobile offset camera to show the right side (curve) */}
      <div className="absolute inset-0 opacity-50" aria-hidden="true">
        <AsciiGraphCanvas cameraOffsetX={isMobile ? 3 : 0} />
      </div>

      <ScrollRevealWrapper duration={1}>
        <p
          className="relative z-10 max-w-[328px] md:max-w-[1034px] px-[22px] md:px-0 text-center text-[24px] md:text-[36px] font-normal leading-[1.3] tracking-[-0.48px] md:tracking-[-0.72px] text-balance"
          style={{ color: 'var(--color-text)' }}
        >
          1six exists to drive the industry to <span className="text-[var(--color-accent)]">cross the chasm.</span>
        </p>
      </ScrollRevealWrapper>
    </section>
  );
}
