'use client';

import { useState } from 'react';
import { AsciiTeamSymbol } from '@/components/ascii/AsciiTeamSymbol';

export function TeamHero() {
  const [symbolReady, setSymbolReady] = useState(false);

  return (
    <section
      className="flex max-md:h-[100dvh] flex-col items-center max-md:justify-center gap-6 md:gap-8 px-[22px] md:px-6 md:pt-[105px] md:pb-24"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <p className="text-[14px] md:text-[20px] font-normal tracking-[-0.28px] md:tracking-[-0.4px] text-[var(--color-sub-text1)]">
        OUR TEAM
      </p>

      {/* 1SIX ASCII symbol — fades in once loaded */}
      <div
        className="flex h-[208px] w-[208px] items-center justify-center transition-opacity duration-700 ease-out"
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
        <span className="text-[var(--color-accent)]">crypto diehards.</span>
        <br />
        we do not like to ruminate about ideals for days and nights.
        <br />
        we prefer to{' '}
        <span className="text-[var(--color-accent)]">take actions</span>
        {' '}to make our dreams come true.
        <br />
        we bring experience from Harvard, Ethereum, PhD Programs,
        <br />
        world level competitive programming (ICPC World Finals), Sniper Special Forces,
        <br />
        and many other exotic areas of lives to cross the first{' '}
        <span className="text-[var(--color-accent)]">16%.</span>
      </p>
    </section>
  );
}
