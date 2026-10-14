# Live database state

Project ref: `cuioodytwyzykqlrjfej`. This file is the source of truth for which SQL in this repo is live.
Update it in the same change that applies a patch. To check the live list, use the Supabase MCP
`list_migrations`.

The live database was **not** built from `schema.sql` or patches 01-04. It was built from the
`rigzea_01..09` and "sharing" migrations (`share_links`, `record_link_event`), which are not in this
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

## Rules for new patches

- Number them `NN_short_name.sql` and make them safe to re-run (`if not exists`, `create or replace`).
- New public tables need explicit `GRANT`s and `enable row level security` in the same patch.
- Test first inside a transaction that always rolls back (`do $$ ... raise exception 'DRYRUN %', result; $$`),
  with `set local role anon` / `authenticated` scenarios. Then apply with `apply_migration`.
- After applying: run the security advisor (`get_advisors`) and add a row to the table above.
