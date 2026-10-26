# demo: offline public demo

## Overview

A public, sign-in-free demo of the CRM at `/demo/`. It runs the real app code (`/app/app.js` and every
`/app/views-*.js` chunk, loaded eagerly) on an in-browser stand-in for supabase-js, with a realistic
sample portfolio for a Tbilisi agency. Nothing is sent to a server. `/rigzea/demo.js` (one level up) adapts
what needs a backend or a real link. The `view/` subfolder is HTML only: it loads a real public page
(`/p/`, `/p/s/`, `/approve/`, `/guide/`) and swaps its Supabase script for the demo mock.

## Interface

- `index.html`: loads, in order, `img-fallback.js`, `seed.js`, `mock.js`, `/js/config.js`, `/js/core.js`, `/js/i18n.js`, `/js/plans.js`, `/demo.js`, `/app/app.js`, then all view chunks.
- `mock.js`: sets `window.supabase = { createClient }` returning a mock client backed by `localStorage`, and `window.RigzeaDemoDB` with `reset()`. Derived from `tests/mock-supabase.js`. Emits `rigzea-demo` window events for notices.
- `seed.js`: `window.__RIGZEA_DEMO_SEED()` returns the sample database with dates relative to the moment of seeding.
- `img-fallback.js`: replaces sample listing photos that fail to load (offline or blocked CDN) with a drawn SVG interior.
- `demo.css`: demo ribbon and guide styles.
- `view/index.html`: demo wrapper for public pages (no direct code files).

## Invariants

- `mock.js` must be loaded before `/js/config.js`, because `config.js` calls `supabase.createClient`.
- The real app files run unchanged; demo behaviour belongs in `mock.js` and `/demo.js`, not in `/app/`.
- The stored demo database is reseeded when its `VERSION` changes or it is older than 12 hours, so relative dates stay fresh. Bump `VERSION` when the seed shape changes.
- Public pages opened through `view/` set `window.__RIGZEA_DEMO_PUBLIC = true` before the mock loads.

## Side Effects

- `localStorage` keys `rigzea_demo_db` and `rigzea_demo_session` (this browser only).
- Loads sample photos from `images.unsplash.com`.
- `/demo.js` patches `window.fetch` so `/api/import-listing` returns a sample listing.

## Verification

- Run: `npm test` (from the repo root).
