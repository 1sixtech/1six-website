'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const subscribe = () => () => {};
const enabled = () => new URLSearchParams(location.search).has('capture-debug');

/** Temporary, opt-in capture probe for physical iPhone reproduction. */
export function ThesisDiagnostics() {
  const active = useSyncExternalStore(subscribe, enabled, () => false);
  const [report, setReport] = useState('Waiting for capture state…');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return;
    const events: unknown[] = [];
    let last = '';
    const receive = (event: Event) => {
      events.push((event as CustomEvent).detail);
      if (events.length > 40) events.shift();
    };
    window.addEventListener('1six:capture-diagnostic', receive);
    const timer = window.setInterval(() => {
      const root = document.documentElement;
      const section = document.getElementById('thesis');
      const swiperElement = section?.querySelector('.swiper') as (HTMLElement & {
        swiper?: { activeIndex: number; allowTouchMove: boolean; destroyed: boolean };
      }) | null;
      let top = 0;
      let node = section;
      while (node) { top += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
      const value = JSON.stringify({
        path: location.pathname,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        mobile: matchMedia('(max-width: 767px)').matches,
        y: Math.round(scrollY), top,
        viewport: [innerWidth, innerHeight, visualViewport?.height],
        viewportTop: visualViewport?.pageTop,
        scrollingElement: document.scrollingElement?.tagName,
        classes: root.className,
        captured: root.dataset.thesisCaptured ?? null,
        menu: root.dataset.menuOpen ?? null,
        overflow: [getComputedStyle(root).overflowY, getComputedStyle(document.body).overflowY],
        mode: swiperElement ? 'swiper' : 'stacked',
        index: swiperElement?.swiper?.activeIndex,
        allow: swiperElement?.swiper?.allowTouchMove,
        destroyed: swiperElement?.swiper?.destroyed,
      });
      if (value !== last) {
        events.push({ event: 'sample', ...JSON.parse(value) });
        if (events.length > 40) events.shift();
        last = value;
      }
      setReport(JSON.stringify({ state: JSON.parse(value), events }));
    }, 250);
    return () => {
      clearInterval(timer);
      window.removeEventListener('1six:capture-diagnostic', receive);
    };
  }, [active]);

  if (!active) return null;
  return createPortal(
    <details style={{ position: 'fixed', zIndex: 9999, right: 8, bottom: 8, maxWidth: 'calc(100vw - 16px)', padding: 10, background: '#fff', color: '#000', border: '1px solid #999', borderRadius: 4, fontSize: 14 }}>
      <summary>Thesis capture diagnostics</summary>
      <button type="button" style={{ minHeight: 44, textDecoration: 'underline' }} onClick={async () => { await navigator.clipboard.writeText(report); setCopied(true); }}>
        {copied ? 'Copied — paste into chat' : 'Copy capture report'}
      </button>
      <textarea aria-label="Capture report" readOnly value={report} style={{ display: 'block', width: 320, maxWidth: '100%', height: 100, fontSize: 12 }} />
    </details>,
    document.body,
  );
}
