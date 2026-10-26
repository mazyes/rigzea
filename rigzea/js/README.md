# js: shared browser scripts

## Overview

Plain browser scripts (no modules, no build step) shared by the CRM (`/app/`), the staff app (`/staff/`),
the public pages (`/p/`, `/p/s/`, `/guide/`, `/approve/`), the demo and the landing site. Each file sets one
or more `window.*` globals. Load order matters: `supabase.js`, then `config.js`, then `core.js`, then the
page's own scripts.

## Interface

- `config.js`
  - `window.RIGZEA_CONFIG` `{ SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL }`. The anon key is public by design; access is enforced by RLS.
  - `window.supabaseClient`: the Supabase client (persisted session, auto refresh, session detected in the URL).
  - `window.RIGZEA_RECOVERY`: `true` when the page was opened from a password-reset link (captured before the auth client strips it, and set again on the `PASSWORD_RECOVERY` auth event).
- `core.js` exposes `window.R` (requires `window.supabaseClient`):
  - Escaping: `esc(v)` for anything put into `innerHTML`; `safeUrl(v)` escapes a stored URL and turns anything that is not `http(s)` into `#`.
  - Formatting: `money(amount, currency)` (GEL, USD, EUR symbols), `date`, `dateTime`, `dayLabel`, `time`, `relative`, `elapsed`, `span`, `toDate` (parses `YYYY-MM-DD` as a local date), `isoDate`, `monthKey`, `sameDay`, `MONTHS`, `WEEKDAYS`.
  - Domain helpers: `isDaily(apartment)`, `listingUrl(apartment, whiteLabel)` (`/p/<slug>/`), `phoneKey`, `CADASTRAL_RE`, `cadastralFormat`, `uuid`.
  - Labels and badges: `L` (Georgian labels), `badge`, `taskBadge`, `approvalStatus`, `approvalBadge`, `expenseBadge`, `dealBadge`, `transactionBadge`, `contactBadge`, `icon(name, size)`.
  - Errors and data: `q(promise)` throws on a Supabase `{ error }`; `friendlyError(err)` maps errors to Georgian messages.
  - UI: `toast`, `run(btn, fn, opts)`, `dialog`, `confirm`, `ask`, `copyText`, `applyTheme`, `applyPrefs`, `calm`, `bindGeorgianName`, `$`, `$$`, `sb` (the client), `whatsappUrl`, `telegramUrl`.
  - Files: `uploadFile(orgId, folder, file)`, `prepareImage(file, kind)`, `uploadImage(orgId, folder, prepared)`, `IMAGE_KINDS`.
- `plans.js`: UMD module. In the browser it sets `window.RIGZEA_PLANS`; in Node it is imported by `api/plan-email.js`. Exports `{ ALL_FEATURES, PLANS, PLAN_ORDER, FEATURE_LABEL }` (plan ids `trial`, `starter`, `pro`, `top`, `agency`, with price, apartment and seat limits and features).
- `i18n.js`: Georgian to English switch. Sets `window.RLang = { lang }`; buttons with `[data-lang-toggle]` flip the stored language and reload. In English mode it swaps known Georgian text nodes and attributes (including content rendered later) using its built-in dictionary.
- `site-tools.js` and `site-tools.css`: public-site helpers used by the landing pages, `/reset-password/` and the app pages: password show/hide toggles, a back-to-top button, the campaign-consent banner (`window.RigzeaCampaign()`), and a site search dialog over `/`, `/features/`, `/pricing/`, `/faq/`.
- `supabase.js`: vendored `@supabase/supabase-js` 2.117.2 UMD bundle (third party; do not edit).

## Invariants

- Everything put into `innerHTML` goes through `R.esc()`; stored URLs in `href`/`src` go through `R.safeUrl()`.
- Money is shown with `R.money(amount, currency)`.
- `uploadFile` rejects files over 10 MB. Folders starting with `receipts`, `tasks` or `approvals` go to the private bucket `rigzea-private` and return a 1-year signed link; there is no fallback to the public bucket. Everything else goes to `rigzea-public` and returns a public URL.
- Expired or nearly expired private signed links are re-signed (1 hour) on click, and a failed private image is re-signed once on load error. Keep using `R.uploadFile` so this keeps working.
- `plans.js` is the single source of truth for plan limits and features; changes must also be made in the database (`plan_limit()`, `plan_has_feature()`) and in the pricing table in `rigzea/index.html`. `tests/plans-sync.test.js` checks this.
- Georgian is the source language in every template; strings missing from the `i18n.js` dictionary stay Georgian.
- All browser storage access is wrapped in `try/catch`; features keep working when storage is blocked.

## Side Effects

- Network: Supabase Auth, PostgREST and Storage (`rigzea-public`, `rigzea-private`) through `window.supabaseClient`; `site-tools.js` fetches the four public pages for search.
- `localStorage` keys: `rigzea_theme`, `rigzea_nav`, `rigzea_motion`, `rigzea_density`, `rigzea_lang`, `rigzea_campaign_consent`, plus the Supabase auth session.
- Global document listeners in `core.js` (click on private links, capture-phase image `error`).
- `i18n.js` reloads the page when the language changes.

## Verification

- Run: `npm test` (from the repo root; includes `tests/plans-sync.test.js`, `tests/i18n.test.js`, `tests/site-tools.test.js` and the e2e suite).
