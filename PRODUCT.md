# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary, now:** partners and associates at top-tier venture firms reading the site before and after pitch meetings, often from a forwarded link. Within minutes they need to know what 1SIX believes, why this team, who already backs it, and how to reach the founders.
- **Also:** prospective hires (engineering, research), press, and partners.

## Product Purpose

1SIX Technologies builds internet-native financial applications for the mass market: the "next 84%" who have not yet crossed into internet-native finance (the first 16% being its innovators and early adopters). The corporate site states that thesis and establishes the team's credibility. Success: a partner leaves able to repeat the thesis in one sentence, recall the backers, and find a way to reach the company.

## Positioning

"Adoption comes first": 1SIX designs from observed behavior (how people actually trade, watch, and engage) rather than ideology, to move internet-native protocols from experiment to default infrastructure. The company publishes its own measurements (Research) instead of adjectives.

## Operating Context

- The site supports fundraising conversations; it is not a sales funnel. Investors usually arrive through warm intros and decks, then use the site to check the story and the people.
- Products stay off the site for now (confirmed 2026-11-04): no product names, screenshots, or links on any page. Copy about products must read honestly without naming one.

## Capabilities and Constraints

- Static marketing site on Next.js 16 / Vercel; copy lives in components; no CMS. Research articles sync at build time from the public `1sixtech/noctis-articles` repo.
- The thesis scroll, intro sequence, and hero scramble logic carry a long bug history (THESIS_SCROLL_HISTORY.md, docs/PHASE5_GRID_PLAN.md): treat `ThesisSection.tsx`, `ThesisSectionMobile.tsx`, `thesisData.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx`, and `hashScroll.ts` as frozen.
- Contact: investors and candidates reach 1SIX at contact@1six.tech (confirmed 2026-11-04).
- The homepage stays thesis-only (confirmed 2026-11-04): no proof block of research or backers on Home; copy is tightened and the world map is tied to "the next 84%".
- The intro cadence (full logo intro once per tab session) and the Home header's reveal-on-first-scroll stay as they are (confirmed 2026-11-04).

## Brand Commitments

- Name: 1SIX (wordmark and titles), written "1six" in lowercase body copy; lowercase manifesto voice.
- The team is presented collectively, without individual names (confirmed 2026-11-04).
- Accent #FF3700 on warm off-white and charcoal grounds; Pretendard Variable; light and dark themes.
- ASCII-mosaic WebGL imagery (desert, graph, "16" symbol, world map) is the visual signature.

## Evidence on Hand

- Backers: Naval Ravikant, Charlie Songhurst, Ken Ng (Uniswap Foundation co-founder), Loi Luu (WBTC creator), Lemniscap, Lambda, "and more".
- Team pedigree: MIT, Harvard, Tsinghua, Schwarzman Scholars, Ethereum Foundation, Starknet Foundation, ICPC World Finalists, Codeforces Grandmasters, Needham & Co., PhD programs, special forces.
- Research: "How Hyperliquid data feed latency is measured" (Dean N., 30 Oct 2026) at /research.
- Absent, never fabricate: individual names or bios, traction metrics, user counts, revenue, customer logos, testimonials, press, round size or terms, office locations.

## Product Principles

1. Prove, don't hype: measurements and named backers over adjectives.
2. Adoption comes first: every surface should make the path from the first 16% to the next 84% legible.
3. Builders, not dreamers: show the craft in the details, because the details are the evidence.

## Accessibility & Inclusion

- WCAG 2.2 AA for text contrast and keyboard access; motion must have a reduced-motion equivalent that still shows all content.
