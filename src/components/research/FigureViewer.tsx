'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface OpenFigure {
  src: string;
  alt: string;
}

interface Opener {
  /** The figure link that opened the viewer: focus goes back to it. */
  link: HTMLElement;
  /** Opened from the keyboard (a click with no pointer behind it). */
  byKeyboard: boolean;
}

/**
 * Full-size view for research figures. The charts are drawn 760-900 units
 * wide with 14-17px labels, and a phone column shrinks them to 5-7px. A tap
 * on a figure (a.research-figure, see lib/research.ts) opens it here at its
 * own size: wider than the screen, it pans sideways, and it can be pinched.
 * Modified clicks keep the link's own behavior (open the file elsewhere),
 * and without script the link opens the file itself.
 */
export function FigureViewer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Opener | null>(null);
  const [figure, setFigure] = useState<OpenFigure | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a.research-figure');
      const image = link?.querySelector('img');
      if (!(link instanceof HTMLAnchorElement) || !image) return;
      event.preventDefault();
      openerRef.current = { link, byKeyboard: event.detail === 0 };
      setFigure({ src: image.currentSrc || image.src, alt: image.alt });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !figure) return;
    if (!dialog.open) dialog.showModal();
    // From the keyboard, focus lands on the way out (the scrollable chart
    // would take it first). From a tap it lands on the dialog itself: Safari
    // would otherwise ring the close button for a finger. In the same task
    // as showModal, so no frame shows the default focus.
    const byKeyboard = openerRef.current?.byKeyboard ?? true;
    (byKeyboard ? closeRef.current : dialog)?.focus({ preventScroll: true });
    // The chart opens on its left edge, where its axis and labels start.
    scrollRef.current?.scrollTo(0, 0);
  }, [figure]);

  const close = useCallback(() => dialogRef.current?.close(), []);

  // Every way out ends here: the close button, Escape, a tap beside the chart.
  // Focus goes back to the figure, so the reading position and assistive
  // technology stay where they were; after a tap the figure is marked so its
  // focus ring stays hidden until focus moves on (research.css).
  const handleClose = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    setFigure(null);
    if (!opener) return;
    const { link, byKeyboard } = opener;
    if (!byKeyboard) {
      link.dataset.pointerFocus = '';
      link.addEventListener('blur', () => delete link.dataset.pointerFocus, { once: true });
    }
    link.focus({ preventScroll: true });
  }, []);

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="figure-viewer"
      aria-label={figure?.alt ? `Figure: ${figure.alt}` : 'Figure'}
      onClose={handleClose}
    >
      <div
        ref={scrollRef}
        className="figure-viewer__scroll"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {figure && (
          // eslint-disable-next-line @next/next/no-img-element -- an SVG chart shown at its own intrinsic size
          <img src={figure.src} alt={figure.alt} className="figure-viewer__image" />
        )}
      </div>
      <button
        ref={closeRef}
        type="button"
        className="figure-viewer__close"
        onClick={close}
        aria-label="Close figure"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
          <path d="M3.5 3.5L16.5 16.5M16.5 3.5L3.5 16.5" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </dialog>
  );
}
