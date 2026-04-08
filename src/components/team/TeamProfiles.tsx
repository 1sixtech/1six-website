'use client';

/**
 * TeamProfiles — Infinite Marquee Logo Section
 *
 * Desktop (V4): Single-row infinite horizontal marquee with centered sub-labels
 *               and vertical dividers between items.
 * Mobile  (M2): Dual-row marquee scrolling in opposite directions.
 *
 * Performance strategy (derived from 20+ resource research):
 * ─────────────────────────────────────────────────────────
 * 1. Pure CSS animation with `transform: translate3d` — GPU-composited,
 *    no layout/paint triggers, locked to compositor thread.
 * 2. `will-change: transform` on animated tracks only (not on display:none tracks).
 * 3. `backface-visibility: hidden` prevents Safari flicker.
 * 4. Content duplicated exactly once (2x total). Both content blocks are structurally
 *    identical — no trailing divider — so the -50% reset is pixel-perfect.
 * 5. `animation-timing-function: linear` for constant velocity.
 * 6. Duplicate content gets `aria-hidden="true"` for screen readers.
 * 7. Global `prefers-reduced-motion` in globals.css handles accessibility.
 * 8. CSS-only = no JS timers = immune to background-tab throttling.
 * 9. Styles live in globals.css (build-time extraction), not inline <style> tags.
 */

// ── Data ──────────────────────────────────────────────────

interface Institution {
  name: string;
  sub?: string;
}

const ROW1: Institution[] = [
  { name: 'MIT' },
  { name: 'Harvard' },
  { name: 'Schwarzman', sub: 'scholars' },
  { name: 'Ethereum', sub: 'foundation' },
  { name: 'Starknet', sub: 'foundation' },
];

const ROW2: Institution[] = [
  { name: 'ICPC', sub: 'world finalists' },
  { name: 'Codeforces', sub: 'grandmasters' },
  { name: 'Needham' },
  { name: 'Tsinghua' },
];

const ALL: Institution[] = [...ROW1, ...ROW2];

// ── Marquee Item ──────────────────────────────────────────

function MarqueeItem({ inst, size }: { inst: Institution; size: 'desktop' | 'mobile' }) {
  const isDesktop = size === 'desktop';

  return (
    <span className={`marquee-item ${isDesktop ? 'marquee-item--desktop' : 'marquee-item--mobile'}`}>
      <span className="marquee-item__name">{inst.name}</span>
      {inst.sub && <span className="marquee-item__sub">{inst.sub}</span>}
    </span>
  );
}

function MarqueeDivider({ size }: { size: 'desktop' | 'mobile' }) {
  return <span className={`marquee-divider ${size === 'desktop' ? 'marquee-divider--desktop' : 'marquee-divider--mobile'}`} />;
}

// ── Marquee Track ─────────────────────────────────────────

function MarqueeTrack({
  items,
  size,
  reverse = false,
  durationMs,
}: {
  items: Institution[];
  size: 'desktop' | 'mobile';
  reverse?: boolean;
  durationMs: number;
}) {
  // Build content: items separated by dividers, WITH trailing divider.
  // The trailing divider ensures a visual separator between the last item
  // of one content block and the first item of the duplicate.
  // Both content blocks are structurally identical, so -50% translateX
  // resets to a pixel-identical visual state — zero visible jump.
  const content = items.flatMap((inst, i) => {
    const els: React.ReactNode[] = [];
    if (i > 0) els.push(<MarqueeDivider key={`d-${i}`} size={size} />);
    els.push(<MarqueeItem key={inst.name} inst={inst} size={size} />);
    return els;
  });

  const contentWithTrailingDivider = [
    ...content,
    <MarqueeDivider key="d-trail" size={size} />,
  ];

  const trackStyle: React.CSSProperties = {
    ['--marquee-duration' as string]: `${durationMs}ms`,
  };

  const trackClass = [
    'marquee-track',
    reverse ? 'marquee-track--reverse' : '',
  ].join(' ');

  return (
    <div className="marquee-track-wrapper">
      <div className={trackClass} style={trackStyle}>
        {/* Original content */}
        <div className="marquee-track__content">
          {contentWithTrailingDivider}
        </div>
        {/* Duplicate for seamless loop — hidden from screen readers */}
        <div className="marquee-track__content" aria-hidden="true">
          {contentWithTrailingDivider}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────

export function TeamProfiles() {
  return (
    <section
      className="marquee-section"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="marquee-container">
        <h2
          className="marquee-heading"
          style={{ color: 'var(--color-text)' }}
        >
          driven by
          <br />
          expertise from the best
        </h2>

        {/* Desktop: single row with all institutions */}
        <div className="marquee-desktop">
          <MarqueeTrack items={ALL} size="desktop" durationMs={35000} />
        </div>

        {/* Mobile: two rows, opposite directions */}
        <div className="marquee-mobile">
          <MarqueeTrack items={ROW1} size="mobile" durationMs={25000} />
          <div className="marquee-row-gap" />
          <MarqueeTrack items={ROW2} size="mobile" durationMs={28000} reverse />
        </div>
      </div>
    </section>
  );
}
