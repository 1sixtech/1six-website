# About mobile composition

Current direction, v0.3.3.0 (2026-11-09). Review scope is About on phones.
The existing Pretendard, orange/monochrome palette, lowercase voice, ASCII 16,
native scroll, factual copy, and desktop paired-column composition remain.

## Diagnosis

The font-size feedback described a composition problem. At 390 × 714, the incumbent
headline began at y362 after a 226px mark and 84px of header/meter. Products began
at y803. Body copy was already 17px with 26.35px leading; ordinary sections had 96px
of trailing space. Increasing all gaps or shrinking all type would not fix this.

The product also formed seven visual stops, with a 36px name only slightly larger
than the 32px section heading. The progress strip often showed only a percentage,
and the footer rewrapped between nearby phone widths.

## Implemented roles and rhythm

| Element | Before | Current mobile |
|---|---|---|
| Header and progress | 84px, two rows | 54px, one row with a stable section label |
| Mark | 58vw, up to260px | 48vw, bounded184–208px |
| H1 at 390px | 44.07px, y362 | 42.12px, y277 |
| First product cue | Hidden on mobile | 44px touch target, y614–658 |
| Section heading | 32px | 28px/1.14, medium weight |
| Product name | 36px | 42px, grouped with domain/description/action |
| Lead and credentials | 20px | 19px; comfortable leading and tracking |
| Backer/firm names | 20px | 24px with 15px supporting roles |
| Body | 17px/1.55 | Preserved |
| Intro trailing interval | 96px | 64px |
| Ordinary section interval | 96px | Preserved |
| Footer on About | Wrapping, right-aligned | Stable left-aligned two-column grid; 44px links |

The first-screen cue is visible at 375/390/402/430 × 714. A 320px narrow check has no
horizontal overflow; shorter screens scroll naturally, without a fixed hero
height or smaller body text. The dark mark is slightly brighter on mobile;
completion still applies the orange treatment. The large email remains the final
primary action and fits the inspected widths.

The mobile product kicker is hidden because the description already states its
category. The website underline belongs to its label, not the whole flex row.
The initial in-page link remains a normal anchor without JavaScript; keyboard
activation and reduced motion move immediately, while pointer activation can glide.

## Scope and implementation

Phone refinements are scoped below 768px in about.css. Footer rules additionally
require body:has(.crossing), so Writing and Thesis retain their existing footer.
The progress layer is noninteractive and sits in the header row without covering
its controls. Its measured geometry drives section labels and anchor offsets.
No new product image, logo, business claim, or decorative animation was invented.
Partnerships remain hidden pending explicit confirmation.

## Review and verification

Independent design assessment and deterministic/browser evidence ran in isolation;
Claude Opus 5.5 Max supplied a separate visual review. The common diagnosis was
role hierarchy and first-screen allocation, not a blanket shortage of whitespace.
After implementation, independent confirmation found no material design defect.
The applicable Nielsen heuristic score moved from 18/24 to 20/24; this is a design
judgment, not a usability-study metric. Automated detector findings: 0.

Checks cover light/dark,375–430px and 320px width, actual 714px Safari content-height
composition, desktop reference, real menu/theme/anchor behavior, and scoped footer
styles. Native iOS confirms header translucency; headless screenshots can render
that effect differently. The detector overlay was blocked by the production CSP;
no policy was weakened. Evidence and full reports are archived in .gstack and
.impeccable/critique for this workspace.
