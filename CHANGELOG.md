# Changelog

All notable changes to the 1SIX website are recorded here. Versions follow
`MAJOR.MINOR.PATCH.MICRO`; `package.json` carries the first three.

## [0.3.11.0] - 2026-11-10

### Changed

- The article sync downloads at most eight files at a time, well inside GitHub's limit of 100 concurrent requests. A file keeps its place through its retries, so a lasting outage fails a build within a few minutes however many articles and figures there are.

### Fixed

- A brief network failure no longer fails a build. A refused or reset connection, a failed DNS lookup, or a download cut off partway is retried after 1, 2, and 4 seconds, and each retry prints a line to the build log.
- A request that stalls is abandoned after 30 seconds, its body included, and sent again. It used to wait up to five minutes.
- A GitHub rate limit holds every request until the time GitHub names, not only the one it refused, so a build stops asking while it is limited.
- A `WRITING_GITHUB_TOKEN` with a space, line break, or non-ASCII character inside it fails the build before any request, without printing it. A line break used to make Node print the whole token in its error.

## [0.3.10.0] - 2026-11-10

### Changed

- About's section rules sit under each title instead of above it, on phones and desktop, with more space between the rule and the content. The title and its content now read as two parts at a glance.
- On the light theme, the unfilled part of the ASCII 16 is a little lighter again, so the filled share stands out while the whole mark still reads.

## [0.3.9.0] - 2026-11-10

### Changed

- The site has one red, the logo's #FF3700. Writing's category labels, the 16% beside the About mark, and every hover and press state now use it instead of a darker red. On the light theme, small red text is below AA contrast; the owner accepted this, and it is recorded in the product notes.
- On phones, each About section title stands apart from its content. Titles are larger (34px) and sit close under their rule with clear space before the content. They also land at the same height on every screen.
- predict.everywhere.trade's name is red, and hovering it underlines the name.
- The whole ASCII 16 on About reads in the light theme, not only its filled part.
- The phone menu underlines the current page as well as coloring it, as the desktop navigation does.

## [0.3.8.0] - 2026-11-10

### Added

- `WRITING_GITHUB_TOKEN`, an optional read-only token, lifts builds off GitHub's shared limit of 60 anonymous requests an hour.
- A written proposal, awaiting the owner's approval, for a required pull-request check in the article repository and an alert when a publish build fails.

### Changed

- The article sync names and refuses a numbered folder it cannot publish: a name the site cannot load, no README or one over 5 MB, a symbolic link, or a submodule in an article's place. A misnamed folder used to publish its figures without its article.
- A published article may carry only image files, up to 5 MB each and 200 MB in total. Anything else fails the sync and is named, instead of being copied to a public URL.
- The site and the sync use one rule for article folder names.

### Fixed

- A partial file listing from GitHub fails the sync instead of silently dropping articles.
- A brief GitHub outage or rate limit no longer fails a build at the first answer. Requests retry up to three times, follow GitHub's requested wait, and fail at once when the wait would exceed a minute.

## [0.3.7.0] - 2026-11-10

### Fixed

- Thesis opens on its first screen when you arrive from the phone menu on a scrolled About. About's position used to carry over to the next page and skip that screen, and Writing opened partway down the same way.
- Clicking the Thesis link twice on desktop stays on the first screen. After a mouse click the header no longer waits on screen for a second click. Keyboard users still bring it down.
- Pressing a Thesis link while on Thesis goes to the first screen and leaves no section in the address, so a reload or Back cannot skip it. The slides start over from the first, and you can scroll straight back into them.
- The footer's Thesis link works on Thesis. It used to do nothing, or land a phone on the last slide. Keyboard users continue from the top of the page.
- Pressing Back with the phone menu open no longer restores the previous page's position when the menu closes.
- The Thesis header stays hidden until your first scroll when you arrive from further down another page.

### Documentation

- `docs/QA_CHECKLIST.md` lists what must pass before a release: Thesis sections, the desktop pin, mobile capture, scroll locks, About's sections, page entry, and the Thesis art, each tied to the fix it protects.

## [0.3.5.0] - 2026-11-09

### Changed

- A merged article now reaches the site on its own, without a website deploy.

### Fixed

- A build that starts right after an article merges reads that exact commit, not a copy GitHub may have cached for five minutes. Every file in a build comes from the same commit.
- The article sync uses the repository's current name instead of relying on GitHub's redirect from the old one.
- A blank `WRITING_GIT_REF` now means `main`, and a ref containing `#` or `/` resolves exactly.

## [0.3.4.0] - 2026-11-09

### Changed

- About shows one section per screen on phones and desktop. The page settles on each section, and a section grows with its content instead of clipping it. Short screens and reduced motion scroll freely.
- Entering Thesis no longer hitches on desktop, and the slides keep their frame rate. Glyph sheets are a few hundred bytes instead of 16 megapixels, canvases build one at a time in idle moments, and only the art on screen plays.
- Phones no longer download a Thesis video twice or decode video for slides that are not mounted.

### Fixed

- After a reload on iOS, the Thesis video no longer plays for a second, freezes, and jumps back to the start.
- Thesis on a phone no longer shows one character repeated across the canvas. The mosaic waits for a real video frame. A video that will not load is retried and then replaced by its still source, and returning to the tab tries again.
- Leaving a page before its video arrives no longer starts that video or holds its decoder.
- A draft article, marked `(draft)` on its date line, stays off the site with its figures instead of failing the build. A missing or impossible date fails the build and names the article.
- A failed article download keeps the last good sync in place, and a long padded line in an article can no longer stall a build.
- The 16 on About completes at every display scale.

## [0.3.3.1] - 2026-11-09

### Added

- Henry P. now has a writer profile showing the Two-time ICPC World Finalist credential, linked from "Arbitrage in reality, part 1: one coin, twelve venues".

### Changed

- A writer profile can show confirmed credentials alone when no biography has been supplied.

## [0.3.3.0] - 2026-11-09

### Changed

- About and Thesis share a first visual-entry logo, while Writing opens immediately. Repeat visits and warmed destinations skip the logo; only the current screen's media and fonts hold entry.
- About prepares Thesis assets in the background. Bounded byte downloads are reused by the actual media consumers, including iOS video Range handling, without constructing other pages' scenes.
- Direct section entries wait for their own art. Thesis text locking is separate from the logo and slide capture, and pending video warmup is reused and cancelled on route leave.
- Partnership names and links are hidden pending confirmation.
- About mobile now has a compact first screen with a visible product cue, integrated header progress, clearer product/backer typography, and a stable About-only footer grid. Body readability and ordinary section spacing are preserved.

### Fixed

- Text-only pages remain readable without JavaScript; a pre-hydration watchdog releases stalled visual entrances.
- Image-source readiness waits for actual image data, including direct world-map entry; cancellation and timeouts release obsolete work.
- Background preparation resumes after returning to a visible tab, while foreground navigation retains priority.

## [0.3.2.0] - 2026-11-08

### Fixed

- The company-logo fill loader now opens About, preparing its rotating 16 before revealing the first screen. Repeat visits and reduced motion skip the loader.
- The mark initializes behind the loading mask, and readiness is reset when leaving the page. A slow or failed asset cannot leave the site permanently locked.
- Mosaic readiness now waits for actual glyph-atlas data instead of an empty texture handle. Without WebGL, it waits for the replacement video frame or image to load.
- Thesis enters directly with its existing text scramble, video warmup, and scroll capture. It no longer shows the company-logo loader.

### Documentation

- Recorded the page-entry ownership and regression checks in `docs/PAGE_ENTRY.md`, and synchronized the product and project instructions.

## [0.3.1.0] - 2026-11-08

### Fixed

- Mobile Thesis holds its position after a fast flick on iOS 27, where an instant scroll request no longer stops native momentum. The seven slides, upward re-entry, and downward exit cooldown retain their existing behavior.
- Leaving the first slide while the viewport is still settling no longer pulls the page back into the last slide.
- Selecting Thesis from its own menu aligns the captured section instead of scrolling to Hero with capture still active.

### Tests

- Added component-effect regression tests for continued momentum, menu scroll-lock coordination, edge exits, and immediate forward re-entry.

## [0.3.0.0] - 2026-11-08

Meet the company first, explore the thesis, and browse the team's writing.

### Added

- Product introduction for predict.everywhere.trade, with its esports prediction-market description, website link, and more-to-come notice.
- Partnerships with USA Esports Association, KeSPA, AESF, IESF, and Lighter.
- Writing filters for Research, Op-ed, and Announcements, with shareable category URLs and clear empty states.
- Clickable author names and a Dean N. profile with his ICPC Asia Regional First Prizes in 2021 and 2022 and his published writing.
- A percentage beside the desktop ASCII mark's red line, synchronized with the mobile meter.
- A company X link in the footer alongside navigation and contact details.

### Changed

- About is now the homepage. The existing thesis experience lives at `/thesis`, and Research becomes `/writing` throughout navigation, metadata, and the sitemap.
- The home story proceeds through products, team origins, backers, partnerships, and a direct invitation to work together.
- The crossing follows scroll continuously from 16% to 100%; reduced motion shows the completed state.
- Team origins now feature Harvard College, Schwarzman Scholars, IOI Medalists, ICPC World Finalists, and Codeforces Grandmasters.
- The thesis moves protocols from experiment to “everyday, everywhere.”
- The footer copyright reads 2026–2027. Writing appears newest first and supports category metadata in the source articles.

### Fixed

- Thesis intro state now initializes on client navigation as well as direct loads. Leaving during the intro clears scroll locks and the page's circular reveal mask.
- StrictMode replay no longer lets an obsolete intro effect launch another reveal.
- Mobile menu closure restores the scroll position after a desktop-to-mobile transition.
- Thesis device detection and callback ordering pass the React Compiler lint rules. Lint excludes generated agent worktrees and reports.
- Vercel uses the package build script through `vercel.json`, replacing the fixed command that pointed at the removed article-sync file.

### Removed

- The “we measure” home section and its article-extraction dependency.
- Needham & Co., special forces, and the protocol pedigree group.
- Obsolete About and Research routes and the old Team redirect.

## [0.2.0.0] - 2026-11-05

The fundraising pass: an About page built for investors, readable research on
a phone, a sharper world map, and a site that loads and holds up better.

### Added

- **About, rebuilt as "the crossing".** A sticky ASCII "16" fills from 16% to
  100% as you read through four bands (the statement, where the team comes
  from, who backs it, how it measures), and inks in the accent at the end. On
  a phone the fill becomes a meter under the header that names the section
  you are in. The page quotes three takeaways from the published research and
  closes on a direct line to contact@1six.tech.
- **Research figures open at full size.** Tap or click a chart to see it at
  its own size in a viewer that pans sideways on a phone and closes with the
  button, Escape or a tap beside it. Keyboard and screen-reader friendly.
- **A contact column in the footer**, and the current page marked in the menu.
- **`pnpm test`**: unit tests for the mosaic renderer, research rendering, the
  About quote, fonts and the theme bootstrap (42 tests).

### Changed

- **Phone typography with a clear hierarchy.** Section titles, names, body
  text and labels now differ in size, weight or ink, and section rules are
  stronger than the hairlines inside lists, so sections are easy to tell
  apart on About, Research and the footer.
- **The world map is framed as the designs.** On a phone it lies on the page,
  larger than the screen and cropped at both sides; on desktop it sits in a
  16:9 panel at a finer grid (168 glyphs across instead of 112). Glyphs are
  drawn at their exact pixel coverage at the screen's pixel density, so they
  are crisp on 1x monitors and Retina screens alike, and the map follows a
  window moved between them.
- **Fonts load about 20x lighter**: the official Pretendard dynamic subset
  serves only the characters a page uses (about 100 KB instead of 2 MB), with
  the slices every page needs preloaded, so no glyph swaps in after the first
  paint.
- **Theme and chrome**: the theme is set before the first paint again, so the
  iPhone status bar matches the page; switching themes cross-fades the page;
  the header logo sits on the header's centre line; gray text meets WCAG AA
  contrast on every ground in both themes.
- **The map redraws only when it changes** (about 6 times a second instead of
  every frame of a 120-240 Hz display), and canvases skip multisampling they
  never used, which cuts GPU work and memory, most on phones.
- **Products stay off the site**, metadata included: product keywords and the
  product-branded social profiles are gone from search metadata.

### Fixed

- Content on a reduced-motion setting no longer stays invisible, and canvases
  show a still frame instead of a loop; without WebGL they show their source
  still, blended into the page, instead of a pulsing placeholder.
- Research content synced from the articles repository is treated as
  untrusted: raw HTML in an article shows as text, a link to anything but the
  web, mail or the site keeps its words and loses its link, the build refuses
  to publish any markup the article renderer would not produce, a chart
  opened on its own cannot run script, and About's quote fails the build
  rather than ship a broken link if the article changes.
- On a phone, a chart's enlarge mark no longer covers its data.
- The phone menu keeps focus inside itself while open, two quick theme
  toggles flip twice, a shared link to a section of About or an article no
  longer jumps back to the top, and the meter count stays right when reduced
  motion is turned off mid-visit.
- `pnpm lint` passes outside the frozen thesis section.

### Removed

- Unused product components (product cards, product canvases, the insight
  list) and the old About sections (team hero, profiles, investors).
