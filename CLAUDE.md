# Rigzea

Real-estate CRM for agents in Georgia (rentals + sales). Plain HTML/CSS/JS, no build step.
Live at https://rigzea.com (Vercel project `rigzea-website`); database is Supabase `cuioodytwyzykqlrjfej`.

## Layout

- `rigzea/` is the deployed static site (Vercel `outputDirectory`). Everything in it is public.
  - `app/` the CRM: `app.js` (shell, routing, data load), `views-*.js` (one file per area), `app.css`
    Each area is its own page (`/app/owners/`, items as `?id=`). Edit only `app/index.html`: the area pages
    are generated from it, with hashed `?v=` asset URLs, by `node scripts/stamp-assets.mjs` (also Vercel's build).
  - `js/core.js` shared helpers exposed as `window.R` (`esc`, `safeUrl`, `money`, `dialog`, `toast`, labels `L`)
  - `p/` public listing page, `p/s/` multi-listing selection, `guide/` guest guide, `approve/` owner approval, `staff/` cleaner app
  - `index.html`, `site.js`, `landing-luxury.*` landing page; `demo/` offline demo with mock data
- `api/` Vercel functions, ES modules (`api/package.json` sets `"type": "module"` for this folder only, so
  CommonJS tests and `.claude` hook scripts keep working). Files starting with `_` are helpers, not routes.
  Supabase config for every function comes from `publicConfig()` in `api/_lib.js`.
- `supabase/patches/NN_*.sql` database changes. **Which ones are live: `supabase/APPLIED.md`.**
  `supabase/schema.sql` is a generated snapshot of the live database and `supabase/migrations.md`
  is the live migration list; refresh both with `node scripts/dump-schema.mjs` (needs `SUPABASE_ACCESS_TOKEN`).
- `tests/` Playwright tests against a mocked Supabase (`mock-supabase.js` + `seed.js`).

## Commands (work in PowerShell and Git Bash)

```
npm run dev            # static server on http://localhost:3000 (no /api)
npm run dev:full       # vercel dev: static site + /api + /p/<slug>/ rewrites
npm test               # unit + all e2e + landing audit (about 10 minutes)
node tests/e2e.js 7 D1 # only the e2e tests whose number starts the name ("7.", "D1.")
npm run deploy         # production deploy (Vercel CLI, logged in as the owner)
```

Failed e2e tests save a screenshot to the OS temp dir (`rigzea-fail-<n>.png`).

## Rules

- All UI copy is Georgian. Never use the em dash character in any site copy; use a colon, comma or period.
- Escape everything put into `innerHTML` with `esc()`. Stored URLs in `href` go through `R.safeUrl()`.
- Forms keep rarely used fields in `<details class="form-more">`; tests must open it (`openMore()` in `tests/e2e.js`).
- New contacts and deals default to lead source `direct`; money is shown with `R.money(amount, currency)`.
- Private files (receipts, task/approval photos) are saved as 1-year signed links; `core.js` re-signs an
  expired one on click (links) or on load error (images) for signed-in members. Keep using `R.uploadFile`.
- Tests mock the database, so they cannot catch RLS, grant or SQL mistakes. Check those against the live
  database with a rolled-back transaction (see `supabase/APPLIED.md`).

## Database changes

1. Write a new `supabase/patches/NN_name.sql` (re-runnable; new tables need GRANTs and RLS). Agents must ask
   the user before running SQL on production; it is no longer auto-approved.
2. Dry run on live inside `do $$ ... raise exception 'DRYRUN %', result; $$` so it always rolls back.
3. Apply with the Supabase MCP `apply_migration`, run `get_advisors` (security), update `APPLIED.md`,
   then refresh the snapshot with `node scripts/dump-schema.mjs` so the repo still matches production.

## Deploy and environment

Vercel env vars (Production): `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`CRON_SECRET`, `RESEND_API_KEY`, `KISA_CLIENT_ID` + `KISA_CLIENT_SECRET` (card checkout; without them it answers `payment_provider_not_configured`). Optional: `KISA_API_URL` (default https://www.kisa.ge), `FIRECRAWL_API_KEY` (lets the listing import read MyHome.ge and SS.ge, which block Vercel's datacenter IPs with a Cloudflare challenge; without it the import shows the manual-entry message), `APP_BASE_URL` (default https://rigzea.com), `EMAIL_FROM`,
`SUPABASE_URL` + `SUPABASE_ANON_KEY` (set both or neither; otherwise read from `rigzea/js/config.js`).
List names with `npx vercel env ls`. See `.env.example`.

The Vercel MCP connector has no access to this project; use the Vercel CLI (`npx vercel ...`) instead.

Telegram webhook (run once after changing the token or secret):
`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://rigzea.com/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>`

Daily cron `/api/cron-reminders` (05:00 UTC) needs `Authorization: Bearer $CRON_SECRET`; Vercel sends it.
