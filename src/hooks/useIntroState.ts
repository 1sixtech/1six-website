'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribeRevealed,
  getRevealedSnapshot,
  subscribeDone,
  getDoneSnapshot,
} from '@/lib/introState';

/**
 * useIntroRevealed — Returns true once the 'intro:revealed' event fires
 * OR immediately if the intro was never active on the current page
 * (non-home, reduced-motion skip, or session repeat skip).
 *
 * Implemented with `useSyncExternalStore` so there is no synchronous
 * `setState` call inside a `useEffect` body (which React 19's
 * `react-hooks/set-state-in-effect` rule forbids). The subscribe/snapshot
 * contract is defined in `@/lib/introState`.
 */
export function useIntroRevealed(): boolean {
  return useSyncExternalStore(
    subscribeRevealed,
    getRevealedSnapshot,
    // getServerSnapshot — SSR cannot know intro state, assume not-yet-revealed.
    // The snapshot is reconciled on client mount via subscribe + getSnapshot.
    () => false,
  );
}

/**
 * useIntroDone — Returns true once the 'intro:done' event has fired
 * (after the overlay fade-out completes). Use sparingly — most consumers
 * only need `useIntroRevealed`.
 */
export function useIntroDone(): boolean {
  return useSyncExternalStore(
    subscribeDone,
    getDoneSnapshot,
    () => false,
  );
}
