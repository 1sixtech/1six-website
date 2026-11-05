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
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # ESLint (Next.js default config)
pnpm test         # Unit tests (Node's built-in runner, src/**/*.test.mjs)
```

Package manager: **pnpm** (`engine-strict=true` in `.npmrc`).

## Project Structure

```
src/
  app/                        # Next.js App Router
    layout.tsx                # Root layout (metadata, theme, analytics)
    page.tsx                  # Home page
    globals.css               # Tailwind v4 @theme, CSS variables, keyframes
    about/page.tsx            # About page ("the crossing"), about.css page styles
    error.tsx                 # Error boundary
    not-found.tsx             # 404 page
    robots.ts, sitemap.ts, manifest.ts
  components/
    ascii/                    # Three.js ASCII mosaic renderers
      AsciiCanvas.tsx         # Core Three.js canvas (dynamic import, no SSR)
      AsciiHero.tsx, AsciiThesis.tsx, AsciiGraph.tsx, AsciiMap.tsx, ...
      mapGeometry.ts          # World map framing, glyph pitch and weight
      pixelScale.ts           # CSS-px mosaic options -> device px (pixelRatioCap)
    home/                     # Homepage section components
      HeroSection.tsx         # Staggered ASCII scramble intro
      ThesisSection.tsx       # GSAP pinned scroll section
      ThesisGraph.tsx, ProductMap.tsx (the world map), ProductsHeading.tsx, ...
    about/                    # About page: AboutCrossing (bands), CrossingMark (sticky ASCII 16 + fill),
                              # aboutData.ts (confirmed pedigree/backers), researchEvidence.ts
    research/                 # FigureViewer.tsx (full-size view of an article's figures)
    team/                     # CareersSection.tsx (parked, not rendered)
    layout/                   # Header.tsx, Footer.tsx
    ui/                       # Reusable: ScrollRevealWrapper, RollingNumber, ThemeToggle, Logo
    providers/                # ThemeProvider.tsx
  hooks/
    useScrollReveal.ts        # One-shot first-scroll detection
    useReducedMotion.ts       # Respects prefers-reduced-motion
    useDevicePixelRatio.ts    # Current device pixel ratio (re-renders on a monitor move or zoom)
  lib/
    site.ts                   # CONTACT_EMAIL, COPYRIGHT, isCurrentRoute()
    research.ts               # Research articles (synced at build by scripts/sync-research.mjs)
    themeInit.ts              # Theme + Home intro bootstrap, inlined in <head>
    ascmosaic/                # Custom Three.js ASCII mosaic library
      index.ts                # AscMosaic class (WebGL renderer)
      asciiMosaicFilter.ts    # ASCII rendering algorithm
      texturedMesh.ts         # Mesh + texture handling
      orbitControls.ts        # Camera controls
public/
  resource/                   # Videos (MP4), textures (PNG), images (WebP)
```

## Architecture & Key Patterns

### Rendering Strategy

- **Server components** by default (pages, layouts, metadata exports)
- **`'use client'`** directive for interactive components (animations, state, events)
- **Dynamic imports** with `ssr: false` for Three.js components (`AsciiCanvas`)
- No API routes, no database — static marketing content hardcoded in components

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
| **CSS transitions + IntersectionObserver** | About page fill: the sticky ASCII "16" fills 16% → 100% band by band |
| **View Transitions** | Whole-page cross-fade on theme switch (ThemeProvider) |

GSAP animations must be cleaned up with `useGSAP()` context or manual `gsap.context()` + `revert()`. Always check `useReducedMotion()` and skip or simplify animations accordingly.

### Three.js / AscMosaic

The custom `AscMosaic` library (`src/lib/ascmosaic/`) renders video/image sources as ASCII character mosaics via WebGL. Key constraints:

- Max 14 concurrent WebGL contexts (managed by `AsciiCanvas`); a disposed mosaic loses its context at once
- Uses `IntersectionObserver` for visibility — pauses/disposes when offscreen
- Handles WebGL context loss/restore events gracefully
- Async initialization queue to avoid main-thread jank; a newer init (a prop change) supersedes a queued one
- Opt-in per canvas: `pixelRatioCap` (output at the device pixel ratio), `smoothCells` (glyphs pre-rendered
  at their exact pixel coverage), `renderOnDemand` (a still image redraws only on its noise ticks).
  The world map uses all three.
- Without WebGL (or under reduced motion) a canvas shows its source media, still

### Styling

- **Tailwind CSS v4** with `@theme` syntax in `globals.css`
- Accent color: `#FF3700`
- Font: **Pretendard Variable** 1.3.9, the official dynamic subset: 92 slices in
  `public/fonts/pretendard-1.3.9/`, `@font-face` + unicode-range in `src/app/fonts/pretendard-variable.css`
  (browsers fetch only the slices a page uses; the root layout preloads the slices every page needs).
  Do not re-subset the font yourself: "Pretendard" is a Reserved Font Name under the OFL.
- Dark mode: CSS variable aliasing via `data-theme` attribute
- Responsive: mobile-first with `md:` breakpoint (768px)
- Path alias: `@/*` maps to `./src/*`

### Performance

- `IntroOrchestrator` warms the Home videos (`videoPool.warmupAll`) while the intro runs
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
- Only context is `ThemeContext` — no global state library

### Code Style

- 2-space indentation, semicolons, single quotes, trailing commas
- No Prettier config — consistent manual formatting
- ESLint: Next.js default config (`next lint`)

## Routes

| Path | Description |
|------|-------------|
| `/` | Homepage (hero, thesis, products) |
| `/about` | Team pedigree, backers, research, contact |
| `/team` | Permanent redirect -> `/about` |

Hash navigation: `/#thesis`, `/#products`

SEO: `robots.ts`, `sitemap.ts`, `manifest.ts` (PWA)

## Deployment

- **Platform**: Vercel (inferred from `@vercel/analytics`)
- **Analytics**: `@vercel/analytics/next` in root layout
- No CI/CD workflows in repo (no `.github/` directory)
- Tests: `pnpm test` runs Node's built-in test runner over `src/**/*.test.mjs` (Node 22.15+; TypeScript is
  stripped natively). Pure logic is tested; there is no DOM or browser test runner.

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | ^16.2.2 | Framework (App Router) |
| react | ^19.0.0 | UI library |
| three | ^0.183.2 | WebGL / ASCII mosaic rendering |
| gsap | ^3.14.2 | Scroll animations (ScrollTrigger, Observer) |
| @gsap/react | ^2.1.2 | GSAP React integration (useGSAP) |
| use-scramble | ^2.2.15 | Character scramble text effects |
| tailwindcss | ^4.0.0 | Utility-first CSS (v4 with @theme) |
| sharp | ^0.34.5 | Image optimization |

## Important Notes

- Three.js is transpiled via `next.config.ts` (`transpilePackages: ['three']`)
- GSAP and Three.js use experimental `optimizePackageImports`
- Some sections are hidden/incomplete: `CareersSection` content not ready
- No environment variables required for local development
- Assets in `/public/resource/` include large video files — not included in git history tracking for new clones

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
