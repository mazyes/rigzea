-- =============================================================================
-- 04_plans.sql — pricing plans, 14-day trial, white-label columns, platform admin.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
--
-- Plans (organizations.plan): trial | starter | pro | top | agency
--   trial   14 days, Top-level access: 50 apartments, 3 seats, every feature
--   starter 10 apartments, 1 seat          (free forever)
--   pro     50 apartments, 1 seat
--   top     150 apartments, 3 seats
--   agency  unlimited apartments / seats
-- "seat" = organization member with role owner/admin/manager (field staff are free).
-- After a trial ends the workspace is LOCKED: data stays readable, no new apartments
-- or invitations. A paid plan whose plan_expires_at passed falls back to starter.
--
-- ACTIVATING A CUSTOMER MANUALLY (no payment provider):
--   1. Once, make yourself platform admin (SQL editor):
--        insert into public.platform_admins (user_id)
--        select id from auth.users where email = 'YOU@example.com' on conflict do nothing;
--   2. In the app: Settings -> "პლატფორმა" tab -> pick the plan and days -> save.
--      Or in SQL:  select public.admin_set_org_plan('<org uuid>', 'pro', 30);
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
do $$
declare v_fresh boolean;
begin
  v_fresh := not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'trial_ends_at');

  alter table public.organizations add column if not exists trial_ends_at timestamptz;
  alter table public.organizations add column if not exists plan_expires_at timestamptz;
  alter table public.organizations add column if not exists brand_color text;
  alter table public.organizations add column if not exists agent_display_name text;
  alter table public.organizations add column if not exists logo_url text;
  alter table public.organizations alter column plan set default 'trial';

  -- First run only: workspaces created before plans existed get a fresh 14-day trial.
  if v_fresh then
    update public.organizations set plan = 'trial', trial_ends_at = now() + interval '14 days'
    where plan is null or plan = 'starter';
  end if;
end $$;

update public.organizations set plan = 'trial' where plan is null or plan not in ('trial', 'starter', 'pro', 'top', 'agency');

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_plan_check') then
    alter table public.organizations add constraint organizations_plan_check check (plan in ('trial', 'starter', 'pro', 'top', 'agency'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_brand_color_check') then
    alter table public.organizations add constraint organizations_brand_color_check check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Platform admins (the product owner). No RLS policies: reachable only via RPCs.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- 3. Plan helpers
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. Server-side caps
-- ----------------------------------------------------------------------------
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
drop trigger if exists trg_apartments_plan on public.apartments;
create trigger trg_apartments_plan before insert or update of status, is_archived on public.apartments
  for each row execute function public.enforce_apartment_plan();

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
drop trigger if exists trg_invitations_plan on public.invitations;
create trigger trg_invitations_plan before insert on public.invitations
  for each row execute function public.enforce_seat_plan();

-- ----------------------------------------------------------------------------
-- 5. Plan columns can only be changed by a platform admin (or the SQL editor)
-- ----------------------------------------------------------------------------
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
drop trigger if exists trg_organizations_plan on public.organizations;
create trigger trg_organizations_plan before insert or update on public.organizations
  for each row execute function public.protect_org_plan();

-- ----------------------------------------------------------------------------
-- 6. create_user_organization: same logic as schema.sql + 14-day trial
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 7. Platform-admin RPCs
-- ----------------------------------------------------------------------------
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

-- p_days: trial -> trial ends in p_days (default 14); paid plans -> extends plan_expires_at by p_days
-- (from today or from the current expiry, whichever is later); NULL = no expiry. starter ignores it.
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

-- ----------------------------------------------------------------------------
-- 8. Permissions (new functions default to PUBLIC execute in Supabase)
-- ----------------------------------------------------------------------------
revoke execute on function public.is_platform_admin(), public.org_effective_plan(uuid), public.plan_limit(text, text),
  public.admin_list_orgs(), public.admin_set_org_plan(uuid, text, integer),
  public.create_user_organization(text, text, text, text) from public, anon;
grant execute on function public.is_platform_admin(), public.org_effective_plan(uuid), public.plan_limit(text, text),
  public.admin_list_orgs(), public.admin_set_org_plan(uuid, text, integer),
  public.create_user_organization(text, text, text, text) to authenticated;
