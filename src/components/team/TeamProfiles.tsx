'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTheme } from '@/components/providers/ThemeProvider';

/**
 * Team Profiles — institution logo grid
 * Desktop: all logos in a 4-col grid
 * Mobile: first 6 logos visible, "see more"/"hide" toggle for the rest
 */

const INSTITUTIONS = [
  { name: 'Needham', file: 'Needham.png' },
  { name: 'Schwarzman', file: 'Schwarzman.png' },
  { name: 'ICPC', file: '_ICPC.png' },
  { name: 'MIT', file: 'MIT.png' },
  { name: 'Harvard', file: 'Harvard.png' },
  { name: 'Codeforces', file: 'Codeforces.png' },
  { name: 'Ethereum', file: 'Ethereum.png' },
  { name: 'Starknet', file: 'Starknet.png' },
  { name: 'Tsinghua', file: 'Tsinghua.png' },
];

const MOBILE_INITIAL_COUNT = 6;

export function TeamProfiles() {
  const { theme, mounted } = useTheme();
  const mode = theme === 'dark' ? 'dark' : 'light';
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="pt-12 md:pt-16 pb-24 md:pb-[220px]" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-[1440px] px-[22px] md:px-12">
        <h2
          className="mb-12 md:mb-[103px] text-center text-[20px] md:text-[24px] font-medium leading-[1.2] tracking-[-0.4px] md:tracking-[-0.48px]"
          style={{ color: 'var(--color-text)' }}
        >
          driven by
          <br />
          expertise from the best
        </h2>

        {/* Desktop: 4-col flex grid, fixed card sizes matching Figma (4×207 + 3×20 = 888px) */}
        <div className="hidden md:flex flex-wrap gap-x-[20px] gap-y-[20px] max-w-[888px] mx-auto">
          {INSTITUTIONS.map((inst) => (
            <div
              key={inst.name}
              className="flex h-[98px] w-[207px] shrink-0 items-center justify-center px-4"
              style={{ backgroundColor: 'var(--color-card)' }}
            >
              {mounted && (
                <Image
                  src={`/logos/${mode}/team/${inst.file}`}
                  alt={inst.name}
                  width={140}
                  height={45}
                  className="max-h-[45px] w-auto object-contain"
                />
              )}
            </div>
          ))}
        </div>

        {/* Mobile: 2-col grid with smooth slide toggle */}
        <div className="mx-auto md:hidden">
          {/* Always-visible first batch */}
          <div className="grid grid-cols-2 gap-3">
            {INSTITUTIONS.slice(0, MOBILE_INITIAL_COUNT).map((inst) => (
              <div
                key={inst.name}
                className="flex h-[78px] items-center justify-center px-4"
                style={{ backgroundColor: 'var(--color-card)' }}
              >
                {mounted && (
                  <Image
                    src={`/logos/${mode}/team/${inst.file}`}
                    alt={inst.name}
                    width={120}
                    height={40}
                    className="max-h-[36px] w-auto object-contain"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Expandable overflow — slides open/closed */}
          <div
            className="grid transition-[grid-template-rows] duration-500 ease-in-out"
            style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 pt-3">
                {INSTITUTIONS.slice(MOBILE_INITIAL_COUNT).map((inst) => (
                  <div
                    key={inst.name}
                    className="flex h-[78px] items-center justify-center px-4"
                    style={{ backgroundColor: 'var(--color-card)' }}
                  >
                    <Image
                      src={`/logos/${mode}/team/${inst.file}`}
                      alt={inst.name}
                      width={120}
                      height={40}
                      className="max-h-[36px] w-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* see more / hide toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mx-auto mt-6 flex cursor-pointer flex-col items-center gap-1 text-[14px] tracking-[-0.14px] text-[var(--color-sub-text2)]"
          >
            <span>{expanded ? 'hide' : 'see more'}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            >
              <path
                d="M2 4.5L6 8.5L10 4.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
