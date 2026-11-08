# Page entry and shared preparation

Current contract, v0.3.3.0 (2026-11-09). The owner approved a shared first-entry
experience, then clarified that Writing should open immediately, About should
prepare Thesis in the background, and refresh/revisit should skip the logo.

| Entry | Logo | Blocking work |
|---|---|---|
| First About or Thesis visual entry | Fill, reveal, fade | Current screen's fonts and actual rendered media |
| Writing, author, article, error page | None | None; server-rendered text is immediately available |
| Known About text anchor | None | None |
| `/thesis#thesis` | First visual-entry policy | First slide's art, not the offscreen hero |
| `/thesis#products` | First visual-entry policy | The world map alongside the target section |
| Same-tab completed visit, refresh, or warmed destination | None | Per-canvas loading continues normally |
| Reduced motion | None | Static media; no optional shared downloads |

The logo's 1.2-second minimum is visual pacing, not download progress. It fills
most of the way, then completes only when this screen is ready or its five-second
readiness deadline expires. Reveal/fade take another 0.95 seconds. The head script
has an independent eight-second watchdog if application chunks never hydrate.

## Ownership and readiness

`themeInit.ts` prepares direct loads before paint. `PageEntry` mirrors this for
client navigation, captures a section hash before ScrollToTop strips it, and gives
every entry an ownership ID. Old timers and asynchronous callbacks cannot unlock
a newer entry. Navigation removes masks and entry locks.

`IntroOrchestrator` controls only `intro-lock` and the site logo. Writing does not
consume the first visual entrance. `siteIntroSeen` records brand frequency, not
cache availability; an in-memory flag also handles blocked storage within an SPA
visit. A reload with storage blocked may replay. New tabs with an opener may
inherit a copy of sessionStorage, so a new tab does not always replay.

The selected route/section reports real readiness through `introState`: About's
current mark, Thesis's hero, its first slide, or its map. Atlas handles and fallback
markup are insufficient: glyph data, decoded media, and the first mosaic render
must be ready. Text-only pages wait for neither a foreign canvas nor background
transfers. Optional preparation starts when fonts and the current scene are ready,
or when the five-second readiness deadline expires.

Thesis's text starts after the site logo has gone. Its `thesis-entry-lock` is
separate and has the existing 2.5-second safety timer. Recognized section entries
do not acquire that offscreen text lock. `ThesisSectionMobile` capture, cached
position math, and directional cooldowns remain unchanged.

## Shared assets and iOS reuse

`siteAssets.ts` lists only active visuals (17 unique URLs, approximately 1.14 MB),
shared by real renderers and the warmup queue. It excludes retired media, all-font
bulk downloads, article archives, and built chunk filenames. Next router prefetch
prepares route code/payloads through the framework's own API.

After current-screen readiness or its deadline, two low-priority workers download
remaining visuals. About is not blocked by Thesis's downloads. Bytes are kept as
Blob URLs for this document and used by AsciiCanvas and videoPool. A native iOS 27
probe showed a full fetch followed by another full media Range transfer; handing the
same bytes to the media consumer avoided that second transfer. This is byte
reuse, not a promise that GPU initialization or video decoding is already done.

Foreground navigation cancels unfinished background work. Completed bytes remain
available across SPA routes. Returning to a visible tab resumes unfinished work
only after its foreground gate has passed. Reduced motion and Save-Data suppress
optional work. Errors/timeouts do not block entry or become permanent ready flags.

Only the open Thesis route primes its remaining video decoders, after its entry
scene is ready or its deadline expires. A canvas reuses a pending pool promise
rather than creating a second decoder. Leaving the route cancels pending promises,
removes sources, and tears down the pool. A priming play completion cannot pause an
acquired video.

## Regression checks

Run `pnpm test`, `pnpm lint`, and `pnpm build`. Check first entry/reload/client
navigation for About, Thesis, Writing, article, and author; delayed fonts/media;
missing or blocked chunks; reduced motion; Save-Data; hidden/visible transitions;
leaving mid-load; and direct section hashes. Confirm Writing has no visible logo
at first paint and completed visits do not replay it.

On native iOS, verify warmed media reuse and the complete Thesis slide/exit/re-entry
flow. Desktop WebKit does not prove UIKit momentum behavior. Do not weaken the
production CSP for local HTTP testing; use a loopback-only test transport or HTTPS.

Partnerships and their links are hidden pending confirmation. Their former names
are parked as pending data; the public About story goes from backers to contact.
Historical capture decisions remain in [THESIS_SCROLL_HISTORY.md](../THESIS_SCROLL_HISTORY.md).
