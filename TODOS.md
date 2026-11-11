# TODOS

## Thesis

### Swap the thesis atlas in place on a theme switch

**What:** Change a mounted canvas's glyph atlas without re-initializing it.

**Why:** The thesis atlas now depends on the theme, so a theme switch tears down and rebuilds every mounted thesis canvas (eager ones too), reloading its video and recreating its context. The glyph sheets themselves are now 108x27, so this is no longer a memory problem.

**Context:** `AsciiCanvas` re-inits whenever `mosaicCellUrl` changes. An `AsciiMosaicFilter.setAtlas(url)` (load, `useAtlas`, dispose the old one) applied from an effect would avoid the rebuild. Found by the v0.2.0.0 performance review.

**Effort:** M
**Priority:** P3
**Depends on:** None

## Home (About)

The crossing performance and reduced-motion items are recorded under Completed.

## Writing

The article repository's publishing gate is recorded under Completed.

### Apply the article repository proposal

**What:** Add the required `Validate articles` check and the build-result wait to `1sixtech/1six-researchs`, and set `WRITING_GITHUB_TOKEN` in Vercel.

**Why:** A malformed article is still found only by the production build after it merges, and a failed hook-triggered build tells no one.

**Context:** The workflows, rollout order, evidence, and what is still unverified are in [docs/ARTICLE_REPO_PROPOSAL.md](docs/ARTICLE_REPO_PROPOSAL.md). It changes another repository and needs the owner's approval. Since v0.3.14.0 the sync alone may take up to 10 minutes before it fails, so the proposal's 12-minute wait for a build result should cover that plus install and `next build` before it is applied.

**Effort:** S
**Priority:** P1
**Depends on:** The sync hardening (merged in v0.3.8.0) and the figure check merged to the website's `main`

## Site-wide

### Leave the CJK font declarations out of the critical CSS

**What:** Ship only the 24 non-CJK `@font-face` rules of the Pretendard subset in the site-wide stylesheet.

**Why:** 68 of the 92 slices cover only CJK code points the English site never shows, yet their declarations ride in every page's render-blocking CSS (about 6.6 KB gzip).

**Context:** The font files stay the upstream ones (the OFL note in CLAUDE.md is about re-subsetting the fonts, not the CSS). The trade-off: a font upgrade is no longer a straight copy of the release CSS, and Korean copy would need its slices back. Found by the v0.2.0.0 performance review.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed

The original problem statements below describe the earlier release; each resolution records the current behavior.

### Count each download's bytes against the size the listing gives it

**What:** In `scripts/sync-writing.mjs`, count each body as it arrives: give up on a file once it passes the size the listing gave it, retry one that ends short, and cap the commit lookup and the listing (about 1 KB and 8 MB).

**Why:** The sync checks only the sizes the listing claims. Since the idle timeout (v0.3.14.0), a body that keeps arriving runs until the 10-minute deadline instead of 30 seconds, so a host sending far more than it listed could fill memory and kill the build before the deadline's report prints. A body that ends early without a length header would also be saved cut short.

**Context:** GitHub serves a pinned commit's files at their exact size (undici decodes gzip first), so an equality check is safe; it needs a CDN or proxy fault to trigger. Deferred from the v0.3.14.0 pre-landing review by the owner, to get its own review.

**Resolution:** Every body is counted as fetch hands it over, after it decodes gzip, and each part is copied into one buffer of the most the body may hold and let go: kept as they came, parts a byte long cost hundreds of bytes each (eight bodies sent a byte at a time held 367 MB of heap after 1.85 MB had arrived, against 20 MB this way). A file must arrive at exactly the size the listing gives it: it is given up on as soon as it passes that size, and one that ends short is retried like a dropped connection, within the same three retries. A file still the wrong size then fails the build, naming the file and both sizes. The commit lookup may send at most 1 KB and the listing 32 MB, not the 8 MB proposed: GitHub's 7 MB tree limit is not the size of its JSON, and a listing it cut off (torvalds/linux, 71,474 entries) measured 17.6 MB. A refusal's body, which only feeds the error message, may hold 4 KB; past that its status still stands, unretried. A listed size below zero is refused with the other size checks, before the files it covers download, and the README total counts only the one README per folder that is checked and downloaded. The listing is checked in time proportional to its size, so a huge one cannot hold the build past its deadline. A sync that runs out of time names bodies of the wrong size as the cause of their retries. Checked on 2026-11-10 against the article repository: `raw.githubusercontent.com` serves gzip with a `Content-Length` of the compressed size, and both it and the REST API deliver exactly the listed bytes once decoded.

**Completed:** v0.3.15.0 (2026-11-11)

### Pin the writing sync to a reviewed commit

**What:** Set `WRITING_GIT_REF` in the Vercel project's environment to a reviewed commit SHA or tag of the article repository, and keep branch protection on that repository.

**Why:** Every build pulls the articles from that repository's `main`, so an unreviewed push there reaches the site at the next deploy.

**Resolution:** Not pinned: a fixed commit would stop new articles from appearing, and articles now publish automatically. `main` in `1sixtech/1six-researchs` requires a pull request but no approval, so one account can publish alone, and repository admins can bypass the pull request. The owner accepted that risk on 2026-11-09. Requiring one approval, re-approval after new pushes, and enforcing the rule for admins would close it.

**Completed:** v0.3.5.0 (2026-11-09)

### Release pooled videos when a mosaic is disposed

**What:** Have `AscMosaic.disposeModel()` call `videoPool.release(video)` for a pooled video, as the `addModel()` replace path already does.

**Resolution:** Every dispose path releases, and the last release destroys the element so its decoder is freed.

**Completed:** v0.3.4.0 (2026-11-09)

### Prepare the About mark during the company-logo loader

**What:** Cover the first About visit while its rotating 16 loads, instead of waiting on Thesis assets after entering the site.

**Resolution:** Originally the logo loader moved to About; its eager mark reports readiness from a rendered mosaic with loaded glyph data or a decoded fallback. The loader removes its own mask and lock. Thesis retains its independent text scramble. Route cleanup and repeat/reduced-motion behavior have effect regression tests.

**Completed:** v0.3.2.0 (2026-11-08)

**Current behavior:** v0.3.3.0 extends the first visual entrance to About and Thesis, keeps Writing immediate, and adds non-blocking shared byte preparation. See [page entry](docs/PAGE_ENTRY.md).

### Fix the two lint errors in ThesisSection.tsx

**What:** Clear the React Compiler lint errors in `src/components/home/ThesisSection.tsx`: a synchronous `setState` in an effect (line 67, `setIsMobile`) and a variable read before its declaration (line 195).

**Why:** `pnpm lint` still exits 1 on these two, so lint cannot gate a build or CI yet. Every other error in the repo is fixed.

**Context:** The file is frozen by the owner (with `ThesisSectionMobile.tsx`, `thesisData.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx`, `hashScroll.ts`), so it was left untouched in v0.2.0.0. When it unfreezes, read `isMobile` with `useSyncExternalStore` over a `matchMedia('(max-width: 767px)')` subscription (the pattern `AsciiMap.tsx` uses), and move the function used at line 195 above its first use. Re-check the thesis capture on a phone and on desktop afterwards.

**Effort:** S
**Priority:** P2
**Depends on:** The owner unfreezing the thesis files

**Resolution:** The authorized thesis changes use `useSyncExternalStore` for device detection and declare `showPage` before its first use. `pnpm lint` now reports zero errors.

**Completed:** v0.3.0.0 (2026-11-08)

### Keep the crossing fill off the page root's style recalc

**What:** Transition a non-inherited custom property on the three elements that read the fill, instead of the inherited `--crossing-fill` on `.crossing`.

**Why:** Each frame of a step's 1200 ms transition restyles every descendant of the About body (about 130 elements and the mark's canvas), though only the mark's mask, its level line and the meter read the value.

**Context:** `about.css` registers `--crossing-fill` with `inherits: true` and transitions it on `.crossing`; `CrossingRoot.tsx` writes it on every step. Register `--crossing-level` with `inherits: false`, set `--crossing-level: var(--crossing-fill)` with the transition on the three consumers, or drive the level line and meter with a transform keyed on `[data-step]`. Small today; it grows with the page. Found by the v0.2.0.0 performance review.

**Effort:** S
**Priority:** P3
**Depends on:** None

**Resolution:** `CrossingRoot` writes continuous fill only to the mark and meter-fill elements. The story root is updated only when completion changes, so per-frame fill writes no longer restyle the full story.

**Completed:** v0.3.0.0 (2026-11-08)

### Drop the reduced-motion !important pins

**What:** Have `CrossingRoot` write the last level (100) under reduced motion, then remove the three `!important` declarations in `about.css`.

**Why:** The pins exist only because the component writes `--crossing-fill` inline on every step regardless of the preference; inline styles beat any selector.

**Context:** Subscribe to the reduced-motion query's `change` (as `useReducedMotion` does) inside the effect. Found by the v0.2.0.0 design review.

**Effort:** S
**Priority:** P4
**Depends on:** None

**Resolution:** `CrossingRoot` writes 100% under reduced motion, observes preference changes, and the CSS no longer uses `!important` pins. Effect tests cover reduced motion and cleanup.

**Completed:** v0.3.0.0 (2026-11-08)
