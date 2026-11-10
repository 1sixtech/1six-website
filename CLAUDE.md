# 1SIX Website

Marketing website for 1SIX Technologies — a Web3/crypto infrastructure company.
Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, and **Tailwind CSS v4**.

## Quality Standards

This project prioritizes **high quality above all else**. When working on this codebase:

- **Research thoroughly**: Always perform web searches when needed — do at least **twice as many searches** as you think necessary. Look up official documentation, best practices, known issues, and community solutions before writing code.
- **Think deeply**: Break problems into multiple steps. Reason through each step carefully. Consider edge cases, performance implications, accessibility, and cross-browser compatibility. Take as long as needed — speed is never a priority over quality.
- **Use tokens generously**: Do not cut corners to save tokens. Read entire files when context matters. Explore the codebase thoroughly. Write detailed commit messages. Explain your reasoning when it adds value.
- **Verify your work**: After making changes, validate them. Run `pnpm build` to catch type errors and build issues. Run `pnpm lint` to ensure code style compliance. Read your own changes back to confirm correctness.
- **Match the existing standard**: This codebase has high attention to detail — smooth animations, careful performance optimization, polished UI. Any contribution must match or exceed this bar.

## Quick Reference

```bash
pnpm dev          # Dev server with Turbopack
pnpm build        # Sync writing, then build production output
pnpm start        # Start production server
pnpm lint         # ESLint (Next.js default config)
pnpm test         # Unit tests (Node's built-in runner, src/**/*.test.mjs)
```

Package manager: **pnpm** (`engine-strict=true` in `.npmrc`).

On a fresh checkout, run `pnpm install`, then `node scripts/sync-writing.mjs` before
`pnpm dev`. Writing content and assets are downloaded from GitHub and ignored by git;
`pnpm build` runs that sync automatically. No environment variables are required.
`WRITING_GIT_REF` optionally selects a reviewed article commit or tag instead of `main`.
`WRITING_GITHUB_TOKEN` optionally gives the sync a read-only GitHub token (see Writing).

## Project Structure

```
src/
  app/                        # Next.js App Router
    layout.tsx                # Root layout (metadata, theme, analytics)
    page.tsx                  # About homepage ("the crossing")
    thesis/page.tsx            # Thesis, intro hero, graph, and world map
    writing/                  # Writing index, writing.css, and shared layout
      [slug]/page.tsx          # Published article
      authors/[slug]/page.tsx  # Confirmed writer profile and published articles
    globals.css               # Tailwind v4 @theme, CSS variables, keyframes
    error.tsx                 # Error boundary
    not-found.tsx             # 404 page
    robots.ts, sitemap.ts, manifest.ts
  components/
    ascii/                    # Three.js ASCII mosaic renderers
      AsciiCanvas.tsx         # Core Three.js canvas (dynamic import, no SSR)
      AsciiHero.tsx, AsciiThesis.tsx, AsciiGraph.tsx, AsciiMap.tsx, ...
      mapGeometry.ts          # World map framing, glyph pitch and weight
      pixelScale.ts           # CSS-px mosaic options -> device px (pixelRatioCap)
    home/                     # Thesis page components (directory name retained)
      HeroSection.tsx         # Staggered ASCII scramble intro
      ThesisSection.tsx       # GSAP pinned scroll section
      ThesisGraph.tsx, ProductMap.tsx (the world map), ProductsHeading.tsx, ...
    about/                    # AboutCrossing (home bands), CrossingMark (ASCII 16 + percentage),
                              # CrossingRoot/crossingProgress (continuous fill), about.css,
                              # aboutData.ts (origins, backers, pending partnerships)
    intro/                    # PageEntry, IntroOrchestrator, IntroOverlay
    writing/                  # WritingIndex filters, ArticleList, full-size FigureViewer
    team/                     # CareersSection.tsx (parked, not rendered)
    layout/                   # Header.tsx, Footer.tsx, FooterLink.tsx
    ui/                       # Reusable: ScrollRevealWrapper, RollingNumber, ThemeToggle, Logo
    providers/                # ThemeProvider.tsx
  hooks/
    useScrollReveal.ts        # One-shot first-scroll detection
    useReducedMotion.ts       # Respects prefers-reduced-motion
    useDevicePixelRatio.ts    # Current device pixel ratio (re-renders on a monitor move or zoom)
  lib/
    site.ts                   # CONTACT_EMAIL, COPYRIGHT, NAV_ITEMS, isCurrentRoute(), isPlainLeftClick()
    writing.ts                # Synced article loading, metadata, ordering, safe HTML rendering
    writingCatalog.ts         # Categories, confirmed writers, and URL filter selection
    writingDraft.mjs          # Draft marker rule, shared by the site and the sync script
    writingSlug.mjs           # Article folder-name rule, shared by the site and the sync script
    themeInit.ts              # Theme + site entrance / Thesis scramble bootstrap, inlined in <head>
    ascmosaic/                # Custom Three.js ASCII mosaic library
      index.ts                # AscMosaic class (WebGL renderer)
      asciiMosaicFilter.ts    # ASCII rendering algorithm
      texturedMesh.ts         # Mesh + texture handling
      orbitControls.ts        # Camera controls
content/writing/              # Downloaded article Markdown (gitignored)
public/
  resource/                   # Videos (MP4), textures (PNG), images (WebP)
  writing-assets/             # Downloaded article assets (gitignored)
scripts/sync-writing.mjs       # Sync from 1sixtech/1six-researchs
scripts/bake-mosaic-atlases.mjs # Cell-sized glyph sheets from the 16 MP exports
vercel.json                   # Repository-owned buildCommand: pnpm build
```

## Architecture & Key Patterns

### Rendering Strategy

- **Server components** by default (pages, layouts, metadata exports)
- **`'use client'`** directive for interactive components (animations, state, events)
- **Dynamic imports** with `ssr: false` for Three.js components (`AsciiCanvas`)
- No API routes or database; marketing copy lives in components and published writing is synced at build time

### Writing

- `scripts/sync-writing.mjs` downloads numbered article folders from `1sixtech/1six-researchs` into
  `content/writing/` and their assets into `public/writing-assets/`. Every file is read at the one commit
  `WRITING_GIT_REF` (default `main`) resolves to, because raw GitHub caches a branch URL for five minutes.
- A push to that repository's `main` that changes a numbered folder deploys the site: its
  `.github/workflows/publish.yml` calls a Vercel Deploy Hook (the `VERCEL_DEPLOY_HOOK_URL` Actions secret).
  Pinning `WRITING_GIT_REF` to a commit or tag stops new articles from appearing.
- Frontmatter accepts `title`, `author`, `date`, `summary`, and `category`. Category IDs are `research`,
  `op-ed`, and `announcements` (case-insensitive); omitted categories default to Research, and invalid
  explicit categories fail the build. Articles sort newest first, with article number as the tie-breaker.
- A date marked `(draft)`, such as `Date: 2026-11-08 (draft)`, keeps an article and its assets off the site; the
  sync skips it. A missing or impossible date fails the build and names the article.
- `/writing?category=op-ed` and the other category URLs survive browser Back. Missing or unknown URL
  filters show all articles. Empty categories show an explanation and a link back to all writing.
- The sync fails and leaves the last good sync in place on a truncated GitHub listing, or on a numbered folder that has no
  README or one over 5 MB, holds a symbolic link, or has a name the site would not load (one rule: `writingSlug.mjs`); every
  such folder is named at once. After drafts are known, published articles may carry only AVIF, GIF, JPEG, PNG, SVG, and WebP
  files of at most 5 MB each and 200 MB in total, again naming every problem. A draft's other files are not checked.
- GitHub 403, 429, and 5xx answers are retried three times, honoring `Retry-After` and the rate-limit reset. A wait longer
  than a minute is not attempted: the sync fails at once. With `WRITING_GITHUB_TOKEN` every request uses the REST API;
  without it files come from `raw.githubusercontent.com`. A token GitHub rejects fails the build.
- Confirmed author profiles live in `writingCatalog.ts`. A bio is optional: without one, the profile
  omits that paragraph and its confirmed credentials supply the page and social-card descriptions.
  Article bylines resolve by author name; an unknown author remains plain text. Profiles list only
  that author's published articles.
- Synced Markdown is untrusted: raw HTML is escaped, unsafe links lose their target, and unexpected
  rendered tags or attributes fail the build. Figures open at full size. `/writing-assets/:path*`
  has a sandboxed CSP for standalone assets; article and author pages keep the site's normal policy.
- Every article image must be an image file under `public/` (the types in `writingAssets.mjs`, shared with the sync),
  matched by exact name as 1six.tech serves it, and its src is rebuilt from that name, fragment kept. A missing,
  miscased, hidden (`.name`), or non-image file fails the build and names the article, as does any image given by
  URL (`http(s)`, `//`, or `data:`), even one the CSP (`img-src 'self' blob: data:`) would allow; a miscased name
  gets a "did you mean". A name differing only in Unicode normalization (NFD from Finder) is accepted. A figure
  marked cannot read (a path with a space outside `<…>`, an undefined `[label]`) fails too, instead of publishing
  its Markdown text.

### Theme System

- `ThemeProvider` context at `src/components/providers/ThemeProvider.tsx`
- Switched via `data-theme="light"|"dark"` attribute on `<html>`
- CSS variables in `globals.css` swap per theme (not Tailwind's `dark:` class)
- Blocking inline `<script>` in `<head>` (`src/lib/themeInit.ts`) prevents flash of incorrect theme (FOIT).
  It must stay render-blocking: `next/script` `beforeInteractive` runs after first paint in the App Router,
  and iOS Safari 26 keeps the status-bar tint it samples at first paint under the fixed glass header.
- `localStorage` persistence; default: dark on mobile, light on desktop
- Access via `useTheme()` hook

### Animation Stack

| Library | Usage |
|---------|-------|
| **GSAP** + ScrollTrigger + Observer | Scroll-driven animations, pinned sections |
| **Three.js** via `AscMosaic` | WebGL ASCII mosaic rendering from video/images |
| **use-scramble** | Character scramble text reveal effects |
| **Passive scroll + requestAnimationFrame** | Home crossing: continuous 16% → 100% fill, desktop percentage, and compact mobile header progress |
| **View Transitions** | Whole-page cross-fade on theme switch (ThemeProvider) |

GSAP animations must be cleaned up with `useGSAP()` context or manual `gsap.context()` + `revert()`. Always check `useReducedMotion()` and skip or simplify animations accordingly.

The first visual entry on About or Thesis may show the company-logo loader. Writing and other
text-only entries stay immediate. `siteIntroSeen` controls same-tab brand frequency, independently
of actual media readiness; an already-warmed visual destination also skips the logo. Entry waits
only for the requested screen and fonts, with a five-second deadline. The head script independently
unlocks after eight seconds if application chunks never hydrate. `PageEntry` owns the site mask;
HeroSection owns a separate `thesis-entry-lock`, so it cannot release the logo. Direct Thesis
section links wait for their target scene and do not acquire the offscreen hero's text lock.

Shared visual downloads use two low-priority workers (~0.77 MB for the current allowlist). Images
keep their bytes as document-owned Blob URLs for the real texture loaders. Video never takes a Blob
source: iOS Safari is unreliable with blob-backed media. Phones skip warming video altogether, since
a native iOS probe showed their media stack downloads it again as Range requests. No foreign-route
decoder or WebGL canvas is created by this cache. Navigation interrupts
background work; visibility resumes it after foreground readiness or its deadline. Reduced motion and
Save-Data suppress optional warming. Renderer readiness still requires actual atlas/frame data.
See [page entry](docs/PAGE_ENTRY.md) for ownership, repeat visits, and regression checks.

### Three.js / AscMosaic

The custom `AscMosaic` library (`src/lib/ascmosaic/`) renders video/image sources as ASCII character mosaics via WebGL. Key constraints:

- Max 14 concurrent WebGL contexts (managed by `AsciiCanvas`); a disposed mosaic loses its context at once
- Uses `IntersectionObserver` for visibility — pauses/disposes when offscreen
- Handles WebGL context loss/restore events gracefully
- Async initialization queue to avoid main-thread jank; a newer init (a prop change) supersedes a queued one
- Opt-in per canvas: `pixelRatioCap` (output at the device pixel ratio), `smoothCells` (glyphs pre-rendered
  at their exact pixel coverage), `renderOnDemand` (a still image redraws only on its noise ticks).
  The world map uses all three.
- A video that cannot load rejects and is retried; the mosaic never draws without a real frame. A stand-in
  color or an empty texture tiles one glyph across the whole canvas.
- Only mounted canvases decode video, and a hidden Thesis slide holds still. iOS decoders are limited and shared
  with the rest of the phone. A pooled video stays in the document (2px, nearly transparent): asked to play before it has
  loaded, a video outside the document stops presenting frames about a second in on iOS WebKit, while its clock keeps running.
- A canvas reports ready only after a real first frame. No init-queue turn outlasts 1.5 seconds, so a slow source or a
  stalled first frame cannot hold the canvases behind it.
- Cell-sized glyph sheets come from `scripts/bake-mosaic-atlases.mjs`: uploading the 16-megapixel exports
  stalled the main thread and cost tens of megabytes of GPU memory per canvas.
- Without WebGL (or under reduced motion) a canvas shows its source media, still

### Styling

- **Tailwind CSS v4** with `@theme` syntax in `globals.css`
- Accent color: `#FF3700` (`--color-accent`), the logo red and the only red: links, labels, states and marks at every size
- Font: **Pretendard Variable** 1.3.9, the official dynamic subset: 92 slices in
  `public/fonts/pretendard-1.3.9/`, `@font-face` + unicode-range in `src/app/fonts/pretendard-variable.css`
  (browsers fetch only the slices a page uses; the root layout preloads the slices every page needs).
  Do not re-subset the font yourself: "Pretendard" is a Reserved Font Name under the OFL.
- Dark mode: CSS variable aliasing via `data-theme` attribute
- Responsive: mobile-first with `md:` breakpoint (768px)
- About shows one section per screen on phones and desktop: bands are `100lvh` tall and the root snaps to them
  (`mandatory`, viewports 640px and taller, 760px at tablet widths, no reduced motion). Bands grow with their content rather than clip it.
  A menu link turns the snap off until the next route commits (`data-nav-leaving`): iOS re-applies the old section after the menu lock lifts, onto the next page.
- Path alias: `@/*` maps to `./src/*`

### Performance

- `PageEntry` prioritizes the entry screen, then warms shared bytes and Next routes; warmup never starts a video decoder
- `CrossingRoot` writes fill values only to `.crossing-mark` and `.crossing-meter__fill`, keeping per-frame style changes off the full story root
- `/resource/*` and `/fonts/*` cached with `Cache-Control: immutable, 1 year`
- Image optimization: webp + avif formats via Next.js
- Turbopack for dev server

## Coding Conventions

### Naming

- **Components**: PascalCase files and exports (`ProductMap.tsx`)
- **Hooks**: camelCase with `use` prefix (`useScrollReveal.ts`)
- **Utilities/lib**: camelCase (`asciiMosaicFilter.ts`)
- **Directories**: kebab-case (`components/ui/`)
- **Constants**: SCREAMING_SNAKE_CASE (`CHAR_RANGE`, `NAV_ITEMS`)
- **Types/Interfaces**: PascalCase (`ThemeContextValue`, `AsciiCanvasProps`)

### TypeScript

- Strict mode enabled
- `interface` for component props and object shapes
- `type` for unions and simple aliases (`type Theme = 'light' | 'dark'`)
- Props interfaces defined above component, not exported separately

### Imports

Order: React -> Next.js -> third-party libs -> `@/` path alias imports -> relative imports -> CSS

```typescript
import { useState, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useTheme } from '@/components/providers/ThemeProvider';
import './globals.css';
```

### Components

- All functional components (no class components)
- Prefer `interface` for props, destructured in function signature
- State via `useState`; refs via `useRef` for DOM elements and animation instances
- Contexts: `ThemeContext`, and `ThesisSlideActive` for Thesis slides — no global state library

### Code Style

- 2-space indentation, semicolons, single quotes, trailing commas
- No Prettier config — consistent manual formatting
- ESLint: Next.js flat config, run through `pnpm lint` (`eslint .`)

## Routes

| Path | Description |
|------|-------------|
| `/` | About: statement, products, origins, backers, contact |
| `/thesis` | Existing hero, thesis scroll, graph, and world map |
| `/writing` | Published writing with All, Research, Op-ed, and Announcements filters |
| `/writing/[slug]` | Article with contents, author link, and full-size figures |
| `/writing/authors/[slug]` | Confirmed writer profile and published articles |

Navigation order is About, Thesis, Writing. `/about`, `/research`, and `/team` are removed without
redirects. Unknown article and author slugs return 404.

Home anchors: `/#products`, `/#origins`, `/#investors`, `/#contact`.
Thesis anchors: `/thesis#thesis`, `/thesis#products`. The header and footer Thesis links, pressed on Thesis, go to Hero and drop any hash.

SEO: each page supplies its canonical URL; `sitemap.ts` includes the root, Thesis, Writing, articles,
and author profiles. `robots.ts` and `manifest.ts` provide crawler and PWA metadata.

## Deployment

- **Platform**: Vercel. `vercel.json` sets `buildCommand` to `pnpm build`, so deployments use the
  repository's current writing-sync script instead of the retired research-sync command.
- **Analytics**: `@vercel/analytics/next` in root layout
- No CI/CD workflows in repo (no `.github/` directory)
- Tests: `pnpm test` runs Node's built-in test runner over `src/**/*.test.mjs` (Node 22.15+; TypeScript is
  stripped natively). Tests cover pure logic, article safety, the article sync against a fake GitHub,
  writer profile output, and actual crossing, intro, mobile capture, and header navigation effects
  with controlled dependencies.
  There is no DOM test package or in-repo browser runner; use gstack `/browse`
  for desktop/mobile navigation, themes, reduced motion, scroll capture, and figure checks.

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | ^16.2.12 | Framework (App Router) |
| react | ^19.0.0 | UI library |
| three | ^0.183.2 | WebGL / ASCII mosaic rendering |
| gsap | ^3.14.2 | Scroll animations (ScrollTrigger, Observer) |
| @gsap/react | ^2.1.2 | GSAP React integration (useGSAP) |
| use-scramble | ^2.2.15 | Character scramble text effects |
| tailwindcss | ^4.0.0 | Utility-first CSS (v4 with @theme) |
| sharp | ^0.35.3 | Image optimization |
| marked | ^18.1.2 | Article Markdown parsing with a constrained renderer |
| swiper | ^12.1.3 | Mobile thesis slides |

## Important Notes

- Three.js is transpiled via `next.config.ts` (`transpilePackages: ['three']`)
- Only Three.js uses experimental `optimizePackageImports`; GSAP is excluded because its plugin registration and ticker must stay intact
- Some sections are hidden/incomplete: `CareersSection` content not ready
- Partnerships are hidden pending confirmation; do not re-enable the section or links without explicit authorization.
- Confirmed product, author, partner, and pedigree claims are recorded in [PRODUCT.md](PRODUCT.md); do not invent facts or logos
- Assets in `/public/resource/` include large video files — not included in git history tracking for new clones

## Documentation

- [PRODUCT.md](PRODUCT.md): current audience, content decisions, and confirmed claims.
- [TODOS.md](TODOS.md): remaining work and completed release items.
- [CHANGELOG.md](CHANGELOG.md): release history; [VERSION](VERSION) uses four parts while package.json uses the first three.
- [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md): what must pass before a release, for Thesis sections, capture, scroll locks, and page entry.
- [docs/ABOUT_MOBILE_DESIGN.md](docs/ABOUT_MOBILE_DESIGN.md): mobile About composition, type roles, spacing, and review evidence.
- [docs/PAGE_ENTRY.md](docs/PAGE_ENTRY.md): About loader readiness, Thesis entry, route cleanup, and regression checks.
- [docs/ARTICLE_REPO_PROPOSAL.md](docs/ARTICLE_REPO_PROPOSAL.md): proposed required check and build-result alert for the article repository, awaiting the owner's approval.
- [THESIS_SCROLL_HISTORY.md](THESIS_SCROLL_HISTORY.md): scroll decisions and regressions (April–November 2026), including the iOS 27 momentum fix and native simulator evidence.
- [docs/PHASE5_GRID_PLAN.md](docs/PHASE5_GRID_PLAN.md): historical grid implementation plan, not the current backlog.
- [security_best_practices_report.md](security_best_practices_report.md): historical security audit (2026-04-13; updated 2026-11-05), with paths and findings from those snapshots.
- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): synchronized project instructions.

---

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review
- Save progress, checkpoint, resume -> invoke checkpoint
- Code quality, health check -> invoke health
