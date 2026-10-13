-- =============================================================================
-- RIGZEA patch 09 — Bring a live database in line with the app
-- For a database that was built from the sharing migrations (public_slug,
-- share_links, record_link_event) rather than patches 01–04. Adds what the app
-- reads and writes: slug and map fields, branding, plans and trial, selections,
-- link statistics, the wider property statuses.
--
-- Additive only: no table, column or row is removed or rewritten. Existing
-- objects are kept (share_links, record_link_event, public_slug). The plan of an
-- existing workspace is NOT changed. Safe to run more than once.
-- Run after 08_team.sql (uses is_org_agent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Properties: slug, map position, badge, agent name; wider status list
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists slug text;
alter table public.apartments add column if not exists lat double precision;
alter table public.apartments add column if not exists lng double precision;
alter table public.apartments add column if not exists badge text;
alter table public.apartments add column if not exists agent_name text;

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
  -- The app also uses reserved / rented / sold. The list only gets longer.
  if exists (select 1 from pg_constraint where conname = 'apartments_status_check'
             and pg_get_constraintdef(oid) not like '%sold%') then
    alter table public.apartments drop constraint apartments_status_check;
    alter table public.apartments add constraint apartments_status_check
      check (status in ('active', 'reserved', 'rented', 'sold', 'maintenance', 'vacant', 'archived'));
  end if;
end $$;

-- Fills only empty slugs from the existing public link.
update public.apartments set slug = public_slug
where slug is null and public_slug ~ '^[a-z0-9][a-z0-9-]{2,79}$';

create unique index if not exists apartments_slug_key on public.apartments (slug);

-- slug is what the app edits; public_slug is what older links use. They stay equal
-- whenever the chosen slug fits the public_slug format (6+ characters).
create or replace function public.apartments_sync_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(nullif(new.public_slug, ''), substr(md5(gen_random_uuid()::text), 1, 10));
  else
    new.slug := lower(btrim(new.slug));
    if new.slug ~ '^[a-z0-9-]{6,80}$' and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
      new.public_slug := new.slug;
    end if;
  end if;
  return new;
end $$;

do $$
begin
  -- Named to run after trg_apartments_slug, which generates public_slug.
  if not exists (select 1 from pg_trigger where tgname = 'trg_apartments_slug_sync' and tgrelid = 'public.apartments'::regclass) then
    create trigger trg_apartments_slug_sync before insert or update on public.apartments
      for each row execute function public.apartments_sync_slug();
  end if;
end $$;

-- A contact may be saved without requirements.
alter table public.owners alter column requirements drop not null;

-- -----------------------------------------------------------------------------
-- 2. Workspace: branding, trial and plan dates
-- -----------------------------------------------------------------------------
alter table public.organizations add column if not exists trial_ends_at timestamptz;
alter table public.organizations add column if not exists plan_expires_at timestamptz;
alter table public.organizations add column if not exists brand_color text;
alter table public.organizations add column if not exists agent_display_name text;
alter table public.organizations add column if not exists fx_rate numeric(10,4);
alter table public.organizations alter column plan set default 'trial';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_plan_check')
     and not exists (select 1 from public.organizations where plan is not null and plan not in ('trial', 'starter', 'pro', 'top', 'agency')) then
    alter table public.organizations add constraint organizations_plan_check
      check (plan in ('trial', 'starter', 'pro', 'top', 'agency'));
  end if;
  if not exists (select 1 from pg_constraint where conname in ('organizations_brand_color_check', 'organizations_brand_color_format')) then
    alter table public.organizations add constraint organizations_brand_color_check
      check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Plans: platform admin, limits, activation
--    trial 50 properties / 3 seats · starter 10 / 1 · pro 50 / 1 · top 150 / 3 · agency unlimited
--    To activate customers, make yourself platform admin once:
--      insert into public.platform_admins (user_id)
--      select id from auth.users where email = 'YOU@example.com' on conflict do nothing;
-- -----------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.platform_admins enable row level security; -- no policies: reachable only through the functions below
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.org_effective_plan(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when o.plan = 'trial' then case when o.trial_ends_at is not null and o.trial_ends_at < now() then 'locked' else 'trial' end
    when o.plan <> 'starter' and o.plan_expires_at is not null and o.plan_expires_at < now() then 'starter'
    else coalesce(o.plan, 'trial')
  end
  from public.organizations o where o.id = p_org;
$$;

-- NULL = unlimited
create or replace function public.plan_limit(p_plan text, p_kind text)
returns integer language sql immutable as $$
  select case p_kind
    when 'apartments' then case p_plan when 'trial' then 50 when 'starter' then 10 when 'pro' then 50 when 'top' then 150 when 'agency' then null else 0 end
    when 'seats' then case p_plan when 'trial' then 3 when 'starter' then 1 when 'pro' then 1 when 'top' then 3 when 'agency' then null else 0 end
  end;
$$;

create or replace function public.enforce_apartment_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan text; v_cap integer; v_count integer;
begin
  if auth.uid() is null then return new; end if;                                   -- SQL editor / service role
  if new.status = 'archived' or coalesce(new.is_archived, false) then return new; end if;
  if tg_op = 'UPDATE' and not (old.status = 'archived' or coalesce(old.is_archived, false)) then return new; end if; -- only re-activation counts
  v_plan := public.org_effective_plan(new.organization_id);
  v_cap := public.plan_limit(v_plan, 'apartments');
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('apt-plan-' || new.organization_id::text));
  select count(*) into v_count from public.apartments
    where organization_id = new.organization_id and status <> 'archived' and coalesce(is_archived, false) = false and id <> new.id;
  if v_count + 1 > v_cap then
    if v_plan = 'locked' then
      raise exception 'საცდელი პერიოდი დასრულდა. ახალი ობიექტის დასამატებლად აირჩიე პაკეტი.' using errcode = 'P0001', hint = 'PLAN_LOCKED';
    end if;
    raise exception 'ობიექტების ლიმიტი ამოიწურა: შენს პაკეტში მაქსიმუმ % აქტიური ობიექტია. გადადი უფრო მაღალ პაკეტზე.', v_cap using errcode = 'P0001', hint = 'PLAN_LIMIT_APARTMENTS';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_seat_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan text; v_cap integer; v_count integer;
begin
  if auth.uid() is null or new.role = 'staff' then return new; end if;
  if new.status is distinct from 'pending' then return new; end if;
  v_plan := public.org_effective_plan(new.organization_id);
  v_cap := public.plan_limit(v_plan, 'seats');
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('seat-plan-' || new.organization_id::text));
  select (select count(*) from public.organization_members where organization_id = new.organization_id and role <> 'staff')
       + (select count(*) from public.invitations where organization_id = new.organization_id and status = 'pending' and role <> 'staff'
            and (expires_at is null or expires_at > now()) and id <> new.id)
    into v_count;
  if v_count + 1 > v_cap then
    if v_plan = 'locked' then
      raise exception 'საცდელი პერიოდი დასრულდა. გუნდის გასაფართოებლად აირჩიე პაკეტი.' using errcode = 'P0001', hint = 'PLAN_LOCKED';
    end if;
    raise exception 'გუნდის ლიმიტი ამოიწურა: შენს პაკეტში % სამუშაო ადგილია. გადადი უფრო მაღალ პაკეტზე. თანამშრომლის (staff) მოწვევა ლიმიტში არ ითვლება.', v_cap using errcode = 'P0001', hint = 'PLAN_LIMIT_SEATS';
  end if;
  return new;
end;
$$;

-- Plan columns can only be changed by a platform admin (or the SQL editor).
create or replace function public.protect_org_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_platform_admin() then new.plan := 'trial'; new.plan_expires_at := null; new.trial_ends_at := null; end if;
    if new.plan = 'trial' and new.trial_ends_at is null then new.trial_ends_at := now() + interval '14 days'; end if;
    return new;
  end if;
  if auth.uid() is not null and not public.is_platform_admin() then
    new.plan := old.plan; new.trial_ends_at := old.trial_ends_at; new.plan_expires_at := old.plan_expires_at;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_apartments_plan' and tgrelid = 'public.apartments'::regclass) then
    create trigger trg_apartments_plan before insert or update of status, is_archived on public.apartments
      for each row execute function public.enforce_apartment_plan();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_invitations_plan' and tgrelid = 'public.invitations'::regclass) then
    create trigger trg_invitations_plan before insert on public.invitations
      for each row execute function public.enforce_seat_plan();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_organizations_plan' and tgrelid = 'public.organizations'::regclass) then
    create trigger trg_organizations_plan before insert or update on public.organizations
      for each row execute function public.protect_org_plan();
  end if;
end $$;

-- New workspaces start with a 14-day trial.
create or replace function public.create_user_organization(p_org_name text, p_city text default 'თბილისი', p_portfolio_size text default '6-20', p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_org uuid; v_email text; v_name text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select email, raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = v_user;
  v_name := coalesce(p_display_name, v_name, split_part(v_email, '@', 1), 'მმართველი');
  insert into public.organizations (name, city, portfolio_size, contact_email, plan, trial_ends_at)
    values (coalesce(nullif(trim(p_org_name), ''), 'ჩემი კომპანია'), p_city, p_portfolio_size, v_email, 'trial', now() + interval '14 days') returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, display_name) values (v_org, v_user, 'owner', v_name);
  insert into public.activity_events (organization_id, actor_id, actor_name, event_type, title) values (v_org, v_user, v_name, 'organization_created', 'სამუშაო სივრცე შეიქმნა');
  return v_org;
end;
$$;

create or replace function public.admin_list_orgs()
returns table (id uuid, name text, city text, plan text, effective_plan text, trial_ends_at timestamptz, plan_expires_at timestamptz,
               created_at timestamptz, owner_email text, apartments_count bigint, members_count bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501'; end if;
  return query
    select o.id, o.name, o.city, o.plan, public.org_effective_plan(o.id), o.trial_ends_at, o.plan_expires_at, o.created_at,
      (select u.email::text from public.organization_members m join auth.users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1),
      (select count(*) from public.apartments a where a.organization_id = o.id and a.status <> 'archived' and coalesce(a.is_archived, false) = false),
      (select count(*) from public.organization_members m where m.organization_id = o.id)
    from public.organizations o order by o.created_at desc;
end;
$$;

-- p_days: trial -> ends in p_days (default 14); paid plans -> extends plan_expires_at by p_days; NULL = no expiry.
create or replace function public.admin_set_org_plan(p_org uuid, p_plan text, p_days integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  if not public.is_platform_admin() then raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501'; end if;
  if p_plan not in ('trial', 'starter', 'pro', 'top', 'agency') then raise exception 'უცნობი პაკეტი: %', p_plan; end if;
  update public.organizations set
    plan = p_plan,
    trial_ends_at = case when p_plan = 'trial' then now() + make_interval(days => coalesce(p_days, 14)) else trial_ends_at end,
    plan_expires_at = case when p_plan in ('trial', 'starter') then null
                           when p_days is null then null
                           else greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => p_days) end,
    updated_at = now()
  where id = p_org returning * into v_org;
  if not found then raise exception 'სამუშაო სივრცე ვერ მოიძებნა.'; end if;
  return jsonb_build_object('id', v_org.id, 'plan', v_org.plan, 'trial_ends_at', v_org.trial_ends_at, 'plan_expires_at', v_org.plan_expires_at);
end;
$$;

revoke execute on function public.is_platform_admin(), public.org_effective_plan(uuid), public.plan_limit(text, text),
  public.admin_list_orgs(), public.admin_set_org_plan(uuid, text, integer),
  public.create_user_organization(text, text, text, text) from public, anon;
grant execute on function public.is_platform_admin(), public.org_effective_plan(uuid), public.plan_limit(text, text),
  public.admin_list_orgs(), public.admin_set_org_plan(uuid, text, integer),
  public.create_user_organization(text, text, text, text) to authenticated;
revoke execute on function public.enforce_apartment_plan(), public.enforce_seat_plan(), public.protect_org_plan() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Selections (one link with several listings for one client)
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
create index if not exists selections_org_idx on public.selections (organization_id, created_at desc);
alter table public.selections enable row level security;
revoke all on public.selections from anon;
grant select, insert, update, delete on public.selections to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'selections_slug_format') then
    alter table public.selections add constraint selections_slug_format check (slug ~ '^[a-z0-9]{8,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'selections_apartments_count') then
    alter table public.selections add constraint selections_apartments_count check (cardinality(apartment_ids) between 1 and 20);
  end if;
  -- Managers see and manage all selections; an agent only their own.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'selections' and policyname = 'selections_select') then
    create policy selections_select on public.selections for select using (
      public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'selections' and policyname = 'selections_insert') then
    create policy selections_insert on public.selections for insert with check (
      public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'selections' and policyname = 'selections_update') then
    create policy selections_update on public.selections for update using (
      public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'selections' and policyname = 'selections_delete') then
    create policy selections_delete on public.selections for delete using (public.is_org_manager(organization_id));
  end if;
end $$;

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
revoke execute on function public.selections_guard() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_selections_guard' and tgrelid = 'public.selections'::regclass) then
    create trigger trg_selections_guard before insert or update of apartment_ids, organization_id on public.selections
      for each row execute function public.selections_guard();
  end if;
end $$;

-- Public, read-only view of a selection. Showcase-safe fields only
-- (no door codes, Wi-Fi, owner or tenant data, internal notes).
create or replace function public.get_public_selection(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sel public.selections;
  v_org public.organizations;
  v_apts jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]{8,40}$' then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  select * into v_sel from public.selections where slug = p_slug and is_active;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  select * into v_org from public.organizations where id = v_sel.organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'slug', a.slug,
      'title', a.name,
      'transaction_type', a.transaction_type,
      'price', case when a.transaction_type = 'sale' then a.sale_price else a.monthly_rent end,
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
                   from jsonb_array_elements(coalesce(a.photos, '[]'::jsonb)) with ordinality as p(value, n)
                  where p.n <= 4),
      'agent_phone', a.agent_phone
    ) order by s.n), '[]'::jsonb)
    into v_apts
    from unnest(v_sel.apartment_ids) with ordinality as s(id, n)
    join public.apartments a on a.id = s.id
   where a.organization_id = v_sel.organization_id
     and coalesce(a.is_archived, false) = false
     and a.status <> 'archived'
     and a.is_published;

  if jsonb_array_length(v_apts) = 0 then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'selection', jsonb_build_object('client_name', v_sel.client_name, 'created_at', v_sel.created_at),
    'apartments', v_apts,
    'agency', jsonb_build_object(
      'name', v_org.name, 'phone', v_org.contact_phone, 'logo_url', v_org.logo_url,
      'brand_color', v_org.brand_color, 'fx_rate', v_org.fx_rate));
end;
$$;
revoke execute on function public.get_public_selection(text) from public;
grant execute on function public.get_public_selection(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Link statistics used by the app (views, WhatsApp and call clicks)
--    Written next to the existing link_events columns; record_link_event stays as is.
-- -----------------------------------------------------------------------------
alter table public.link_events add column if not exists visitor text;
alter table public.link_events add column if not exists selection_id uuid;
create index if not exists idx_link_events_selection on public.link_events (selection_id) where selection_id is not null;
create index if not exists idx_link_events_apt_visitor on public.link_events (apartment_id, visitor, kind, created_at desc);

-- Anonymous event logging with dedup and a rate limit:
--  * the same visitor counts once per 30 min for views and once per 2 min for clicks;
--  * at most 600 events per listing per hour and 60 per visitor per hour.
create or replace function public.track_link_event(p_ref text, p_kind text, p_visitor text default null, p_selection_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_id uuid;
  v_apt public.apartments;
  v_visitor text := nullif(left(regexp_replace(coalesce(p_visitor, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_window interval;
begin
  if p_kind not in ('view', 'whatsapp', 'call') or v_ref = '' or length(v_ref) > 100 then return false; end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id := v_ref::uuid; end if;

  select * into v_apt from public.apartments
  where (slug = v_ref or public_slug = v_ref or id = v_id)
    and coalesce(is_archived, false) = false and status <> 'archived' and is_published
  limit 1;
  if not found then return false; end if;

  -- Team members previewing their own listing are not counted.
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

  insert into public.link_events (organization_id, apartment_id, selection_id, kind, visitor, visitor_id)
  values (v_apt.organization_id, v_apt.id, p_selection_id, p_kind, v_visitor, coalesce(v_visitor, 'anonymous'));
  return true;
end;
$$;

-- Counters for the property page (organization members only).
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
    'visitors', count(distinct coalesce(visitor, visitor_id)) filter (where kind = 'view'),
    'whatsapp', count(*) filter (where kind = 'whatsapp'),
    'calls', count(*) filter (where kind = 'call'),
    'views_7d', count(*) filter (where kind = 'view' and created_at > now() - interval '7 days'),
    'last_view_at', max(created_at) filter (where kind = 'view')
  ) into v_out
  from public.link_events where apartment_id = p_apartment_id;
  return v_out;
end;
$$;

revoke execute on function public.track_link_event(text, text, text, uuid) from public;
revoke execute on function public.get_link_stats(uuid) from public, anon;
grant execute on function public.track_link_event(text, text, text, uuid) to anon, authenticated;
grant execute on function public.get_link_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Public listing: found by slug, public_slug or id; returns what the public
--    page reads. Never returns owner data, door codes, Wi-Fi, tenant or notes.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_listing(p_ref text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_apt public.apartments%rowtype;
  v_org public.organizations%rowtype;
  v_id uuid;
begin
  if v_ref = '' or length(v_ref) > 100 then
    return jsonb_build_object('success', false);
  end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_ref::uuid;
  end if;

  select * into v_apt from public.apartments
  where (slug = v_ref or public_slug = v_ref or id = v_id)
    and coalesce(is_archived, false) = false
    and status <> 'archived'
    and is_published
  limit 1;
  if not found then
    return jsonb_build_object('success', false);
  end if;

  select * into v_org from public.organizations where id = v_apt.organization_id;

  return jsonb_build_object(
    'success', true,
    'apartment', jsonb_build_object(
      'id', v_apt.id,
      'slug', v_apt.slug,
      'public_slug', v_apt.public_slug,
      'name', v_apt.name,
      'address', v_apt.address,
      'city', v_apt.city,
      'district', v_apt.district,
      'transaction_type', coalesce(v_apt.transaction_type, case when v_apt.rental_type = 'short_term' then 'daily' else 'long_term' end),
      'property_type', coalesce(v_apt.property_type, 'apartment'),
      'sale_price', v_apt.sale_price,
      'price_sqm', v_apt.price_sqm,
      'bathrooms', coalesce(v_apt.bathrooms, 1),
      'rooms', coalesce(v_apt.rooms, v_apt.bedrooms),
      'bedrooms', v_apt.bedrooms,
      'floor', v_apt.floor,
      'total_floors', v_apt.total_floors,
      'area_sqm', v_apt.area_sqm,
      'monthly_rent', v_apt.monthly_rent,
      'currency', coalesce(v_apt.currency, 'USD'),
      'rental_type', v_apt.rental_type,
      'pets_allowed', coalesce(v_apt.pets_allowed, false),
      'utilities_estimate', v_apt.utilities_estimate,
      'prepayment_terms', v_apt.prepayment_terms,
      'deposit_amount', v_apt.deposit_amount,
      'checkin_time', v_apt.checkin_time,
      'checkout_time', v_apt.checkout_time,
      'agent_phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone),
      'photos', coalesce(v_apt.photos, '[]'::jsonb),
      'description', v_apt.description,
      'description_en', v_apt.description_en,
      'amenities', coalesce(v_apt.amenities, '[]'::jsonb),
      'badge', v_apt.badge,
      'lat', v_apt.lat,
      'lng', v_apt.lng,
      'status', v_apt.status,
      'updated_at', v_apt.updated_at
    ),
    'agency', jsonb_build_object(
      'name', v_org.name,
      'logo_url', v_org.logo_url,
      'brand_color', v_org.brand_color,
      'agent_name', coalesce(nullif(v_apt.agent_name, ''), v_org.agent_display_name),
      'phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone)
    )
  );
end;
$function$;
revoke execute on function public.get_public_listing(text) from public;
grant execute on function public.get_public_listing(text) to anon, authenticated;
