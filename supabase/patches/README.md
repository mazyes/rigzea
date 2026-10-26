# Database patches

## Overview

Numbered SQL files (`NN_short_name.sql`) that change the live Supabase database
(project `cuioodytwyzykqlrjfej`). Each patch is written to be re-runnable and is
applied by hand, one at a time, after a rolled-back dry run. Nothing runs these
files automatically: there is no migration runner in the repo and no build step
touches them.

Not every file here is live. The live database was built from migrations that are
not in this repo (`rigzea_01..09`, `sharing_foundations`, `link_tracking`) and then
aligned by patches 05 onward. [`../APPLIED.md`](../APPLIED.md) is the only source of
truth for which patch is live, partly live, or never run.

## Interface

One file per change. What each one adds (functions, tables and policies are all in
schema `public` unless noted):

| Patch | Status (see APPLIED.md) | Adds or changes |
|---|---|---|
| `01_smartlink.sql` | never run | `link_events`, `track_link_event`, `get_public_listing`, `get_public_showcase`, `get_link_stats` |
| `02_deals.sql` | never run | `selections`, `contracts`, `get_public_selection`, `selections_guard` |
| `03_renewals.sql` | partly; do not run whole | `telegram_link_codes`, Telegram link-code and renewal RPCs |
| `04_plans.sql` | never run | plans, trial, `platform_admins`, `plan_limit`, `org_effective_plan` |
| `05_sales_crm.sql` | live | sales fields, 7-stage pipeline, buyer/seller contacts, viewings, `get_public_listing` |
| `06_cobroker_trust.sql` | live | cadastral code on properties, unreliable-client flag on contacts |
| `07_documents.sql` | live | personal number on contacts (contract autofill) |
| `08_team.sql` | live | commission splits, role `agent`, `is_org_agent`, `agent_can_see_contact`, `deals_split_guard` |
| `09_align_live.sql` | live | aligns the sharing-built database with the app: slugs, branding, plans, selections, link stats |
| `10_free_plan_limit.sql` | live | free plan = 3 active properties, `trial_grants` (one trial per account) |
| `11_trial_to_free.sql` | live | ended trial becomes free plan, `org_has_feature`, `plan_has_feature`, `enforce_plan_feature` |
| `12_platform_admin.sql` | live | `grant_platform_admin`, `revoke_platform_admin`, `list_platform_admins`, `platform_admin_log` |
| `13_paid_import_and_pdf.sql` | live | link import and PDF limited to paid plans, `my_org_has_feature` |
| `14_reminders_live.sql` | live | the parts of 03 the cron and bot need: `pending_telegram_notifications`, `mark_telegram_sent`, `scan_lease_renewals` |
| `15_guest_guide_rpc.sql` | live, replaced by 18 | `get_guest_guide` |
| `16_secure_storage.sql` | live | buckets `rigzea-public` and `rigzea-private`, `can_write_org_folder`, storage policies |
| `17_missing_columns.sql` | live | `apartments.public_slug`, `is_published`; `link_events.visitor_id`, `notified_at` |
| `18_security_hardening.sql` | live | `get_guest_guide_by_token` (door code and Wi-Fi need a token), storage listing limited to org members |
| `19_listing_notify_cap.sql` | live | patches the live `track_link_event_notify` in place: 3 alerts per listing per hour |
| `20_import_rate_limit.sql` | live | `import_requests`, `register_import` (10 imports per hour per user) |
| `21_kisa_payments.sql` | live (outside migrations) | `payments`, `activate_org_subscription` |
| `22_backend_security_hardening.sql` | live | no direct anonymous writes, membership checks on every `*_insert` policy, atomic payment activation |
| `23_profile_branding.sql` | live | profile pictures, `update_my_profile`, stricter storage folders |
| `24_chat.sql` | live | `chat_channels`, `chat_channel_members`, `chat_messages`, `chat_reactions`, chat RPCs and realtime |
| `25_invites.sql` | live | `get_invitation`, `accept_invitation`, `invitation_email_data`, 14-day invite expiry |

Callers of these functions live in `api/` (Vercel functions, service role) and
`rigzea/app/` (browser, anon or authenticated role).

## Invariants

- File names are `NN_short_name.sql`; the next patch takes the next free number (26).
- Every patch is safe to run twice: `create ... if not exists`, `create or replace`,
  `drop policy if exists` before `create policy`.
- Patches are additive. Do not drop or rewrite tables, columns or rows unless the user
  asks for it explicitly.
- A new public table gets explicit `GRANT`s and `enable row level security` in the same
  patch. New `SECURITY DEFINER` functions set `search_path` and check `auth.uid()`
  themselves.
- Do not run 01, 02, 03 or 04. They target a schema the live database never had and
  would collide with the live definitions.
- When a live function differs from what a patch in the repo says (19 is the example),
  patch the live definition in place rather than re-creating it from an older file.
- Feature gates in SQL mirror `PLANS` in `rigzea/app/app.js`; change both together.
- Patches must not contain credentials or real user data. `grant_platform_admin` is
  called from the SQL editor with the address typed there, not stored in a file.
- Applying a patch updates [`../APPLIED.md`](../APPLIED.md) in the same change.

## Side Effects

- None while the files sit in the repo. Running one changes the production database
  directly (schema, functions, RLS policies, grants, storage policies, realtime
  publication). There is no staging database.
- Agents must ask the user before running any SQL on production; it is not auto-approved.

## Verification

Tests mock the database, so `npm test` cannot catch RLS, grant or SQL mistakes. For
any patch:

1. Dry run on live inside a block that always rolls back:
   `do $$ ... raise exception 'DRYRUN %', result; $$`, with `set local role anon` and
   `set local role authenticated` scenarios for each caller that should be allowed or denied.
2. With the user's approval, apply with the Supabase MCP `apply_migration`.
3. Run `get_advisors` (security) and note the result in `../APPLIED.md`.
4. Refresh the snapshot: `node scripts/dump-schema.mjs` (needs `SUPABASE_ACCESS_TOKEN`).
5. Run `npm test` for any app code changed alongside the patch.
