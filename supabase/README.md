# Supabase

## Overview

Everything about the production database (Supabase project `cuioodytwyzykqlrjfej`)
that lives in the repo: the record of what is live, a generated snapshot of the live
structure, the SQL patches that change it, and the Auth email templates.

The live database was **not** built from the files here. It was built from migrations
that are not in this repo (`rigzea_01..09`, `sharing_foundations`, `link_tracking`) and
then aligned with the app by patches 05 onward. Read [`APPLIED.md`](./APPLIED.md) before
trusting any patch.

## Interface

- [`APPLIED.md`](./APPLIED.md): hand-maintained. Which patch is live, how and when it was
  applied, the advisor result, and the rules for new patches. The source of truth.
- `schema.sql`: generated snapshot of live (tables, constraints, indexes, functions,
  triggers, RLS policies, grants). Read it to learn the real shape of a table or function.
  Run it only against an empty database; it is not a migration.
- `migrations.md`: generated list of rows in `supabase_migrations.schema_migrations` on live.
  Patches run from the SQL editor (15, 16, 17, 21) never appear here.
- [`patches/`](./patches/README.md): numbered, re-runnable SQL changes (`NN_*.sql`).
- [`templates/`](./templates/README.md): Supabase Auth email templates built from
  `api/_email.js`.
- `.temp/`: Supabase CLI link state (project ref, service versions). Not documentation;
  do not edit.

Both generated files come from `node scripts/dump-schema.mjs` (needs
`SUPABASE_ACCESS_TOKEN`), which reads the Supabase Management API.

## Invariants

- Never hand-edit `schema.sql` or `migrations.md`; refresh them with
  `node scripts/dump-schema.mjs` after every database change so the repo matches production.
- Every database change is a new file in `patches/`, and the same change adds its row to
  `APPLIED.md`.
- The snapshot can lag behind live. As of this writing, `schema.sql` and `migrations.md`
  (generated 2026-10-16) predate patches 21 to 25: they have no `payments` or `chat_*`
  tables, no `update_my_profile` and no `accept_invitation`, although `APPLIED.md` lists
  those patches as live. Trust `APPLIED.md`, and refresh the snapshot before relying on it.
- Tests mock Supabase (`tests/mock-supabase.js`), so they cannot catch RLS, grant or SQL
  mistakes. Those are checked against live with a rolled-back transaction.
- No credentials in any file here. The access token is set in the shell only.

## Side Effects

- The files in this folder change nothing by themselves.
- `node scripts/dump-schema.mjs` reads live through the Management API and overwrites
  `schema.sql` and `migrations.md`.
- Applying a patch writes to the production database directly; there is no staging
  database. Agents must ask the user before running any SQL on production.

## Verification

Database changes are verified by the dry-run procedure, not by `npm test`:

1. Dry run on live inside `do $$ ... raise exception 'DRYRUN %', result; $$` so it always
   rolls back, with `set local role anon` / `authenticated` scenarios.
2. Apply with the Supabase MCP `apply_migration` (only after the user approves).
3. Run `get_advisors` (security), add the row to `APPLIED.md`.
4. Run `node scripts/dump-schema.mjs` to refresh the snapshot.

App code changed alongside a patch is still tested with `npm test`.
