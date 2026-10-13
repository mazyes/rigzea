-- =============================================================================
-- RIGZEA patch 12 — Granting platform admin rights
--   Platform admins activate plans for every workspace, so the right is given
--   in exactly two ways:
--     a) from the Supabase SQL editor (the project owner), for the first admin:
--          select public.grant_platform_admin('you@example.com');
--     b) by an existing platform admin, from the "პლატფორმა" tab.
--   No signed-in user can give the right to themselves, the table is closed to
--   the API, and every grant, removal and plan change is written to a log.
--   Removing an admin marks the row as revoked; nothing is deleted.
-- Additive. Safe to run more than once.
-- =============================================================================

alter table public.platform_admins add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.platform_admins add column if not exists revoked_at timestamptz;
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create table if not exists public.platform_admin_log (
  id bigint generated always as identity primary key,
  action text not null,
  actor_id uuid,
  target_user_id uuid,
  target_org_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_admin_log enable row level security;
revoke all on public.platform_admin_log from public, anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and revoked_at is null);
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- True for an active platform admin, or for the project owner working in the SQL editor
-- (no signed-in user and a database role that the API never uses).
create or replace function public.platform_admin_caller_ok()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin()
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$$;
revoke execute on function public.platform_admin_caller_ok() from public, anon, authenticated;

create or replace function public.grant_platform_admin(p_email text)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_target uuid; v_confirmed timestamptz; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  select id, email_confirmed_at into v_target, v_confirmed from auth.users where lower(email) = v_email;
  if v_target is null then raise exception 'ამ ელფოსტით მომხმარებელი ვერ მოიძებნა.' using errcode = 'P0001'; end if;
  if v_confirmed is null then raise exception 'ამ მომხმარებელს ელფოსტა დადასტურებული არ აქვს.' using errcode = 'P0001'; end if;
  insert into public.platform_admins (user_id, granted_by) values (v_target, auth.uid())
    on conflict (user_id) do update set revoked_at = null, granted_by = excluded.granted_by;
  insert into public.platform_admin_log (action, actor_id, target_user_id, detail)
    values ('grant', auth.uid(), v_target, jsonb_build_object('email', v_email));
  return jsonb_build_object('user_id', v_target, 'email', v_email);
end $$;

create or replace function public.revoke_platform_admin(p_email text)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_target uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is null or not exists (select 1 from public.platform_admins where user_id = v_target and revoked_at is null) then
    raise exception 'ამ ელფოსტით პლატფორმის ადმინი ვერ მოიძებნა.' using errcode = 'P0001';
  end if;
  -- An admin cannot leave the platform without any admin; the SQL editor can.
  if auth.uid() is not null and (select count(*) from public.platform_admins where revoked_at is null) <= 1 then
    raise exception 'ბოლო ადმინის უფლების მოხსნა შეუძლებელია.' using errcode = 'P0001';
  end if;
  update public.platform_admins set revoked_at = now() where user_id = v_target;
  insert into public.platform_admin_log (action, actor_id, target_user_id, detail)
    values ('revoke', auth.uid(), v_target, jsonb_build_object('email', v_email));
  return jsonb_build_object('user_id', v_target, 'email', v_email);
end $$;

create or replace function public.list_platform_admins()
returns table (user_id uuid, email text, granted_at timestamptz, granted_by_email text)
language plpgsql stable security definer set search_path to 'public', 'auth' as $$
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, a.created_at, g.email::text
    from public.platform_admins a
    join auth.users u on u.id = a.user_id
    left join auth.users g on g.id = a.granted_by
    where a.revoked_at is null
    order by a.created_at;
end $$;

revoke execute on function public.grant_platform_admin(text) from public, anon;
revoke execute on function public.revoke_platform_admin(text) from public, anon;
revoke execute on function public.list_platform_admins() from public, anon;
grant execute on function public.grant_platform_admin(text) to authenticated;
grant execute on function public.revoke_platform_admin(text) to authenticated;
grant execute on function public.list_platform_admins() to authenticated;

-- Plan changes are logged too.
create or replace function public.admin_set_org_plan(p_org uuid, p_plan text, p_days integer default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org public.organizations; v_old text;
begin
  if not public.is_platform_admin() then raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501'; end if;
  if p_plan not in ('trial', 'starter', 'pro', 'top', 'agency') then raise exception 'უცნობი პაკეტი: %', p_plan; end if;
  select plan into v_old from public.organizations where id = p_org;
  update public.organizations set
    plan = p_plan,
    trial_ends_at = case when p_plan = 'trial' then now() + make_interval(days => coalesce(p_days, 14)) else trial_ends_at end,
    plan_expires_at = case when p_plan in ('trial', 'starter') then null
                           when p_days is null then null
                           else greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => p_days) end,
    updated_at = now()
  where id = p_org returning * into v_org;
  if not found then raise exception 'სამუშაო სივრცე ვერ მოიძებნა.'; end if;
  insert into public.platform_admin_log (action, actor_id, target_org_id, detail)
    values ('set_plan', auth.uid(), p_org, jsonb_build_object('from', v_old, 'to', p_plan, 'days', p_days));
  return jsonb_build_object('id', v_org.id, 'plan', v_org.plan, 'trial_ends_at', v_org.trial_ends_at, 'plan_expires_at', v_org.plan_expires_at);
end $$;
revoke execute on function public.admin_set_org_plan(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_org_plan(uuid, text, integer) to authenticated;
