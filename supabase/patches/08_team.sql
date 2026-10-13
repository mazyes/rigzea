-- =============================================================================
-- RIGZEA patch 08 — Team: commission splits, the agent role and saved documents
--   1. Columns the app already writes (deal criteria, FX rate) and the contracts table.
--   2. Commission split between the listing agent, the selling agent and the agency.
--   3. Role "agent": sees the shared inventory, works only with own deals and contacts.
--      A property owner's contact becomes visible to an agent once the agent has a
--      viewing scheduled for that property. Finances and team settings stay closed.
-- Additive: no table, column or row is removed. Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns and tables the app expects
-- -----------------------------------------------------------------------------
alter table public.deals add column if not exists criteria jsonb not null default '{}'::jsonb;
alter table public.organizations add column if not exists fx_rate numeric(10,4);

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
revoke all on public.contracts from anon;
grant select, insert, update, delete on public.contracts to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Commission split
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists listing_agent_id uuid references public.organization_members(id) on delete set null;

alter table public.deals add column if not exists listing_agent_id uuid references public.organization_members(id) on delete set null;
alter table public.deals add column if not exists selling_agent_id uuid references public.organization_members(id) on delete set null;
alter table public.deals add column if not exists listing_split numeric(5,2) not null default 25;
alter table public.deals add column if not exists selling_split numeric(5,2) not null default 25;
alter table public.deals add column if not exists listing_paid boolean not null default false;
alter table public.deals add column if not exists selling_paid boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_split_check') then
    alter table public.deals add constraint deals_split_check
      check (listing_split >= 0 and selling_split >= 0 and listing_split + selling_split <= 100);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Role "agent"
--    Existing policies are changed in place (ALTER POLICY); nothing is dropped
--    except the two role lists, which are replaced by longer ones.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'organization_members_role_check' and pg_get_constraintdef(oid) not like '%agent%') then
    alter table public.organization_members drop constraint organization_members_role_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organization_members_role_check') then
    alter table public.organization_members add constraint organization_members_role_check
      check (role in ('owner', 'admin', 'manager', 'agent', 'staff'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'invitations_role_check' and pg_get_constraintdef(oid) not like '%agent%') then
    alter table public.invitations drop constraint invitations_role_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitations_role_check') then
    alter table public.invitations add constraint invitations_role_check
      check (role in ('admin', 'manager', 'agent', 'staff'));
  end if;
end $$;

create or replace function public.is_org_agent(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role = 'agent');
$$;

-- True when the current user has a viewing (open or done) for this property.
create or replace function public.agent_has_viewing(p_apartment uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.tasks t
    where t.apartment_id = p_apartment and t.type = 'viewing' and t.status <> 'cancelled'
      and (t.created_by = auth.uid() or t.assigned_to = public.my_member_id(t.organization_id)));
$$;

-- An agent sees a contact they own, or the owner of a property they have a viewing for.
create or replace function public.agent_can_see_contact(p_contact uuid, p_org uuid, p_assigned uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_org_agent(p_org) and (
    p_assigned = public.my_member_id(p_org)
    or exists (select 1 from public.apartments a where a.owner_id = p_contact and public.agent_has_viewing(a.id)));
$$;

revoke execute on function public.is_org_agent(uuid) from public, anon;
revoke execute on function public.agent_has_viewing(uuid) from public, anon;
revoke execute on function public.agent_can_see_contact(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_org_agent(uuid) to authenticated;
grant execute on function public.agent_has_viewing(uuid) to authenticated;
grant execute on function public.agent_can_see_contact(uuid, uuid, uuid) to authenticated;

-- Split percentages and payout marks are set by managers only.
create or replace function public.deals_split_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_org_manager(new.organization_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.listing_split := 25; new.selling_split := 25; new.listing_paid := false; new.selling_paid := false;
  else
    new.listing_agent_id := old.listing_agent_id; new.selling_agent_id := old.selling_agent_id;
    new.listing_split := old.listing_split; new.selling_split := old.selling_split;
    new.listing_paid := old.listing_paid; new.selling_paid := old.selling_paid;
  end if;
  return new;
end $$;
revoke execute on function public.deals_split_guard() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_deals_split_guard' and tgrelid = 'public.deals'::regclass) then
    create trigger trg_deals_split_guard before insert or update on public.deals
      for each row execute function public.deals_split_guard();
  end if;
end $$;

-- Sets each policy's rule: changes it in place when it exists, creates it otherwise.
-- What an agent gets:
--   properties  the whole inventory to read; write only own listings
--   contacts    own contacts, plus the owner of a property once a viewing is scheduled
--   deals       the ones they created or are named on
--   tasks       the ones they created or are assigned to
--   documents   their own
-- Finance, approvals, invitations, team and workspace settings stay manager / admin only.
do $$
declare
  r record;
  mgr constant text := 'public.is_org_manager(organization_id)';
  agt constant text := 'public.is_org_agent(organization_id)';
  me constant text := 'public.my_member_id(organization_id)';
  own_deal constant text := '(created_by = auth.uid() or public.my_member_id(organization_id) in (assigned_agent_id, listing_agent_id, selling_agent_id))';
begin
  for r in select * from (values
    ('apartments', 'apartments_select', 'select',
      mgr || ' or ' || agt || ' or owner_id in (select public.my_owner_ids()) or exists (select 1 from public.tasks t where t.apartment_id = apartments.id and t.status in (''assigned'', ''in_progress'', ''blocked'') and t.assigned_to = public.my_member_id(apartments.organization_id))'),
    ('apartments', 'apartments_insert', 'insert', mgr || ' or (' || agt || ' and listing_agent_id = ' || me || ')'),
    ('apartments', 'apartments_update', 'update', mgr || ' or (' || agt || ' and listing_agent_id = ' || me || ')'),
    ('owners', 'owners_select', 'select', mgr || ' or user_id = auth.uid() or public.agent_can_see_contact(id, organization_id, assigned_to)'),
    ('owners', 'owners_insert', 'insert', mgr || ' or (' || agt || ' and assigned_to = ' || me || ')'),
    ('owners', 'owners_update', 'update', mgr || ' or (' || agt || ' and assigned_to = ' || me || ')'),
    ('deals', 'deals_select', 'select', mgr || ' or (' || agt || ' and ' || own_deal || ')'),
    ('deals', 'deals_insert', 'insert', mgr || ' or (' || agt || ' and created_by = auth.uid())'),
    ('deals', 'deals_update', 'update', mgr || ' or (' || agt || ' and ' || own_deal || ')'),
    ('tasks', 'tasks_select', 'select', mgr || ' or assigned_to = ' || me || ' or (' || agt || ' and created_by = auth.uid())'),
    ('tasks', 'tasks_insert', 'insert', mgr || ' or (' || agt || ' and created_by = auth.uid())'),
    ('tasks', 'tasks_update', 'update', mgr || ' or (' || agt || ' and (created_by = auth.uid() or assigned_to = ' || me || '))'),
    ('activity_events', 'activity_events_insert', 'insert', mgr || ' or ' || agt),
    ('contracts', 'contracts_select', 'select', mgr || ' or (' || agt || ' and created_by = auth.uid())'),
    ('contracts', 'contracts_insert', 'insert', mgr || ' or (' || agt || ' and created_by = auth.uid())'),
    ('contracts', 'contracts_update', 'update', mgr || ' or (' || agt || ' and created_by = auth.uid())'),
    ('contracts', 'contracts_delete', 'delete', 'public.is_org_admin(organization_id)')
  ) as t(tbl, pol, cmd, rule)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      execute format('alter policy %I on public.%I %s (%s)', r.pol, r.tbl, case when r.cmd = 'insert' then 'with check' else 'using' end, r.rule);
    else
      execute format('create policy %I on public.%I for %s %s (%s)', r.pol, r.tbl, r.cmd, case when r.cmd = 'insert' then 'with check' else 'using' end, r.rule);
    end if;
  end loop;
end $$;
