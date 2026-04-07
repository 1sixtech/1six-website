'use client';

import { useTheme } from '@/components/providers/ThemeProvider';

/**
 * Investors Section
 * Desktop: flex-wrap row of cards
 * Mobile (Figma): 2-col grid, 3 rows, with "and more industry leaders" footer
 *
 * Firm logos are single SVGs (black fill). In dark mode CSS filter: invert(1)
 * flips them to white.
 */

const INDIVIDUAL_INVESTORS = [
  { name: 'Naval Ravikant', role: 'Founder of AngelList' },
  { name: 'Charlie Songhurst', role: 'Facebook Board Member' },
  { name: 'Loi Luu', role: 'WBTC Creator' },
];

const FIRM_INVESTORS = [
  { name: 'Lambda', file: 'Lambda.svg', w: 95, h: 27, mw: 80, mh: 23 },
  { name: 'Lemniscap', file: 'Lemniscap.svg', w: 106, h: 22, mw: 90, mh: 19 },
  { name: 'Ergodic Group', file: 'Ergodic.svg', w: 137, h: 22, mw: 116, mh: 19 },
];

export function InvestorsSection() {
  const { theme } = useTheme();
  const invertFilter = theme === 'dark' ? 'invert(1)' : undefined;

  return (
    <section
      id="investors"
      className="pt-[70px] pb-[24px] md:h-[494px]"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      <div className="mx-auto max-w-[1440px] px-[22px] md:px-12">
        {/* Header */}
        <div className="mb-[60px] md:mb-[102px] text-center">
          <p className="text-[14px] md:text-[20px] font-normal tracking-[-0.28px] md:tracking-[-0.4px] text-[var(--color-sub-text1)]">
            INVESTORS
          </p>
          <h2
            className="text-[20px] md:text-[24px] font-medium leading-[1.3] md:leading-[1.2] tracking-[-0.4px] md:tracking-[-0.48px]"
            style={{ color: 'var(--color-text)' }}
          >
            backed by
            <br />
            global industry leaders
          </h2>
        </div>

        {/* Desktop: horizontal row of 6 cards */}
        <div className="hidden md:block">
          <div className="flex items-center justify-center gap-[10px] overflow-x-auto">
            {INDIVIDUAL_INVESTORS.map((investor) => (
              <div
                key={investor.name}
                className="flex h-[100px] w-[207px] shrink-0 flex-col items-center justify-center"
                style={{ backgroundColor: 'var(--color-bg)' }}
              >
                <span
                  className="text-[18px] font-normal tracking-[-0.36px]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {investor.name}
                </span>
                <span className="text-[12px] tracking-[-0.12px] text-[var(--color-sub-text1)]">
                  {investor.role}
                </span>
              </div>
            ))}
            {FIRM_INVESTORS.map((firm) => (
              <div
                key={firm.name}
                className="flex h-[100px] w-[207px] shrink-0 items-center justify-center"
                style={{ backgroundColor: 'var(--color-bg)' }}
              >
                <img
                  src={`/logos/${firm.file}`}
                  alt={firm.name}
                  width={firm.w}
                  height={firm.h}
                  className="object-contain"
                  style={{ width: firm.w, height: firm.h, filter: invertFilter }}
                />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[12px] tracking-[-0.12px] text-[var(--color-sub-text1)]">
            and more industry leaders
          </p>
        </div>

        {/* Mobile: 2-col grid, 3 rows */}
        <div className="md:hidden">
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: Individual investors */}
            {INDIVIDUAL_INVESTORS.slice(0, 2).map((investor) => (
              <div
                key={investor.name}
                className="flex h-[79px] flex-col items-center justify-center"
                style={{ backgroundColor: 'var(--color-bg)' }}
              >
                <span
                  className="text-[15px] font-normal tracking-[-0.3px]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {investor.name}
                </span>
                <span className="text-[12px] tracking-[-0.12px] text-[var(--color-sub-text2)]">
                  {investor.role}
                </span>
              </div>
            ))}

            {/* Row 2: Last individual + first firm */}
            <div
              className="flex h-[79px] flex-col items-center justify-center"
              style={{ backgroundColor: 'var(--color-bg)' }}
            >
              <span
                className="text-[15px] font-normal tracking-[-0.3px]"
                style={{ color: 'var(--color-text)' }}
              >
                {INDIVIDUAL_INVESTORS[2].name}
              </span>
              <span className="text-[12px] tracking-[-0.12px] text-[var(--color-sub-text2)]">
                {INDIVIDUAL_INVESTORS[2].role}
              </span>
            </div>
            <div
              className="flex h-[79px] items-center justify-center"
              style={{ backgroundColor: 'var(--color-bg)' }}
            >
              <img
                src={`/logos/${FIRM_INVESTORS[0].file}`}
                alt={FIRM_INVESTORS[0].name}
                width={FIRM_INVESTORS[0].mw}
                height={FIRM_INVESTORS[0].mh}
                className="object-contain"
                style={{ width: FIRM_INVESTORS[0].mw, height: FIRM_INVESTORS[0].mh }}
              />
            </div>

            {/* Row 3: Remaining firms */}
            {FIRM_INVESTORS.slice(1).map((firm) => (
              <div
                key={firm.name}
                className="flex h-[79px] items-center justify-center"
                style={{ backgroundColor: 'var(--color-bg)' }}
              >
                <img
                  src={`/logos/${firm.file}`}
                  alt={firm.name}
                  width={firm.mw}
                  height={firm.mh}
                  className="object-contain"
                  style={{ width: firm.mw, height: firm.mh }}
                />
              </div>
            ))}
          </div>

          {/* "and more" footer */}
          <p className="mt-8 text-center text-[12px] tracking-[-0.12px] text-[var(--color-sub-text1)]">
            and more industry leaders
          </p>
        </div>
      </div>
    </section>
  );
}
