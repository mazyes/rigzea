-- =============================================================================
-- RIGZEA patch 01 — Smart link: pretty listing URLs, public listing data,
-- agency branding and link analytics (views / WhatsApp / call clicks).
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- Requires the base schema (supabase/schema.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists slug text;
alter table public.apartments add column if not exists lat double precision;
alter table public.apartments add column if not exists lng double precision;
alter table public.apartments add column if not exists badge text;
alter table public.apartments add column if not exists agent_name text;
alter table public.apartments add column if not exists amenities jsonb not null default '[]'::jsonb;
alter table public.apartments add column if not exists description_en text;
alter table public.apartments add column if not exists photos jsonb not null default '[]'::jsonb;

alter table public.organizations add column if not exists brand_color text;
alter table public.organizations add column if not exists logo_url text;

-- Slug format: lowercase latin letters, digits and dashes, 3–80 chars.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartments_slug_format') then
    alter table public.apartments add constraint apartments_slug_format
      check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,79}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'apartments_lat_range') then
    alter table public.apartments add constraint apartments_lat_range check (lat is null or lat between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'apartments_lng_range') then
    alter table public.apartments add constraint apartments_lng_range check (lng is null or lng between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_brand_color_format') then
    alter table public.organizations add constraint organizations_brand_color_format
      check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

-- Every apartment gets a slug; the app may set a readable one, otherwise a short random one is used.
create or replace function public.apartments_default_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  else
    new.slug := lower(btrim(new.slug));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apartments_default_slug on public.apartments;
create trigger trg_apartments_default_slug before insert or update of slug on public.apartments
  for each row execute function public.apartments_default_slug();

update public.apartments set slug = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) where slug is null;

create unique index if not exists apartments_slug_key on public.apartments (slug);

-- -----------------------------------------------------------------------------
-- 2. Public listing (anon). Accepts a slug or an apartment id.
--    Never returns owner data, door codes, Wi-Fi, tenant or internal notes.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_listing(p_ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_apt public.apartments;
  v_org public.organizations;
begin
  if v_ref = '' then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_apt from public.apartments where id = v_ref::uuid;
  else
    select * into v_apt from public.apartments where slug = v_ref;
  end if;

  if not found or coalesce(v_apt.is_archived, false) or v_apt.status = 'archived' then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  select * into v_org from public.organizations where id = v_apt.organization_id;

  return jsonb_build_object(
    'success', true,
    'apartment', jsonb_build_object(
      'id', v_apt.id,
      'slug', v_apt.slug,
      'name', v_apt.name,
      'address', v_apt.address,
      'city', v_apt.city,
      'district', v_apt.district,
      'rooms', v_apt.rooms,
      'bedrooms', v_apt.bedrooms,
      'floor', v_apt.floor,
      'total_floors', v_apt.total_floors,
      'area_sqm', v_apt.area_sqm,
      'monthly_rent', v_apt.monthly_rent,
      'currency', coalesce(v_apt.currency, 'USD'),
      'rental_type', coalesce(v_apt.rental_type, 'short_term'),
      'pets_allowed', coalesce(v_apt.pets_allowed, false),
      'utilities_estimate', v_apt.utilities_estimate,
      'prepayment_terms', v_apt.prepayment_terms,
      'deposit_amount', v_apt.deposit_amount,
      'checkin_time', v_apt.checkin_time,
      'checkout_time', v_apt.checkout_time,
      'photos', coalesce(v_apt.photos, '[]'::jsonb),
      'description', v_apt.description,
      'description_en', v_apt.description_en,
      'amenities', coalesce(v_apt.amenities, '[]'::jsonb),
      'badge', v_apt.badge,
      'lat', v_apt.lat,
      'lng', v_apt.lng,
      'status', v_apt.status,
      'agent_phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone),
      'updated_at', v_apt.updated_at
    ),
    'agency', jsonb_build_object(
      'name', v_org.name,
      'logo_url', v_org.logo_url,
      'brand_color', v_org.brand_color,
      'agent_name', v_apt.agent_name,
      'phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone)
    )
  );
end;
$$;

-- Backward compatible wrapper used by older links (/p/?id=<uuid>).
create or replace function public.get_public_showcase(p_apartment_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.get_public_listing(p_apartment_id::text);
$$;

-- -----------------------------------------------------------------------------
-- 3. Link analytics
-- -----------------------------------------------------------------------------
create table if not exists public.link_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  selection_id uuid,
  kind text not null check (kind in ('view', 'whatsapp', 'call')),
  visitor text,
  created_at timestamptz not null default now()
);
create index if not exists idx_link_events_apt on public.link_events (apartment_id, created_at desc);
create index if not exists idx_link_events_visitor on public.link_events (apartment_id, visitor, kind, created_at desc);
create index if not exists idx_link_events_selection on public.link_events (selection_id) where selection_id is not null;

alter table public.link_events enable row level security;
drop policy if exists link_events_select on public.link_events;
create policy link_events_select on public.link_events for select to authenticated using (public.is_org_member(organization_id, auth.uid()));
revoke all on public.link_events from anon;
-- No insert/update/delete policies: rows are written only by track_link_event().

-- Anonymous event logging with dedup and a simple rate limit.
--  * the same visitor is counted once per 30 min for views and once per 2 min for clicks;
--  * at most 600 events per apartment per hour and 60 per visitor per hour.
create or replace function public.track_link_event(p_ref text, p_kind text, p_visitor text default null, p_selection_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_apt public.apartments;
  v_visitor text := nullif(left(regexp_replace(coalesce(p_visitor, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_window interval;
begin
  if p_kind not in ('view', 'whatsapp', 'call') then return false; end if;

  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_apt from public.apartments where id = v_ref::uuid;
  else
    select * into v_apt from public.apartments where slug = v_ref;
  end if;
  if not found or coalesce(v_apt.is_archived, false) then return false; end if;

  -- Logged-in team members previewing their own listing are not counted.
  if auth.uid() is not null and public.is_org_member(v_apt.organization_id, auth.uid()) then return false; end if;

  if (select count(*) from public.link_events
      where apartment_id = v_apt.id and created_at > now() - interval '1 hour') >= 600 then
    return false;
  end if;

  if v_visitor is not null then
    if (select count(*) from public.link_events
        where visitor = v_visitor and created_at > now() - interval '1 hour') >= 60 then
      return false;
    end if;
    v_window := case when p_kind = 'view' then interval '30 minutes' else interval '2 minutes' end;
    if exists (select 1 from public.link_events
               where apartment_id = v_apt.id and visitor = v_visitor and kind = p_kind
                 and created_at > now() - v_window) then
      return false;
    end if;
  end if;

  insert into public.link_events (organization_id, apartment_id, selection_id, kind, visitor)
  values (v_apt.organization_id, v_apt.id, p_selection_id, p_kind, v_visitor);
  return true;
end;
$$;

-- Counters for the apartment page (organization members only).
create or replace function public.get_link_stats(p_apartment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_out jsonb;
begin
  select organization_id into v_org from public.apartments where id = p_apartment_id;
  if v_org is null or not public.is_org_member(v_org, auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'views', count(*) filter (where kind = 'view'),
    'visitors', count(distinct visitor) filter (where kind = 'view'),
    'whatsapp', count(*) filter (where kind = 'whatsapp'),
    'calls', count(*) filter (where kind = 'call'),
    'views_7d', count(*) filter (where kind = 'view' and created_at > now() - interval '7 days'),
    'last_view_at', max(created_at) filter (where kind = 'view')
  ) into v_out
  from public.link_events where apartment_id = p_apartment_id;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.get_public_listing(text) from public;
revoke execute on function public.track_link_event(text, text, text, uuid) from public;
revoke execute on function public.get_link_stats(uuid) from public, anon;
grant execute on function public.get_public_listing(text) to anon, authenticated;
grant execute on function public.get_public_showcase(uuid) to anon, authenticated;
grant execute on function public.track_link_event(text, text, text, uuid) to anon, authenticated;
grant execute on function public.get_link_stats(uuid) to authenticated;
