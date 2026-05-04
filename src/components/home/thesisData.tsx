import { AsciiThesis } from '@/components/ascii/AsciiThesis';

export interface ThesisState {
  id: string;
  /** Desktop layout: inline ASCII within text flow */
  desktopContent: React.ReactNode;
  /** Mobile layout: ASCII as separate block, two-tier text sizing */
  mobileContent: React.ReactNode;
}

/* ─── Desktop: Inline ASCII (same as before) ─── */
export function InlineAscii({ n, extend }: {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  extend: 'up' | 'down';
}) {
  return (
    <span
      className="relative inline-block w-[110px] align-middle mx-2"
      style={{ height: '1em' }}
    >
      <span
        className="absolute inset-x-0 h-[110px] overflow-hidden"
        style={extend === 'up' ? { bottom: 0 } : { top: 0 }}
      >
        <AsciiThesis stateNumber={n} />
      </span>
    </span>
  );
}

/* ─── Mobile: Block-level ASCII art ─── */
export function MobileAscii({ n, align = 'center' }: {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right';
}) {
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div className={`flex ${justifyClass} w-full`}>
      <div className="relative w-[76px] h-[76px] overflow-hidden">
        <AsciiThesis stateNumber={n} />
      </div>
    </div>
  );
}

/* ─── Shared sub-text style for mobile ─── */
export const subTextClass = "text-[var(--color-sub-text1)] text-[18px] leading-[1.25] tracking-[-0.36px]";

export const THESIS_STATES: ThesisState[] = [
  {
    id: 'thesis-01',
    desktopContent: (
      <>
        <span>the internet was built on </span>
        <InlineAscii n={1} extend="up" />
        <span> an </span>
        <span className="text-[var(--color-accent)]">ideal:</span>
        <br />
        <span>a free and open space for information, ideas, and value.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={1} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          the internet was built on an <span className="text-[var(--color-accent)]">ideal:</span>
        </p>
        <p className={subTextClass}>
          a free and open space for<br />information, ideas, and value.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-02',
    desktopContent: (
      <>
        <span>but that vision remains </span>
        <InlineAscii n={2} extend="up" />
        <span> </span>
        <span className="text-[var(--color-accent)]">unfinished.</span>
        <br />
        <span>ownership is centralized. incentives are misaligned.</span>
        <br />
        <span>value is trapped in closed loops.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={2} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          but that vision remains <span className="text-[var(--color-accent)]">unfinished.</span>
        </p>
        <p className={subTextClass}>
          ownership is centralized.<br />incentives are misaligned.<br />value is trapped in closed loops.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-03',
    desktopContent: (
      <>
        <span>new </span>
        <InlineAscii n={3} extend="up" />
        <span> </span>
        <span className="text-[var(--color-accent)]">internet-native protocols</span>
        <span> have emerged:</span>
        <br />
        <span>the bridge to reclaim the internet&apos;s original promise.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={3} align="right" />
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          new <span className="text-[var(--color-accent)]">internet-native protocols</span> have emerged:
        </p>
        <p className={subTextClass}>
          the bridge to reclaim the internet&apos;s<br />original promise.
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-04',
    desktopContent: (
      <>
        <span>yet the technology is still early,</span>
        <br />
        <span>not even past the first </span>
        <InlineAscii n={4} extend="down" />
        <span> </span>
        <span className="text-[var(--color-accent)]">16%</span>
        <span> of adoption.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <p className={subTextClass}>
          yet the technology is still early,<br />not even past the first
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          <span className="text-[var(--color-accent)]">16%</span> of adoption.
        </p>
        <MobileAscii n={4} align="left" />
      </div>
    ),
  },
  {
    id: 'thesis-05',
    desktopContent: (
      <>
        <span>we are here to </span>
        <InlineAscii n={5} extend="up" />
        <span> change that.</span>
        <br />
        <span>to move these protocols from experiment to </span>
        <span className="text-[var(--color-accent)]">infrastructure.</span>
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <MobileAscii n={5} align="center" />
        <p className={subTextClass}>
          we are here to change that.<br />to move these protocols
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
          from experiment to <span className="text-[var(--color-accent)]">infrastructure.</span>
        </p>
      </div>
    ),
  },
  {
    id: 'thesis-06',
    desktopContent: (
      <>
        <span>from possibility to </span>
        <span className="text-[var(--color-accent)]">default.</span>
        <br />
        <span>from the edges to </span>
        <InlineAscii n={6} extend="down" />
        <span> </span>
        the center of the world.
      </>
    ),
    mobileContent: (
      <div className="flex flex-col items-center gap-1">
        <p className={subTextClass}>
          from possibility to <span className="text-[var(--color-accent)]">default.</span><br />from the edges to
        </p>
        <p className="text-[24px] leading-[1.25] tracking-[-0.48px] text-[var(--color-text)]">
          the center of the world.
        </p>
        <MobileAscii n={6} align="center" />
      </div>
    ),
  },
  {
    id: 'thesis-07',
    desktopContent: (
      <>
        <span>this is why we are </span>
        <span className="text-[var(--color-accent)]">1six.</span>
      </>
    ),
    mobileContent: (
      <p className="text-[24px] leading-[1.25] tracking-[-0.48px]" style={{ color: 'var(--color-text)' }}>
        this is why we are <span className="text-[var(--color-accent)]">1six.</span>
      </p>
    ),
  },
];

export const TOTAL = THESIS_STATES.length;
