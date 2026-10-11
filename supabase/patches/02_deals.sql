-- =============================================================================
-- RIGZEA patch 02 — Deals layer: client selections (multi-listing links),
-- saved matchmaker criteria, organization FX rate and saved lease contracts.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- Requires the base schema (supabase/schema.sql). Works with or without patch 01.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
-- GEL per 1 USD, used to show prices and commission totals in one currency.
alter table public.organizations add column if not exists fx_rate numeric(10,4) not null default 2.7;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_fx_rate_positive') then
    alter table public.organizations add constraint organizations_fx_rate_positive check (fx_rate > 0 and fx_rate < 100);
  end if;
end $$;

-- Client search criteria saved from the matchmaker: { city, district, budget_min, budget_max, currency, rooms, bedrooms, pets }
alter table public.deals add column if not exists criteria jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Selections (one link with several listings for one client)
-- -----------------------------------------------------------------------------
create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  slug text not null unique,
  client_name text,
  apartment_ids uuid[] not null default '{}',
  criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.selections add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.selections add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'selections_slug_format') then
    alter table public.selections add constraint selections_slug_format check (slug ~ '^[a-z0-9]{8,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'selections_apartments_count') then
    alter table public.selections add constraint selections_apartments_count
      check (cardinality(apartment_ids) between 1 and 20);
  end if;
end $$;

create index if not exists selections_org_idx on public.selections (organization_id, created_at desc);

alter table public.selections enable row level security;
drop policy if exists selections_select on public.selections;
drop policy if exists selections_insert on public.selections;
drop policy if exists selections_update on public.selections;
drop policy if exists selections_delete on public.selections;
create policy selections_select on public.selections for select using (public.is_org_member(organization_id, auth.uid()));
create policy selections_insert on public.selections for insert with check (public.is_org_manager(organization_id));
create policy selections_update on public.selections for update using (public.is_org_manager(organization_id));
create policy selections_delete on public.selections for delete using (public.is_org_manager(organization_id));

-- Only listings of the same organization may be put into a selection.
create or replace function public.selections_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(new.apartment_ids) as x(id)
    where not exists (select 1 from public.apartments a where a.id = x.id and a.organization_id = new.organization_id)
  ) then
    raise exception 'შერჩევაში მხოლოდ თქვენი კომპანიის ბინების დამატებაა შესაძლებელი';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_selections_guard on public.selections;
create trigger trg_selections_guard before insert or update of apartment_ids, organization_id on public.selections
  for each row execute function public.selections_guard();

-- Public, read-only view of a selection. Returns only showcase-safe fields
-- (no door codes, wifi, owner data, tenant data or internal notes).
create or replace function public.get_public_selection(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sel public.selections;
  v_org jsonb;
  v_apts jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]{8,40}$' then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  select * into v_sel from public.selections where slug = p_slug and is_active;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  select to_jsonb(o) into v_org from public.organizations o where o.id = v_sel.organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'slug', to_jsonb(a) ->> 'slug',
      'title', a.name,
      'price', a.monthly_rent,
      'currency', coalesce(a.currency, 'USD'),
      'rooms', a.rooms,
      'bedrooms', a.bedrooms,
      'area_sqm', a.area_sqm,
      'floor', a.floor,
      'total_floors', a.total_floors,
      'district', a.district,
      'city', a.city,
      'pets_allowed', coalesce(a.pets_allowed, false),
      'photos', (select coalesce(jsonb_agg(p.value), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(to_jsonb(a) -> 'photos', '[]'::jsonb)) with ordinality as p(value, n)
                  where p.n <= 4),
      'agent_phone', a.agent_phone
    ) order by s.n), '[]'::jsonb)
    into v_apts
    from unnest(v_sel.apartment_ids) with ordinality as s(id, n)
    join public.apartments a on a.id = s.id
   where a.organization_id = v_sel.organization_id
     and coalesce(a.is_archived, false) = false
     and a.status <> 'archived';

  if jsonb_array_length(v_apts) = 0 then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'selection', jsonb_build_object(
      'client_name', v_sel.client_name,
      'created_at', v_sel.created_at
    ),
    'apartments', v_apts,
    'agency', jsonb_build_object(
      'name', v_org ->> 'name',
      'phone', v_org ->> 'contact_phone',
      'logo_url', v_org ->> 'logo_url',
      'brand_color', v_org ->> 'brand_color',
      'fx_rate', v_org -> 'fx_rate'
    )
  );
end;
$$;

revoke execute on function public.get_public_selection(text) from public;
grant execute on function public.get_public_selection(text) to anon, authenticated;
revoke execute on function public.selections_guard() from public, anon;

-- -----------------------------------------------------------------------------
-- 3. Contracts (generated lease agreements; data holds the filled form)
-- -----------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists contracts_org_idx on public.contracts (organization_id, created_at desc);
create index if not exists contracts_deal_idx on public.contracts (deal_id);

alter table public.contracts enable row level security;
drop policy if exists contracts_select on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_update on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_select on public.contracts for select using (public.is_org_manager(organization_id));
create policy contracts_insert on public.contracts for insert with check (public.is_org_manager(organization_id));
create policy contracts_update on public.contracts for update using (public.is_org_manager(organization_id));
create policy contracts_delete on public.contracts for delete using (public.is_org_admin(organization_id));
