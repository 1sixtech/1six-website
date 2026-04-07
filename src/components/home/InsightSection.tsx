'use client';

import { useState } from 'react';

const INSIGHTS = [
  { id: '1', title: 'evaluating chain-of -thought monitorability', date: 'Jan 18, 2026', source: 'Nevada TV' },
  { id: '2', title: 'evaluating chain-of -thought monitorability', date: 'Dec 11, 2025', source: 'Nevada TV' },
  { id: '3', title: 'evaluating chain-of -thought monitorability', date: 'Nov 23, 2025', source: 'Nevada Trade' },
];

const TABS = ['All', 'Nevada TV', 'Nevada Trade'] as const;

export function InsightSection() {
  const [activeTab, setActiveTab] = useState<string>('All');
  const filtered = activeTab === 'All' ? INSIGHTS : INSIGHTS.filter((i) => i.source === activeTab);

  return (
    <section
      id="insight"
      className="w-full py-12 md:py-0 md:h-[656px]"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/*
        Mobile: normal flow with padding
        Desktop: absolute positioned like before (max-w-[1440px] relative container)
      */}
      <div className="mx-auto max-w-[1440px] md:relative md:h-full">
        {/* INSIGHT label */}
        <p className="text-center text-[14px] md:text-[20px] font-normal tracking-[-0.28px] md:tracking-[-0.4px] text-[var(--color-sub-text1)] mb-6 md:mb-0 md:absolute md:left-1/2 md:-translate-x-1/2 md:top-[70px]">
          INSIGHT
        </p>

        {/* Tab bar */}
        <div className="flex justify-center gap-4 mb-6 md:mb-0 md:absolute md:left-1/2 md:-translate-x-1/2 md:top-[147px]">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[12px] font-medium tracking-[-0.12px] transition-colors ${
                activeTab === tab ? 'text-[var(--color-text)]' : 'text-[var(--color-sub-text1)] hover:text-[var(--color-accent)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Articles */}
        <div className="px-[22px] md:px-0 md:absolute md:left-[275px] md:top-[183px] md:w-[890px]">
          {filtered.map((insight) => (
            <div key={insight.id}>
              <div className="h-[1px] w-full" style={{ backgroundColor: 'var(--color-sub-text2)', opacity: 0.2 }} />
              <div className="flex items-start justify-between py-4 md:py-5">
                <div>
                  <p
                    className="text-[18px] md:text-[24px] font-normal leading-[1.25] tracking-[-0.36px] md:tracking-[-0.48px]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {insight.title}
                  </p>
                  <p className="mt-1 md:mt-2 text-[12px] md:text-[14px] font-normal tracking-[-0.12px] md:tracking-[-0.14px] text-[var(--color-sub-text1)]">
                    {insight.date}  |  {insight.source}
                  </p>
                </div>
                <button className="mt-1 text-[16px] md:text-[20px] text-[var(--color-sub-text1)] transition-colors hover:text-[var(--color-accent)]" aria-label="Expand">
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* View All button */}
        <div className="flex justify-end px-[22px] mt-4 md:px-0 md:mt-0 md:absolute md:right-[275px] md:top-[476px]">
          <a
            href="#"
            className="inline-flex h-[38px] md:h-auto items-center justify-center rounded-[5px] md:rounded-[3px] px-4 md:px-3 py-2 text-[12px] font-normal tracking-[-0.12px] transition-colors bg-[var(--color-accent)] text-white md:bg-transparent md:text-[var(--color-accent)] md:border md:border-[var(--color-accent)] md:hover:bg-[var(--color-accent)] md:hover:text-white md:hover:border-[var(--color-accent)]"
          >
            View All
          </a>
        </div>
      </div>
    </section>
  );
}
