# Changelog

All notable changes to the 1SIX website are recorded here. Versions follow
`MAJOR.MINOR.PATCH.MICRO`; `package.json` carries the first three.

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
