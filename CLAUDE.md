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
```

Package manager: **pnpm** (`engine-strict=true` in `.npmrc`).

## Project Structure

```
src/
  app/                        # Next.js App Router
    layout.tsx                # Root layout (metadata, theme, analytics)
    page.tsx                  # Home page
    globals.css               # Tailwind v4 @theme, CSS variables, keyframes
    about/page.tsx            # Team/About page
    error.tsx                 # Error boundary
    not-found.tsx             # 404 page
    robots.ts, sitemap.ts, manifest.ts
  components/
    ascii/                    # Three.js ASCII mosaic renderers
      AsciiCanvas.tsx         # Core Three.js canvas (dynamic import, no SSR)
      AsciiHero.tsx, AsciiThesis.tsx, AsciiGraph.tsx, AsciiMap.tsx, ...
    home/                     # Homepage section components
      HeroSection.tsx         # Staggered ASCII scramble intro
      ThesisSection.tsx       # GSAP pinned scroll section
      ThesisGraph.tsx, ProductMap.tsx, ProductCard.tsx, ...
    team/                     # About page section components
      TeamHero.tsx, TeamProfiles.tsx, InvestorsSection.tsx, CareersSection.tsx
    layout/                   # Header.tsx, Footer.tsx
    ui/                       # Reusable: ScrollRevealWrapper, RollingNumber, ThemeToggle, Logo
    providers/                # ThemeProvider.tsx, AssetPrefetcher.tsx
  hooks/
    useScrollReveal.ts        # One-shot first-scroll detection
    useReducedMotion.ts       # Respects prefers-reduced-motion
  lib/
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
- Blocking `<script>` in `<head>` prevents flash of incorrect theme (FOIT)
- `localStorage` persistence; default: dark on mobile, light on desktop
- Access via `useTheme()` hook

### Animation Stack

| Library | Usage |
|---------|-------|
| **GSAP** + ScrollTrigger + Observer | Scroll-driven animations, pinned sections |
| **Three.js** via `AscMosaic` | WebGL ASCII mosaic rendering from video/images |
| **use-scramble** | Character scramble text reveal effects |
| **CSS keyframes** | Marquee infinite scroll (team profiles) |

GSAP animations must be cleaned up with `useGSAP()` context or manual `gsap.context()` + `revert()`. Always check `useReducedMotion()` and skip or simplify animations accordingly.

### Three.js / AscMosaic

The custom `AscMosaic` library (`src/lib/ascmosaic/`) renders video/image sources as ASCII character mosaics via WebGL. Key constraints:

- Max 10 concurrent WebGL contexts (managed by `AsciiCanvas`)
- Uses `IntersectionObserver` for visibility — pauses/disposes when offscreen
- Handles WebGL context loss/restore events gracefully
- Async initialization queue to avoid main-thread jank

### Styling

- **Tailwind CSS v4** with `@theme` syntax in `globals.css`
- Accent color: `#FF3700`
- Font: **Pretendard Variable** (local, 45-920 weight range)
- Dark mode: CSS variable aliasing via `data-theme` attribute
- Responsive: mobile-first with `md:` breakpoint (768px)
- Path alias: `@/*` maps to `./src/*`

### Performance

- `AssetPrefetcher` component: 3-batch idle-time prefetch strategy
- Detects slow connections (2G, `saveData`) and skips non-critical prefetches
- `/resource/*` assets cached with `Cache-Control: immutable, 1 year`
- Image optimization: webp + avif formats via Next.js
- Turbopack for dev server

## Coding Conventions

### Naming

- **Components**: PascalCase files and exports (`ProductCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useScrollReveal.ts`)
- **Utilities/lib**: camelCase (`asciiMosaicFilter.ts`)
- **Directories**: kebab-case (`components/ui/`)
- **Constants**: SCREAMING_SNAKE_CASE (`CHAR_RANGE`, `NAV_ITEMS`)
- **Types/Interfaces**: PascalCase (`ThemeContextValue`, `ProductCardProps`)

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
| `/about` | Team, investors, careers |
| `/team` | Permanent redirect -> `/about` |

Hash navigation: `/#thesis`, `/#products`

SEO: `robots.ts`, `sitemap.ts`, `manifest.ts` (PWA)

## Deployment

- **Platform**: Vercel (inferred from `@vercel/analytics`)
- **Analytics**: `@vercel/analytics/next` in root layout
- No CI/CD workflows in repo (no `.github/` directory)
- No testing framework installed

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
