'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AsciiTeamSymbol } from '@/components/ascii/AsciiTeamSymbol';
import { setRouteVisualReady } from '@/lib/introState';

/**
 * The ASCII "16" mark and its fill. Purely decorative: the whole column is
 * hidden from assistive tech. Its first rendered frame readies the site
 * loader on About; repeat visits and reduced motion show the page immediately.
 *
 * The fill is a mask on the mark's own ink, not a second canvas: below the
 * level the glyphs print at full strength, above it they sit at a dim
 * silhouette (the dim-then-fill idea of the intro logo, told in ink because
 * WebGL glyphs cannot be recolored per region without a second context).
 * An accent hairline marks the level and stays at the brim at 100%.
 * Desktop pins the mark with CSS sticky; on mobile it sits at the top of
 * the page at a smaller size.
 */
export function CrossingMark() {
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    setRouteVisualReady('/', false);
    return () => {
      mountedRef.current = false;
      setRouteVisualReady('/', false);
    };
  }, []);

  const handleReady = useCallback(() => {
    if (!mountedRef.current) return;
    setReady(true);
    setRouteVisualReady('/', true);
  }, []);

  return (
    <div className="crossing-aside" aria-hidden="true">
      <div className="crossing-mark" data-ready={ready ? 'true' : 'false'}>
        <div className="crossing-mark__ink">
          <AsciiTeamSymbol onReady={handleReady} />
        </div>
        <span className="crossing-mark__level">
          <span className="crossing-mark__count" data-crossing-count>16%</span>
        </span>
      </div>
    </div>
  );
}
