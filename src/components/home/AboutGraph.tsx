'use client';

import { useState, useEffect } from 'react';
import { ScrollRevealWrapper } from '@/components/ui/ScrollRevealWrapper';
import { AsciiGraphCanvas } from '@/components/ascii/AsciiGraph';

export function AboutGraph() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <section
      className="relative flex h-screen w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/* ASCII graph background — on mobile offset camera to show the right side (curve) */}
      <div className="absolute inset-0 opacity-30">
        <AsciiGraphCanvas cameraOffsetX={isMobile ? 3 : 0} />
      </div>

      <ScrollRevealWrapper y={30} duration={1}>
        <p
          className="relative z-10 max-w-[328px] md:max-w-[1034px] px-[22px] md:px-0 text-center text-[24px] md:text-[36px] font-normal leading-[1.3] tracking-[-0.48px] md:tracking-[-0.72px]"
          style={{ color: 'var(--color-text)' }}
        >
          1six exists to push the industry past that line.
        </p>
      </ScrollRevealWrapper>
    </section>
  );
}
