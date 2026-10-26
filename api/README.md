# api

## Overview

Vercel serverless functions for Rigzea (ES modules; `api/package.json` sets `"type": "module"` for this
folder only). Each `*.js` file without a leading `_` is a route at `/api/<name>`; files starting with `_`
are shared helpers and are never exposed. Per-function settings (`maxDuration`, `includeFiles` for
`rigzea/js/config.js` and `rigzea/p/index.html`), the `/p/<ref>/` rewrite to `/api/p` and the daily cron
live in the repo-root `vercel.json`.

The functions talk to Supabase over PostgREST (`/rest/v1/...`, `/rest/v1/rpc/...`) and Auth
(`/auth/v1/user`), to the Telegram Bot API, to Resend (email), to KISA (card payments) and, optionally,
to Firecrawl (listing import proxy). There is no local `/api` with `npm run dev`; use `npm run dev:full`.

## Interface

### Shared helpers (not routes)

- `_lib.js`
  - `BASE_APP_URL`: `APP_BASE_URL` env var or `https://rigzea.com`.
  - `ConfigError`, `requireEnv(...names)`: throws `ConfigError` listing missing env vars.
  - `esc(s)`: escapes `&`, `<`, `>` for Telegram HTML and email text.
  - `telegramRequest(method, payload)`, `sendMessage(chatId, text, extra)`: Bot API calls (HTML parse mode,
    link previews off). Return the parsed JSON or `null` on network error.
  - `publicConfig()`: `{ url, key }` for Supabase. Both from `SUPABASE_URL` + `SUPABASE_ANON_KEY`, or both
    parsed from `rigzea/js/config.js`; cached per instance. Empty strings mean "not configured".
  - `callRpcAs(token, fn, params)`: RPC with the caller's JWT (RLS applies). Returns
    `{ ok, status, data, error? }`; `error` carries the PostgREST message (up to 300 chars).
  - `callRpc(fn, params)`: RPC with `SUPABASE_SERVICE_ROLE_KEY`. Returns parsed JSON or `null` on failure.
  - `fmtDate(iso)` (`YYYY-MM-DD` to `DD.MM.YYYY`), `daysText(days)` (Georgian "expires in N days" text).
- `_email.js`
  - `renderEmail({ preheader, title, lines, button, rows, list, note, lang })`: branded inline-styled HTML
    (`lang` is `ka` or `en`). The same layout builds the Supabase Auth templates (`supabase/templates/build.mjs`).
  - `renderText(content)`: plain-text alternative.
  - `sendEmail({ to, subject, content })`: sends through Resend. Returns `{ ok, id }` or `{ ok: false, error }`.
- `_import-parse.js` (pure functions, unit tested by `tests/import-parse.test.js`)
  - `ALLOWED_HOSTS`: `myhome.ge`, `ss.ge`, `place.ge`.
  - `hostOf(rawUrl)`: `{ site, url }` for an http(s) URL on an allowed host (subdomains included), else `null`.
  - `parseListing(site, html)`: normalized listing (`title`, `transaction_type`, `property_type`, location,
    area, floors, rooms, price and currency, `price_sqm` for sales, `images` up to 15 https URLs,
    `description` up to 2500 chars, `name`, `source`) or `null`.
  - `debrand(text)`: drops sentences with phones, links, emails, cadastral codes or contact wording.

### Routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/p` | GET | none (anon key) | Serves `rigzea/p/index.html` with Open Graph tags and `window.__RIGZEA_LISTING__` injected from `get_public_listing`. Also exports `buildMeta`. |
| `/api/import-listing` | POST `{ url, org }` | user JWT | Reads one listing page and returns `{ ok, listing }` for the new-property form. |
| `/api/telegram` | GET (health check, no auth), POST | POST: `X-Telegram-Bot-Api-Secret-Token` header | Telegram webhook: link codes, `/today`, `/apartments`, `/renewals`, `/help`, and Georgian free text to tasks. |
| `/api/cron-reminders` | GET, POST | `Authorization: Bearer $CRON_SECRET` | Daily job: lease renewal and overdue alerts, then Telegram delivery. |
| `/api/link-event` | POST `{ ref, kind, visitor, selection }` | none | Counts a public link view or contact click and notifies linked Telegram chats. |
| `/api/invite-email` | POST `{ invitation, lang }` | user JWT | Sends a team invitation email. Also exports `inviteContent()`. |
| `/api/plan-email` | POST `{ org }` | user JWT (platform admin) | Sends the plan activation email after `admin_set_org_plan`. |
| `/api/kisa-checkout` | POST `{ orgId, plan }` | user JWT (owner or admin) | Creates a pending payment and a KISA checkout session; returns `{ checkoutUrl, orderId, paymentId }`. |
| `/api/kisa-webhook/` | POST `?token=`, header `X-Kisa-Event: payment.callback` | per-payment callback token | KISA payment callback; activates a 30-day subscription and emails a receipt. |
| `/api/kisa-stream-confirm` | POST | none | Retired: always answers 410 (browser donation events cannot prove payment). |
| `/api/client-error` | POST `{ kind, path, file, line, column }` | same-origin `Origin` | Logs sanitized client error locations only. |

Supabase RPCs used: `get_public_listing`, `my_org_has_feature`, `register_import`,
`consume_telegram_link_code`, `get_linked_telegram_org`, `get_telegram_apartments`, `get_telegram_renewals`,
`telegram_create_task_record`, `scan_lease_renewals`, `scan_alerts`, `pending_telegram_notifications`,
`mark_telegram_sent`, `close_stale_telegram_notifications`, `track_link_event_notify`,
`invitation_email_data`, `admin_list_orgs`, `activate_org_subscription`. User JWTs arrive as `Authorization: Bearer <token>`; `import-listing` and `kisa-checkout` check them
against `/auth/v1/user`, `invite-email` and `plan-email` pass them straight to the RPC. With
`trailingSlash: true` in `vercel.json`, a path without the trailing slash gets a 308 redirect first.
Tables touched directly:
`payments` (service role), `organization_members` (caller JWT).

## Invariants

- Every function reads Supabase URL and anon key only through `publicConfig()`; never pair a URL and key
  from different sources.
- Secrets come only from env vars (`SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
  `CRON_SECRET`, `RESEND_API_KEY`, `KISA_CLIENT_ID`, `KISA_CLIENT_SECRET`, optional `FIRECRAWL_API_KEY`,
  `KISA_API_URL`, `EMAIL_FROM`). Missing secrets mostly answer 500 or 503; exceptions: the cron route answers
  401 before checking config, and an unreachable Supabase Auth or feature check in `import-listing`,
  `invite-email` and `plan-email` surfaces as 401 or 403.
- Shared secrets (cron bearer, Telegram header, KISA callback token hash) are compared with `timingSafeEqual`.
  The cron route authenticates before checking any other config.
- Browser input never decides who gets an email or which plan is active: recipients, roles, plans and
  tokens are read from the database (`invitation_email_data`, `admin_list_orgs`, `payments`).
- Calls on behalf of a user use the caller's JWT (`callRpcAs` or a bearer header) so RLS applies; the
  service-role key is used only for server-owned work (Telegram, cron, link events, payments).
- `import-listing` only fetches the three allowed hosts, follows redirects only on the same site (4 requests,
  so at most 3 redirects), caps the page at 3 MB and the direct fetch at 8 s (the Firecrawl path, used for
  MyHome.ge and SS.ge when `FIRECRAWL_API_KEY` is set, has no redirect check, a 6 MB cap and a 35 s timeout), requires a signed-in user whose workspace has the
  `import` feature, and charges `register_import` (10 per hour) only after the URL is validated.
- `kisa-webhook` activates only a `pending` payment that matches `provider_order_id`, the token hash, the
  amount (in cents), and the metadata ids and currency when the callback sends them; a repeated callback returns `already_completed`.
- `kisa-checkout` stores the KISA `orderId` on the payment row before returning the checkout URL, and marks
  the row `failed` on any provider error.
- User and database text interpolated into Telegram HTML, email HTML or the listing page goes through an
  escape helper: `_lib.esc` (`&`, `<`, `>`; no quotes, so not safe inside attributes on its own), the
  quote-escaping variants in `_email.js` and `p.js`. Server-made values (`BASE_APP_URL`, approval tokens,
  amounts, dates) go in unescaped. The listing page is assembled with replacer functions, and the
  injected listing JSON escapes `<`, U+2028 and U+2029.
- `client-error` never logs message text, stacks or user data, and rejects bodies whose `Content-Length` header is over 2 KB.
- The Telegram webhook always answers 200 after a valid secret (errors are logged), so Telegram does not
  retry. Raw UUID linking is refused; only one-time codes link a chat.
- User-facing messages are Georgian and must not use the em dash character.

## Side Effects

- Network: Supabase REST and Auth, `api.telegram.org`, `api.resend.com`, KISA (`KISA_API_URL`, default
  `https://www.kisa.ge`), `api.firecrawl.dev` (only with `FIRECRAWL_API_KEY`), and the listing sites.
- Database writes through RPCs: notifications and their sent flags, tasks and owner approvals from
  Telegram text, link-event counters, import budget rows, Telegram chat links, subscription activation.
- Direct writes: `payments` rows inserted and patched by `kisa-checkout` and `kisa-webhook`.
- Outbound messages: Telegram messages to linked chats; emails (invitation, plan activation, payment receipt).
- Disk reads: `rigzea/js/config.js` (via `publicConfig`) and `rigzea/p/index.html` (cached per instance in `p.js`).
- Logging: `console.error` for failures; `client-error` logs one sanitized JSON line per report.
- Caching: `/api/p` sets `s-maxage=60, stale-while-revalidate=300` for found listings; other routes send
  `no-store`.

## Verification

- Run: `npm test` (full suite, about 10 minutes).
- Faster checks for this folder: `node tests/import-parse.test.js` and `node tests/backend-security.test.mjs`.
- Tests mock Supabase, so RLS, grants and SQL in the RPCs above must be checked against the live database
  with a rolled-back transaction (see `supabase/APPLIED.md`).
