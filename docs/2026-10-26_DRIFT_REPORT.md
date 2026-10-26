# Drift report, 2026-10-26

EGM drift report (docs vs. live code) on branch `egm-audit`. The new per-directory READMEs were
generated from the code today, so this report covers the docs that existed before them.

## CLAUDE.md

- The environment variable list leaves out the KISA payment variables the code reads:
  `KISA_CLIENT_ID`, `KISA_CLIENT_SECRET` and the optional `KISA_API_URL` (`api/kisa-checkout.js:144-146`).
  Without the first two, card checkout answers `payment_provider_not_configured`.

## AGENTS.md

- Out of date against CLAUDE.md: the env var list is missing the `FIRECRAWL_API_KEY` line, and the
  `.claude` hook folder is written as `.Codex` (line 16).
- Same KISA gap as CLAUDE.md.

## .env.example

- `KISA_API_URL=https://api.kisa.ge`, but the code defaults to `https://www.kisa.ge`
  (`api/kisa-checkout.js:144`). One of the two is wrong; the repo does not say which.
- `KISA_WEBHOOK_SECRET` is listed, but no code reads it. The webhook is authenticated by a
  per-payment callback token instead (`api/kisa-webhook.js:338-343`).

## supabase/schema.sql and supabase/migrations.md

- Generated 2026-10-16, before patches 21 to 25, which `supabase/APPLIED.md` marks live. The
  snapshot has no `payments` or `chat_*` tables, no `update_my_profile` or `accept_invitation`, and
  `migrations.md` stops at `20_import_rate_limit`. Fix: `node scripts/dump-schema.mjs` (needs
  `SUPABASE_ACCESS_TOKEN`; read-only on live).

## extension/README.md and extension/background.js

- `background.js:2` says the posting-form URLs are "best guesses: confirm them"; the README says both
  forms were mapped live on 2026-10-16. The code comment is the stale one.
- `rigzea/downloads/rigzea-extension.zip` is a hand-made copy of `extension/`; nothing rebuilds it,
  so it drifts whenever the extension changes.

## rigzea/site.js

- Not referenced by any HTML page (legacy mobile menu toggle). Dead file.

## PERFORMANCE_PLAN.md

- See the Goldfish review in the audit summary (claims checked against code after commit `9cbedcf`).

## Resolution (same day)

- Fixed: KISA env vars added to CLAUDE.md and AGENTS.md (plus the FIRECRAWL line in AGENTS.md);
  `KISA_WEBHOOK_SECRET` removed from `.env.example`; stale `background.js` comment; `api/README.md`
  claims narrowed to what the code does; `PERFORMANCE_PLAN.md` rechecked against the code.
- Open: which KISA base URL is right (`.env.example` now leaves it empty and notes both);
  `schema.sql` refresh needs `SUPABASE_ACCESS_TOKEN`; `rigzea/site.js` and the extension zip left as they are.
