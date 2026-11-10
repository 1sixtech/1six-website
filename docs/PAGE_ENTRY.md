# Page entry and shared preparation

Current contract, v0.3.4.0 (2026-11-09). The owner
approved a shared first-entry experience, then clarified that Writing should open
immediately, About should prepare Thesis in the background, and refresh/revisit
should skip the logo.

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

Each route mounts its own `IntroOverlay` and `IntroOrchestrator`. Both keys follow
the pathname and must differ from each other: with one shared key, React removed
only the old orchestrator, and every client navigation left the previous route's
full-screen overlay in the page (fixed in v0.3.9.1). A section hash on the same
route keeps both mounted.

`IntroOrchestrator` controls only `intro-lock` and the site logo. Writing does not
consume the first visual entrance. `siteIntroSeen` records brand frequency, not
cache availability; an in-memory flag also handles blocked storage within an SPA
visit. A reload with storage blocked may replay. New tabs with an opener may
inherit a copy of sessionStorage, so a new tab does not always replay.

The selected route/section reports real readiness through `introState`: About's
current mark, Thesis's hero, its first slide, or its map. Atlas handles and fallback
markup are insufficient: glyph data, the source's real pixels (an image's data, a
video's first frame), and the first mosaic render must be ready. Text-only pages
wait for neither a foreign canvas nor background transfers. Optional preparation
starts when fonts and the current scene are ready, or when the five-second readiness
deadline expires.

Thesis's text starts after the site logo has gone. Its `thesis-entry-lock` is
separate and has the existing 2.5-second safety timer. Recognized section entries
do not acquire that offscreen text lock. `ThesisSectionMobile` capture, cached
position math, and directional cooldowns remain unchanged.

## Shared assets

`siteAssets.ts` lists only active visuals (17 unique URLs, approximately 0.77 MB),
shared by real renderers and the warmup queue. It excludes retired media, all-font
bulk downloads, article archives, and built chunk filenames. Next router prefetch
prepares route code/payloads through the framework's own API.

After current-screen readiness or its deadline, two low-priority workers download
remaining visuals. About is not blocked by Thesis's downloads. Image bytes are kept
as Blob URLs for this document and used by the texture loaders. This is byte reuse,
not a promise that GPU initialization is already done.

Video is different. It never takes a Blob source: v0.3.3.0 did, and iPhones then fell
back to "dots everywhere" on client navigation into Thesis (see WebKit 270772 and
232076 for the platform behavior). A native iOS 27 probe showed the media stack
downloads a fetched file again as Range requests, so phones skip warming video and
desktop keeps it for the HTTP cache. A pooled video stays in the document, at 2px and
nearly transparent: asked to play before it has loaded, a video outside the document
stops presenting frames about a second in on iOS WebKit while its clock keeps running.

Foreground navigation cancels unfinished background work. Completed bytes remain
available across SPA routes. Returning to a visible tab resumes unfinished work
only after its foreground gate has passed. Reduced motion and Save-Data suppress
optional work. Errors/timeouts do not block entry or become permanent ready flags.

## Video loading and failure

Warmup is byte-only and never starts a decoder; only `videoPool.load`, called for a
mounted canvas, does. Priming every Thesis video at once ran eight players
together just as the Hero appeared, on a phone whose decoders are shared with
anything else running, such as a video call.

- A mounted canvas loads its own video through `videoPool.load`, one queue turn at a
  time. No turn outlasts 1.5 seconds (`withinTurn`), so nothing a canvas waits for can
  hold the canvases behind it. A source slower than that rejoins at the front when it
  arrives; a canvas waiting on a first frame keeps waiting outside the queue.
- `play()` is requested right after `load()`, and any of `canplay`, `loadeddata`, or a
  video frame callback completes the load. iOS can hold `canplay` until playback is
  requested; waiting for `canplay` before asking to play can wait forever.
- A completed load is not readiness. A canvas reports ready only after a real first
  frame (`AscMosaic.waitForSceneTextures`). A playing video must present one: WebKit
  can report `HAVE_ENOUGH_DATA` before any frame exists, and uploading then reads back
  an empty texture, tiles one glyph, and can block the main thread for a second. Only
  a video that cannot report frames, because it is paused (Low Power Mode) or the
  browser has no `requestVideoFrameCallback`, is taken on `readyState`.
- A source that fails, or shows no frame within five seconds, retries after one and
  three seconds, then falls back to the still. Time in a hidden tab does not count
  against the five seconds. Returning to a visible tab starts a failed source over.
- There is no stand-in material. A solid color, or a texture that has no frame yet,
  would be tiled as one glyph across the canvas, which is the symptom this replaced.
  The mosaic draws nothing until a frame has been uploaded.
- A hidden Thesis slide stays mounted but paused, as does an eager canvas off screen
  (merely touching the viewport edge counts as off screen). The last canvas to release
  a video destroys it, because a paused video still holds its decoder. A canvas that
  leaves before taking its video calls `videoPool.abandon`, which stops the load or
  frees the element. Leaving any route cancels pending loads and tears down the pool.

## Regression checks

Run `pnpm test`, `pnpm lint`, and `pnpm build`. Check first entry/reload/client
navigation for About, Thesis, Writing, article, and author; delayed fonts/media;
missing or blocked chunks; reduced motion; Save-Data; hidden/visible transitions;
leaving mid-load; and direct section hashes. Confirm Writing has no visible logo
at first paint and completed visits do not replay it. After each client navigation
the page holds one `.intro-overlay`, not one per route visited. Fail or stall every `.mp4`
and confirm the page shows no repeated-glyph tile, and that a source failing once
recovers on its own. Hold back a playing video's first frame and confirm that canvas
does not report ready, the canvases behind it still build after its 1.5-second turn,
and it retries at the five-second deadline.

On native iOS, verify the complete Thesis slide/exit/re-entry flow, and check a
physical iPhone: simulators do not reproduce device media failures. Desktop WebKit does not prove UIKit momentum behavior. Do not weaken the
production CSP for local HTTP testing; use a loopback-only test transport or HTTPS.

Every entry to plain `/thesis` from another page starts on Hero; section URLs still
land on their sections. On native iOS, scroll About past its first section, open the
menu, and follow Thesis and Writing: each must start at the top. Pressing a Thesis link
while on Thesis, from a slide, from below Thesis, or from a section URL, goes to Hero,
leaves no hash, and shows slide one on the next entry, even if the visitor scrolls back
down at once. On desktop, click the Thesis link twice from another page: the header must
not stay on screen for the second click. The release list is in
[the QA checklist](QA_CHECKLIST.md).

Partnerships and their links are hidden pending confirmation. Their former names
are parked as pending data; the public About story goes from backers to contact.
Historical capture decisions remain in [THESIS_SCROLL_HISTORY.md](../THESIS_SCROLL_HISTORY.md).
