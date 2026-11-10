---
target: "About page on mobile: section headers vs content; one red"
total_score: 23
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
target_identity: "file:/Users/giwook/project/1sixtech/1six-website/.claude/worktrees/writing-article-addition-88a185/src/components/about/AboutCrossing.tsx"
target_fingerprint: "sha256:80d02656bb450866f239380a130ccdfd74ea39b82cacecfd46bb119624afba94"
target_path: /Users/giwook/project/1sixtech/1six-website/.claude/worktrees/writing-article-addition-88a185/src/components/about/AboutCrossing.tsx
timestamp: 2026-11-10T02-43-35Z
slug: src-components-about-aboutcrossing-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence). Target: About `/` on phones (<768px), Persuade mode, 390x844 light/dark.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Meter shows section and progress; the % has no legend |
| 2 | Match System / Real World | 3 | Plain language; "37%" is an unexplained metaphor |
| 3 | User Control and Freedom | 3 | Mandatory snap; no section jump on mobile |
| 4 | Consistency and Standards | 2 | The heading plays a different role per section (caption, title, peer) and moves 124px between screens |
| 5 | Error Prevention | 3 | 44px targets; product links go to an unverified domain |
| 6 | Recognition Rather Than Recall | 3 | Each screen labelled twice, but the heading does not read as one |
| 7 | Flexibility and Efficiency | n/a | One-pass persuasive narrative |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained; the top third of each screen is empty |
| 9 | Error Recovery | 3 | Email visible as text if mailto fails |
| 10 | Help and Documentation | n/a | No task needs documentation |
| **Total** | | **23/32** | **Good (72%)** |

## Design Specificity Verdict

The frame is authored (ASCII 16, 16->100 meter, lowercase voice, one red); the inside of each section is category-interchangeable (rule, heading, list, centred). Detector: CLI `[]` for src/components/about; in-page detector clean at 390x844, two false positives at 1440x900 (sticky column overflow, the overlay's own glow). Script injection was blocked by the page CSP; detect.js ran through the debugging protocol instead, so no user-visible overlay.

## Priority Issues

- [P1] Heading and content near-equal type: heading 28/500 vs backer names and closing line 24/400 (1.17x, same ink); product name 42 inverts it. Fix: heading 34px/1.1 on phones; product name in the logo red. (/impeccable typeset)
- [P1] Spacing roles collapse: rule->heading 21 = heading->content 20 < row pitch 33, so the heading groups with the first entry. Fix: rule gap 12px, head gap 36px; statement keeps 20px. (/impeccable layout)
- [P2] Heading position floats (rule at 214-338px down the band). Fix: top-align non-statement bands at header + clamp(32px, 12svh, 112px). (/impeccable layout)
- [P2] Red text below AA on light after the owner's one-red decision: 16% figure 17px at 3.2:1; phone menu current item colour-only. Accepted by the owner; menu gains an underline. (/impeccable audit)
- [P3] Hairlines 1.14:1 on light. Fix: text at 16% on phones (~1.46:1). (/impeccable polish)

## Persona Red Flags

- Jordan: "16%" metaphor unexplained on mobile; "backed by" reads as a list entry.
- Casey: faint hairlines and red 16% wash out outdoors; no visible "next" after screen 1.
- VC partner on a phone: Backers is three flicks away with no jump; "backers 79%" can read as a fundraising metric.

## Minor Observations

- Meter labels and headings use different words (backers / "backed by").
- Product name and "Visit website" are two tab stops to one URL.

## Questions to Consider

- Should phones keep only the red bar and drop the % beside the section name?
- Should Backers, the strongest proof for this audience, come before a single product that is not live?
