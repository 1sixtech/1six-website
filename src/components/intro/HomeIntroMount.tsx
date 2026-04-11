'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { IntroOverlay } from './IntroOverlay';
import { IntroOrchestrator } from './IntroOrchestrator';
import { teardownVideoPool } from '@/lib/videoPool';

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

  // Route-leave safety net — closes the "user clicks Header About during
  // the 1.8s hero scramble in skip mode" stuck-lock bug.
  //
  // Normal flow: HeroSection.unlockPage() removes `intro-lock` when the
  // scramble completes (or its 2.5s fallback fires). That is the happy
  // path and still owns the unlock for both full and skip modes.
  //
  // Edge case: in skip mode, body.pointer-events is `auto` (by design —
  // skip mode should feel fast) so the Header's `<Link href="/about">`
  // is clickable during the scramble. If the user clicks it, Next.js
  // unmounts HeroSection which cancels the 2.5s fallback timer, and
  // NOTHING removes the class — every downstream page inherits
  // `overflow: hidden !important` until a full reload.
  //
  // Fix: whenever this component sees the user leave `/`, clear the
  // class. This runs after HeroSection's unmount cleanup, so normal
  // unlock wins the race and this is a no-op on the happy path.
  // Also teardown the videoPool on route-leave to release the pooled
  // HTMLVideoElements (see videoPool.ts for the lifecycle contract).
  useEffect(() => {
    if (pathname !== '/') {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('intro-lock');
      }
      teardownVideoPool();
    }
  }, [pathname]);

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
