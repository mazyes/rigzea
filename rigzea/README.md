# rigzea: deployed static site

## Overview

This folder is the whole public website and the browser apps, deployed as-is by Vercel (`outputDirectory`)
to https://rigzea.com. Everything in it is public. It is plain HTML, CSS and JS with no bundler; the only
build step is `node scripts/stamp-assets.mjs`, which stamps hashed `?v=` asset URLs into `app/index.html` and
writes the per-area CRM pages from it. Server code lives outside this folder in `api/` (Vercel functions).

## Interface

Root files with code:

- `index.html` with `landing-luxury.js`, `landing-luxury.css`, `landing-motion.js`, `landing-app.css`, `story.js`, `story.css`: the Georgian landing page. `landing-luxury.js` drives the header, mobile drawer, pricing card light, feature demos, billing toggle and anchors and sets `window.showLuxuryToast`; `landing-motion.js` plays one-time entrance animations (only when motion is allowed) and sets `window.lxRollPrice`; `story.js` runs the accessible tabs of the story section (`[data-story-root]`). The landing also loads `/legal/operator.js` and `/js/site-tools.js`.
- `service-worker.js`: caches the CRM shell (`/app/` serves every area, refreshed in the background) and hashed `/app/*` and `/js/*` assets (cache first). Cache name `rigzea-app-v3`; old `rigzea-*` caches are deleted on activate. Never touches Supabase, `/api/` or public pages (`/p/`, `/guide/`, `/approve/`). Posts an update message to open tabs instead of reloading; accepts `skip-waiting`. Registered by the app pages.
- `demo.js`: demo adapter loaded by `demo/index.html` after `/js/core.js` and before `/app/app.js`. Points public links at the demo copies, keeps uploads in the browser, shows demo notices, the ribbon and a "what to try" guide, and patches `window.fetch` so `/api/import-listing` returns a sample listing.
- `site.js`: older mobile menu toggle (`#mobile-toggle`, `#mobile-nav`). No HTML page in this folder references it at present.

Subdirectories with contracts:

- [app](./app/README.md): the signed-in CRM (shell `app.js`, area chunks `views-*.js`, `app.css`); area pages are generated from `app/index.html`.
- [js](./js/README.md): shared browser scripts (`window.R` from `core.js`, Supabase config, plans, i18n, public-site tools).
- [demo](./demo/README.md): offline demo running the real app on an in-browser mock database.
- [legal](./legal/README.md): legal pages and the `operator.js` operator details.
- [staff](./staff/README.md): field staff "My jobs" app using `staff_*` RPCs.

HTML-only pages (no code files; inline scripts only):

- `p/`: public listing page `/p/<slug>/`; `p/s/`: multi-listing selection page.
- `guide/`: guest guide. `approve/`: owner approval page (`?token=`).
- `signin/`, `signup/`, `reset-password/`, `onboarding/`: auth and first-run pages.
- `features/`, `pricing/`, `faq/`, `404.html`: marketing and error pages.

Assets and third party:

- `vendor/`: third-party minified libraries (`qrcode.min.js`, `xlsx.full.min.js`). Do not edit.
- `fonts/` (FiraGO), `img/`, `downloads/` (`rigzea-extension.zip`), logos, favicons, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `og-preview.jpg`, `style.css`.

## Invariants

- Everything here is served publicly. Never put secrets in this folder; the Supabase anon key in `js/config.js` is public by design and RLS enforces access.
- Edit only `app/index.html`, never the generated `app/<area>/index.html` pages, and re-run `node scripts/stamp-assets.mjs` after changing hashed assets.
- All UI copy is Georgian (English comes from `js/i18n.js`). Never use the em dash character in any site copy.
- Escape everything put into `innerHTML` with `R.esc()`; stored URLs in `href` go through `R.safeUrl()`.
- Bump `CACHE` in `service-worker.js` when its caching rules change, so old caches are dropped.

## Side Effects

- Browser apps talk to Supabase project `cuioodytwyzykqlrjfej` (Auth, PostgREST, Realtime, Storage buckets `rigzea-public` and `rigzea-private`) and to the Vercel functions under `/api/`.
- Service worker Cache Storage (`rigzea-app-v3`), `localStorage`, `sessionStorage` and IndexedDB in visitors' browsers.
- The demo loads sample photos from `images.unsplash.com`; the landing uses local images in `img/`.

## Verification

- Run: `npm test` (from the repo root: unit tests, all e2e tests against a mocked Supabase, and the landing audit; about 10 minutes).
