-- =============================================================================
-- RIGZEA patch 08 — Team: commission splits, the agent role and saved documents
--   1. Columns the app already writes (deal criteria, FX rate) and the contracts table.
--   2. Commission split between the listing agent, the selling agent and the agency.
--   3. Role "agent": sees the shared inventory, works only with own deals and contacts.
--      A property owner's contact becomes visible to an agent once the agent has a
--      viewing scheduled for that property. Finances and team settings stay closed.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
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
-- -----------------------------------------------------------------------------
do $$
begin
  alter table public.organization_members drop constraint if exists organization_members_role_check;
  alter table public.organization_members add constraint organization_members_role_check
    check (role in ('owner', 'admin', 'manager', 'agent', 'staff'));
  alter table public.invitations drop constraint if exists invitations_role_check;
  alter table public.invitations add constraint invitations_role_check
    check (role in ('admin', 'manager', 'agent', 'staff'));
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

-- Properties: the whole inventory is shared with agents; they edit only their own listings.
drop policy if exists apartments_select on public.apartments;
create policy apartments_select on public.apartments for select using (
  public.is_org_manager(organization_id)
  or public.is_org_agent(organization_id)
  or owner_id in (select public.my_owner_ids())
  or exists (select 1 from public.tasks t
    where t.apartment_id = apartments.id and t.status in ('assigned', 'in_progress', 'blocked')
      and t.assigned_to = public.my_member_id(apartments.organization_id)));
drop policy if exists apartments_insert on public.apartments;
create policy apartments_insert on public.apartments for insert with check (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and listing_agent_id = public.my_member_id(organization_id)));
drop policy if exists apartments_update on public.apartments;
create policy apartments_update on public.apartments for update using (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and listing_agent_id = public.my_member_id(organization_id)));

-- Contacts: own contacts, plus the owner of a property once a viewing is scheduled.
drop policy if exists owners_select on public.owners;
create policy owners_select on public.owners for select using (
  public.is_org_manager(organization_id)
  or user_id = auth.uid()
  or public.agent_can_see_contact(id, organization_id, assigned_to));
drop policy if exists owners_insert on public.owners;
create policy owners_insert on public.owners for insert with check (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and assigned_to = public.my_member_id(organization_id)));
drop policy if exists owners_update on public.owners;
create policy owners_update on public.owners for update using (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and assigned_to = public.my_member_id(organization_id)));

-- Deals: an agent works with deals they created or are named on.
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select using (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and (
    created_by = auth.uid()
    or public.my_member_id(organization_id) in (assigned_agent_id, listing_agent_id, selling_agent_id))));
drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert with check (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and created_by = auth.uid()));
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update using (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and (
    created_by = auth.uid()
    or public.my_member_id(organization_id) in (assigned_agent_id, listing_agent_id, selling_agent_id))));

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
revoke execute on function public.deals_split_guard() from public, anon;
drop trigger if exists trg_deals_split_guard on public.deals;
create trigger trg_deals_split_guard before insert or update on public.deals
  for each row execute function public.deals_split_guard();

-- Tasks: agents create viewings and follow-ups and see the ones they created.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select using (
  public.is_org_manager(organization_id)
  or assigned_to = public.my_member_id(organization_id)
  or (public.is_org_agent(organization_id) and created_by = auth.uid()));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert with check (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and created_by = auth.uid()));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update using (
  public.is_org_manager(organization_id)
  or (public.is_org_agent(organization_id) and (created_by = auth.uid() or assigned_to = public.my_member_id(organization_id))));

-- Activity log entries written by agents.
drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events for insert with check (
  public.is_org_manager(organization_id) or public.is_org_agent(organization_id));

-- Saved documents: managers see all, agents their own.
drop policy if exists contracts_select on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_update on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_select on public.contracts for select using (
  public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
create policy contracts_insert on public.contracts for insert with check (
  public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
create policy contracts_update on public.contracts for update using (
  public.is_org_manager(organization_id) or (public.is_org_agent(organization_id) and created_by = auth.uid()));
create policy contracts_delete on public.contracts for delete using (public.is_org_admin(organization_id));
