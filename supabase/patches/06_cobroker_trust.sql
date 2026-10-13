-- =============================================================================
-- RIGZEA patch 06 — Cadastral codes and unreliable-client flags
-- Adds the cadastral code to properties (duplicate detection inside a workspace)
-- and a team-wide "unreliable client" flag with a note on contacts.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Apartments: cadastral code
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists cadastral_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartments_cadastral_code_format') then
    -- 01.10.14.009.011, optionally with unit segments (.01.008)
    alter table public.apartments add constraint apartments_cadastral_code_format
      check (cadastral_code is null or cadastral_code ~ '^\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}(\.\d{2}(\.\d{3})?)?$');
  end if;
end $$;

-- Lookup for the duplicate warning. Not unique on purpose: the same property can
-- legitimately be listed twice (for sale and for rent), so the app warns instead of blocking.
create index if not exists apartments_org_cadastral_idx
  on public.apartments (organization_id, cadastral_code)
  where cadastral_code is not null;

-- -----------------------------------------------------------------------------
-- 2. Contacts: unreliable / problematic client flag
-- -----------------------------------------------------------------------------
alter table public.owners add column if not exists is_flagged boolean not null default false;
alter table public.owners add column if not exists flag_note text;
alter table public.owners add column if not exists flagged_at timestamptz;
alter table public.owners add column if not exists flagged_by_name text;

create index if not exists owners_org_flagged_idx
  on public.owners (organization_id)
  where is_flagged;
