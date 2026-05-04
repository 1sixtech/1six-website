'use client';

import { useState } from 'react';
import { AsciiTeamSymbol } from '@/components/ascii/AsciiTeamSymbol';

export function TeamHero() {
  const [symbolReady, setSymbolReady] = useState(false);

  return (
    // Keep the about hero height stable on mobile. `dvh` tracks browser UI
    // show/hide during fast flicks and causes visible scroll correction.
    <section
      className="flex max-md:h-svh flex-col items-center max-md:justify-center gap-6 md:gap-8 px-[22px] md:px-6 md:pt-[105px] md:pb-24"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <p className="text-[14px] md:text-[20px] font-normal tracking-[-0.28px] md:tracking-[-0.4px] text-[var(--color-sub-text1)]">
        OUR TEAM
      </p>

      {/* 1SIX ASCII symbol — fades in once loaded */}
      <div
        className="relative h-[208px] w-[208px] transition-opacity duration-700 ease-out"
        style={{ opacity: symbolReady ? 1 : 0 }}
      >
        <AsciiTeamSymbol onReady={() => setSymbolReady(true)} />
      </div>

      <h1
        className="text-center text-[28px] md:text-[36px] font-medium leading-[1.15] tracking-[-0.56px] md:tracking-[-0.72px]"
        style={{ color: 'var(--color-text)' }}
      >
        we don&apos;t dream. we{' '}
        <span className="text-[var(--color-accent)] md:text-[var(--color-text)]">build.</span>
      </h1>

      {/* Description — desktop only */}
      <p
        className="hidden md:block max-w-[850px] text-center text-[24px] font-normal leading-[1.3] tracking-[-0.48px]"
        style={{ color: 'var(--color-text)' }}
      >
        we are a team of{' '}
        <span className="text-[var(--color-accent)]">diehards.</span>
        <br />
        we don&apos;t spend days and nights ruminating on ideals.
        <br />
        we{' '}
        <span className="text-[var(--color-accent)]">take action</span>
        {' '}to make them real.
      </p>
      <p
        className="hidden md:block max-w-[850px] text-center text-[18px] font-normal leading-[1.3] tracking-[-0.48px]"
        style={{ color: 'var(--color-text)' }}
      >
        we bring experience from Harvard, Ethereum, PhD programs,
        <br />
        world-class competitive programming (ICPC World Finals), special forces,
        <br />
        and many other uncommon paths of life to cross the first{' '}
        <span className="text-[var(--color-accent)]">16%.</span>
      </p>
    </section>
  );
}
