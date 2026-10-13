-- =============================================================================
-- RIGZEA patch 10 — Free plan: 3 active properties, and the ways around the limit
--   1. The free ("starter") plan holds 3 active properties (was 10).
--   2. Moving a property in from another workspace is checked like adding one.
--   3. One trial per account: a second workspace cannot be opened to get a new trial.
-- Additive: no table, column or row is removed. Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Limits per plan (mirrors PLANS in rigzea/app/app.js)
-- -----------------------------------------------------------------------------
create or replace function public.plan_limit(p_plan text, p_kind text)
returns integer language sql immutable as $$
  select case p_kind
    when 'apartments' then case p_plan when 'trial' then 50 when 'starter' then 3 when 'pro' then 50 when 'top' then 150 when 'agency' then null else 0 end
    when 'seats' then case p_plan when 'trial' then 3 when 'starter' then 1 when 'pro' then 1 when 'top' then 3 when 'agency' then null else 0 end
  end;
$$;

-- -----------------------------------------------------------------------------
-- 2. The property limit also covers a property moved between workspaces
-- -----------------------------------------------------------------------------
create or replace function public.enforce_apartment_plan()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_plan text; v_cap integer; v_count integer;
begin
  if auth.uid() is null then return new; end if;
  if new.status = 'archived' or coalesce(new.is_archived, false) then return new; end if;
  -- An edit that neither reactivates the property nor moves it to another workspace adds nothing.
  if tg_op = 'UPDATE' and new.organization_id = old.organization_id
     and not (old.status = 'archived' or coalesce(old.is_archived, false)) then return new; end if;
  v_plan := public.org_effective_plan(new.organization_id);
  v_cap := public.plan_limit(v_plan, 'apartments');
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('apt-plan-' || new.organization_id::text));
  select count(*) into v_count from public.apartments
    where organization_id = new.organization_id and status <> 'archived' and coalesce(is_archived, false) = false and id <> new.id;
  if v_count + 1 > v_cap then
    raise exception 'ობიექტების ლიმიტი ამოიწურა: შენს პაკეტში მაქსიმუმ % აქტიური ობიექტია. გადადი უფრო მაღალ პაკეტზე.', v_cap using errcode = 'P0001', hint = 'PLAN_LIMIT_APARTMENTS';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_apartment_plan() from public, anon, authenticated;

create or replace trigger trg_apartments_plan
  before insert or update of status, is_archived, organization_id on public.apartments
  for each row execute function public.enforce_apartment_plan();

-- -----------------------------------------------------------------------------
-- 3. One trial per account
--    trial_grants remembers who has already opened a workspace, so the record
--    survives a later role change inside that workspace.
-- -----------------------------------------------------------------------------
create table if not exists public.trial_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.trial_grants enable row level security;
revoke all on public.trial_grants from public, anon, authenticated;

insert into public.trial_grants (user_id, organization_id)
  select distinct on (m.user_id) m.user_id, m.organization_id
  from public.organization_members m
  where m.role = 'owner' and m.user_id is not null
  order by m.user_id, m.created_at
on conflict (user_id) do nothing;

create or replace function public.create_user_organization(p_org_name text, p_city text default 'თბილისი', p_portfolio_size text default '6-20', p_display_name text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_user uuid := auth.uid(); v_org uuid; v_email text; v_name text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('new-org-' || v_user::text));
  if exists (select 1 from public.trial_grants where user_id = v_user)
     or exists (select 1 from public.organization_members where user_id = v_user and role = 'owner') then
    raise exception 'ამ ანგარიშს უკვე აქვს სამუშაო სივრცე. საცდელი პერიოდი ერთ ანგარიშზე ერთხელ გაიცემა.' using errcode = 'P0001', hint = 'ONE_WORKSPACE';
  end if;
  select email, raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = v_user;
  v_name := coalesce(p_display_name, v_name, split_part(v_email, '@', 1), 'მმართველი');
  insert into public.organizations (name, city, portfolio_size, contact_email, plan, trial_ends_at)
    values (coalesce(nullif(trim(p_org_name), ''), 'ჩემი კომპანია'), p_city, p_portfolio_size, v_email, 'trial', now() + interval '14 days') returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, display_name) values (v_org, v_user, 'owner', v_name);
  insert into public.trial_grants (user_id, organization_id) values (v_user, v_org);
  insert into public.activity_events (organization_id, actor_id, actor_name, event_type, title) values (v_org, v_user, v_name, 'organization_created', 'სამუშაო სივრცე შეიქმნა');
  return v_org;
end $$;
revoke execute on function public.create_user_organization(text, text, text, text) from public, anon;
grant execute on function public.create_user_organization(text, text, text, text) to authenticated;
