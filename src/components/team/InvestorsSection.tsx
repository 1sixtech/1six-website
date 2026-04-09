'use client';

/**
 * Investors Section — D4 "River" layout
 *
 * Desktop: CSS Grid 7-column (4 investors + 3 dividers), row 2 firms span with
 *          center divider aligned to row 1's middle divider.
 * Mobile:  CSS Grid 3-column (2 items + 1 divider), 3 rows of pairs.
 *
 * All text, no card backgrounds, no logos. Dividers use --color-divider.
 */

const INDIVIDUAL_INVESTORS = [
  { name: 'Naval Ravikant', role: 'Founder of AngelList' },
  { name: 'Charlie Songhurst', role: 'Facebook Board Member' },
  { name: 'Ken Ng', role: 'Uniswap Foundation\nCofounder' },
  { name: 'Loi Luu', role: 'WBTC Creator' },
];

const FIRM_INVESTORS = ['Lemniscap', 'Lambda'];

/* Shared vertical divider (both breakpoints) */
function Divider({ className = '' }: { className?: string }) {
  return (
    <div
      className={`justify-self-center self-center ${className}`}
      style={{ width: 1, backgroundColor: 'var(--color-divider)' }}
    />
  );
}

export function InvestorsSection() {
  return (
    <section
      id="investors"
      className="pt-[100px] pb-[100px]"
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      <div className="mx-auto max-w-[1440px] px-[22px] md:px-12">
        {/* Header */}
        <div className="mb-[50px] md:mb-[80px] text-center">
          <h2
            className="text-[20px] md:text-[24px] font-medium leading-[1.3] md:leading-[1.2] tracking-[-0.4px] md:tracking-[-0.48px]"
            style={{ color: 'var(--color-text)' }}
          >
            backed by
            <br />
            global industry leaders
          </h2>
        </div>

        {/* ── Desktop: 7-column grid ── */}
        <div className="hidden md:block">
          <div
            className="mx-auto grid max-w-[860px]"
            style={{
              gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr',
              rowGap: 40,
            }}
          >
            {/* Row 1 — Individual investors */}
            <InvestorCell
              name={INDIVIDUAL_INVESTORS[0].name}
              role={INDIVIDUAL_INVESTORS[0].role}
            />
            <Divider className="h-[28px]" />
            <InvestorCell
              name={INDIVIDUAL_INVESTORS[1].name}
              role={INDIVIDUAL_INVESTORS[1].role}
            />
            <Divider className="h-[28px]" />
            <InvestorCell
              name={INDIVIDUAL_INVESTORS[2].name}
              role={INDIVIDUAL_INVESTORS[2].role}
            />
            <Divider className="h-[28px]" />
            <InvestorCell
              name={INDIVIDUAL_INVESTORS[3].name}
              role={INDIVIDUAL_INVESTORS[3].role}
            />

            {/* Row 2 — Firms (span to align center divider) */}
            <div
              className="flex items-center justify-center"
              style={{ gridColumn: '1 / 4' }}
            >
              <span
                className="text-[18px] font-semibold tracking-[-0.2px] leading-none"
                style={{ color: 'var(--color-text)' }}
              >
                {FIRM_INVESTORS[0]}
              </span>
            </div>
            <Divider className="h-[28px]" />
            <div
              className="flex items-center justify-center"
              style={{ gridColumn: '5 / 8' }}
            >
              <span
                className="text-[18px] font-semibold tracking-[-0.2px] leading-none"
                style={{ color: 'var(--color-text)' }}
              >
                {FIRM_INVESTORS[1]}
              </span>
            </div>
          </div>

          <p
            className="mt-6 text-center text-[11px] tracking-[-0.1px]"
            style={{ color: 'var(--color-sub-text2)' }}
          >
            and more
          </p>
        </div>

        {/* ── Mobile: 3-column grid (M2 — 2-column pairs) ── */}
        <div className="md:hidden">
          <div
            className="grid"
            style={{
              gridTemplateColumns: '1fr 1px 1fr',
              rowGap: 20,
            }}
          >
            {/* Row 1 */}
            <InvestorCellMobile
              name={INDIVIDUAL_INVESTORS[0].name}
              role={INDIVIDUAL_INVESTORS[0].role}
            />
            <Divider className="h-[24px]" />
            <InvestorCellMobile
              name={INDIVIDUAL_INVESTORS[1].name}
              role={INDIVIDUAL_INVESTORS[1].role}
            />

            {/* Row 2 */}
            <InvestorCellMobile
              name={INDIVIDUAL_INVESTORS[2].name}
              role={INDIVIDUAL_INVESTORS[2].role}
            />
            <Divider className="h-[24px]" />
            <InvestorCellMobile
              name={INDIVIDUAL_INVESTORS[3].name}
              role={INDIVIDUAL_INVESTORS[3].role}
            />

            {/* Row 3 — Firms */}
            <div className="flex items-center justify-center py-[8px]">
              <span
                className="text-[14px] font-semibold tracking-[-0.15px] leading-none"
                style={{ color: 'var(--color-text)' }}
              >
                {FIRM_INVESTORS[0]}
              </span>
            </div>
            <Divider className="h-[24px]" />
            <div className="flex items-center justify-center py-[8px]">
              <span
                className="text-[14px] font-semibold tracking-[-0.15px] leading-none"
                style={{ color: 'var(--color-text)' }}
              >
                {FIRM_INVESTORS[1]}
              </span>
            </div>
          </div>

          <p
            className="mt-6 text-center text-[11px] tracking-[-0.1px]"
            style={{ color: 'var(--color-sub-text2)' }}
          >
            and more
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Desktop investor cell ── */
function InvestorCell({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-[4px]">
      <span
        className="text-[18px] font-semibold tracking-[-0.2px] leading-none"
        style={{ color: 'var(--color-text)' }}
      >
        {name}
      </span>
      <span
        className="mt-[6px] text-[9px] uppercase tracking-[0.2px] leading-[1.4] text-center whitespace-pre-line"
        style={{ color: 'var(--color-sub-text1)' }}
      >
        {role}
      </span>
    </div>
  );
}

/* ── Mobile investor cell ── */
function InvestorCellMobile({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-[8px]">
      <span
        className="text-[14px] font-semibold tracking-[-0.15px] leading-none"
        style={{ color: 'var(--color-text)' }}
      >
        {name}
      </span>
      <span
        className="mt-[4px] text-[8px] uppercase tracking-[0.2px] leading-[1.4] text-center whitespace-pre-line"
        style={{ color: 'var(--color-sub-text1)' }}
      >
        {role}
      </span>
    </div>
  );
}
