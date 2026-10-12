create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  city text default 'თბილისი',
  portfolio_size text,
  plan text default 'starter',
  logo_url text,
  contact_email text,
  contact_phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
  display_name text,
  phone text,
  created_at timestamptz default now(),
  unique (organization_id, user_id)
);

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  email text,
  payout_account text,
  preferred_language text default 'ka',
  notes text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  name text not null,
  address text,
  city text,
  unit_number text,
  management_type text,
  status text not null default 'active' check (status in ('active', 'maintenance', 'vacant', 'archived')),
  bedrooms integer,
  access_instructions text,
  door_code text,
  wifi_name text,
  wifi_password text,
  parking_info text,
  checkin_time time default '14:00',
  checkout_time time default '12:00',
  cleaning_minutes integer default 180,
  commission_pct numeric(5,2) default 20,
  notes text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  guest_name text not null,
  guest_phone text,
  guests_count integer default 1,
  source text not null default 'airbnb' check (source in ('airbnb', 'booking', 'direct', 'other')),
  check_in date not null,
  check_out date not null,
  check_in_time time default '14:00',
  check_out_time time default '12:00',
  expected_income numeric(10,2) default 0,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (check_out > check_in)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  description text,
  type text not null default 'other' check (type in ('cleaning', 'maintenance', 'repair', 'inspection', 'payment', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'blocked', 'done', 'cancelled')),
  assigned_to uuid references public.organization_members(id) on delete set null,
  scheduled_start timestamptz,
  due_date timestamptz,
  blocked_reason text,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  issue text not null,
  description text,
  reported_date timestamptz default now(),
  estimate_amount numeric(10,2),
  final_cost numeric(10,2),
  contractor_name text,
  contractor_phone text,
  requires_owner_approval boolean not null default true,
  approval_status text not null default 'not_requested' check (approval_status in ('not_requested', 'pending', 'approved', 'declined')),
  status text not null default 'reported' check (status in ('reported', 'estimated', 'in_progress', 'completed', 'cancelled')),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  repair_id uuid references public.repairs(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  owner_id uuid references public.owners(id) on delete cascade,
  title text,
  amount numeric(10,2) not null default 0,
  description text,
  photos jsonb not null default '[]'::jsonb,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  response_note text,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  repair_id uuid references public.repairs(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  category text not null default 'other' check (category in ('cleaning', 'repair', 'maintenance', 'utility', 'supplies', 'laundry', 'other')),
  amount numeric(10,2) not null,
  expense_date date default current_date,
  description text,
  vendor text,
  receipt_url text,
  paid_by text,
  status text not null default 'incurred' check (status in ('proposed', 'approved', 'declined', 'incurred', 'paid')),
  receipt_required boolean not null default true,
  charge_to_owner boolean not null default true,
  approved_at timestamptz,
  incurred_at timestamptz,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.income (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  amount numeric(10,2) not null,
  income_date date default current_date,
  source text not null default 'rental',
  period text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  report_type text check (report_type in ('check_in', 'check_out', 'inspection')),
  inspector_name text,
  rooms_condition jsonb default '{}'::jsonb,
  meter_readings jsonb default '{}'::jsonb,
  keys_handover jsonb default '{}'::jsonb,
  overall_notes text,
  photos jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  month_period text not null,
  total_income numeric(10,2) default 0,
  total_expenses numeric(10,2) default 0,
  commission numeric(10,2) default 0,
  net_result numeric(10,2) default 0,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'sent')),
  snapshot_data jsonb default '{}'::jsonb,
  finalized_at timestamptz,
  sent_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (apartment_id, month_period)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text,
  type text default 'info',
  link text,
  dedup_key text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'staff')),
  token text default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  invited_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  created_at timestamptz default now()
);

create table public.telegram_chats (
  chat_id bigint primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_name text,
  linked_at timestamptz default now()
);

create index idx_members_user on public.organization_members(user_id);
create index idx_owners_org on public.owners(organization_id);
create index idx_owners_user on public.owners(user_id);
create index idx_apartments_org on public.apartments(organization_id);
create index idx_reservations_org_dates on public.reservations(organization_id, check_in, check_out);
create index idx_reservations_apt on public.reservations(apartment_id, check_in);
create index idx_tasks_org_due on public.tasks(organization_id, due_date);
create index idx_tasks_assignee on public.tasks(assigned_to, status);
create unique index uq_tasks_turnover on public.tasks(reservation_id) where type = 'cleaning' and reservation_id is not null;
create index idx_approvals_org on public.approvals(organization_id);
create index idx_expenses_org_status on public.expenses(organization_id, status);
create index idx_income_org on public.income(organization_id);
create unique index uq_income_reservation on public.income(reservation_id) where reservation_id is not null;
create index idx_events_org on public.activity_events(organization_id, created_at desc);
create index idx_notifications_user on public.notifications(user_id, is_read);
create unique index uq_notifications_dedup on public.notifications(user_id, dedup_key) where dedup_key is not null;;
