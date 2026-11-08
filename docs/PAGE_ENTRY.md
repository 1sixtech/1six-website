# Page entry and the About loader

Current contract, v0.3.2.0 (2026-11-08). The company-logo loader moved from
Thesis to About after the homepage became the company/team story. The old
loader warmed Thesis assets while the first About visit showed an unready 16.

| Entry | Company logo | Readiness and interaction |
|---|---|---|
| First About visit in a tab | Fill, then circular reveal and fade | Wait for the current 16 mark, with a 1.2s minimum and 5s readiness deadline |
| Repeat About visit | Skipped | Page is immediately interactive; the mark loads normally |
| About with reduced motion | Skipped | No loader lock; source media stays still and crossing fill is 100% |
| Thesis, direct or client navigation | None | Existing text scramble owns its lock, with the 2.5s safety unlock; eight videos warm independently |
| Writing | None | Immediately interactive |

The 5s deadline starts when the loader effect runs, not before the client JavaScript
has arrived. Its reveal takes another 0.5s plus a 0.3s fade. The logo fill is an
entrance animation, not a claimed percentage of bytes downloaded. Failed assets
must not trap a visitor behind it.

## Ownership

- `themeInit.ts` runs in the head before paint. It selects the theme and prepares
  the relevant route lock/mask. It uses `aboutIntroSeen`, independently of the
  retired Thesis intro flag.
- `PageEntry` mirrors that setup for client navigation. Leaving a route clears its
  lock and both clip-path properties. Leaving Thesis also tears down its video pool.
- `CrossingMark` owns About readiness for its current mount. Its layout effect resets
  readiness before loader effects run; an old canvas callback after unmount is ignored.
- `AsciiTeamSymbol` initializes eagerly, because waiting for intersection under a
  zero-radius mask would make readiness depend on the reveal it is meant to unlock.
- `AsciiMosaicFilter.isReady()` requires downloaded glyph data, not just a texture
  handle or empty coverage placeholder. Otherwise a slow PNG could release the
  loader before any glyphs were drawable.
- `AsciiCanvas` reports a successfully rendered mosaic through `onReady`. If WebGL
  fails, its fallback reports readiness after decoded video data/seek completion or
  image load. Merely mounting fallback markup is not readiness.
- `IntroOrchestrator` owns the About animation, minimum/deadline timers, and final
  unlock. It removes inline clip-path properties after completion so sticky elements
  retain normal geometry. Effect cleanup cancels timers, listeners, and GSAP tweens;
  stale microtasks and animation callbacks cannot complete another route's entry.
- `HeroSection` owns the independent Thesis text scramble and its unlock. It no
  longer waits for logo-reveal events. The iOS 27 capture correction and historical
  directional cooldowns remain in `ThesisSectionMobile` unchanged.

Readiness uses a current-mount boolean and `about-mark:ready`. The old all-canvas
registry, `preloadKey` properties, and unused intro lifecycle hooks were removed.
Thesis warmup still includes Desert, About01–06, and Graph, and never delays About.

## Regression checks

Run `pnpm test`, `pnpm lint`, and `pnpm build`. Effect tests cover loader timing,
StrictMode replay, route cleanup, stale completion, fallback decoding, and the
separate Thesis lock/warmup. The iOS capture and Header navigation tests remain.

Browser verification should include:

- A cold About load: logo fills, mark is ready before normal reveal, then mask and
  lock are removed. Verify a visible rotating mark on both themes and screen sizes.
- A delayed mark atlas: readiness, not just logo timing, controls reveal. Also verify
  the bounded deadline when an asset never becomes available.
- No WebGL with delayed fallback video; reduced motion with no animated loader.
- Repeat visits; About → Thesis → About; Thesis first, then first About visit.
- Leaving during loading/reveal; cold direct `/#investors` or `/#products` entry.
- Native iOS Thesis capture after the route change, including both edge exits and
  re-entry. Desktop WebKit cannot establish UIKit momentum behavior.

The separate [scroll history](../THESIS_SCROLL_HISTORY.md) records the iOS 27
momentum diagnosis and the older capture decisions. Preserve that historical record.
