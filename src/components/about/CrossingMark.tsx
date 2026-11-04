'use client';

import { useEffect, useRef, useState } from 'react';
import { AsciiTeamSymbol } from '@/components/ascii/AsciiTeamSymbol';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** A moment in the source loop where the "16" faces the viewer. */
const FRONT_FRAME_SECONDS = 0.2;

/**
 * Under reduced motion AsciiCanvas swaps WebGL for the plain source video,
 * which loops a rotating "16". Hold that video on its frontal frame so the
 * mark is still, as the rest of the crossing is.
 */
function useStillFallbackVideo(container: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = container.current;
    if (!active || !root) return;

    let held: HTMLVideoElement | null = null;
    const stay = () => held?.pause();
    const seek = () => {
      if (held) held.currentTime = FRONT_FRAME_SECONDS;
    };
    const release = () => {
      held?.removeEventListener('play', stay);
      held?.removeEventListener('loadedmetadata', seek);
      held = null;
    };
    const hold = () => {
      const video = root.querySelector('video');
      if (!video || video === held) return;
      release();
      held = video;
      video.pause();
      video.addEventListener('play', stay);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
      else video.addEventListener('loadedmetadata', seek, { once: true });
    };

    hold();
    // The canvas module loads lazily, so the video can arrive after mount.
    const observer = new MutationObserver(hold);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      release();
    };
  }, [container, active]);
}

/**
 * The ASCII "16" mark and its fill. Purely decorative: the whole column is
 * hidden from assistive tech, and nothing in it gates content.
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
  const markRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useStillFallbackVideo(markRef, reduceMotion);

  return (
    <div className="crossing-aside" aria-hidden="true">
      <div ref={markRef} className="crossing-mark" data-ready={ready ? 'true' : 'false'}>
        <div className="crossing-mark__ink">
          <AsciiTeamSymbol onReady={() => setReady(true)} />
        </div>
        <span className="crossing-mark__level" />
      </div>
    </div>
  );
}
