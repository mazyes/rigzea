// Generates supabase/schema.sql and supabase/migrations.md from the LIVE database.
//
// Why: the live database was built from migrations that were never committed, so the repo
// could not reproduce production. This tool pulls the authoritative schema back into the repo
// through the Supabase Management API (read-only queries), so the snapshot can be refreshed
// any time the database changes.
//
// Usage (PowerShell):
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."; node scripts/dump-schema.mjs
// Or:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dump-schema.mjs
//
// The token is an account-level personal access token (Supabase -> Account -> Access Tokens).
// It is only read here; nothing is written to the database.
import fs from 'node:fs';
import path from 'node:path';

const REF = process.env.SUPABASE_PROJECT_REF || 'cuioodytwyzykqlrjfej';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN (Supabase -> Account -> Access Tokens).');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}`;
const ROOT = path.resolve(import.meta.dirname, '..');

async function api(pathname) {
  const res = await fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}`);
  return res.json();
}

async function sql(query) {
  const res = await fetch(`${API}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`query failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return []; }
}

const rows = (list, key = 'ddl') => list.map((r) => r[key]).filter((v) => v != null);

// Ordered sections. Each runs one read-only query; a failure is reported, not fatal.
const SECTIONS = [
  ['extensions', `
    select 'create extension if not exists ' || quote_ident(e.extname) || ' with schema ' || quote_ident(n.nspname) || ';' as ddl
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname <> 'plpgsql'
    order by e.extname`],

  ['tables', `
    select format('create table %I.%I (%s);', n.nspname, c.relname,
      string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        case when a.attnotnull then ' not null' else '' end,
        case
          when a.attidentity <> '' then ' generated ' || (case a.attidentity when 'a' then 'always' when 'd' then 'by default' end) || ' as identity'
          when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid)
          else ''
        end), E',\\n  ' order by a.attnum)) as ddl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r'
    group by n.nspname, c.relname
    order by c.relname`],

  ['constraints', `
    select format('alter table %I.%I add constraint %I %s;', n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)) as ddl
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype in ('p','u','f','c','x')
    order by c.relname, con.contype, con.conname`],

  ['indexes', `
    select pg_get_indexdef(i.indexrelid) || ';' as ddl
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_namespace n on n.oid = ic.relnamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
    order by ic.relname`],

  ['functions', `
    select pg_get_functiondef(p.oid) || ';' as ddl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind <> 'a'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid`],

  ['triggers', `
    select pg_get_triggerdef(t.oid) || ';' as ddl
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
    order by c.relname, t.tgname`],

  ['row level security', `
    select format('alter table %I.%I enable row level security;', n.nspname, c.relname) as ddl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    order by c.relname`],

  ['policies', `
    select format('create policy %I on %I.%I%s%s%s%s;',
        pol.polname, n.nspname, c.relname,
        case when pol.polpermissive then '' else ' as restrictive' end,
        case pol.polcmd when '*' then ' for all' when 'r' then ' for select' when 'a' then ' for insert' when 'w' then ' for update' when 'd' then ' for delete' end,
        case when pol.polroles = '{0}' then '' else ' to ' || (select string_agg(quote_ident(r.rolname), ', ') from pg_roles r where r.oid = any(pol.polroles)) end,
        case when pol.polqual is not null then ' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' else '' end,
        case when pol.polwithcheck is not null then ' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' else '' end) as ddl
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','storage')
    order by n.nspname, c.relname, pol.polname`],

  ['table grants', `
    select format('grant %s on table %I.%I to %s;', g.privilege_type, g.table_schema, g.table_name,
        case when g.grantee = 'PUBLIC' then 'public' else quote_ident(g.grantee) end) as ddl
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.grantee in ('anon','authenticated','service_role','PUBLIC')
    order by g.table_name, g.grantee, g.privilege_type`],

  ['function grants', `
    select format('grant execute on function %I.%I(%s) to %s;', n.nspname, p.proname,
        pg_get_function_identity_arguments(p.oid),
        case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end) as ddl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner
    order by p.proname, a.grantee`],
];

const HEADER = `-- supabase/schema.sql
-- GENERATED SNAPSHOT of the live database (project ${REF}). Do not edit by hand.
-- Refresh with:  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node scripts/dump-schema.mjs
--
-- This is the authoritative structure of production (tables, constraints, indexes, functions,
-- triggers, RLS policies and grants). It is a snapshot, not a re-runnable migration: run it only
-- against an empty database. Day-to-day changes still go through supabase/patches/NN_*.sql.
`;

const parts = [HEADER];
const summary = [];
for (const [label, query] of SECTIONS) {
  try {
    const list = rows(await sql(query));
    parts.push(`\n-- ===========================================================================\n-- ${label} (${list.length})\n-- ===========================================================================\n`);
    parts.push(list.join('\n'));
    summary.push(`${label}: ${list.length}`);
  } catch (e) {
    parts.push(`\n-- ${label}: FAILED to dump (${e.message})`);
    summary.push(`${label}: FAILED (${e.message})`);
  }
}

const out = path.join(ROOT, 'supabase', 'schema.sql');
fs.writeFileSync(out, parts.join('\n') + '\n', 'utf8');

// Migration history, so APPLIED.md can be reconciled with what the database actually recorded.
const migrations = await api('/database/migrations');
const mig = [
  `# Applied migrations (live project ${REF})`,
  '',
  'Generated by `scripts/dump-schema.mjs` from the Supabase Management API. These are the',
  'migrations the database itself recorded in `supabase_migrations.schema_migrations`.',
  '',
  '| Version | Name |',
  '|---|---|',
  ...migrations.map((m) => `| ${m.version} | ${m.name} |`),
  '',
];
fs.writeFileSync(path.join(ROOT, 'supabase', 'migrations.md'), mig.join('\n'), 'utf8');

console.log(`Wrote supabase/schema.sql (${parts.join('\n').split('\n').length} lines) and supabase/migrations.md (${migrations.length} migrations).`);
for (const line of summary) console.log('  ' + line);
