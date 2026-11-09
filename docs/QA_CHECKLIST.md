# QA checklist

What has to pass before a release, centered on Thesis: its sections, its pin and capture,
the page locks around them, and the ways a page has started in the wrong place. Almost
every item comes from something that shipped broken or nearly did, so the last column
names what it protects. For why the code looks the way it does, read the
[scroll history](../THESIS_SCROLL_HISTORY.md) and [page entry](PAGE_ENTRY.md).

## How to run it

Start with `pnpm test`, `pnpm lint`, and `pnpm build`. Unit tests cover the logic, not
native scrolling, so they do not replace the items below.

| If the change touches | Run sections |
|---|---|
| `ThesisSection*.tsx`, `captureSettle.ts`, `hashScroll.ts`, `ScrollToTop.tsx` | 1, 2, 3, 4, 5 |
| `Header.tsx`, `Footer.tsx`, `FooterLink.tsx`, `useScrollReveal.ts` | 1, 2, 5 |
| About's snap rules, `CrossingRoot.tsx`, `AboutCrossing.tsx` | 1, 5, 6 |
| `themeInit.ts`, `PageEntry.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx`, `introState.ts` | 1, 5, 7 |
| `AsciiCanvas.tsx`, `ascmosaic/`, `videoPool.ts`, `assetWarmup.ts`, `siteAssets.ts` | 7, 8 |
| A Next.js, GSAP, or Swiper upgrade, or a new iOS Safari | All of them |

**Priority.** P0 blocks the release. P1 can ship only if the PR names the failure and why
it can wait. A P0 that could not be run is reported as not run, never as passed.

**Where.**

| Code | Environment |
|---|---|
| iOS | Native Safari in the iOS 26.5 and iOS 27 simulators |
| iPhone | A physical iPhone. Simulators do not reproduce device media failures |
| Android | Chrome on a physical Android phone |
| Phone | iOS and Android |
| Desktop | Chrome, Safari, and Firefox at 1440x900 and 1280x640 |
| All | Phone and Desktop |

**Record the result** in the PR's test plan: item ID, environment, pass or fail. List what
was not run.

### Ground rules

A result that breaks one of these does not count.

- **iOS items need native iOS.** Chromium phone emulation and desktop WebKit passed while
  iPhones had the menu snap bug (section 15 of the history), the iOS 27 momentum bug
  (section 11), and the reload video freeze.
- **Use a production build.** `pnpm build`, then `pnpm start`. Do not weaken the CSP for
  local HTTP: use a loopback-only proxy or HTTPS.
- **Open each run on a fresh origin or tab.** Reopening a visited URL in the same tab
  restores its old offset, which invalidates any "starts on Hero" check.
- **Use real gestures.** A synthetic swipe with no intermediate touch points does not
  advance Swiper. Use a finger or a multi-point touch path.
- **Watch for 4 seconds after arriving.** The worst of these bugs landed after the route
  had already changed and the page had already been reset. One reading of `scrollY` taken
  too early passes a broken build.

**Starts on Hero** means, in every item below: `scrollY` is 0, "we haven't crossed the 16%
yet." is on screen, `html[data-thesis-captured]` is absent, and no scroll follows.

## 1. Arriving on Thesis

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| ENT-1 | Scroll About past its first section, open the menu, tap Thesis | Starts on Hero | iOS | P0 | History 15: snap re-applied onto the next route |
| ENT-2 | Same, tap Writing | Writing starts at the top | iOS | P0 | History 15 |
| ENT-3 | About at its top, menu, Thesis | Starts on Hero | Phone | P0 | e6140f2 |
| ENT-4 | Header Thesis link from About at top, middle, and bottom | Starts on Hero | Desktop | P0 | 669f9d7 route move |
| ENT-5 | Footer Thesis link from the bottom of About | Starts on Hero | All | P0 | 669f9d7 |
| ENT-6 | Scroll Writing to the bottom, go to Thesis by menu or header | Starts on Hero | All | P0 | e6140f2: menu restored the old offset |
| ENT-7 | Load `/thesis` directly, revisit it, and reload from the bottom of the page | Starts on Hero each time | All | P0 | Entry race with the GSAP pin (history 1) |
| ENT-8 | Thesis, go to Writing, press Back | Starts on Hero | All | P1 | Scroll restoration is manual |
| ENT-9 | About, scrolled, open the menu, press browser Back to Thesis, then close the menu | Starts on Hero, not About's offset | Phone | P0 | History 15 |
| ENT-10 | Delay the Thesis route past 5 seconds, tap it from About's menu | Starts on Hero when it arrives | iOS | P1 | History 15: snap flag expiry |
| ENT-11 | Double-click the header's Thesis link from another page, at gaps from 0 to 1000 ms | Starts on Hero, URL has no hash | Desktop | P0 | History 15: second click reached the header |
| ENT-12 | Arrive by mouse click, from the top of About and from further down it | Header stays hidden until the first scroll, then slides in | Desktop | P0 | History 15 |
| ENT-13 | Leave Thesis, come back, scroll | Header hides again and reveals on the first scroll | All | P0 | e6140f2: header stuck off screen |

## 2. Sections and links on Thesis

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| SEC-1 | Open `/thesis#thesis` directly | Lands on slide 1, captured or pinned, URL keeps the hash | All | P0 | ScrollToTop hash sequence (history 1) |
| SEC-2 | Open `/thesis#products` directly | Lands on "adoption comes first." with the map below it, URL keeps the hash | All | P0 | Same |
| SEC-3 | On `/thesis?x=1`, press the Thesis link on Hero, twice | Stays on Hero, URL keeps its query and has no hash, no history entry added | All | P0 | History 15 |
| SEC-4 | From slide 5, tap Thesis in the menu | Starts on Hero, capture released, page not locked | Phone | P0 | #9, history 15 |
| SEC-5 | Then scroll down | Thesis rises showing slide 1, not slide 5, and captures slide 1 | Phone | P0 | History 15 |
| SEC-6 | Press Thesis, then swipe straight back down within a second | Captures slide 1, does not scroll past Thesis | iOS | P0 | History 11 and 15: immediate re-entry |
| SEC-7 | From below Thesis, tap Thesis in the menu, then scroll a little | Stays free on Hero, does not jump to slide 7 | Phone | P0 | History 15: stale scroll baseline |
| SEC-8 | From a pinned page, click the header's Thesis link | Starts on Hero, pin released, page indicator back on 1 | Desktop | P0 | History 15 |
| SEC-9 | Then wheel down, then reload at the top | Enters the pin on page 1. Reload starts on Hero | Desktop | P0 | History 15 |
| SEC-10 | From the graph or the map, press the Thesis link, then wheel down | Thesis rises showing page 1, not the last page | Desktop | P0 | History 15 |
| SEC-11 | Open `/thesis#products`, press the Thesis link, wait, reload | Starts on Hero, hash gone and stays gone | All | P0 | History 15: hash made reload and Back skip Hero |
| SEC-12 | Footer Thesis link on plain `/thesis` | Starts on Hero | All | P0 | History 15: it did nothing |
| SEC-13 | Footer Thesis link from `/thesis#products` | Starts on Hero, never slide 7 | Phone | P0 | History 15: landed captured on the last slide |
| SEC-14 | Focus the footer link, press Enter, press Tab | Focus lands on Thesis's first page dot, not in the footer | Desktop | P1 | History 15 |
| SEC-15 | Cmd, Ctrl, or middle click a Thesis link on Thesis | Opens a new tab, this page does not move | Desktop | P1 | Header tests |
| SEC-16 | Click a page dot, then the Thesis link within half a second, once pinned and once with Thesis partly on screen | Stays on Hero, does not return to the pin | Desktop | P1 | History 15 |
| SEC-17 | While a slow route is pending, press Thesis on Thesis | Stays on Thesis | Desktop | P1 | History 15 |
| SEC-18 | Click a page dot, then Writing within half a second | Writing starts at the top | Desktop | P1 | History 15 |
| SEC-19 | Click a paragraph in a long article, press Tab | Focus moves to the next link near there, the page does not jump to the top | Desktop | P0 | History 15: main must not stay focusable |

## 3. Desktop pin

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| DSK-1 | Wheel from Hero into Thesis and keep going | The first gesture after the pin advances a page | Desktop | P0 | #6: first wheel gesture swallowed |
| DSK-2 | Wheel through all pages | Wheel never freezes | Desktop | P0 | d3a0e7c |
| DSK-3 | Fling hard on a trackpad | Exactly one page per gesture | Desktop | P0 | 1dd6f11 |
| DSK-4 | Stop between Hero and Thesis, then scroll both ways | Not trapped | Desktop | P0 | 1dd6f11 |
| DSK-5 | Wheel past the last page | Exits to the graph, no bounce back, not stuck | Desktop | P0 | 18e889e, 1dd6f11 |
| DSK-6 | Wheel up past page 1 | Exits to Hero | Desktop | P0 | 18e889e |
| DSK-7 | Scroll up from the graph | Re-enters on the last page | Desktop | P0 | #6 |
| DSK-8 | Use page dots, arrows, PageUp and PageDown, Space while pinned | Each moves to the expected page | Desktop | P1 | Existing behavior |
| DSK-9 | Watch the section edges through the pin | No content shows through | Desktop | P1 | d3a0e7c |
| DSK-10 | Enter Thesis on a typical laptop | No hitch on entry, only on-screen art plays | Desktop | P1 | #13 |

## 4. Mobile capture

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| MOB-1 | Scroll from Hero into Thesis | Captures slide 1 with the section exactly at the top | Phone | P0 | #4 |
| MOB-2 | Fling hard from Hero | Same, and the page stays there | iOS 27, Android | P0 | #9: scrollY 1331 against a 714 target. #6: Android snap |
| MOB-3 | Swipe through slides 1 to 7 and back | One slide per swipe, text does not shift between slides, dots stay visible with the URL bar showing | Phone | P0 | #6 |
| MOB-4 | Swipe down on slide 7 | Exits to the graph, not recaptured | Phone | P0 | #4 |
| MOB-5 | Swipe up on slide 1 | Exits to Hero | Phone | P0 | #4 |
| MOB-6 | After MOB-5, swipe straight back down | Captures slide 1 again | Phone | P0 | #6, history 11 |
| MOB-7 | Scroll up from the graph | Captures slide 7 with no sliver of Hero | Phone | P0 | #4, #6 |
| MOB-8 | Exit down from slide 7, reverse mid-way, then scroll down again | Never jumps from the last slide to the first | iPhone | P0 | History 4.6 |
| MOB-9 | After an exit, stop touching for 2 seconds | No delayed snap back | Phone | P0 | History 4.3 |
| MOB-10 | Flick, then exit upward while it settles | Does not capture slide 7 | iOS 27 | P0 | #9 |
| MOB-11 | Swipe on a partly visible Thesis | Page scrolls, slide does not change | Phone | P0 | #6: two touch gates |
| MOB-12 | Let the address bar show and hide, then capture | Lands exactly at the section top, no jump | Phone | P0 | 2406b7b, 29c451c |
| MOB-13 | Rotate, or resize a narrow window, then capture | Lands at the section top | Phone | P1 | Cached position |
| MOB-14 | Interrupt a swipe with a call or notification | No false exit | iPhone | P1 | History 4.2 |
| MOB-15 | Move between Hero and Thesis quickly many times | Capture still works, no `AsciiMosaicFilter: timed out` | Phone | P1 | #4 |

## 5. Scroll locks

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| LCK-1 | On Thesis or About, scrolled, open the menu and close it with X | Returns to the same position | Phone | P0 | e6140f2 |
| LCK-2 | Open the menu while below Thesis | Thesis does not capture, page not locked afterward | Phone | P0 | #6: phantom scroll locked the whole page |
| LCK-3 | Open and close the menu on a captured slide | Same slide, still captured, swipes work | Phone | P0 | #6 |
| LCK-4 | After any route change, inspect `html` and `body` | None of `intro-lock`, `thesis-entry-lock`, `thesis-scroll-lock`, `thesis-touch-lock`, `data-menu-open`, `data-nav-leaving` remain, and body has no inline position | All | P0 | 669f9d7 |
| LCK-5 | Leave during the logo or the text scramble | Next page scrolls normally | All | P0 | 669f9d7 |
| LCK-6 | Let the Thesis text scramble run | Scrolling is locked during it and released after, within its 2.5-second limit | All | P0 | #11 |
| LCK-7 | Block the application chunks and load About or Thesis | Page unlocks within 8 seconds | All | P0 | #11 |
| LCK-8 | Open the menu with a keyboard, Tab through it, press Escape | Focus stays inside, the page behind is inert, focus returns to the menu button | Desktop narrow | P1 | #7 |
| LCK-9 | On Thesis at the top, press Tab until focus passes the skip link | Keyboard focus brings the hidden header on screen | Desktop | P0 | History 15 |

## 6. About sections

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| ABT-1 | Flick through About | One section per flick, percentages 16, 37, 58, 79, 100 | All | P0 | #13 |
| ABT-2 | Use a short viewport, and reduced motion | Scrolls freely, nothing clipped | All | P1 | #13 |
| ABT-3 | Arrive on About by the menu, then scroll | Still settles on sections | iOS | P0 | History 15 |
| ABT-4 | Delay a route, tap a menu link, then press the logo or About | Sections still settle afterward, within 5 seconds at most | Phone | P1 | History 15 |
| ABT-5 | Follow the in-page links and `/#products`, `/#origins`, `/#investors`, `/#contact` | Each lands on its section | All | P1 | #7 |
| ABT-6 | Press About in the menu while on About | Menu closes, snap still works | iOS | P1 | History 15 |

## 7. Page entry

The full contract and its checks are in [page entry](PAGE_ENTRY.md).

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| LOAD-1 | First visit to About, then Thesis in a new session | Logo shows once, only until the screen is ready | All | P0 | #11 |
| LOAD-2 | First visit to Writing, an article, an author page | Opens immediately, no logo at first paint | All | P0 | #11 |
| LOAD-3 | Revisit in the same tab, and reload | No repeated logo | All | P1 | #11 |
| LOAD-4 | Stall or fail fonts and media | Entry releases at its deadline | All | P0 | #11 |
| LOAD-5 | Turn on reduced motion | No loader, no pin, no capture, Thesis stacks its pages | All | P0 | #6 |
| LOAD-6 | Turn on Save-Data | No optional downloads | All | P1 | #11 |

## 8. Thesis art

| ID | Do this | Must be true | Where | P | Protects |
|---|---|---|---|---|---|
| ART-1 | From About, go to Thesis by client navigation | No canvas tiled with one repeated glyph | iPhone | P0 | #13 |
| ART-2 | Reload Thesis | Video keeps playing, does not freeze after a second | iOS, iPhone | P0 | #13: 14 of 17 loads froze |
| ART-3 | Fail or stall every `.mp4` | Retries, then shows the still, never a tiled glyph | All | P0 | #13 |
| ART-4 | Hold back a playing video's first frame | That canvas does not report ready, the canvases behind it still build | All | P1 | #13 |
| ART-5 | Leave a page before its video arrives | No decoder started or held | All | P1 | #13 |
| ART-6 | Use Low Power Mode | Canvases still show frames | iPhone | P1 | a5b188f |
| ART-7 | Hide the tab during loading, then return | A failed source starts over and recovers | All | P1 | #13 |

## Known issues

Open, not release blockers:

- After closing the menu on About with X, the progress meter reads 100% until the next
  scroll. `CrossingRoot` measures while the body is locked. Position and sections are correct.
- Leaving a page at a small offset, such as within about 80 px of the desktop pin's start,
  can open the next page at that offset. Next skips its reset when the new page's first
  element is already on screen. Thesis resets itself; Writing does not.
- On a slow route, scrolling after tapping a menu link from below Thesis can capture the
  last slide until the route arrives.
