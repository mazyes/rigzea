-- =============================================================================
-- RIGZEA (რიგზეა) - COMPLETE SUPABASE POSTGRESQL SCHEMA & RLS POLICIES
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. ORGANIZATIONS
create table if not exists public.organizations (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    city text default 'თბილისი',
    owner_id uuid references auth.users(id) on delete set null,
    settings jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- 2. ORGANIZATION MEMBERS
create table if not exists public.organization_members (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
    display_name text,
    created_at timestamp with time zone default now(),
    unique(organization_id, user_id)
);

-- 3. OWNERS (Property owners / clients)
create table if not exists public.owners (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    phone text,
    email text,
    telegram_chat_id text,
    payout_account text,
    notes text,
    created_at timestamp with time zone default now()
);

-- 4. APARTMENTS
create table if not exists public.apartments (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    owner_id uuid references public.owners(id) on delete set null,
    title text not null,
    address text not null,
    status text default 'active' check (status in ('active', 'maintenance', 'inactive', 'archived')),
    monthly_target numeric(10, 2) default 0,
    passcode text,
    wifi_ssid text,
    wifi_pass text,
    notes text,
    created_at timestamp with time zone default now()
);

-- 5. TASKS
create table if not exists public.tasks (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid references public.apartments(id) on delete cascade,
    title text not null,
    description text,
    category text default 'other' check (category in ('cleaning', 'repair', 'checkin', 'checkout', 'inspection', 'other')),
    priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
    status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_to text,
    due_date date,
    created_at timestamp with time zone default now(),
    completed_at timestamp with time zone
);

-- 6. REPAIRS
create table if not exists public.repairs (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    title text not null,
    description text,
    status text default 'pending' check (status in ('pending', 'in_progress', 'resolved')),
    estimated_cost numeric(10, 2) default 0,
    actual_cost numeric(10, 2) default 0,
    reported_date date default current_date,
    created_at timestamp with time zone default now()
);

-- 7. APPROVALS (Owner cost/repair approvals)
create table if not exists public.approvals (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    owner_id uuid references public.owners(id) on delete set null,
    title text not null,
    amount numeric(10, 2) not null default 0,
    description text,
    status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
    token text unique default encode(gen_random_bytes(16), 'hex'),
    receipt_url text,
    created_at timestamp with time zone default now(),
    responded_at timestamp with time zone
);

-- 8. EXPENSES
create table if not exists public.expenses (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    category text not null,
    amount numeric(10, 2) not null,
    description text,
    receipt_url text,
    expense_date date default current_date,
    created_by text,
    created_at timestamp with time zone default now()
);

-- 9. INCOME
create table if not exists public.income (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    source text not null default 'Airbnb',
    amount numeric(10, 2) not null,
    description text,
    income_date date default current_date,
    created_at timestamp with time zone default now()
);

-- 10. CONDITION REPORTS (Check-in/Check-out Inspections)
create table if not exists public.condition_reports (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    inspector_name text,
    report_type text default 'checkout' check (report_type in ('checkin', 'checkout', 'routine')),
    cleanliness_score integer check (cleanliness_score between 1 and 10),
    damages_found boolean default false,
    photos jsonb default '[]'::jsonb,
    notes text,
    created_at timestamp with time zone default now()
);

-- 11. MONTHLY REPORTS
create table if not exists public.monthly_reports (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid not null references public.apartments(id) on delete cascade,
    owner_id uuid references public.owners(id) on delete set null,
    month_year text not null,
    total_income numeric(10, 2) default 0,
    total_expenses numeric(10, 2) default 0,
    net_payout numeric(10, 2) default 0,
    report_json jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- 12. ACTIVITY EVENTS (Timeline)
create table if not exists public.activity_events (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    apartment_id uuid references public.apartments(id) on delete set null,
    actor_id uuid references auth.users(id) on delete set null,
    actor_name text,
    event_type text not null,
    title text not null,
    description text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- 13. NOTIFICATIONS
create table if not exists public.notifications (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    message text,
    type text default 'info',
    link text,
    is_read boolean default false,
    created_at timestamp with time zone default now()
);

-- 14. INVITATIONS
create table if not exists public.invitations (
    id uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    email text not null,
    role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
    status text default 'pending' check (status in ('pending', 'accepted', 'revoked')),
    created_at timestamp with time zone default now()
);

-- =============================================================================
-- INDEXES FOR MAXIMUM QUERY SPEED
-- =============================================================================
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(organization_id);
create index if not exists idx_apartments_org on public.apartments(organization_id);
create index if not exists idx_tasks_org on public.tasks(organization_id);
create index if not exists idx_tasks_apt on public.tasks(apartment_id);
create index if not exists idx_expenses_org on public.expenses(organization_id);
create index if not exists idx_income_org on public.income(organization_id);
create index if not exists idx_approvals_token on public.approvals(token);
create index if not exists idx_activity_events_org on public.activity_events(organization_id);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.owners enable row level security;
alter table public.apartments enable row level security;
alter table public.tasks enable row level security;
alter table public.repairs enable row level security;
alter table public.approvals enable row level security;
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.condition_reports enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;

-- Helper function: Check if user is member of organization
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

-- Generic org-based policies
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'owners', 'apartments', 'tasks', 'repairs', 'expenses', 'income',
    'condition_reports', 'monthly_reports', 'activity_events', 'invitations'
  ]) loop
    execute format('create policy if not exists "Org members access %1$s" on public.%1$s for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));', t);
  end loop;
end $$;

-- Organizations policies
create policy if not exists "Users can view orgs they belong to"
  on public.organizations for select
  using (exists (select 1 from public.organization_members where organization_id = organizations.id and user_id = auth.uid()));

create policy if not exists "Users can create orgs"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy if not exists "Org owners/admins can update org"
  on public.organizations for update
  using (exists (select 1 from public.organization_members where organization_id = organizations.id and user_id = auth.uid() and role in ('owner', 'admin')));

-- Organization Members policies
create policy if not exists "Users can view members of their orgs"
  on public.organization_members for select
  using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy if not exists "Users can join or add members"
  on public.organization_members for insert
  with check (user_id = auth.uid() or public.is_org_member(organization_id));

-- Approvals policies (public token viewing for owners who receive SMS/Telegram links)
create policy if not exists "Anyone with valid token can view approval"
  on public.approvals for select
  using (token is not null or public.is_org_member(organization_id));

create policy if not exists "Anyone with valid token can update approval status"
  on public.approvals for update
  using (token is not null or public.is_org_member(organization_id));

create policy if not exists "Org members can create approvals"
  on public.approvals for insert
  with check (public.is_org_member(organization_id));

-- Notifications policies
create policy if not exists "Users can read/update own notifications"
  on public.notifications for all
  using (user_id = auth.uid());

-- =============================================================================
-- 15. TELEGRAM BOT INTEGRATION & APPROVAL RPCS
-- =============================================================================

-- Telegram Chats Table
create table if not exists public.telegram_chats (
    chat_id bigint primary key,
    organization_id uuid references public.organizations(id) on delete cascade,
    user_name text,
    linked_at timestamp with time zone default now()
);

alter table public.telegram_chats enable row level security;
drop policy if exists "Allow all on telegram_chats" on public.telegram_chats;
create policy "Allow all on telegram_chats" on public.telegram_chats for all using (true) with check (true);

-- Link Telegram Chat RPC
create or replace function public.link_telegram_chat(p_chat_id bigint, p_org_id uuid, p_user_name text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_org public.organizations%rowtype;
begin
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Organization not found');
  end if;

  insert into public.telegram_chats (chat_id, organization_id, user_name, linked_at)
  values (p_chat_id, p_org_id, p_user_name, now())
  on conflict (chat_id) do update
  set organization_id = excluded.organization_id,
      user_name = coalesce(excluded.user_name, public.telegram_chats.user_name),
      linked_at = now();

  return jsonb_build_object(
    'success', true,
    'org_id', v_org.id,
    'org_name', v_org.name,
    'city', v_org.city
  );
end;
$$;

-- Get Linked Telegram Org RPC
create or replace function public.get_linked_telegram_org(p_chat_id bigint)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_rec record;
begin
  select tc.chat_id, tc.organization_id, o.name as org_name, o.city
  into v_rec
  from public.telegram_chats tc
  join public.organizations o on o.id = tc.organization_id
  where tc.chat_id = p_chat_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'orgId', v_rec.organization_id,
    'orgName', v_rec.org_name,
    'city', v_rec.city
  );
end;
$$;

-- Get Telegram Org RPC
create or replace function public.get_telegram_org(p_org_id uuid)
returns table (
  id uuid,
  name text,
  city text
)
language sql
security definer
as $$
  select id, name, city
  from public.organizations
  where id = p_org_id;
$$;

-- Get Telegram Apartments RPC
create or replace function public.get_telegram_apartments(p_org_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  unit_number text,
  status text
)
language sql
security definer
as $$
  select 
    id,
    name,
    address,
    unit_number,
    status
  from public.apartments
  where organization_id = p_org_id and coalesce(is_archived, false) = false
  order by created_at desc;
$$;

-- Telegram Create Task Record RPC
create or replace function public.telegram_create_task_record(
  p_org_id uuid,
  p_apt_id uuid,
  p_title text,
  p_description text,
  p_cost numeric default 0,
  p_source text default 'Telegram'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_task_id uuid;
  v_repair_id uuid;
  v_owner_id uuid;
  v_approval_id uuid;
  v_token text;
begin
  select owner_id into v_owner_id from public.apartments where id = p_apt_id;

  insert into public.tasks (
    organization_id, apartment_id, title, description, type, priority, status
  ) values (
    p_org_id, p_apt_id, p_title, p_description, 'repair', 'high', 'pending'
  ) returning id into v_task_id;

  if coalesce(p_cost, 0) > 0 then
    v_token := encode(gen_random_bytes(16), 'hex');

    insert into public.repairs (
      organization_id, apartment_id, task_id, issue, description,
      estimate_amount, requires_owner_approval, approval_status, status
    ) values (
      p_org_id, p_apt_id, v_task_id, p_title, p_description,
      p_cost, true, 'pending', 'pending'
    ) returning id into v_repair_id;

    insert into public.approvals (
      organization_id, apartment_id, repair_id, owner_id, amount,
      description, token, status
    ) values (
      p_org_id, p_apt_id, v_repair_id, v_owner_id, p_cost,
      p_description, v_token, 'pending'
    ) returning id into v_approval_id;
  end if;

  insert into public.activity_events (
    organization_id, apartment_id, actor_name, event_type, title, description
  ) values (
    p_org_id, p_apt_id, 'Telegram ბოტი', 'telegram_task_created', p_title, p_description
  );

  return jsonb_build_object(
    'task_id', v_task_id,
    'repair_id', v_repair_id,
    'approval_id', v_approval_id,
    'token', v_token
  );
end;
$$;

-- Get Public Approval RPC
create or replace function public.get_public_approval(p_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_appr record;
  v_apt record;
  v_owner record;
  v_org record;
  v_repair record;
begin
  select * into v_appr from public.approvals where token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Approval not found');
  end if;

  select * into v_apt from public.apartments where id = v_appr.apartment_id;
  select * into v_owner from public.owners where id = v_appr.owner_id;
  select * into v_org from public.organizations where id = v_appr.organization_id;
  select * into v_repair from public.repairs where id = v_appr.repair_id;

  return jsonb_build_object(
    'success', true,
    'approval', row_to_json(v_appr),
    'apartment', coalesce(row_to_json(v_apt), '{}'::json),
    'owner', coalesce(row_to_json(v_owner), json_build_object('name', 'მესაკუთრე')),
    'organization', coalesce(row_to_json(v_org), '{}'::json),
    'repair', coalesce(row_to_json(v_repair), '{}'::json)
  );
end;
$$;

-- Respond Public Approval RPC
create or replace function public.respond_public_approval(
  p_token text,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_appr public.approvals%rowtype;
  v_status text;
begin
  select * into v_appr from public.approvals where token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Approval not found');
  end if;

  v_status := case when p_decision in ('approved', 'accept') then 'approved' else 'rejected' end;

  update public.approvals
  set status = v_status,
      response_note = p_note,
      responded_at = now()
  where id = v_appr.id;

  if v_appr.repair_id is not null then
    update public.repairs
    set approval_status = v_status
    where id = v_appr.repair_id;
  end if;

  insert into public.activity_events (
    organization_id, apartment_id, actor_name, event_type, title, description
  ) values (
    v_appr.organization_id, v_appr.apartment_id, 'მესაკუთრე',
    'approval_response',
    case when v_status = 'approved' then 'ხარჯი დადასტურებულია' else 'ხარჯზე დაფიქსირდა უარი' end,
    coalesce(p_note, 'მესაკუთრემ დააფიქსირა პასუხი')
  );

  return jsonb_build_object('success', true, 'status', v_status);
end;
$$;

