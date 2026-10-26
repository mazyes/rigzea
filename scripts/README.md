# scripts

## Overview

Node build and maintenance scripts (ES modules, `.mjs`, no dependencies). Two of them are Vercel's build
step; the third pulls the live database schema back into the repo.

## Interface

- `stamp-assets.mjs`: `node scripts/stamp-assets.mjs`. Hashes every `/app/*` and `/js/*` script and stylesheet
  referenced in `rigzea/app/index.html` and rewrites them as `?v=<8 hex sha256>`; injects
  `window.__RIGZEA_ASSET_VERSIONS` (hashes of the lazily loaded `views-*.js` route chunks) before `</head>`;
  writes `rigzea/app/<area>/index.html` for each area in `AREAS` (`tasks`, `apartments`, `owners`, `deals`,
  `finance`, `team`, `settings`, `chat`) with a Georgian `<title>` and a "generated" comment.
- `generate-sitemap.mjs`: `node scripts/generate-sitemap.mjs`. Writes `rigzea/sitemap.xml` from a fixed
  route list (`/`, `/features/`, `/pricing/`, `/faq/`, `/legal/*`), skipping pages with `noindex`.
- `dump-schema.mjs`: `SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dump-schema.mjs` (PowerShell:
  `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."; node scripts/dump-schema.mjs`). Optional
  `SUPABASE_PROJECT_REF` (default `cuioodytwyzykqlrjfej`). Writes `supabase/schema.sql` and
  `supabase/migrations.md`.

## Invariants

- Vercel's `buildCommand` (`vercel.json`) is `node scripts/stamp-assets.mjs && node scripts/generate-sitemap.mjs`;
  both must stay safe to run repeatedly.
- `stamp-assets.mjs` reads and rewrites `rigzea/app/index.html` in place, so it strips an existing
  `?v=` and a previous `__RIGZEA_ASSET_VERSIONS` tag before adding new ones. Files are written only when
  their content changed. Edit only `app/index.html`; the area pages are overwritten.
- The route chunk list in `stamp-assets.mjs` must match the `views-*.js` files `app.js` loads on demand;
  adding a new area means updating `AREAS` (and the routing in `app.js`).
- `app/index.html` must have a `<title>`, or `stamp-assets.mjs` throws.
- `generate-sitemap.mjs` throws if a listed page's canonical is not `https://rigzea.com<route>` or if two
  routes share a canonical. New public pages must be added to `routes` by hand.
- `dump-schema.mjs` sends only read-only catalog queries; a failing section is written as a `FAILED`
  comment instead of aborting. `schema.sql` is a snapshot for an empty database, not a migration; changes
  still go through `supabase/patches/NN_*.sql`.
- The access token is read from the environment only and is never written to disk.

## Side Effects

- `stamp-assets.mjs`: writes `rigzea/app/index.html` and `rigzea/app/<area>/index.html`.
- `generate-sitemap.mjs`: writes `rigzea/sitemap.xml`.
- `dump-schema.mjs`: network calls to `https://api.supabase.com/v1/projects/<ref>` (`/database/query`,
  `/database/migrations`); overwrites `supabase/schema.sql` and `supabase/migrations.md`. Exits 1 without a token.

## Verification

- Run: `npm test` (the e2e suite in `tests/e2e.js` loads the generated area pages such as `/app/owners/`).
- Build check: `node scripts/stamp-assets.mjs && node scripts/generate-sitemap.mjs`, then `git diff` should
  show no change on a clean tree.
