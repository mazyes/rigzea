# Landing page and shared controls audit

Date: 21 October 2026. Preview: http://localhost:3000/.

Scope: home page, shared search/cookie/contact controls, marketing navigation, and password controls. Used Impeccable audit/distill guidance and `voicetone.md`. This is not an audit of the signed-in CRM or production services.

## Implementation integrity: pass

The added controls now use the existing `lx-btn`, `lx-theme-toggle`, and auth `btn` components. The four marketing pages have identical navigation, verified by a browser test. The home page introduces the product through a large product image, an editorial section, three open step rows, and one closing signup prompt. Detailed demos, pricing, comparison, and FAQ content remain on their dedicated pages.

## Health score

| Dimension | Score | Evidence |
| --- | --- | --- |
| Accessibility | 3/4 | Measured body/control text contrast, keyboard search/skip access, labels, visible focus, reduced-motion behavior, image alternatives. Screen-reader testing remains outstanding. |
| Performance | 3/4 | Removed duplicated page content, an unused modal, and duplicate scroll-progress work. Existing large shared style/interaction files remain. |
| Theming | 3/4 | Existing component styles replace the separate button design. Both themes pass measured contrast; older shared styles still contain literal colors. |
| Responsive layout | 4/4 | Chromium checks at 320, 390, 768, and 1440 pixels; no horizontal overflow, header targets at least 44 by 44 pixels, compact step rows. |
| Implementation integrity | 4/4 | Navigation equality and absence of duplicated detail sections are covered by tests. Georgian reviewed against the voice guide. |
| **Total** | **17/20** | **Good** |

## Verified corrections

- Replaced technical/formal Georgian in new controls with shorter wording in the site's informal voice. Search now asks `რას ეძებ?`, with `მოძებნე`; contact uses `მოგვწერე`.
- Replaced separate button geometry and color rules with the existing components. Search uses the same round header control as theme/language.
- Removed extra navigation entries from separate pages and dead comparison links. The same four destinations now appear everywhere.
- Removed duplicate scroll-progress rendering and its extra scroll listener.
- Corrected the light-theme focus ring. Search-input focus contrast is 13.17:1 in dark mode and 5.24:1 in light mode.
- Measured representative page/control text after color transitions settle: minimum 5.09:1 in dark mode and 5.48:1 in light mode.
- Made step content visible without waiting for a reveal animation, including when reduced-motion preferences change. Corrected mobile step wrapping.
- Prevented the skip link from becoming permanently visible when reduced-motion styles disable button transforms.
- Increased the tablet menu button from 42 by 42 to at least 44 by 44 pixels.

## Remaining findings

### [P2] Shared assets include detail-page code

Location: `rigzea/landing-luxury.css` and `rigzea/landing-luxury.js`. The home page still loads styles and interactions used by the dedicated pages. The stylesheet is approximately 123 KB and interactions approximately 32 KB before transfer compression. This is not a functional failure, but a future `$impeccable optimize` pass could split home-only assets after measuring transfer and execution cost. Do not delete shared rules without checking the other pages.

No verified P0 or P1 issue remains within the audited scope. The Impeccable detector also reported contrast/padding/glow candidates in the older shared stylesheet. Cross-theme color pairings were checked against actual rendered colors rather than treated as automatic failures; open step rows are intentionally not padded cards. The existing emerald brand treatment was preserved.

## Validation and limits

- `node tests/landing-theme.test.js`: themes, representative text/focus contrast, navigation equality, layout widths, touch-target dimensions, landmarks/links, reduced motion, single progress bar.
- `node tests/site-tools.test.js`: consent, attribution, search/error/retry, password controls, keyboard access, storage failure, mobile and print.
- `node tests/audit-suite.js`: 6/6 checks, with detailed demos and pricing tested on their dedicated pages.
- `node tests/multi-page.test.js`: 6/6 checks including sign-in and registration/reset pages.
- JavaScript syntax checks passed.

Evidence uses Chromium and emulated viewport sizes, not a physical phone or screen reader. No production deployment, production database change, or full CRM test run was performed. The previously identified team-page regression also reproduces with the original app code.

Recommended follow-up, if desired: `$impeccable optimize` for measured asset splitting, followed by `$impeccable polish` for the final picture placement. The existing image area is retained; no new picture was supplied or generated.
