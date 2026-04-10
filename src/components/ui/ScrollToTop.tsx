'use client';

import { useEffect } from 'react';
import { isThesisPinReady, scrollToHashTarget, shouldWaitForThesisPin } from '@/lib/hashScroll';

/**
 * On mount: strip hash from the URL to prevent the browser's native
 * hash-anchor scroll (which races with GSAP ScrollTrigger pin setup),
 * force scroll to top, then re-scroll to the hash target once GSAP
 * pins are ready.
 *
 * The hash is saved before removal so we can programmatically scroll
 * to it later. Programmatic scrollTo generates 'scroll' events (not
 * wheel/touch), bypassing the Thesis section's gesture capture.
 */
export function ScrollToTop() {
  useEffect(() => {
    if (history.scrollRestoration) {
      history.scrollRestoration = 'manual';
    }

    // Save and strip the hash BEFORE the browser can scroll to it.
    // replaceState removes the hash without creating a new history entry.
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      history.replaceState(null, '', window.location.pathname);
    }

    window.scrollTo(0, 0);

    if (hash) {
      // Poll for the target element and, on desktop, the Thesis pin spacer.
      // Uses setInterval (not rAF) so it keeps trying even if the
      // main thread is busy with WebGL initialization.
      // Generous timeout (5s) covers slow mobile devices.
      const startTime = Date.now();
      const maxWait = 5000;
      const waitForThesisPin = shouldWaitForThesisPin();

      const poll = setInterval(() => {
        const target = document.getElementById(hash);
        const ready = !!target && (!waitForThesisPin || isThesisPinReady());

        if (ready) {
          clearInterval(poll);
          scrollToHashTarget(hash);
          // Restore hash in URL after scroll
          history.replaceState(null, '', `#${hash}`);
        } else if (Date.now() - startTime > maxWait) {
          clearInterval(poll);
          // Fallback: scroll to target even without pin spacer
          if (target) {
            scrollToHashTarget(hash);
            history.replaceState(null, '', `#${hash}`);
          }
        }
      }, 50);

      return () => clearInterval(poll);
    }
  }, []);

  return null;
}
