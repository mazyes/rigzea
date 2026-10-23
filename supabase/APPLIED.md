# Live database state

Project ref: `cuioodytwyzykqlrjfej`. This file is the source of truth for which SQL in this repo is live.
Update it in the same change that applies a patch.

Two files are generated from live and describe production exactly:

- `supabase/schema.sql` — full structural snapshot (tables, constraints, indexes, functions,
  triggers, RLS policies, grants).
- `supabase/migrations.md` — the migrations recorded in `supabase_migrations.schema_migrations`.

Refresh both after any database change (token from Supabase -> Account -> Access Tokens):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
node scripts/dump-schema.mjs
```

The live database was **not** built from `schema.sql` or patches 01-04. It was built from the
`rigzea_01..09` and "sharing" migrations (`sharing_foundations`, `link_tracking`), which are not in this
repo, and then aligned with the app by patches 06-09.

| Patch | Live? | How / when |
|---|---|---|
| 01_smartlink | never run | superseded by the live "sharing" migrations + 09 |
| 02_deals | never run | superseded by `sales_crm` + 09 |
| 03_renewals | partly | Telegram link-code and renewal functions differ from live; do not run as a whole |
| 04_plans | never run | superseded by 09-12 |
| 05_sales_crm | yes | migration `sales_crm`, 2026-10-13 |
| 06_cobroker_trust | yes | migration `cobroker_trust`, 2026-10-13 |
| 07_documents | yes | migration `documents_personal_id`, 2026-10-13 |
| 08_team | yes | migrations `team_splits_columns`, `agent_role`, 2026-10-13 |
| 09_align_live | yes | migrations `align_live_1..5`, 2026-10-13 |
| 10_free_plan_limit | yes | migrations `free_plan_1..2`, 2026-10-13 |
| 11_trial_to_free | yes | migrations `trial_to_free_1..3`, 2026-10-13 |
| 12_platform_admin | yes | migration `platform_admin_1_grant_process`, 2026-10-13 |
| 13_paid_import_and_pdf | yes | migration `paid_import_and_pdf`, 2026-10-13 |
| 14_reminders_live | yes | migration `14_reminders_live`, 2026-10-13 |
| 15_guest_guide_rpc | yes | run from the SQL editor (not recorded as a migration); replaced by 18 |
| 16_secure_storage | yes | run from the SQL editor (not recorded as a migration) |
| 17_missing_columns | yes | run from the SQL editor (not recorded as a migration) |
| 18_security_hardening | yes | migration `18_security_hardening`, 2026-10-14 |
| 19_listing_notify_cap | yes | migration `19_listing_notify_cap`, 2026-10-15 |
| 20_import_rate_limit | yes | migration `20_import_rate_limit`, 2026-10-15 (10 imports/hour per user) |
| 21_kisa_payments | yes | run outside migrations (the `payments` table was live); reconciled by 22 |
| 22_backend_security_hardening | yes | migration `22_backend_security_hardening`, 2026-10-22 (dry run first; advisor: no new findings) |
| 23_profile_branding | yes | migration `23_profile_branding`, 2026-10-23 (dry run first, rolled back; advisor: only the expected "signed-in users can run a SECURITY DEFINER function" note for `update_my_profile`, which checks `auth.uid()`) |
| 24_chat | yes | migrations `24_chat` and `24_chat_revoke_trigger_functions`, 2026-10-23 (dry run first with owner, admin, manager, agent, staff and an outsider: every allow and deny as designed; realtime publication added for the three chat tables) |

## Rules for new patches

- Number them `NN_short_name.sql` and make them safe to re-run (`if not exists`, `create or replace`).
- New public tables need explicit `GRANT`s and `enable row level security` in the same patch.
- Test first inside a transaction that always rolls back (`do $$ ... raise exception 'DRYRUN %', result; $$`),
  with `set local role anon` / `authenticated` scenarios. Then apply with `apply_migration`.
- After applying: run the security advisor (`get_advisors`) and add a row to the table above.
