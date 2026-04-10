'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';

/**
 * HomeIntroMount — Client wrapper mounted in the root layout. Renders
 * the intro overlay + orchestrator only while on the homepage.
 *
 * Why a wrapper? layout.tsx is a server component and can't hold the
 * refs that IntroOverlay and IntroOrchestrator need to share. It also
 * can't use usePathname to gate the mount. This component bridges that.
 *
 * Ref population strategy: #main-content is rendered by layout.tsx
 * outside this subtree, so we can't use a ref callback. Instead we
 * populate mainContentRef.current during render (guarded for SSR and
 * idempotent via the !mainContentRef.current check). This runs before
 * the IntroOrchestrator's useEffect fires, so the orchestrator sees a
 * valid ref on its first run. Using a ref-during-render pattern also
 * avoids the react-hooks/set-state-in-effect lint rule that would
 * trigger if we hydrated via useState + useEffect.
 */
export function HomeIntroMount() {
  const pathname = usePathname();
  const fillRectRef = useRef<SVGRectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  // Lazy-initialize the ref during render (client-only). React permits
  // the `if (ref.current == null) { ref.current = ... }` pattern for
  // one-time initialization; it runs before any child effects fire, so
  // IntroOrchestrator's useEffect sees a valid mainContentRef on its
  // first run.
  if (typeof document !== 'undefined') {
    if (mainContentRef.current == null) {
      mainContentRef.current = document.getElementById('main-content') as HTMLElement | null;
    }
  }

  if (pathname !== '/') return null;

  return (
    <>
      <IntroOverlay ref={overlayRef} fillRectRef={fillRectRef} />
      <IntroOrchestrator
        fillRectRef={fillRectRef}
        overlayRef={overlayRef}
        mainContentRef={mainContentRef}
      />
    </>
  );
}
