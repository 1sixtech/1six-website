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

"Adoption comes first": 1SIX designs from observed behavior (how people actually trade, watch, and engage) rather than ideology, to move internet-native protocols from experiment to everyday, everywhere. Writing brings together the company's research, op-eds, and announcements; only published articles appear.

## Operating Context

- The site supports fundraising conversations; it is not a sales funnel. Investors usually arrive through warm intros and decks, then use the site to check the story and the people.
- The November 2026 website brief authorizes a product introduction for predict.everywhere.trade: "An esports-focused prediction market", the provided https://predict.everywhere.trade link, and "More Coming Soon". Its desktop label reads "01 / prediction market" (owner, 2026-11-10; formerly "01 / esports"). The final logo has not been supplied, so the name appears as text. The provided domain did not resolve during release verification; do not claim the product is live or substitute an unconfirmed URL.
- "powered by Lighter" is withheld at the owner's request. The entire Partnerships section is also withheld pending confirmation (2026-11-09).

## Capabilities and Constraints

- Static marketing site on Next.js 16 / Vercel; copy lives in components; no CMS. Writing syncs at build time from the public `1sixtech/1six-researchs` repo through `scripts/sync-writing.mjs`, and a push to that repo's `main` that changes an article deploys the site. `WRITING_GIT_REF` optionally selects a reviewed commit or tag (default `main`); a fixed commit or tag stops new articles from appearing.
- The thesis scroll, intro sequence, and hero scramble logic carry a long bug history ([scroll history](THESIS_SCROLL_HISTORY.md), [grid plan](docs/PHASE5_GRID_PLAN.md)). The November 2026 feedback authorized the route move, fifth-slide wording, lint fixes, and intro lifecycle fixes. Keep changes to `ThesisSection.tsx`, `ThesisSectionMobile.tsx`, `thesisData.tsx`, `IntroOrchestrator.tsx`, `HeroSection.tsx`, and `hashScroll.ts` focused and verify desktop/mobile capture, direct/client entry, repeat visits, and route-leave cleanup.
- Contact: investors and candidates reach 1SIX at contact@1six.tech (confirmed 2026-11-04).
- About is the homepage at `/`: "we don't dream. we build.", products, origins, backers, and "work with us", in that order. Each section has its own screen on phones and desktop (owner request, 2026-11-09). The ASCII "16" fills continuously from 16% to 100%, with a desktop percentage and compact mobile header progress; reduced motion shows the complete state and scrolls freely.
- The first visual entry on About or Thesis uses the company-logo loader while the current screen prepares; Writing and other text-only entries open immediately. A completed same-tab visit or an already-warmed destination skips the logo. About also prepares Thesis assets in the background, without waiting for them before opening; phones do not pre-download video. The website keeps download hints separate from actual first-frame readiness. See [page entry](docs/PAGE_ENTRY.md).
- The existing thesis experience lives at `/thesis`. Its text entrance has a separate lock from the logo and is omitted as a lock on direct section links; slide capture remains unchanged. Routes must never inherit another page's scroll lock or reveal mask.
- About mobile prioritizes the first-screen message and product cue, keeps 17px body text, distinguishes products and backers from section labels, and preserves desktop composition. See [mobile design](docs/ABOUT_MOBILE_DESIGN.md).
- Navigation is About (`/`), Thesis (`/thesis`), Writing (`/writing`). The old `/about`, `/research`, and `/team` routes are removed. The footer repeats the page links, contact@1six.tech, https://x.com/1sixtech, and the 2026–2027 copyright.
- Writing has Research, Op-ed, and Announcements filters, shareable category URLs, independent author links, and useful empty states. Articles appear newest first. Missing category metadata defaults to Research; an unrecognized explicit category fails the build.

## Brand Commitments

- Name: 1SIX in the wordmark and social-card titles, written "1six" in lowercase body copy; lowercase manifesto voice. Every page's browser tab title is "1six" (owner, 2026-11-10).
- Favicon: the 16 mark in black on a slightly rounded #FF3700 square (owner, 2026-11-10). `public/favicon.svg` is the source; `scripts/make-icons.mjs` renders the PNGs, and the iOS home-screen icon is the same square full-bleed. Icon URLs carry a version so browsers and search engines fetch a changed icon.
- The home team story is collective. Writing names confirmed authors and links to their profiles; Dean N.'s profile is authorized by the November 2026 brief and the owner's credential correction; Henry P.'s profile by the owner (2026-11-09).
- Accent #FF3700, the logo's red, on warm off-white and charcoal grounds; Pretendard Variable; light and dark themes. It is the site's only red, at every text size and in both themes (owner, 2026-11-10); the darker small-text red is retired.
- ASCII-mosaic WebGL imagery (desert, graph, "16" symbol, world map) is the visual signature.

## Evidence on Hand

- Backers: Naval Ravikant, Charlie Songhurst, Ken Ng (Uniswap Foundation co-founder), Loi Luu (WBTC creator), Lemniscap, Lambda, "and more".
- Team origins: Harvard College and Schwarzman Scholars; IOI Medalists, ICPC World Finalists, and Codeforces Grandmasters. The older institution, protocol, finance, and special-forces claims are no longer part of the site.
- Pending partnerships: USA Esports Association, KeSPA, AESF, IESF, and Lighter. The owner says these are not yet confirmed (2026-11-09); the section and its links are hidden. Do not publish names, logos, or relationship claims until explicitly reconfirmed.
- Research: "How Hyperliquid data feed latency is measured" (Dean N., 30 Oct 2026) at `/writing/001-hyperliquid-data-feed-latency`. The former "we measure" home section is removed; the article remains published.
- Research: "Arbitrage in reality, part 1: one coin, twelve venues" (Henry P., 8 Nov 2026) at `/writing/002-arbitrage-in-reality-cross-venue`.
- Dean N.: First Prize, ICPC Asia Regional, 2021 and 2022, at `/writing/authors/dean-n`. His short bio describes his published work on financial infrastructure. Do not attribute the team's collective ICPC World Finalist credential to Dean.
- Henry P.: two-time ICPC World Finalist (owner, 2026-11-09), at `/writing/authors/henry-p`. No years and no bio sentence were supplied; do not add either without confirmation.
- Absent, never fabricate: additional names or bios, final product or partner logos, traction metrics, user counts, revenue, customer logos, testimonials, press, round size or terms, office locations.

## Product Principles

1. Prove, don't hype: measurements and named backers over adjectives.
2. Adoption comes first: every surface should make the path from the first 16% to the next 84% legible.
3. Builders, not dreamers: show the craft in the details, because the details are the evidence.

## Accessibility & Inclusion

- WCAG 2.2 AA for text contrast and keyboard access; motion must have a reduced-motion equivalent that still shows all content.
- Accepted exception (owner, 2026-11-10): every tab title is "1six", knowing it falls short of WCAG 2.4.2 (Page Titled). Screen readers name no page on load or on navigation (Next announces a route change only when the title changes), and search results, bookmarks and history do not tell pages apart by title. A route announcer and per-page titles ("thesis · 1six") were offered and declined.
- Accepted exception (owner, 2026-11-10): because the site uses one red, red text below 24px (19px bold) is 3.2:1 on the light ground and 3.8:1 on the dark card, under AA's 4.5:1 for small text; on the dark ground it passes at 4.7:1. Small red text at rest is limited to the Writing category label, the current page in the phone menu, the desktop 16% count beside the mark, the "16%" figure in About's opening paragraph, the red key words in the mobile Thesis slides' 18px text, and the outlined buttons on the 404 ("back to home") and error ("try again") pages; elsewhere red marks hover and press states. Do not add more small red text at rest.
