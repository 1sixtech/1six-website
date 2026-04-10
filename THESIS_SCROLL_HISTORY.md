# ThesisSection Scroll — Problem History and Current State

Everything the repository has learned about making the Thesis section scroll correctly on both desktop and iOS Safari. This document is append-only by convention and is the source of truth for why the current code looks the way it does. If you are about to change anything in `ThesisSection.tsx`, `ThesisSectionMobile.tsx`, `AsciiCanvas.tsx`, `Header.tsx`, `ScrollToTop.tsx`, or `hashScroll.ts`, read this first.

Last updated: `2026-04-11`
Current branch head: `ea6c175` (`giwook-Han/fix-mobile-problem`)
Related PR: [#4 — fix: stabilize mobile thesis scroll capture](https://github.com/1sixtech/1six-website/pull/4)
Related open issue: [#5 — `/about` → hamburger → THESIS lands on Hero](https://github.com/1sixtech/1six-website/issues/5)

---

## Table of contents

1. Current architecture (what ships today)
2. Phase 1 — Desktop GSAP fixes (pre-mobile split)
3. Phase 2 — Mobile path extraction
4. Phase 3 — Review session stabilization (this session)
5. Known open issue
6. Design decisions log (why not alternative X)
7. Failed approaches (so nobody re-introduces them)
8. Research notes
9. Key files
10. Next steps

---

## 1. Current architecture (what ships today)

### Device split

`ThesisSection.tsx` is a **router component**. It holds an `isMobile: boolean | null` state, initialized to `null`, and resolved inside a `useEffect` via `window.matchMedia('(max-width: 767px)')`.

- `isMobile === null` → render an empty `<section id="thesis" className="h-dvh …" />` placeholder.
  This keeps the visual footprint correct during SSR/hydration and prevents GSAP from inserting its `.pin-spacer` wrapper before we know whether we should mount the mobile path instead (which would cause a `removeChild` DOMException when React tries to reconcile).
- `isMobile === true` → render `<ThesisSectionMobile />`.
- `isMobile === false` → render `<ThesisSectionDesktop />` (GSAP ScrollTrigger pin + Observer).

`prefers-reduced-motion` users get a static stacked fallback regardless of device.

### Desktop path (unchanged from Phase 1)

```
GSAP ScrollTrigger pin: true
  + Observer (type: 'wheel,touch', preventDefault: false)
  + manual touchstart/touchmove/wheel listeners
    (conditional preventDefault when sectionActiveRef === true)
  + time-based COOLDOWN_MS = 400 debounce
  + direction-swapped callbacks + wheelSpeed: -1
    (normalizes desktop wheel vs iOS touch)
```

This is the outcome of the whole Phase 1 exploration. It is the design that finally stopped the desktop wheel freeze, the page skip, and the iOS direction inversion all at once.

### Mobile path (added in Phase 2, stabilized in Phase 3)

```
Hero (normal scroll)
  │ scroll down
  ▼
┌ top sentinel (h-0, directly above thesis) ─────────┐
│  IntersectionObserver, threshold: 0                 │
│  When the sentinel leaves the viewport upward       │
│  (!entry.isIntersecting && entry.bottom < 0),       │
│  fire capture('top', sectionTopAbs).                │
│  sectionTopAbs is taken from entry.boundingClientRect│
│  (IO-snapshot), not from a fresh getBoundingClientRect │
│  — iOS momentum can overshoot between detection and │
│  callback execution.                                │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ capture('top' | 'bottom', sectionTopAbs) ──────────┐
│  1) stateRef = 'captured'                           │
│  2) window.scrollTo(sectionTopAbs, 'auto')          │
│     — instant snap, no smooth so iOS momentum       │
│     cannot race with a smooth animation.            │
│  3) swiper.slideTo(dir === 'bottom' ? TOTAL-1 : 0, 0)│
│  4) document.addEventListener('touchmove',           │
│         preventPageScroll, { passive: false })       │
│     — fullpage.js pattern, synchronous event-level   │
│     scroll blocking. No body.position or overflow.   │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ Thesis (100dvh, Swiper vertical + EffectFade) ─────┐
│  Swiper handles the 7 slide transitions itself,     │
│  because its internal touch handlers run BEFORE     │
│  the document-level preventPageScroll listener.     │
│                                                     │
│  Edge exit (touchend on section):                  │
│    activeIndex === 0       + deltaY < -50 → release('up')  │
│    activeIndex === TOTAL-1 + deltaY >  50 → release('down') │
│                                                     │
│  touchValidRef guards against stray touchend after  │
│  an OS-originated touchcancel (incoming call, etc). │
│  Without this, a canceled swipe's trailing touchend │
│  could compute a bogus deltaY against a stale start │
│  position and trigger a false edge exit.            │
│                                                     │
│  WebGL note: all 6 MobileAscii canvases mount       │
│  concurrently while thesis is in view. The isActive │
│  prop is a VISUAL gate (opacity-0 wrapper for       │
│  inactive slides), not a mount gate — AsciiCanvas's │
│  IntersectionObserver uses rootMargin: '200px' and  │
│  is geometric, so it ignores opacity. Headroom is   │
│  provided by MAX_ACTIVE_CONTEXTS = 10 in            │
│  AsciiCanvas.tsx. True single-canvas mounting       │
│  would need real unmount + remount per slide, which │
│  introduces a visible re-init delay and was         │
│  rejected.                                          │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ release(exitDirection) ────────────────────────────┐
│  1) stopCapture(opposite boundary)                  │
│     → stateRef = 'idle'                             │
│     → remove document touchmove listener            │
│     → blockedSentinel = 'top' | 'bottom'            │
│     → setTimeout clears blockedSentinel after       │
│       CAPTURE_SUSPEND_MS (1200 ms)                  │
│  2) suspendCapture()                                │
│     → captureSuspendedUntilRef = now + 1200         │
│     → blocks BOTH top sentinel and reverse-scroll   │
│       paths for 1200 ms. This is NOT a duplicate of │
│       blockedSentinel — see §3, §5, and §7 for why. │
└────────────────────────────────────────────────────┘
  │
  ▼
smooth scroll to Hero (exit up) or #thesis-graph (exit down)
  │
  ▼
ThesisGraph (normal scroll)
  │ scroll up (reverse re-entry)
  ▼
┌ Reverse re-entry ──────────────────────────────────┐
│  Implemented as a scroll-delta crossing check in an │
│  onScroll listener, NOT as a bottom IntersectionObserver. │
│  A zero-height sentinel immediately below thesis    │
│  kept firing at the 0px first-intersect boundary    │
│  on mobile Safari, which was too eager.             │
│                                                     │
│  onScroll logic:                                    │
│    prevScrollY > sectionTopAbs &&                   │
│    currentScrollY <= sectionTopAbs                  │
│    && stateRef === 'idle'                           │
│    && Date.now() >= captureSuspendedUntilRef        │
│    && blockedSentinel !== 'bottom'                  │
│    → capture('bottom', sectionTopAbs)               │
│                                                     │
│  When the reverse capture succeeds, Swiper is       │
│  set to the LAST slide so the user continues from   │
│  where they were logically.                         │
└────────────────────────────────────────────────────┘
```

### Hash navigation

- Nav links in `Header.tsx` map to `href="/#thesis"`, `href="/#products"`, `href="/about"`.
- `Header.handleNavClick` splits on same-page vs cross-route.
  - **Same-page**: `manualUnlockRef.current = true; unlockScroll(false); setMenuOpen(false); emitHashScrollRequest(hash); history.pushState(null, '', '#${hash}'); rAF(() => scrollToHashTarget(hash));`
  - **Cross-route**: `setMenuOpen(false); router.push('/#${hash}', { scroll: false });` — see open issue §5.
- `ScrollToTop.tsx` runs on `HomePage` mount. It strips the current hash via `history.replaceState(null, '', pathname)`, forces `scrollTo(0, 0)` (so GSAP ScrollTrigger pin setup cannot race with the browser's native hash scroll), then polls every 50 ms for the hash target and emits `HASH_SCROLL_REQUEST_EVENT` + `scrollToHashTarget(hash)` once readiness is met.
- `ThesisSectionMobile` listens for `HASH_SCROLL_REQUEST_EVENT`:
  - `hash === 'thesis'`: sets `pendingHashCaptureRef = true` and calls `suspendCapture()` so the next scroll event captures into slide 0.
  - Any other hash while `stateRef === 'captured'`: calls `releaseForProgrammaticNavigation()` which clears the capture state without direction-aware cooldown.

### ASCII canvas race guard (added this session)

`AsciiCanvas.initMosaic` is an `async` function that goes through `new AscMosaic(…)` → `setCanvasSize` → `addModel` → `enableAsciiMosaicFilter` (internally polls for up to 5 s). Between any two `await` points, `destroyMosaic` can race it via a rapid `isVisible` toggle on the parent `IntersectionObserver`. The previous `mountedRef.current` check did not catch this because `destroyMosaic` never touches `mountedRef`.

Current guard (per `await` in `initMosaic`):

```ts
if (!mountedRef.current || mosaicRef.current !== mosaic) {
  mosaic.stopAnimate();
  mosaic.dispose();
  if (mosaicRef.current === mosaic) {
    activeContextCount = Math.max(0, activeContextCount - 1);
    mosaicRef.current = null;
  }
  return;
}
```

See §4 for why this was necessary.

---

## 2. Phase 1 — Desktop GSAP fixes (pre-mobile split)

All Phase 1 bugs were on desktop. Mobile had been piggy-backing on the same GSAP path and producing its own different symptoms, but the desktop problems had to be fixed first before we could see mobile clearly.

### 1.1. Desktop wheel freeze (blocker)

- **Symptom**: After entering thesis on desktop, wheel scroll did nothing. Keyboard navigation still worked.
- **Root cause**: The Two-Observer pattern in `ffff820` had a viewport-level `preventScroll` Observer that consumed wheel events before the page-level Observer could handle them.
- **Fix**: `d3a0e7c` — collapse to a single Observer.
- **Status**: ✅ resolved.

### 1.2. Multi-page skip on fast gestures

- **Symptom**: A strong trackpad fling or fast swipe skipped 2–3 pages at once instead of transitioning page-by-page.
- **Root cause**: `onComplete` disabled the Observer for 150 ms, but trackpad momentum on macOS lasts 500 ms – 1.5 s. Residual momentum events slipped through the re-enable window.
- **Fix**: `1dd6f11` — remove the disable/re-enable dance entirely; use a time-based `COOLDOWN_MS = 400` debounce instead.
- **Status**: ✅ resolved.

### 1.3. Scroll stops in the middle of the Hero ↔ Thesis handoff

- **Symptom**: Stopping mid-scroll between Hero and Thesis left the user stuck — native scroll had been blocked by an always-on Observer.
- **Root cause**: `18e889e` made the Observer always-on with `preventDefault: true`. This blocked scrolling even outside the pin range.
- **Fix**: `1dd6f11` — lifecycle-managed Observer enable/disable gated by `sectionActiveRef`.
- **Status**: ✅ resolved.

### 1.4. Cannot exit the last page on desktop

- **Symptom**: On slide 7, scrolling down did not transition into `ThesisGraph`.
- **Root cause**: The `+1 px` offset used to push `scrollY` past the pin end was absorbed by pin-spacer reflow, and the safety timeout never restored the observer, leaving the user stuck.
- **Fix**: `1dd6f11` — offset is now `+50 px`, safety timeout restores the interactive state if `onLeave`/`onLeaveBack` never fires.
- **Status**: ✅ resolved.

### 1.5. Bounce-back on boundary exit

- **Root cause**: `onEnterBack` had no guard against the exit scrollTo re-entering the pin range on the same frame.
- **Fix**: `18e889e` introduced `exitingRef`.
- **Status**: ✅ resolved.

### 1.6. "One swipe eaten" feeling on boundary exit

- **Root cause**: `requestAnimationFrame` deferred the `scrollTo` by one frame, producing a ~16 ms gap where the user's swipe had been "consumed" but no visual response appeared.
- **Fix**: `d15407a` — remove the rAF; `Observer.disable()` is synchronous and needs no deferral.
- **Status**: ✅ resolved.

### 1.7. Bottom layer bleed-through

- **Root cause**: The thesis `section` had no `overflow: hidden` or `z-index`. Content from sections above/below showed through during pin transitions.
- **Fix**: `d3a0e7c` — `overflow-hidden z-10` on the section plus a solid background color on `.pin-spacer` in `globals.css`.
- **Status**: ✅ resolved.

### 1.8. First iOS swipe ignored

- **Symptom**: On desktop's iOS branch (before mobile was split out), the first touch after entering thesis only stopped the existing compositor momentum, it did not trigger a slide transition.
- **Root cause**: iOS compositor-driven `UIScrollView` momentum is outside the JS event loop. Whatever touch handler runs first sees only "momentum stop", not "user gesture".
- **Fix**: `5624ab5` — module-level `normalizeScroll(true)` routes all scroll through the JS thread.
- **Status**: ✅ resolved (desktop). Mobile eventually bypassed this entirely via the Swiper path — see Phase 2.

### Phase 1 commit history

| Commit | What it did | Outcome |
|---|---|---|
| `a3714a9` | `wheelSpeed: -1` + swapped Observer callbacks | Fixed iOS touch direction |
| `721296c` | Always-on Observer + `sectionActiveRef` | Conditional `preventDefault` |
| `447c95b` | `touchstart` `preventDefault` | Partial improvement |
| `b68ba61` | Global `normalizeScroll(true)` | iOS momentum fixed, header broke |
| `20b362e` | `normalizeScroll` deferred until `intro-lock` lifts | `intro-lock` conflict fixed |
| `f6dab2c` | `anticipatePin: 1`, cooldown 400 ms | Overshoot improved |
| `ffff820` | Two-Observer pattern | Jank fixed, introduced wheel freeze ❌ |
| `7152bef` | Two-Observer refinement | Partial improvement |
| `d3a0e7c` | Single Observer + disable/enable | Freeze fixed, introduced touch leak ❌ |
| `18e889e` | Always-on Observer + `exitingRef` | Leak fixed, introduced pin-out blocking ❌ |
| `1dd6f11` | Enable/disable lifecycle | Pin-out blocking fixed |
| `d15407a` | Scoped `normalizeScroll` + rAF removed | Introduced page skip ❌ |
| `27fb73d` | `normalizeScroll` removed + `touchstart` | iOS momentum returned |
| `5624ab5` | Module-level `normalizeScroll(true)` | iOS momentum fixed ✅, jank |
| `b98377e` | Momentum config (0.3 s cap) | Worse than before ❌ |
| `5e78c2f` | Revert momentum config | End of Phase 1 |

---

## 3. Phase 2 — Mobile path extraction

Desktop was stable but mobile was still using the same GSAP pin path and producing a different set of symptoms. After ~30 research sources, a Codex second opinion, and two rounds of engineering review, the decision was to **fully split desktop and mobile**. The rationale:

1. iOS Safari compositor-thread scroll and JS scroll interception are fundamentally at odds. Every single-path fix required a compromise on one side.
2. Pinned scroll-trap is the wrong interaction primitive on mobile to begin with — see NNGroup on scroll hijacking.
3. But the Thesis section's page-by-page storytelling is core to the message, so we could not just drop the pagination on mobile.
4. Solution: keep desktop untouched (GSAP pin + Observer), build a separate mobile path that achieves the same experience with a different mechanism (Swiper vertical + sentinel-based capture).

### 2.1. Initial mobile extraction

- **Commit**: `018dd79` — "feat: replace mobile GSAP scroll-trap with Swiper horizontal fade"
- **Attempt**: Build `ThesisSectionMobile` with Swiper horizontal + EffectFade.
- **Outcome**: Build passed. Horizontal swipe felt wrong for a "read down" story. More importantly, a "something went wrong" error appeared on first mobile load because GSAP's pin-spacer wrapper conflicted with React's vDOM during hydration.
- **Status**: ❌ hydration crash.

### 2.2. GSAP pin-spacer + React hydration conflict

- **Commit**: `6a1a73f` — "fix: prevent GSAP pin-spacer DOM conflict on mobile hydration"
- **Symptom**: On mobile first load, Hero did not render. Thesis appeared immediately. A "something went wrong" error was logged. Assets were missing.
- **Root cause**: `isMobile` started at `false` (the SSR default). GSAP created its pin-spacer DOM. Then the `useEffect` ran and flipped `isMobile` to `true`. React tried to replace the GSAP-manipulated DOM subtree, and `removeChild` threw a DOMException because the node was no longer where React thought it was.
- **Fix**: Split `ThesisSection` into a parent (device detection) and `ThesisSectionDesktop` (GSAP hooks). Initialize `isMobile` to `null` instead of `false` so SSR renders an empty `section#thesis` placeholder and only the correct subtree mounts after the media query resolves.
- **Status**: ✅ resolved.

### 2.3. Horizontal swipe UX problem

- **Commit**: `f57f6e8` — "fix: switch mobile thesis to vertical swipe with manual edge exit"
- **Symptom**: Horizontal swipe felt unnatural for the thesis content.
- **Fix**: Change Swiper direction from `horizontal` to `vertical`. `releaseOnEdges` is broken on iOS (Swiper issues #6691, #7923, unresolved as of March 2025), so edge exit is implemented manually via `touchstart` / `touchend` delta computation against `EDGE_THRESHOLD = 50 px`.
- **Status**: ✅ UX resolved. Introduced the next problem.

### 2.4. Page-level scroll passes straight through thesis — attempt 1 (body lock)

- **Commit**: `22559bb` — "fix: add body scroll lock so thesis stops page scroll on mobile"
- **Symptom**: Scrolling down from Hero would flash past thesis slide 0 and continue all the way into Products. Swiper vertical is a `100 dvh` section in the DOM, but page-level momentum just ran right over it.
- **Attempt**: IntersectionObserver with `threshold: 0.6` + body scroll lock (`document.body.style.overflow = 'hidden'` + `position: fixed`).
- **Outcome**: Partially worked but introduced new problems:
  - The 60% threshold locked at awkward visual positions.
  - On exit, the 40% of thesis still in view re-triggered the lock.
  - Smooth scroll felt like a "jump".
  - Race condition between body lock and smooth scroll.
- **Status**: ❌ partial fix, new bugs introduced.

### 2.5. Sentinel-based lock — attempt 2

- **Commit**: `9693a5a` — "fix: sentinel-based scroll lock with Safari fallback and exit cooldown"
- **Changes**:
  - IO `threshold: 0.6` → a sentinel element (thesis top = viewport top when the sentinel leaves the viewport).
  - `behavior: 'smooth'` → `behavior: 'auto'` (instant) on entry.
  - Added `body overflow: hidden` + `touchmove preventDefault` Safari fallback.
  - Exit cooldown raised to 800 ms.
  - WebGL: restrict mount to active slide only.
- **Outcome**: Re-lock problem fixed. Timing race between body lock and smooth scroll remained.
- **Status**: ❌ partial.

### 2.6. Smooth transitions + rAF polling — attempt 3

- **Commit**: `613d9cb` — "fix: smooth transitions for thesis entry and exit on mobile"
- **Attempt**: Both entry and exit used `behavior: 'smooth'`. An rAF loop polled `window.scrollY` to detect completion before applying the body lock.
- **Root cause of failure**: iOS compositor momentum and `window.scrollY` (which is JS-thread) desync during smooth scroll. The rAF poll missed the completion moment.
- **Status**: ❌ failed.

### 2.7. Architecture replacement — `touchmove.preventDefault` capture

- **Commit**: `aa3f932` — "fix: replace body lock with touchmove preventDefault capture"
- **Fundamental redesign**: drop body lock. Switch to the fullpage.js pattern.
- **Changes**:
  - `body { overflow: hidden; position: fixed }` → `document.addEventListener('touchmove', preventPageScroll, { passive: false })`.
  - Synchronous, event-level scroll blocking before the compositor decides to scroll.
  - A `top sentinel` plus a `bottom sentinel` for bidirectional capture.
  - Swiper still handles its own container touches.
  - Entry: `scrollTo(sectionTop, 'auto')` + immediately attach the document listener.
  - Exit: remove the listener + smooth scroll to the adjacent section.
- **Outcome**: Forward path (Hero → Thesis) worked perfectly. User feedback: "야야야야야 좋다!!!!".
- **Status**: ✅ mostly resolved. Reverse path still had issues.

### 2.8. Reverse re-entry cooldown problem

- **Commit**: `a179588` — "fix: direction-aware cooldown for reliable reverse scroll re-entry"
- **Symptom**: After an exit-down (Thesis → Graph), all sentinels were blocked for 1000 ms. Users who immediately reversed direction (upward) could not re-enter thesis.
- **Fix**: Split the cooldown per direction.
  - `release('down')` → only the top sentinel is blocked; the bottom sentinel is immediately open.
  - `release('up')` → only the bottom sentinel is blocked; the top sentinel is immediately open.
  - State machine simplified from three states to `'idle' | 'captured'` (exit state removed).
  - Cooldown: 1000 ms → 500 ms.
- **Status**: ✅ reverse re-entry now possible. Introduced a "jump" feeling on reverse re-entry.

### 2.9. Reverse re-entry "teleport" feeling

- **Commit**: `8b9312e` — "fix: delay reverse re-entry + use IO entry coords to smooth thesis jump"
- **Symptom**: Scrolling up from ThesisGraph felt like "teleporting" back into Thesis.
- **Initial (wrong) diagnosis**: `behavior: 'auto'` was blamed. User pushed back — the layout means `sectionTopAbs` moves ~0 px on reverse re-entry because both thesis and graph are `h-dvh`.
- **Revised diagnosis**: three combining factors.
  1. The bottom sentinel was placed immediately below thesis (0 px gap), so the tiniest upward nudge after exiting downward re-fired it. "I just left, why am I being pulled back in?"
  2. `capture()` internally called `section.getBoundingClientRect()`, which read a stale value after iOS momentum overshot past the sentinel during the IO callback's microtask delay.
  3. The 500 ms cooldown was right on the boundary of the smooth scroll animation's settle time.
- **Fix**:
  1. Add `rootMargin: '0px 0px -50% 0px'` to the bottom sentinel — ThesisGraph must be at least half visible before reverse re-entry can fire.
  2. Use `entry.boundingClientRect` (the IO snapshot) instead of a fresh `getBoundingClientRect()`, removing momentum overshoot error.
  3. Change `capture` signature to `capture(direction, sectionTopAbs)` so each sentinel computes its own coordinate and passes it in.
  4. Cooldown 500 → 700 ms.
- **Status**: ✅ verified on iPhone in this session as part of Phase 3.

### Phase 2 commit history

| Commit | What it did | Outcome |
|---|---|---|
| `018dd79` | Swiper horizontal + EffectFade | Horizontal UX wrong, hydration crash |
| `6a1a73f` | Split `ThesisSection` into parent + desktop | Hydration fixed |
| `f57f6e8` | Swiper vertical + manual edge exit | Scroll passthrough ❌ |
| `22559bb` | Body scroll lock (threshold 0.6) | Partial, timing bugs |
| `9693a5a` | Sentinel-based + Safari fallback | Re-lock fixed, still has timing |
| `613d9cb` | Smooth transitions | Smooth race condition ❌ |
| `aa3f932` | **Touchmove `preventDefault` capture** | **Forward path perfect** ✅ |
| `a179588` | Direction-aware cooldown | Reverse re-entry works |
| `8b9312e` | `rootMargin` + IO entry coords | Reverse jump smoothed ⏳ |

---

## 4. Phase 3 — Review session stabilization (this session)

The Phase 2 work was iPhone-verified through `8b9312e`. Then a structured code review uncovered six additional issues (four were real, two collapsed together). This section tracks what was fixed, what was attempted and reverted, and how the resolution status lines up with the original findings.

The commits that make up Phase 3, in order:

| Commit | Title |
|---|---|
| `15a1382` | docs: clarify thesis mobile webgl mount note |
| `2a1262a` | fix: mobile thesis touchcancel and reverse race |
| `5935962` | docs: log open issue for /about hash nav to hero (later replaced by GitHub issue #5) |
| `22d7412` | fix: loosen hash capture alignment tolerance to 4px |
| `ea6c175` | fix: guard AsciiCanvas init against destroyMosaic race |

### 4.1. WebGL mount note corrected (`15a1382`)

- **Finding**: A comment in `ThesisSectionMobile` and a section of this history claimed "only the active slide mounts its WebGL canvas (aggressive for mobile GPU)". Reading `AsciiCanvas.tsx` showed this was never true.
- **Reality**: `AsciiCanvas` uses an `IntersectionObserver` with `rootMargin: '200px'` which is purely geometric and ignores `opacity: 0` wrappers. All 6 `MobileAscii` canvases mount concurrently once thesis is in the viewport. The headroom comes from `MAX_ACTIVE_CONTEXTS = 10` in `AsciiCanvas.tsx`.
- **Action**: Update the comment and this history. No code change. True single-canvas mounting is explicitly rejected because it would need real unmount of inactive subtrees, which introduces a visible re-init delay on every slide change.

### 4.2. `touchcancel` stray-`touchend` bug (part of `2a1262a`)

- **Symptom**: On iOS, when a `touchcancel` (incoming call, notification, multi-touch disruption) was followed by a stray `touchend`, the old reset of `touchStartY = 0` combined with a `clientY ≈ 400` produced `deltaY ≈ -400`, which tripped the edge exit threshold on slide 0 and bounced the user back to Hero.
- **Root cause**: The original `touchcancel` handler cleared `touchStartY` to zero, but `0` is a **valid coordinate** (top of the viewport). Using it as a sentinel value was ambiguous.
- **Fix**: Introduce `touchValidRef`. Set it to `true` on `touchstart`, `false` on `touchcancel`. `touchend` early-returns if `touchValidRef` is `false`. `touchStartY` is left untouched so the normal path is bit-identical to before.
- **Behavior change analysis**: none on the normal path. The edge-exit math and the Swiper interaction remain exactly as before for any sequence that does not go through `touchcancel`.
- **Status**: ✅ iPhone-verified.

### 4.3. `pendingReverseCaptureRef` replay race (part of `2a1262a`)

- **Symptom**: After an exit-down, pushing the scroll up by even 1–2 px during the 1200 ms suspend window stored a "pending reverse capture" flag. A flush timer firing at `1200 + 32 ms` re-evaluated the scroll position and called `capture('bottom', sectionTopAbs)`, dragging the user back to slide 7 **1.2 seconds after they thought the exit was complete**, with no gesture in the meantime.
- **Root cause**: The `pendingReverseCaptureRef` replay mechanism assumed it could reconstruct user intent from a stale threshold crossing. It could not: by the time the flush timer ran, the user might have moved further, reversed again, or just stopped. The position check `currentScrollY <= sectionTopAbs` at flush time was not a proxy for "the user still wants to re-enter thesis".
- **Fix**: Remove the `pendingReverseCaptureRef` mechanism entirely. In-suspend reverse crossings are simply ignored; only a fresh `onScroll` crossing after the suspend window expires will capture. This is the behavior that shipped in `d14f610` and was iPhone-verified at that point.
- **Behavior change analysis**: none on the normal path. The only paths affected are the 1.2 s replays that were user-visible bugs.
- **Status**: ✅ iPhone-verified. Also resolved the originally filed "wrong-slide direction in reverse fallback" finding, which was downstream of this.

### 4.4. Hash capture alignment tolerance (`22d7412`)

- **Context**: `pendingHashCaptureRef` is checked in three places, each comparing `window.scrollY` against `sectionTopAbs` with an allowed gap of `HASH_CAPTURE_ALIGNMENT_TOLERANCE`. The old value was `1 px`.
- **Problem**: 1 px is too tight to survive subpixel rounding (1–2 device px at 2x/3x DPR), `ScrollTrigger.refresh()`'s layout jiggle, and iOS dynamic address-bar movement.
- **Fix**: `1 → 4`. The constant is only consulted while `pendingHashCaptureRef` is set, which is only during hash-triggered entries. Normal user gestures never read it.
- **Behavior change analysis**: strictly increases the chance that a hash-triggered entry captures cleanly. Can only go from "silent fail" to "capture success" — never the other direction.
- **Status**: ✅ applied.

### 4.5. `AsciiCanvas` destroyMosaic race (`ea6c175`)

- **Observed symptom**: `AsciiCanvas: Failed to initialize AscMosaic: Error: AsciiMosaicFilter: timed out waiting for ready state` appearing repeatedly in the browser console during rapid Hero ↔ Thesis back-and-forth. At some point the dev server appeared to hang.
- **Implicated secondary symptom**: intermittent "thesis doesn't lock, page just scrolls through" reports after a few back-and-forth scrolls.
- **Root cause**:
  1. Rapid `isVisible` toggling on `AsciiCanvas` queued multiple `initMosaic` invocations in the global `enqueueInit` queue.
  2. Between `await mosaic.addModel(…)` and `await mosaic.enableAsciiMosaicFilter(…)`, `destroyMosaic` could race the init flow.
  3. `destroyMosaic` calls `mosaic.dispose()`, which inside `AscMosaic` sets `this.asciiMosaicFilter = null` and disposes `this.renderer`.
  4. But `destroyMosaic` does not touch `mountedRef`, so the `mountedRef.current` guard inside `initMosaic` passes and `enableAsciiMosaicFilter` runs on the already-disposed `AscMosaic`.
  5. `enableAsciiMosaicFilter` allocates a fresh `AsciiMosaicFilter` against a disposed `renderer`; `checkReady` polls for 5 s and finally rejects.
  6. When multiple canvases hit this at the same time, the main thread gets stuck in a stack of `setTimeout(10ms)` polls plus Three.js retrying against a disposed context. Touch and scroll events get delayed, the top sentinel IO callback runs late, and the Hero → Thesis capture is missed — producing the "thesis doesn't lock" symptom.
- **Fix**: After every `await` in `initMosaic`, check both `mountedRef.current` AND `mosaicRef.current === mosaic`. If the race has happened, the local `mosaic` reference is no longer the canonical one, so we `stopAnimate()` + `dispose()` it immediately and bail. The active context count is decremented only when `mosaicRef.current === mosaic` to avoid double-decrementing when a newer init has already replaced us.
- **Behavior change analysis**: none on the normal path. The guard is only true when a race has happened, and on the normal path `mosaicRef.current === mosaic` holds all the way through. On the race path, the previous behavior was a 5 s timeout error + a main-thread stall; the new behavior is an immediate quiet cleanup.
- **Status**: ✅ applied. Covered in PR #4.
- **Hypothesis on the "scroll-through" symptom**: Phase 3 posits that the originally-reported "Hero → Thesis sometimes doesn't lock" is **downstream** of this race, not a separate capture bug. Rapid back-and-forth causes the race, the race stalls the main thread, the stalled main thread drops touch/scroll events, the capture is missed. This hypothesis has to be confirmed on iPhone after the fix ships — see §10 Next steps.

### 4.6. Reverted attempt — remove `suspendCapture()` from `release()` (important)

This fix attempt was landed briefly and then reverted after an iPhone regression. Recording it here so nobody re-introduces it.

- **Hypothesis**: `suspendCapture()` was a redundant wrapper for "prevent the smooth exit scroll from re-capturing the boundary we just crossed", and `blockedSentinel` already provided direction-aware cooldown for that. Removing `suspendCapture()` from `release()` should eliminate a global pause window that was blocking the mind-change re-entry path.
- **Attempted change**:
  ```ts
  const release = useCallback((exitDirection: 'down' | 'up') => {
    if (stateRef.current !== 'captured') return;
    stopCapture(exitDirection === 'down' ? 'bottom' : 'top');
    // suspendCapture() removed
  }, [stopCapture]);
  ```
- **Reality on iPhone**: produced a brand-new regression — "scrolling at the last thesis slide sends you back to slide 0".
- **Post-mortem root cause**: `suspendCapture()` is NOT duplicated by `blockedSentinel`. It covers the **opposite direction** during a mid-exit mind-change.
  - Scenario: on slide 6, swipe down → `release('down')` → smooth scroll toward ThesisGraph.
  - User changes their mind mid-scroll and swipes up. `scrollY` drops back past Hero.
  - User swipes down again. `scrollY` crosses `thesisTop`. Top sentinel IO fires.
  - With `suspendCapture()`: `captureSuspendedUntilRef` still active, top sentinel path is blocked, fire is skipped, user scrolls through into Products.
  - Without `suspendCapture()`: no global block, `capture('top')` runs, user snaps to slide 0. "Last page → first page" regression.
  - In short: `blockedSentinel` handles the same-direction boundary. `suspendCapture()` handles the opposite-direction boundary. They are a **pair**, not a duplicate.
- **Revert**: restored `suspendCapture()` in `release()`. Current `ThesisSectionMobile.tsx` matches the `22d7412` checkpoint for this logic.
- **Lesson**: always test mind-change paths, not just the happy exit path. And never assume a cooldown is redundant just because it overlaps in time with another cooldown — they may be covering different dimensions (direction vs window).

### Phase 3 commit history

| Commit | What it did | Outcome |
|---|---|---|
| `15a1382` | Correct the WebGL mount note in history + source | Documentation only |
| `2a1262a` | `touchValidRef` + remove `pendingReverseCaptureRef` | ✅ iPhone-verified |
| `5935962` | Open-issue log for `/about` → hero (superseded by GH issue #5) | Documentation only |
| `22d7412` | `HASH_CAPTURE_ALIGNMENT_TOLERANCE` 1 → 4 | ✅ applied |
| `ea6c175` | `AsciiCanvas initMosaic` race guard | ✅ applied |

---

## 5. Known open issue

### `/about` → hamburger → THESIS → user lands on Hero

Tracked in [GitHub issue #5](https://github.com/1sixtech/1six-website/issues/5).

On iPhone, tapping the THESIS link in the hamburger menu while on `/about` routes to `/` but the page settles on Hero. `ThesisSectionMobile` never transitions to `'captured'`. Reproduces regardless of starting scroll position inside `/about`. Same-page `/` → hamburger → THESIS works correctly.

**This PR does not fix it.** A first attempt that added `manualUnlockRef.current = true; unlockScroll(false)` to the cross-route else branch of `Header.handleNavClick` was based on a wrong hypothesis and showed no symptom change on device; it was reverted.

**Why this is hard**: it is a coordination bug across four systems (`Header.handleNavClick`, the menu scroll-lock `useEffect` in Header, `ScrollToTop.tsx`, and `ThesisSection` / `ThesisSectionMobile`'s mount sequence). The exact order in which these run is different from the same-page path and small differences in effect ordering determine whether the hash handoff succeeds.

**Recommended next step**: attach an iPhone to Safari Web Inspector and log `scrollY` + handler identity at every stage. Issue #5 contains six candidate hypotheses (A–F) and a step-by-step instrumentation guide. The key is to identify exactly which stage drops `scrollY` back to zero, or dispatches `HASH_SCROLL_REQUEST_EVENT` with zero listeners attached.

**User workaround**: tap the logo (routes to `/` without a hash) and scroll down manually.

---

## 6. Design decisions log

### Why split desktop and mobile at all

Eliminating the race between iOS compositor scroll and JS scroll interception turned out to require accepting different mechanisms on each platform. GSAP `pin: true` is fine on desktop but fundamentally fragile on iOS. Pinned scroll-trap is also the wrong UX primitive on mobile (NNGroup). Keeping the visual experience consistent while using different mechanisms ("adaptive complexity") is the industry standard for this problem.

### Why `touchmove.preventDefault` instead of body lock

`body { overflow: hidden }` + `position: fixed` were attempted three times (`22559bb`, `9693a5a`, `613d9cb`) and all failed because:

- iOS compositor momentum crosses the lock before the asynchronous style change is committed.
- `window.scrollY` desyncs from the compositor during a smooth scroll.
- `position: fixed` causes a visible layout shift.

`document.addEventListener('touchmove', preventDefault, { passive: false })` is synchronous, event-level, and does not modify the DOM. This is the fullpage.js pattern. It is the only thing that worked reliably on iPhone.

### Why sentinel-based capture instead of `IntersectionObserver` with a percent threshold

`threshold: 0.6` was attempted in `22559bb` and consistently locked at awkward visual positions. A zero-height sentinel placed immediately above (or below) the thesis section guarantees that IO fires at a geometrically precise point (thesis top = viewport top). `rootMargin` gives a clean way to shift the fire point for the reverse case (`'0px 0px -50% 0px'` requires ThesisGraph to be half visible before reverse re-entry fires).

### Why reverse re-entry uses scroll-delta instead of a bottom sentinel

A zero-height bottom sentinel fires at its very first intersection (0 px boundary). On iOS Safari that was too eager — tiny upward nudges immediately after exiting downward kept pulling the user back in. A scroll-delta check (`prevScrollY > threshold && currentScrollY <= threshold`) is easier to reason about and more forgiving to iOS momentum noise. This change is the fix from `8b9312e`.

### Why `blockedSentinel` + `captureSuspendedUntilRef` are both needed

`blockedSentinel` blocks **the same-direction boundary** during the smooth exit animation, so the exit does not self-re-capture.
`captureSuspendedUntilRef` (via `suspendCapture()`) blocks **the opposite-direction boundary** for the same window, so a mid-exit mind-change does not snap to the other side of thesis. They are a pair. Phase 3 initially mistook them for duplicates and paid for that with a regression — see §4.6.

### Swiper `releaseOnEdges` is unusable on iOS

Swiper issues #6691 and #7923 are open and unresolved. `touchReleaseOnEdges` has been broken since v9 (#6381). Edge exit is implemented manually via `touchstart` / `touchend` delta.

---

## 7. Failed approaches — do not re-introduce

1. **`body { overflow: hidden }` + `position: fixed`** (`22559bb`, `9693a5a`, `613d9cb`)
   - Compositor momentum passes through before the lock applies.
   - `window.scrollY` desyncs with the compositor during smooth scroll.
   - `position: fixed` causes a visible layout shift.
   - Replaced by `touchmove.preventDefault` (`aa3f932`).

2. **`behavior: 'smooth'` on entry + rAF polling to detect completion** (`613d9cb`)
   - Smooth scroll momentum races iOS compositor state.
   - The rAF poll misses the true completion moment.
   - Replaced by instant snap + immediate capture (`aa3f932`).

3. **`IntersectionObserver` with `threshold: 0.6`** (`22559bb`)
   - Inexact trigger position.
   - 40% of thesis remaining in view after exit causes re-trigger.
   - Replaced by sentinel-based capture (`9693a5a`).

4. **Single cooldown that blocks both sentinels** (`aa3f932`)
   - Reverse re-entry impossible.
   - Replaced by direction-aware cooldown (`a179588`).

5. **`getBoundingClientRect()` read inside the `capture` callback** (`aa3f932` – `a179588`)
   - iOS momentum overshoots past the sentinel between IO detection and callback execution, so the rect read is stale.
   - Replaced by passing `entry.boundingClientRect` from the IO event into `capture` (`8b9312e`).

6. **Bottom sentinel placed immediately below thesis with no `rootMargin`** (`aa3f932` – `a179588`)
   - Too eager — fires on tiny upward nudges after exit.
   - Replaced by `rootMargin: '0px 0px -50% 0px'` (`8b9312e`).
   - Later replaced again by scroll-delta crossing detection in `onScroll` (`d14f610` era) because the zero-height sentinel still had a 0 px first-intersect edge case.

7. **Swiper `releaseOnEdges`** (rejected before attempting)
   - iOS Safari bug (#6691, #7923, unresolved).
   - Manual `touchstart` / `touchend` delta is the only working path.

8. **Module-level `normalizeScroll(true)`** on mobile (Phase 1 attempted, Phase 2 removed)
   - Fixes iOS momentum but puts every scroll tick on the JS thread → WebGL jank.
   - Removed on mobile; retained on desktop where WebGL load is lower and jank is less visible.

9. **`pendingReverseCaptureRef` replay across the suspend window** (Phase 3 removed, see §4.3)
   - Re-evaluating a stale threshold crossing after 1200 ms does not recover user intent.
   - Deleted; in-suspend reverse crossings are now dropped.

10. **Removing `suspendCapture()` from `release()`** (Phase 3 attempted and reverted, see §4.6)
    - Mistakenly thought `blockedSentinel` already covered what `suspendCapture()` does. It does not — they cover orthogonal directions.
    - Reverted. Regression was "last page → first page" on mind-change.

---

## 8. Research notes

### iOS Safari scroll model

- iOS momentum scroll runs on the compositor thread (`UIScrollView`). JS cannot observe or intervene mid-momentum.
- `touchstart` `preventDefault` can stop momentum from starting; once momentum has started, JS can no longer stop it.
- `touchmove` `preventDefault` behavior is unstable on iOS 15+; `touch-action: none` CSS is a more reliable primitive when applicable.
- `overscroll-behavior: none` is **ignored** on iOS (WebKit #176454).
- `body { overflow: hidden }` only works correctly on iOS 16.3+.
- **The reliable primitive on iOS**: `document.addEventListener('touchmove', preventDefault, { passive: false })`. This blocks synchronously at the event level before the compositor commits.

### GSAP + iOS

- `normalizeScroll` is experimental. It skips every second `touchmove` and routes all scroll through the JS thread.
- `ScrollTrigger` `pin: true` jitters frequently on iOS because of `position: fixed` + compositor layer conflicts.
- The most commonly recommended pattern when using GSAP pin on mobile is **don't** — split desktop and mobile.

### Swiper.js

- `releaseOnEdges`: iOS bug (#6691, #7923), unresolved as of March 2025.
- `touchReleaseOnEdges`: broken since v9 (#6381).
- Vertical + fade are supported but coexisting with page-level scroll is hard.
- **Conclusion**: don't depend on `releaseOnEdges`. Compute edge exit directly from `touchstart` / `touchend` deltas.

### fullpage.js pattern (primary inspiration)

- Uses `touchstart` + `touchmove` `preventDefault` directly.
- Does not use `overflow: hidden` or `position: fixed`.
- Event-level synchronous blocking is the most reliable approach.
- Exposes `setAllowScrolling(false)` as a state-management API.

### UX research

- NNGroup on scroll hijacking: it degrades control, freedom, and discoverability on mobile.
- BUT the "page-at-a-time reveal" pattern is effective for storytelling, as long as it's bounded in scope. This is distinct from scroll-jacking the entire page.
- "Adaptive complexity" (different implementations on desktop vs mobile) is the industry standard for this kind of design.

### CSS scroll-snap

- WebKit #243582: on fast flicks, scroll-snap flies all the way to the end. Unresolved.
- Unsuitable for mobile fullpage.

### IntersectionObserver

- `entry.boundingClientRect` is a snapshot taken at the moment of detection. The callback runs later, and iOS momentum can move the actual rect between those two moments.
- `rootMargin` shifts the fire point (`'0px 0px -50% 0px'` = viewport bottom edge raised by 50%).

---

## 9. Key files

| File | Role |
|---|---|
| `src/components/home/ThesisSection.tsx` | Device-split parent. Renders placeholder → `ThesisSectionMobile` or `ThesisSectionDesktop`. |
| `src/components/home/ThesisSectionMobile.tsx` | Mobile: Swiper vertical + sentinel + touchmove capture + reverse-scroll re-entry + hash event handler. |
| `src/components/home/thesisData.tsx` | Shared data: `THESIS_STATES`, `InlineAscii`, `MobileAscii`, `subTextClass`. |
| `src/components/home/ThesisGraph.tsx` | `id="thesis-graph"` — exit target for `release('down')`. |
| `src/components/ascii/AsciiCanvas.tsx` | WebGL mosaic canvas with `MAX_ACTIVE_CONTEXTS = 10` budget, `initMosaic` queue, destroyMosaic race guard. |
| `src/lib/ascmosaic/*.ts` | The Three.js-based `AscMosaic` library. `enableAsciiMosaicFilter` polls for ready state — this is what used to time out before the Phase 3 race guard. |
| `src/components/layout/Header.tsx` | Hamburger nav. Emits `HASH_SCROLL_REQUEST_EVENT` for same-page hashes, delegates to `router.push` for cross-route. |
| `src/components/ui/ScrollToTop.tsx` | Strips the hash on mount, forces `scrollTo(0, 0)`, polls for readiness, then fires `emitHashScrollRequest` + `scrollToHashTarget`. |
| `src/lib/hashScroll.ts` | Shared hash utilities: `HASH_SCROLL_REQUEST_EVENT`, `emitHashScrollRequest`, `scrollToHashTarget`, `shouldWaitForThesisPin`, `isThesisPinReady`. |
| `src/app/globals.css` | `intro-lock` class, `.pin-spacer` background color. |
| `src/hooks/useScrollReveal.ts` | Scroll-reveal polling fallback. |
| `src/app/layout.tsx` | Root layout with the blocking theme script and `intro-lock` bootstrap. |
| `src/app/page.tsx` | HomePage. Mounts `ScrollToTop` and the section sequence. |

---

## 10. Next steps

### Verified on iPhone (Phase 3 ✅)

- Forward Hero → Thesis capture at slide 0.
- Thesis internal slide swipe (1–7).
- Slide 6 + swipe down → ThesisGraph smooth exit.
- Slide 0 + swipe up → Hero smooth exit.
- Reverse re-entry from ThesisGraph back into Thesis at slide 7.
- Touch cancel mid-swipe does not false-exit.
- 1.2 s post-exit replay capture is gone (no forced slide 7 snap).
- Hash capture alignment accepts up to 4 px slack.

### To be verified on iPhone (follow-up after PR #4 merges)

- Rapid Hero ↔ Thesis back-and-forth stress test:
  - No `AsciiMosaicFilter: timed out` errors in the console.
  - Thesis still captures reliably after repeated toggles.
  - This is the test that validates whether the `AsciiCanvas` race guard (`ea6c175`) also resolves the "thesis sometimes doesn't lock" symptom (the Phase 3 hypothesis — see §4.5).

### Known open

- Issue #5 — `/about` → hamburger → THESIS stays on Hero. Requires Safari Web Inspector tracing on device.

### Deferred (investigate only if user feedback demands it)

- `EDGE_THRESHOLD = 50 px` — feels fine in current testing but has not been rigorously tuned.
- Swiper `slideTo(idx, 0)` is an instant visual jump. If users complain, consider a short fade, but benchmark for WebGL init cost first.
- `CAPTURE_SUSPEND_MS = 1200 ms` — tied to the smooth-scroll settle time. Do not shorten without verifying on device against the mind-change regression path (see §4.6).
- Dead hash-poll `useEffect` in `ThesisSectionMobile.tsx` — static analysis suggests it never runs (because `ScrollToTop` strips the hash before `ThesisSectionMobile` mounts), but Issue #5 might need it as a fallback, so it is explicitly NOT removed yet. Re-evaluate after Issue #5 is resolved.

### Architectural invariants — do not change without device verification

- The `isMobile === null` placeholder in `ThesisSection.tsx` — prevents GSAP pin-spacer hydration conflicts.
- `MAX_ACTIVE_CONTEXTS = 10` in `AsciiCanvas.tsx` — the 6-canvas concurrent mount pattern depends on it.
- `entry.boundingClientRect.bottom < 0` guard on the top sentinel IO callback.
- Scroll-delta based reverse re-entry (do not re-introduce a bottom IntersectionObserver).
- `blockedSentinel` + `captureSuspendedUntilRef` pair — they cover different dimensions, both are needed.
- `ScrollToTop.tsx`'s hash-strip + `scrollTo(0, 0)` + poll sequence — this is the known fix for the GSAP ScrollTrigger pin race on desktop; re-enabling the native hash scroll will regress desktop.
