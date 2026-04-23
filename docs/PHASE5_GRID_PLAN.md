# Phase 5: 12-Column Grid System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `max-w-[1440px]` container pattern with a true viewport-anchored 12-column CSS Grid so that 48px side margins and section column spans are consistent at any viewport width (especially ≥1440px).

**Architecture:** Introduce CSS custom properties for grid tokens (column count, column width baseline, gutter, side margin) and a reusable `.site-grid` / `.site-grid-inner` utility class pair. Each section declares either `fullscreen` (no margin), `full-grid` (48px margin only), or `narrow-grid` (margin + inner column offset) using Tailwind's built-in `grid-cols-12`, `col-start-*`, `col-span-*` utilities over the CSS grid container.

**Tech Stack:** Tailwind CSS v4 (`@theme` tokens), Next.js 16 App Router (Server + Client components), TypeScript. No new runtime deps.

---

## Scope Check

- **In scope:** All layout containers that currently use `max-w-[1440px] mx-auto` or `px-6` / `px-[48px]` without viewport-anchoring. Specifically: `Header.tsx`, `Footer.tsx`, `ProductMap.tsx`, `ProductCard.tsx`, `ProductsHeading.tsx`, `ThesisSection.tsx` (inner text container only), `ThesisGraph.tsx`, `TeamHero.tsx`, `InvestorsSection.tsx`, `CareersSection.tsx`, `globals.css` (grid tokens + marquee container).
- **Out of scope (hard rule):** `ThesisSection.tsx` outer `<section>` and GSAP pin logic, `ThesisSectionMobile.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx` inner text constraints (intro-lock ownership), `thesisData.tsx`, `hashScroll.ts`. These are blacklisted by `IMPLEMENTATION_PLAN.md` and have 25+ bug-fix history. Touching them is a release-blocker.
- **Mobile (<768px):** Stays at the existing 22px side padding with **no** strict column grid. Only desktop (≥768px) gets the full 12-col grid. The Figma comment and DESIGN_REVIEW.md both scope the "1440 기준 12-col" spec to desktop.

---

## Grid Math (Baseline 1440px Desktop)

Derived from `DESIGN_REVIEW.md` section A:
- Viewport side margin: **48px**
- Usable width at 1440: `1440 − 96 = 1344px`
- 12 columns × C + 11 × 20px gutters = 1344 → **C = 93.67px** ✓ matches spec
- Column edges (from left of grid, not viewport): 0, 113.67, 227.34, 341.01, 454.68, 568.35, 682.02, 795.69, 909.36, 1023.03, 1136.7, 1250.37, 1344

> For viewports > 1440px we use `grid-template-columns: repeat(12, 1fr)` with fixed 48px side padding so columns **stretch** proportionally. The 93.67 is the design baseline, not a hard px value. Below 1440 no change (already working).

### Inferred column spans per section

| Section | Mode | Inferred span | Evidence |
|---------|------|--------------|----------|
| Hero | 1 fullscreen | n/a | Figma코멘트: "양옆 간격 없이 꽉차게" |
| Header | 2 full-grid | logo col 1 start, nav col 12 end | Figma 코멘트: "48px 그리드 끝에 배치" |
| Footer | 2 full-grid | same as Header | DESIGN_REVIEW B-6 |
| ProductMap box | 2 full-grid | cols 1–12 | DESIGN_REVIEW B-4: "1344px 폭" |
| ProductMap ASCII | inner 70% | ~cols 2.5–10.5 of box | 70% of box |
| ThesisGraph | 1 fullscreen | n/a | `w-full h-svh` preserved |
| Thesis text | 3 narrow-grid | **col-start 2 col-span 10** ⚠️ | `max-w-[1034px]` centered; 10 cols ≈ 1116.7px fits ★ |
| ProductsHeading | 3 narrow-grid | **col-start 3 col-span 8** ⚠️ | text `max-w-[889px]` = 8 cols ≈ 890px ✓ |
| ProductCard | 3 narrow-grid | **col-start 3 col-span 8** | `ml-[calc(16.67%+35px)]` + `w-[890px]`: 48 + 2×93.67 + 2×20 = 275px offset = start of col 3; 890px = 8 cols ✓ |
| InvestorsSection | 3 narrow-grid | **col-start 3 col-span 8** ⚠️ | `max-w-[860px]` ≈ 8 cols |
| TeamHero text | 3 narrow-grid | **col-start 3 col-span 8** ⚠️ | `max-w-[890px]` = 8 cols |
| CareersSection | 3 narrow-grid | **col-start 3 col-span 8** ⚠️ | `max-w-[890px]` = 8 cols |

⚠️ = inferred from existing max-w values rather than explicit Figma spec. Confirm visually against Figma during Task 10 or reject/adjust.

---

## File Structure

### Created files
None — all work is edits to existing files plus new CSS in `globals.css`.

### Modified files

| File | Responsibility after change |
|------|----------------------------|
| `src/app/globals.css` | Add `@theme` grid tokens, `.site-grid` (desktop 12-col grid wrapper), `.site-grid-fullscreen` (no-op), mobile fallback. Remove/reshape `.marquee-container` to use grid tokens. |
| `src/components/layout/Header.tsx` | Replace `max-w-[1440px] mx-auto` container with `.site-grid` parent; logo in `col-start-1` first-cell, nav in `col-start-12` last-cell. |
| `src/components/layout/Footer.tsx` | Replace desktop wrapper with `.site-grid`; logo in col 1, link groups occupy cols 8-12 (or 7-12; confirm Figma). |
| `src/components/home/ProductMap.tsx` | Drop `max-w-[calc(100%-96px)]`, use `.site-grid > .site-grid-box` spanning 12 cols; inner ASCII at 70% width. |
| `src/components/home/ProductCard.tsx` | Drop `max-w-[1440px]` + `ml-[calc(16.67%+35px)]`; use `.site-grid` parent with `col-start-3 col-span-8`. Width becomes fluid (≈890px at 1440, stretches above). |
| `src/components/home/ProductsHeading.tsx` | `.site-grid` parent, text in `col-start-3 col-span-8`. Mobile stays `px-[22px]`. |
| `src/components/home/ThesisSection.tsx` | **Only inner text container div at line 533** — change `px-[22px] md:px-6` to grid column positioning. Outer `<section>` and GSAP untouched. |
| `src/components/home/ThesisGraph.tsx` | Keep `w-full h-svh`; inner text already `max-w-[1034px] px-[22px] md:px-0` works as Mode 1 fullscreen. No change needed except possibly verify. |
| `src/components/team/TeamHero.tsx` | Replace `px-[22px] md:px-6` (24px, bug) with `.site-grid` + `col-start-3 col-span-8` for text block. |
| `src/components/team/InvestorsSection.tsx` | Drop `max-w-[1440px] px-[22px] md:px-12`; use `.site-grid` + inner block at `col-start-3 col-span-8`. 7-col internal CSS grid stays. |
| `src/components/team/CareersSection.tsx` | Same pattern as TeamHero. |
| `IMPLEMENTATION_PLAN.md` | Update Phase 5 row from "deferred" to "done" with link to this plan (housekeeping; optional). |

### Not touched (guardrail)
`ThesisSection.tsx` outer structure, `ThesisSectionMobile.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx`, `thesisData.tsx`, `hashScroll.ts`, `AssetPrefetcher.tsx`, all `ascii/*` canvas renderers.

---

## Verification Strategy

No test framework installed (per `CLAUDE.md`). Each task verifies via:
1. `pnpm build` — catches type errors, broken CSS @theme syntax.
2. `pnpm lint` — Next.js/ESLint defaults.
3. Browser check at three widths: **1280px (below 1440)**, **1440px (baseline)**, **1920px (wide — where the bug manifests)**. Dark mode only for all tasks except Task 6 (Thesis interaction in both modes).
4. Thesis scroll regression check after Task 6, 9, 10: enter → advance 7 pages → exit, both dirs.

---

## Task 1: Add Grid Tokens and Utility Classes to globals.css

**Files:**
- Modify: `src/app/globals.css` (add after existing `@theme` block, before `:root`)

- [ ] **Step 1: Add grid custom properties to `@theme`**

Insert inside the existing `@theme { ... }` block starting at line 6:

```css
  /* ── 12-column grid system ────────────────────────────────── */
  --grid-cols: 12;
  --grid-gutter: 20px;
  --grid-margin-desktop: 48px;
  --grid-margin-mobile: 22px;
```

- [ ] **Step 2: Add `site-grid` utility via `@utility` (Tailwind v4)**

Append after the existing `[data-theme='dark']` block (around line 41). The `@utility` directive (Tailwind v4 feature) is required — plain `.site-grid { ... }` CSS classes do NOT accept the `md:` prefix. `@utility` registers the rule with Tailwind's variant engine so `md:site-grid` works.

```css
/* ══════════════════════════════════════════════════════════
   12-column grid wrapper — viewport-anchored, scales above 1440
   ══════════════════════════════════════════════════════════
   Structure only — NO padding. Pair with `px-[22px] md:px-[48px]`
   (or mode-specific padding) on the same element.

   Mode 1 (fullscreen): do not use this class — keep w-full on the
     section.
   Mode 2 (full-grid, 48px margins only): apply site-grid + padding,
     direct children use col-span-12 / col-start-1 / col-start-12.
   Mode 3 (narrow-grid): apply site-grid + padding, children use
     col-start-N col-span-M (e.g. col-start-3 col-span-8).            */
@utility site-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: var(--grid-gutter);
  width: 100%;
}

/* Utility: element should span the full grid (mode 2) ignoring the
   12-col subdivision. Useful for ProductMap box where children align
   to box edges not grid columns.                                      */
@utility site-grid-span-all {
  grid-column: 1 / -1;
}
```

**Usage patterns established here** (padding is ALWAYS explicit):
- Always-grid section (rare): `<section className="site-grid px-[22px] md:px-[48px] ...">`
- Grid only at desktop, flex on mobile: `<section className="flex flex-col md:site-grid px-[22px] md:px-[48px] ...">`
- Grid at desktop, existing mobile flex preserved: `<section className="md:site-grid px-[22px] md:px-[48px] ...">`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: completes with no CSS syntax or @theme errors.

- [ ] **Step 4: Verify visual no-op**

Run: `pnpm dev` and check the homepage at 1440px still looks identical. Any new utility class is unused yet — this step just guards against accidental regression from new CSS parsing.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(grid): add 12-column grid tokens and site-grid utility"
```

---

## Task 2: Migrate Header to site-grid (Mode 2)

**Files:**
- Modify: `src/components/layout/Header.tsx:218-258`

- [ ] **Step 1: Replace desktop container**

Current (line 218):
```tsx
<div className="relative mx-auto h-full w-full max-w-[1440px]">
```

Replace with:
```tsx
<div className="md:site-grid md:px-[48px] relative h-full w-full items-center">
```

Note: only desktop becomes grid. Mobile keeps the existing `absolute left-[22px]` / `absolute right-[10px]` positioning on logo and hamburger — `relative` on the wrapper is required for those `absolute` children to scope correctly.

- [ ] **Step 2: Make logo and nav use grid columns at desktop**

Logo currently (line 221-224):
```tsx
<Link
  href="/"
  className="absolute top-1/2 -translate-y-1/2 left-[22px] md:left-[48px]"
>
  <LogoHeader className="h-[14px] w-[48px] md:h-[21px] md:w-[73px] text-[var(--color-accent)]" />
</Link>
```

Replace with:
```tsx
<Link
  href="/"
  className="absolute top-1/2 -translate-y-1/2 left-[22px] md:static md:top-auto md:translate-y-0 md:col-start-1 md:justify-self-start md:self-center"
>
  <LogoHeader className="h-[14px] w-[48px] md:h-[21px] md:w-[73px] text-[var(--color-accent)]" />
</Link>
```

Nav currently (line 229):
```tsx
<nav className="absolute top-1/2 -translate-y-1/2 right-[48px] hidden items-center md:flex">
```

Replace with:
```tsx
<nav className="hidden md:flex md:col-start-12 md:justify-self-end md:self-center items-center">
```

- [ ] **Step 3: Verify mobile hamburger still works**

Mobile hamburger at line 249 keeps `absolute right-[10px]` — no change. Verify by running dev server and resizing to <768px.

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: passes.

- [ ] **Step 5: Visual check at 1280 / 1440 / 1920**

At 1920px: logo should now sit at viewport-left + 48px (not 288px). Nav should sit at viewport-right − 48px. At 1440: no visual change vs. before. At 1280: no visual change.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "refactor(header): migrate to site-grid 12-col (viewport-anchored)"
```

---

## Task 3: Migrate Footer to site-grid (Mode 2)

**Files:**
- Modify: `src/components/layout/Footer.tsx:74-95` (desktop block only)

- [ ] **Step 1: Replace desktop wrapper**

Current (line 75):
```tsx
<div className="hidden md:flex relative mx-auto h-[304px] w-full max-w-[1440px] items-start justify-between px-[48px] py-[32px]">
```

Replace with:
```tsx
<div className="hidden md:site-grid md:px-[48px] relative h-[304px] w-full items-start py-[32px]">
```

Note: `md:site-grid` supplies `display: grid` at ≥768px. `hidden` hides the element below 768px (mobile uses the separate `<div className="block md:hidden ...">` earlier in the same return). No `max-w-[1440px]` — the grid stretches to viewport − 96px.

- [ ] **Step 2: Wrap left column with col-start-1 col-span-4**

Current (line 77-82):
```tsx
<div className="flex flex-col justify-between h-full">
  <LogoFooter className="h-[48px] w-[50px] text-[var(--color-accent)]" />
  <p className="text-[12px] font-normal leading-[1.2] tracking-[-0.12px] text-[var(--color-sub-text1)]">
    &copy; 2025 - 2026 1SIX Technologies Inc. All rights reserved.
  </p>
</div>
```

Replace the `<div className="flex flex-col ...">` opener with:
```tsx
<div className="col-start-1 col-span-5 flex flex-col justify-between h-full">
```

- [ ] **Step 3: Wrap right link groups with col-start-8 col-span-5**

Current (line 85-94):
```tsx
<div className="flex gap-16">
  <div className="flex flex-col gap-6">
    <FooterColumn title="COMPANY" links={COMPANY_LINKS} />
    <FooterColumn title="PRODUCTS" links={PRODUCT_LINKS} />
  </div>
  <FooterColumn title="CONNECT" links={CONNECT_LINKS} />
</div>
```

Replace the outer `<div className="flex gap-16">` with:
```tsx
<div className="col-start-8 col-span-5 flex gap-16 justify-end">
```

> ⚠️ **Figma-verify:** `col-start-8 col-span-5` is an inference. May need `col-start-9 col-span-4` if Figma shows links closer to the right edge. DESIGN_REVIEW notes "현재 너무 좁음, 비율 조정 필요" which implies wider left/right separation than the current flexbox.

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: passes.

- [ ] **Step 5: Visual check**

Three widths. Confirm at 1920 the logo sits at viewport-left + 48, links on the right near viewport-right − 48.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Footer.tsx
git commit -m "refactor(footer): migrate desktop to site-grid 12-col"
```

---

## Task 4: Migrate ProductMap to site-grid (Mode 2)

**Files:**
- Modify: `src/components/home/ProductMap.tsx:16-24`

- [ ] **Step 1: Wrap section in site-grid and have inner box span all columns**

Current (line 17-23):
```tsx
<section
  ref={sectionRef}
  className="mx-auto flex h-[540px] md:h-[756px] w-full max-w-[calc(100%-96px)] flex-col items-center justify-end overflow-hidden"
  style={{
    backgroundColor: 'var(--color-card)',
  }}
>
```

Replace with:
```tsx
<div className="site-grid px-[22px] md:px-[48px]">
  <section
    ref={sectionRef}
    className="site-grid-span-all flex h-[540px] md:h-[756px] w-full flex-col items-center justify-end overflow-hidden"
    style={{
      backgroundColor: 'var(--color-card)',
    }}
  >
```

- [ ] **Step 2: Close the new wrapper at end of section**

Find the closing `</section>` at the end of the return (line 70-71) and add `</div>` after it:
```tsx
  </section>
</div>
```

- [ ] **Step 3: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: passes.

- [ ] **Step 4: Visual check**

At 1920px the map box should now go from viewport-left + 48 to viewport-right − 48 (≈ 1824px wide). At 1440: ≈1344px wide (unchanged). Inner ASCII still 70% of box (existing `w-[70%]`).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/ProductMap.tsx
git commit -m "refactor(product-map): migrate to site-grid (viewport-anchored box)"
```

---

## Task 5: Migrate ProductCard to site-grid (Mode 3, col-start-3 col-span-8)

**Files:**
- Modify: `src/components/home/ProductCard.tsx:22-32`

- [ ] **Step 1: Replace outer wrappers with site-grid**

Current (line 23-32):
```tsx
<div className="w-full py-3">
  {/*
    Mobile (<768px): mx-[22px], vertical card, auto height
    Desktop (>=768px): max-w-[1440px] mx-auto, left-offset, horizontal 890x270
  */}
  <div className="mx-[22px] md:mx-auto md:w-full md:max-w-[1440px]">
    <div
      className="flex flex-col overflow-hidden md:ml-[calc(16.67%+35px)] md:w-[890px] md:h-[270px] md:flex-row"
      style={{ backgroundColor: 'var(--color-card2)' }}
    >
```

Replace with:
```tsx
<div className="w-full py-3">
  {/* Mobile: 22px side margin. Desktop: site-grid with 48px padding, card spans col-start-3 col-span-8 (fluid, ≈890px at 1440, stretches above). */}
  <div className="mx-[22px] md:mx-0 md:site-grid md:px-[48px]">
    <div
      className="flex flex-col overflow-hidden md:col-start-3 md:col-span-8 md:h-[270px] md:flex-row"
      style={{ backgroundColor: 'var(--color-card2)' }}
    >
```

Note: width `md:w-[890px]` removed — column spans dictate width. At 1440 viewport this renders as 8 cols × 93.67 + 7 × 20 = 889.4 ≈ 890px ✓.

- [ ] **Step 2: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: passes.

- [ ] **Step 3: Visual check**

At 1440 the card looks identical to before (890 wide, 275 offset). At 1920 the card stretches proportionally and sits further right (col-start-3 now measured from viewport-left + 48).

- [ ] **Step 4: Commit**

```bash
git add src/components/home/ProductCard.tsx
git commit -m "refactor(product-card): migrate to site-grid col-start-3 col-span-8"
```

---

## Task 6: Migrate ThesisSection inner text container only (Mode 3)

⚠️ **DANGER ZONE.** The outer `<section ref={sectionRef}>` and all GSAP logic above it are untouchable. Only the `.absolute max-w-[1034px] px-[22px] md:px-6` content wrappers at lines 532-548 are modified.

**Files:**
- Modify: `src/components/home/ThesisSection.tsx:530-548`

The constraint: each `<div ref={setContentRef(index)}>` is GSAP-animated via `autoAlpha` and `yPercent`. Refs must stay attached to the same element. Position model (`absolute`) should not change — replacing `absolute` with `static` would make the 7 states stack sequentially instead of overlapping, breaking the pin/crossfade completely.

**Strategy:** turn the outer stacking container into a CSS grid. All 7 content divs target the same grid cell (cols 2–11 at md, cols 1–12 at mobile). CSS Grid explicitly allows multiple children to occupy the same cell — they overlap in source order. GSAP's transform/opacity animations work identically on grid items. No position-model change needed.

- [ ] **Step 1: Convert outer stacking container to grid**

Current (line 526-527):
```tsx
<div className="absolute inset-0 flex items-center justify-center">
  {THESIS_STATES.map((state, index) => {
```

Replace with:
```tsx
<div className="absolute inset-0 site-grid px-[22px] md:px-[48px] items-center">
  {THESIS_STATES.map((state, index) => {
```

> `site-grid` = `display: grid; grid-template-columns: repeat(12, 1fr)`. `items-center` centers each grid item vertically in its row. Because all items below use `row-start-1`, they share the same row and stack via their source order.

- [ ] **Step 2: Replace inner content div — grid placement, no position change**

Current (line 530-534):
```tsx
<div
  key={state.id}
  ref={setContentRef(index)}
  className="absolute max-w-[1034px] px-[22px] md:px-6"
  style={index !== 0 ? { visibility: 'hidden', opacity: 0 } : undefined}
>
```

Replace with:
```tsx
<div
  key={state.id}
  ref={setContentRef(index)}
  className="col-span-12 md:col-start-2 md:col-span-10 row-start-1 flex items-center justify-center"
  style={index !== 0 ? { visibility: 'hidden', opacity: 0 } : undefined}
>
```

> Note: `absolute` dropped, `max-w-[1034px]` dropped (column span controls width now), `px-6` bug dropped. The `row-start-1` is the key — all 7 children land in row 1 col 2-11 and overlap.

- [ ] **Step 3: No added closing tags**

No new wrappers added in Task 6, so no new closing `</div>` is needed. Structure:
```tsx
<div className="absolute inset-0 site-grid px-[22px] md:px-[48px] items-center">
  {THESIS_STATES.map(...)} {/* each child is a grid item */}
</div>
```

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: passes.

- [ ] **Step 5: Desktop Thesis scroll regression check**

Run dev server, scroll to Thesis from Hero, advance all 7 pages via wheel/trackpad, then reverse. Confirm pin behavior, crossfade, dot indicator all work. This section carries 25+ bug-fix history — any regression requires immediate rollback.

- [ ] **Step 6: Mobile Thesis Swiper regression check**

Resize below 768px (or use device emulation). Confirm horizontal swipe between states works; no double-scroll, no capture leak.

- [ ] **Step 7: Dark and light mode both**

ASCII rendering is different per theme. Confirm inline ASCII characters stay aligned within the text line at both themes.

- [ ] **Step 8: Commit**

```bash
git add src/components/home/ThesisSection.tsx
git commit -m "refactor(thesis): migrate inner text container to site-grid col-span-10"
```

---

## Task 7: Migrate ProductsHeading to site-grid (Mode 3)

**Files:**
- Modify: `src/components/home/ProductsHeading.tsx:12-16`

- [ ] **Step 1: Wrap section content in site-grid**

Current (line 12-16):
```tsx
<section
  id="products"
  className="flex flex-col items-center px-[22px] md:px-0 pt-[80px] md:pt-[115px] pb-[40px] md:pb-[60px]"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
```

Replace with:
```tsx
<section
  id="products"
  className="flex flex-col md:site-grid px-[22px] md:px-[48px] pt-[80px] md:pt-[115px] pb-[40px] md:pb-[60px]"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
  <div className="flex flex-col items-center md:col-start-3 md:col-span-8">
```

Note: at mobile the section is `flex flex-col`; at md+ `md:site-grid` overrides display to grid (custom `@utility` classes are emitted after built-in `flex`, so the md variant wins at the breakpoint). If during implementation the display override fails visually, wrap the grid in an inner `<div className="md:site-grid md:px-[48px] w-full">` instead and drop `md:site-grid` from the section.

- [ ] **Step 2: Close the new inner wrapper before `</section>`**

Current end of component (around line 34):
```tsx
    </p>
  </section>
```

Replace with:
```tsx
    </p>
    </div>
  </section>
```

- [ ] **Step 3: Mobile fallback check**

At <768px the section should render exactly as before (flex column, 22px side padding). The `md:site-grid` only activates at ≥768px; below that the inner `md:col-*` utilities are no-ops.

If the `md:site-grid` display override fails to apply (check devtools at 1440px — if inner div is not column-positioned), fall back to inserting an extra wrapper: replace `md:site-grid` on the section with an inner `<div className="w-full md:site-grid md:px-[48px]">...</div>` containing the col-spanned child. This avoids relying on Tailwind's source-order resolution for conflicting `display` utilities.

- [ ] **Step 4: Build + lint + visual**

Run: `pnpm build && pnpm lint`. Check 1920/1440/1280 desktop + 375 mobile.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/ProductsHeading.tsx
git commit -m "refactor(products-heading): migrate to site-grid col-start-3 col-span-8"
```

---

## Task 8: Migrate InvestorsSection to site-grid (Mode 3)

**Files:**
- Modify: `src/components/team/InvestorsSection.tsx:34-39`

- [ ] **Step 1: Replace outer wrapper**

Current (line 34-39):
```tsx
<section
  id="investors"
  className="pt-[100px] pb-[100px]"
  style={{ backgroundColor: 'var(--color-card)' }}
>
  <div className="mx-auto max-w-[1440px] px-[22px] md:px-12">
```

Replace with:
```tsx
<section
  id="investors"
  className="pt-[100px] pb-[100px] md:site-grid px-[22px] md:px-[48px]"
  style={{ backgroundColor: 'var(--color-card)' }}
>
  <div className="md:col-start-3 md:col-span-8">
```

- [ ] **Step 2: Build + lint + visual**

Run: `pnpm build && pnpm lint`. Navigate to `/about#investors`, check 1920/1440.

- [ ] **Step 3: Commit**

```bash
git add src/components/team/InvestorsSection.tsx
git commit -m "refactor(investors): migrate to site-grid col-start-3 col-span-8"
```

---

## Task 9: Migrate TeamHero and CareersSection to site-grid (Mode 3)

**Files:**
- Modify: `src/components/team/TeamHero.tsx:11-15`
- Modify: `src/components/team/CareersSection.tsx:50-56`

- [ ] **Step 1: TeamHero — wrap content in grid**

Current TeamHero (line 11-15):
```tsx
<section
  className="flex max-md:h-svh flex-col items-center max-md:justify-center gap-6 md:gap-8 px-[22px] md:px-6 md:pt-[105px] md:pb-24"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
```

Replace with:
```tsx
<section
  className="max-md:h-svh max-md:flex max-md:flex-col max-md:items-center max-md:justify-center max-md:gap-6 px-[22px] md:site-grid md:px-[48px] md:pt-[105px] md:pb-24"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
  <div className="md:col-start-3 md:col-span-8 flex flex-col items-center md:gap-8">
```

> Rationale: mobile keeps the original flex column behavior via `max-md:flex`; desktop uses grid with content confined to cols 3–10.

- [ ] **Step 2: TeamHero — close new inner wrapper before `</section>`**

Add `</div>` after the closing `</p>` of the description text (at end of return):
```tsx
    </p>
    </div>
  </section>
```

- [ ] **Step 3: CareersSection — migrate**

Current (line 50-56):
```tsx
<section
  id="careers"
  className="py-24"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
  <div className="mx-auto max-w-[890px] px-[22px] md:px-6">
```

Replace with:
```tsx
<section
  id="careers"
  className="py-24 md:site-grid px-[22px] md:px-[48px]"
  style={{ backgroundColor: 'var(--color-bg)' }}
>
  <div className="md:col-start-3 md:col-span-8">
```

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`.

- [ ] **Step 5: Visual check on /about page**

Scroll full about page at 1920. Team hero, profiles marquee, investors, careers all align. Confirm the `md:site-grid` prefixed class works (fallback: move grid class to an inner wrapper div instead).

- [ ] **Step 6: Commit**

```bash
git add src/components/team/TeamHero.tsx src/components/team/CareersSection.tsx
git commit -m "refactor(team): migrate TeamHero and Careers to site-grid col-start-3 col-span-8"
```

---

## Task 10: Verify Mode 1 sections (Hero, ThesisGraph) unchanged

**Files:** none modified; verification-only.

- [ ] **Step 1: Confirm HeroSection.tsx has no max-w cap**

Read `src/components/home/HeroSection.tsx:200-220`. Confirm `className` on the `<section>` is `relative flex h-svh w-full items-center justify-center overflow-hidden`. No change needed — this is Mode 1 fullscreen.

- [ ] **Step 2: Confirm ThesisGraph.tsx outer is full-width**

Read `src/components/home/ThesisGraph.tsx:19-23`. Confirm the `<section>` is `relative flex h-svh w-full items-center justify-center overflow-hidden`. Text inside has `max-w-[1034px] px-[22px] md:px-0` — confirm visually at 1920 that the text centers correctly. If Figma has this section in Mode 3 (narrow grid) instead of Mode 1, adjust by wrapping in `md:site-grid` + `md:col-start-2 md:col-span-10` similar to Task 6.

⚠️ **Figma-verify:** Confirm whether ThesisGraph should be Mode 1 or Mode 3.

- [ ] **Step 3: No commit if no change**

If adjustments needed, apply and commit with:
```bash
git commit -m "refactor(thesis-graph): align text to site-grid"
```

---

## Task 11: Drop dead max-w-[1440px] references

**Files:**
- Modify: `src/components/home/InsightSection.tsx:27` (commented-out/hidden file — still cleanup worthwhile)
- Verify: no other file still has `max-w-[1440px]`

- [ ] **Step 1: Grep for stragglers**

Run: `grep -rn "max-w-\[1440px\]" src/`
Expected: only InsightSection.tsx remains.

- [ ] **Step 2: Convert InsightSection to site-grid-ready**

At line 27, replace `<div className="mx-auto max-w-[1440px] md:relative md:h-full">` with `<div className="md:site-grid md:px-[48px] md:relative md:h-full">` and wrap inner content in `<div className="md:col-start-1 md:col-span-12">` (full-grid mode 2). Keep the file behind its current render gate — we're just prepping it for when Insight launches.

- [ ] **Step 3: Final grep**

Run: `grep -rn "max-w-\[1440px\]" src/`
Expected: zero matches.

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/InsightSection.tsx
git commit -m "refactor(insight): prep for site-grid (still gated off)"
```

---

## Task 12: Final end-to-end verification

**Files:** none modified.

- [ ] **Step 1: Full build from clean**

Run: `rm -rf .next && pnpm build`
Expected: passes with zero errors.

- [ ] **Step 2: Three-viewport visual sweep on homepage**

Open dev server. At each of 1280, 1440, 1920:
1. Header logo at viewport-left + 48px (verify via devtools coordinates).
2. Header nav at viewport-right − 48px.
3. Hero section: edge-to-edge video, no 48px margin.
4. Thesis text: enter section, advance pages, confirm text stays centered and readable at all widths.
5. ThesisGraph text: centered.
6. ProductsHeading: centered within cols 3–10.
7. ProductMap: box at 48px from viewport edges; ASCII at 70% of box (centered).
8. ProductCard × 2: offset consistent (col-start-3); cards have same left edge at all widths.
9. Footer: logo at viewport-left + 48px, links at viewport-right − 48px.

- [ ] **Step 3: /about page sweep**

1. TeamHero centered, text max-width feels right.
2. TeamProfiles marquee (unchanged).
3. InvestorsSection: grid centered.
4. CareersSection: content at cols 3–10.

- [ ] **Step 4: Thesis scroll regression — full**

Desktop: Hero → scroll down → Thesis pins → 7 pages → exits into ThesisGraph. Reverse same. Confirm no stuck state, no skip, no visual flicker.

Mobile (devtools or real device): Hero → scroll → Thesis Swiper appears → swipe through 7 slides → scroll continues. Confirm capture/release, no page freeze.

- [ ] **Step 5: Dark/light mode toggle**

Toggle theme at top of homepage. Confirm grid alignment, colors, ASCII contrast all remain consistent.

- [ ] **Step 6: Run on 1920px real screen if available**

The main point of this refactor is behavior ≥1440px. If physical monitor available, open `pnpm dev` at full screen and visually confirm logo/nav/card alignment.

- [ ] **Step 7: Final commit (if any touch-ups from sweep)**

If sweep reveals small issues, fix and commit. Otherwise move to PR.

- [ ] **Step 8: Update IMPLEMENTATION_PLAN.md**

Edit `IMPLEMENTATION_PLAN.md` Phase 5 row:
```diff
- | **12-column 그리드 시스템 전면 도입** | 전체 레이아웃 리팩토링. 현재 작업 범위를 넘음 |
+ | **12-column 그리드 시스템 전면 도입** | ✅ 완료 — `docs/PHASE5_GRID_PLAN.md` 참고 |
```

- [ ] **Step 9: Commit housekeeping**

```bash
git add IMPLEMENTATION_PLAN.md
git commit -m "docs: mark Phase 5 (12-col grid) as complete"
```

---

## Rollback Plan

If Task 6 (Thesis) regresses and can't be fixed quickly:
```bash
git revert <task-6-commit-hash>
```
Other tasks (1–5, 7–12) are independent of Thesis pin logic. Thesis regression does not block them.

If Task 1 (globals.css) breaks Tailwind compilation:
```bash
git revert <task-1-commit-hash>
```
All subsequent tasks depend on it — revert cascade.

---

## Open Questions for User (Before or During Implementation)

1. **Mode 3 column spans** — inferred as `col-start-3 col-span-8` across multiple sections from existing `max-w-[890px]`. Please confirm against Figma, especially:
   - ProductsHeading: is the "adoption comes first" heading on col 3–10, or is it actually intended to span full 12 cols (centered naturally by text)?
   - TeamHero description: col 3–10 or 2–11?
   - ThesisSection text: col 2–11 (span 10) or col 3–10 (span 8)?
2. **Footer link column** — Task 3 uses `col-start-8 col-span-5` for the right-side link cluster. Figma may prefer tighter or wider. Feedback welcome.
3. **ThesisGraph** — currently Mode 1 (fullscreen with text centered inside). Should it remain Mode 1 or become Mode 3 (narrow grid text)?
4. **Mobile grid** — current plan keeps 22px side padding with no strict grid below 768px. If Figma defines a mobile 4-col or 6-col grid, this plan needs an additional task.
