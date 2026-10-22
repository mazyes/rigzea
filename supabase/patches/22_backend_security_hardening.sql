-- 22_backend_security_hardening.sql
-- Close direct anonymous writes and enforce organization membership on browser inserts.
-- Also make KISA payment activation atomic and align the paid starter plan with the app.

-- Anonymous clients use public RPCs; they do not need direct table mutations.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

create or replace function public.get_user_org_ids(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select m.organization_id
    from public.organization_members m
   where p_user_id = (select auth.uid())
     and m.user_id = (select auth.uid());
$$;

create or replace function public.is_org_member(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p_user_id = (select auth.uid())
     and exists (
       select 1 from public.organization_members m
        where m.organization_id = p_org_id and m.user_id = (select auth.uid())
     );
$$;

-- Organization membership is created only by the protected organization/invitation RPCs.
revoke insert on public.organization_members from anon, authenticated;
drop policy if exists members_insert on public.organization_members;

drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members
  for update to authenticated
  using (public.is_org_admin(organization_id) and role <> 'owner')
  with check (public.is_org_admin(organization_id) and role in ('admin', 'manager', 'agent', 'staff'));

-- Every direct browser insert must belong to the caller's existing organization membership.
drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events
  for insert to authenticated
  with check (
    public.is_org_member(organization_id, (select auth.uid()))
    and actor_id = (select auth.uid())
  );

drop policy if exists apartments_insert on public.apartments;
create policy apartments_insert on public.apartments
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists condition_reports_insert on public.condition_reports;
create policy condition_reports_insert on public.condition_reports
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists contracts_insert on public.contracts;
create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists income_insert on public.income;
create policy income_insert on public.income
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.is_org_admin(organization_id)
    and invited_by = (select auth.uid())
    and role in ('admin', 'manager', 'agent', 'staff')
  );

drop policy if exists monthly_reports_insert on public.monthly_reports;
create policy monthly_reports_insert on public.monthly_reports
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists owners_insert on public.owners;
create policy owners_insert on public.owners
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists repairs_insert on public.repairs;
create policy repairs_insert on public.repairs
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

drop policy if exists selections_insert on public.selections;
create policy selections_insert on public.selections
  for insert to authenticated
  with check (
    public.is_org_manager(organization_id)
    or (public.is_org_agent(organization_id) and created_by = (select auth.uid()))
  );

drop policy if exists share_links_insert on public.share_links;
create policy share_links_insert on public.share_links
  for insert to authenticated
  with check (public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_org_member(organization_id, (select auth.uid())));

-- Storage object writes must stay under an organization folder the caller belongs to.
drop policy if exists "rigzea private upload" on storage.objects;
create policy "rigzea private upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));

drop policy if exists "rigzea public upload" on storage.objects;
create policy "rigzea public upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));

drop policy if exists "rigzea private update" on storage.objects;
create policy "rigzea private update" on storage.objects
  for update to authenticated
  using (bucket_id = 'rigzea-private' and public.can_write_org_folder(name))
  with check (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));

drop policy if exists "rigzea public update" on storage.objects;
create policy "rigzea public update" on storage.objects
  for update to authenticated
  using (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name))
  with check (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));

-- Reconcile patch 21's payment table in case it was not recorded as a migration.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  plan text not null,
  amount numeric(10, 2) not null,
  currency text not null default 'GEL',
  provider text not null default 'kisa',
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payments_org_created on public.payments (organization_id, created_at desc);
create unique index if not exists idx_payments_provider_order
  on public.payments (provider, provider_order_id) where provider_order_id is not null;
alter table public.payments enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.payments from anon, authenticated;
grant select on public.payments to authenticated, service_role;
drop policy if exists payments_org_member on public.payments;
create policy payments_org_member on public.payments
  for select to authenticated
  using (public.is_org_member(organization_id, (select auth.uid())));

-- Patch 21's original CHECK omitted the paid starter plan.
alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments
  add constraint payments_plan_check check (plan in ('starter', 'pro', 'top', 'agency'));

-- Serialize duplicate callbacks and only activate a pending, matching KISA payment once.
create or replace function public.activate_org_subscription(
  p_org uuid,
  p_plan text,
  p_days integer default 30,
  p_payment_id uuid default null,
  p_provider_payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_org public.organizations%rowtype;
  v_owner_email text;
  v_plan_name text;
begin
  if p_payment_id is null or p_days is distinct from 30 then
    raise exception 'invalid payment activation request' using errcode = '42501';
  end if;

  select * into v_payment
    from public.payments
   where id = p_payment_id
   for update;

  if not found
     or v_payment.provider <> 'kisa'
     or v_payment.organization_id <> p_org
     or v_payment.plan <> p_plan then
    raise exception 'payment does not match activation request' using errcode = '42501';
  end if;

  if v_payment.status = 'completed' then
    select * into v_org from public.organizations where id = p_org;
    return jsonb_build_object(
      'ok', true, 'already_completed', true, 'org_id', v_org.id,
      'plan', v_org.plan, 'plan_expires_at', v_org.plan_expires_at
    );
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'payment is not pending' using errcode = '42501';
  end if;

  update public.payments
     set status = 'completed',
         provider_payment_id = coalesce(nullif(p_provider_payment_id, ''), provider_payment_id),
         updated_at = now()
   where id = p_payment_id and status = 'pending';
  if not found then raise exception 'payment was already processed' using errcode = '42501'; end if;

  update public.organizations set
    plan = p_plan,
    plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days',
    updated_at = now()
  where id = p_org
  returning * into v_org;
  if not found then raise exception 'organization not found' using errcode = 'P0001'; end if;

  select u.email into v_owner_email
    from public.organization_members m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_org and m.role = 'owner'
   order by m.created_at limit 1;

  v_plan_name := case p_plan
    when 'starter' then 'დამწყები'
    when 'pro' then 'პრო აგენტი'
    when 'top' then 'გუნდი'
    when 'agency' then 'სააგენტო'
    else p_plan
  end;

  insert into public.activity_events (organization_id, event_type, title, metadata)
  values (p_org, 'plan_activated', 'პაკეტი გააქტიურდა: ' || v_plan_name || ' (30 დღე)',
          jsonb_build_object('plan', p_plan, 'days', 30, 'expires_at', v_org.plan_expires_at));

  return jsonb_build_object(
    'ok', true, 'org_id', v_org.id, 'plan', v_org.plan,
    'plan_expires_at', v_org.plan_expires_at, 'owner_email', v_owner_email
  );
end;
$$;

revoke all on function public.activate_org_subscription(uuid, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_org_subscription(uuid, text, integer, uuid, text) to service_role;

-- Serialize per-user rate checks; the caller cannot raise the hard-coded hourly cap.
create index if not exists idx_import_requests_created_at on public.import_requests (created_at);
create or replace function public.register_import(p_org uuid, p_limit integer default 10)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then return false; end if;
  if not public.is_org_member(p_org, v_user) then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  delete from public.import_requests where created_at < now() - interval '1 day';

  select count(*) into v_count
    from public.import_requests
   where user_id = v_user and created_at > now() - interval '1 hour';
  if v_count >= 10 then return false; end if;

  insert into public.import_requests (organization_id, user_id) values (p_org, v_user);
  return true;
end;
$$;
revoke all on function public.register_import(uuid, integer) from public, anon;
grant execute on function public.register_import(uuid, integer) to authenticated;
