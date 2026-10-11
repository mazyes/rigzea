-- =============================================================================
-- RIGZEA (რიგზეა) — complete database schema for a fresh Supabase project.
-- Tables, role-based RLS, workflow triggers, RPCs used by the web app,
-- the staff view, the public approval page and the Telegram webhook.
-- Run once in the SQL editor of a new project.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. TABLES
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. INDEXES
-- -----------------------------------------------------------------------------
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
create unique index uq_notifications_dedup on public.notifications(user_id, dedup_key) where dedup_key is not null;

-- -----------------------------------------------------------------------------
-- 3. ROLE HELPERS
-- -----------------------------------------------------------------------------
create function public.is_org_member(p_org_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = p_org_id and user_id = p_user_id);
$$;

create function public.get_user_org_ids(p_user_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = p_user_id;
$$;

create function public.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role in ('owner', 'admin', 'manager'));
$$;

create function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

create function public.my_member_id(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.organization_members where organization_id = p_org and user_id = auth.uid() limit 1;
$$;

create function public.my_owner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.owners where user_id = auth.uid();
$$;

create function public.is_my_apartment(p_apartment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.apartments a join public.owners o on o.id = a.owner_id
    where a.id = p_apartment and o.user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 4. NOTIFICATIONS
-- -----------------------------------------------------------------------------
create function public.notify_user(p_org uuid, p_user uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (organization_id, user_id, title, message, type, link, dedup_key)
  values (p_org, p_user, p_title, p_message, p_type, p_link, p_dedup)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
end;
$$;

create function public.notify_managers(p_org uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.organization_members where organization_id = p_org and role in ('owner', 'admin', 'manager') loop
    perform public.notify_user(p_org, r.user_id, p_title, p_message, p_type, p_link, p_dedup);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. WORKFLOW TRIGGERS
-- -----------------------------------------------------------------------------
create function public.tasks_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_user uuid; v_apt text;
begin
  new.updated_at := now();
  if new.assigned_to is not null and new.status = 'new' then new.status := 'assigned';
  elsif new.assigned_to is null and new.status = 'assigned' then new.status := 'new';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_ok := case old.status
      when 'new'         then new.status in ('assigned', 'in_progress', 'cancelled')
      when 'assigned'    then new.status in ('new', 'in_progress', 'blocked', 'cancelled', 'done')
      when 'in_progress' then new.status in ('assigned', 'blocked', 'done', 'cancelled')
      when 'blocked'     then new.status in ('assigned', 'in_progress', 'cancelled', 'new')
      when 'done'        then new.status in ('in_progress', 'assigned')
      when 'cancelled'   then new.status in ('new', 'assigned')
      else false end;
    if not v_ok then raise exception 'სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status; end if;
  end if;

  if new.status = 'blocked' and coalesce(trim(new.blocked_reason), '') = '' then raise exception 'შეჩერებისთვის მიუთითეთ მიზეზი'; end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;
  if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  if new.status = 'done' then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;

  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    select user_id into v_user from public.organization_members where id = new.assigned_to;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(new.organization_id, v_user, 'ახალი დავალება: ' || new.title,
      coalesce(v_apt, '') || coalesce(' · ვადა ' || to_char(new.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'), ''),
      'assignment', '/staff/', 'assign:' || new.id || ':' || new.assigned_to);
  end if;
  return new;
end;
$$;
create trigger trg_tasks_lifecycle before insert or update on public.tasks for each row execute function public.tasks_lifecycle();

create function public.expenses_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_apt text;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_ok := case old.status
      when 'proposed' then new.status in ('approved', 'declined')
      when 'approved' then new.status in ('incurred', 'paid', 'proposed')
      when 'declined' then new.status in ('proposed')
      when 'incurred' then new.status in ('paid', 'approved')
      when 'paid'     then new.status in ('incurred')
      else false end;
    if not v_ok then raise exception 'ხარჯის სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status; end if;
  end if;
  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  if new.status in ('incurred', 'paid') and new.incurred_at is null then new.incurred_at := now(); end if;
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  if new.status in ('incurred', 'paid') and new.receipt_required and new.receipt_url is null then
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_managers(new.organization_id, 'ქვითარი აკლია: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || coalesce(new.description, new.category), 'receipt', '/app/?view=finance', 'receipt:' || new.id);
  end if;
  return new;
end;
$$;
create trigger trg_expenses_workflow before insert or update on public.expenses for each row execute function public.expenses_workflow();

create function public.approvals_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner_user uuid; v_owner_name text; v_apt text; v_title text;
begin
  select name into v_apt from public.apartments where id = new.apartment_id;
  select user_id, name into v_owner_user, v_owner_name from public.owners where id = new.owner_id;
  v_title := coalesce(new.title, new.description, 'ხარჯი');
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_user(new.organization_id, v_owner_user, 'საჭიროა თანხმობა: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || v_title, 'approval_request', '/approve/?token=' || new.token, 'approval_req:' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'declined') then
    update public.expenses set status = new.status where approval_id = new.id and status = 'proposed';
    perform public.notify_managers(new.organization_id,
      case when new.status = 'approved' then 'თანხმობა მიღებულია · ' else 'უარი თანხმობაზე · ' end || coalesce(v_apt, ''),
      coalesce(v_owner_name, 'მფლობელი') || ' · ₾' || new.amount || ' · ' || v_title || coalesce(' — „' || new.response_note || '“', ''),
      'approval_response', '/app/?view=owners', 'approval_resp:' || new.id);
  end if;
  return new;
end;
$$;
create trigger trg_approvals_notify after insert or update on public.approvals for each row execute function public.approvals_notify();

create function public.statements_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_apt text;
begin
  new.updated_at := now();
  if new.status in ('finalized', 'sent') and (tg_op = 'INSERT' or old.status = 'draft') then
    new.finalized_at := coalesce(new.finalized_at, now());
    select o.user_id into v_user from public.owners o where o.id = new.owner_id;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(new.organization_id, v_user, 'ამონაწერი მზადაა · ' || new.month_period,
      coalesce(v_apt, '') || ' · წმინდა ანაზღაურება ₾' || new.net_result, 'statement', null, 'statement:' || new.id);
  end if;
  return new;
end;
$$;
create trigger trg_statements_notify before insert or update on public.monthly_reports for each row execute function public.statements_notify();

-- -----------------------------------------------------------------------------
-- 6. APP RPCs
-- -----------------------------------------------------------------------------
create function public.create_user_organization(p_org_name text, p_city text default 'თბილისი', p_portfolio_size text default '6-20', p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_org uuid; v_email text; v_name text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select email, raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = v_user;
  v_name := coalesce(p_display_name, v_name, split_part(v_email, '@', 1), 'მმართველი');
  insert into public.organizations (name, city, portfolio_size, contact_email) values (coalesce(nullif(trim(p_org_name), ''), 'ჩემი კომპანია'), p_city, p_portfolio_size, v_email) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, display_name) values (v_org, v_user, 'owner', v_name);
  insert into public.activity_events (organization_id, actor_id, actor_name, event_type, title) values (v_org, v_user, v_name, 'organization_created', 'სამუშაო სივრცე შეიქმნა');
  return v_org;
end;
$$;

create function public.accept_my_invitations()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_name text; r record; v_count integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email), raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = auth.uid();
  for r in select * from public.invitations where lower(email) = v_email and status = 'pending' and (expires_at is null or expires_at > now()) loop
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (r.organization_id, auth.uid(), r.role, coalesce(v_name, split_part(v_email, '@', 1)))
    on conflict (organization_id, user_id) do nothing;
    update public.invitations set status = 'accepted' where id = r.id;
    v_count := v_count + 1;
  end loop;
  update public.owners set user_id = auth.uid() where user_id is null and lower(email) = v_email;
  return v_count;
end;
$$;

create function public.scan_alerts(p_org uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_user uuid; v_count integer := 0;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then raise exception 'წვდომა შეზღუდულია'; end if;
  for r in select t.*, a.name as apt_name from public.tasks t left join public.apartments a on a.id = t.apartment_id
           where t.status in ('new', 'assigned', 'in_progress', 'blocked') and t.due_date < now() and (p_org is null or t.organization_id = p_org) loop
    perform public.notify_managers(r.organization_id, 'ვადაგადაცილებული: ' || r.title,
      coalesce(r.apt_name, '') || ' · ვადა იყო ' || to_char(r.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'), 'overdue', '/app/?view=tasks', 'overdue:' || r.id);
    if r.assigned_to is not null then
      select user_id into v_user from public.organization_members where id = r.assigned_to;
      perform public.notify_user(r.organization_id, v_user, 'ვადაგადაცილებული: ' || r.title, coalesce(r.apt_name, ''), 'overdue', '/staff/', 'overdue:' || r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.generate_statement(p_apartment uuid, p_month text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_apt record;
  v_from date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_to date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_income numeric; v_exp numeric; v_comm numeric; v_id uuid;
begin
  select * into v_apt from public.apartments where id = p_apartment;
  if not found or not public.is_org_manager(v_apt.organization_id) then raise exception 'წვდომა შეზღუდულია'; end if;
  if exists (select 1 from public.monthly_reports where apartment_id = p_apartment and month_period = p_month and status <> 'draft') then
    raise exception 'ამ თვის ამონაწერი უკვე დასრულებულია';
  end if;
  select coalesce(sum(amount), 0) into v_income from public.income where apartment_id = p_apartment and income_date >= v_from and income_date < v_to;
  select coalesce(sum(amount), 0) into v_exp from public.expenses where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid') and expense_date >= v_from and expense_date < v_to;
  v_comm := round(v_income * coalesce(v_apt.commission_pct, 0) / 100, 2);
  insert into public.monthly_reports (organization_id, apartment_id, owner_id, month_period, total_income, total_expenses, commission, net_result, status, snapshot_data)
  values (v_apt.organization_id, p_apartment, v_apt.owner_id, p_month, v_income, v_exp, v_comm, v_income - v_exp - v_comm, 'draft', jsonb_build_object(
    'apartment', v_apt.name, 'commission_pct', coalesce(v_apt.commission_pct, 0),
    'income', coalesce((select jsonb_agg(jsonb_build_object('date', income_date, 'source', source, 'amount', amount, 'description', description) order by income_date)
      from public.income where apartment_id = p_apartment and income_date >= v_from and income_date < v_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('date', expense_date, 'category', category, 'amount', amount, 'description', description, 'status', status, 'receipt_url', receipt_url) order by expense_date)
      from public.expenses where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid') and expense_date >= v_from and expense_date < v_to), '[]'::jsonb)))
  on conflict (apartment_id, month_period) do update set owner_id = excluded.owner_id, total_income = excluded.total_income, total_expenses = excluded.total_expenses,
    commission = excluded.commission, net_result = excluded.net_result, snapshot_data = excluded.snapshot_data
  returning id into v_id;
  return v_id;
end;
$$;

-- Public approval page (token = capability; returns no access codes or internal notes)
create function public.get_public_approval(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_a record; v_apt record; v_owner record; v_org record;
begin
  select * into v_a from public.approvals where token = p_token;
  if not found then return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა ან გაუქმებულია'); end if;
  select name, address, unit_number, city into v_apt from public.apartments where id = v_a.apartment_id;
  select name into v_owner from public.owners where id = v_a.owner_id;
  select name, contact_phone into v_org from public.organizations where id = v_a.organization_id;
  return jsonb_build_object('success', true,
    'approval', jsonb_build_object('id', v_a.id, 'title', v_a.title, 'amount', v_a.amount, 'description', v_a.description, 'status', v_a.status,
      'photos', v_a.photos, 'created_at', v_a.created_at, 'responded_at', v_a.responded_at, 'response_note', v_a.response_note, 'expires_at', v_a.expires_at),
    'apartment', jsonb_build_object('name', v_apt.name, 'address', v_apt.address, 'unit_number', v_apt.unit_number, 'city', v_apt.city),
    'owner', jsonb_build_object('name', v_owner.name),
    'organization', jsonb_build_object('name', v_org.name, 'contact_phone', v_org.contact_phone),
    'repair', '{}'::jsonb);
end;
$$;

create function public.respond_public_approval(p_token text, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a record; v_owner text;
begin
  if p_decision not in ('approved', 'declined') then return jsonb_build_object('success', false, 'error', 'არასწორი გადაწყვეტილება'); end if;
  select * into v_a from public.approvals where token = p_token for update;
  if not found then return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა'); end if;
  if v_a.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია'); end if;
  if v_a.expires_at is not null and v_a.expires_at < now() then return jsonb_build_object('success', false, 'error', 'მოთხოვნის ვადა ამოიწურა'); end if;
  update public.approvals set status = p_decision, response_note = p_note, responded_at = now(), updated_at = now() where id = v_a.id;
  if v_a.repair_id is not null then update public.repairs set approval_status = p_decision, updated_at = now() where id = v_a.repair_id; end if;
  select name into v_owner from public.owners where id = v_a.owner_id;
  insert into public.activity_events (organization_id, apartment_id, actor_name, event_type, title, description, metadata)
  values (v_a.organization_id, v_a.apartment_id, coalesce(v_owner, 'მფლობელი'),
    case when p_decision = 'approved' then 'owner_approved' else 'owner_declined' end,
    case when p_decision = 'approved' then 'მფლობელმა დაადასტურა ₾' || v_a.amount else 'მფლობელმა უარი თქვა ₾' || v_a.amount || '-ზე' end,
    coalesce(p_note, coalesce(v_a.title, v_a.description)),
    jsonb_build_object('approval_id', v_a.id, 'task_id', v_a.task_id, 'amount', v_a.amount, 'decision', p_decision));
  return jsonb_build_object('success', true, 'status', p_decision);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. STAFF RPCs (staff never update tasks directly)
-- -----------------------------------------------------------------------------
create function public.staff_task_guard(p_task uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found then raise exception 'დავალება ვერ მოიძებნა'; end if;
  if not (public.is_org_manager(v_task.organization_id) or v_task.assigned_to = public.my_member_id(v_task.organization_id)) then
    raise exception 'ეს დავალება შენზე არ არის მიბმული';
  end if;
  return v_task;
end;
$$;

create function public.staff_update_task(p_task uuid, p_status text default null, p_checklist jsonb default null, p_notes text default null, p_blocked_reason text default null)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_name text;
begin
  v_task := public.staff_task_guard(p_task);
  if p_status is not null and p_status not in ('in_progress', 'blocked', 'done', 'assigned') then raise exception 'დაუშვებელი სტატუსი'; end if;
  if p_status = 'done' and exists (select 1 from jsonb_array_elements(coalesce(p_checklist, v_task.checklist)) e where coalesce((e->>'done')::boolean, false) = false) then
    raise exception 'დასასრულებლად მონიშნე ჩეკლისტის ყველა პუნქტი';
  end if;
  if p_status = 'done' and v_task.type = 'cleaning' and not exists (select 1 from jsonb_array_elements(v_task.photos) e where e->>'phase' = 'after') then
    raise exception 'დასასრულებლად ატვირთე მინიმუმ ერთი „შემდეგ“ ფოტო';
  end if;
  update public.tasks set status = coalesce(p_status, status), checklist = coalesce(p_checklist, checklist), notes = coalesce(p_notes, notes),
    blocked_reason = case when p_status = 'blocked' then p_blocked_reason else blocked_reason end
  where id = p_task returning * into v_task;
  if p_status is not null then
    select display_name into v_name from public.organization_members where id = v_task.assigned_to;
    insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description, metadata)
    values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'), 'task_' || p_status,
      case p_status when 'in_progress' then 'დაიწყო: ' when 'done' then 'დასრულდა: ' when 'blocked' then 'შეჩერდა: ' else 'განახლდა: ' end || v_task.title,
      coalesce(p_blocked_reason, p_notes), jsonb_build_object('task_id', v_task.id));
    if p_status = 'blocked' then
      perform public.notify_managers(v_task.organization_id, 'დავალება შეჩერდა: ' || v_task.title, coalesce(v_name, '') || ' · ' || coalesce(p_blocked_reason, ''), 'task_blocked', '/app/?view=tasks', null);
    end if;
  end if;
  return v_task;
end;
$$;

create function public.staff_add_task_photo(p_task uuid, p_url text, p_phase text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  v_task := public.staff_task_guard(p_task);
  if p_phase not in ('before', 'after', 'problem') then raise exception 'არასწორი ფოტოს ტიპი'; end if;
  update public.tasks set photos = coalesce(photos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('url', p_url, 'phase', p_phase, 'at', now()))
  where id = p_task returning * into v_task;
  return v_task;
end;
$$;

create function public.staff_report_problem(p_task uuid, p_title text, p_description text default null, p_photo_url text default null, p_urgent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_new uuid; v_name text; v_apt text;
begin
  v_task := public.staff_task_guard(p_task);
  if coalesce(trim(p_title), '') = '' then raise exception 'აღწერე პრობლემა'; end if;
  select display_name into v_name from public.organization_members where user_id = auth.uid() and organization_id = v_task.organization_id;
  select name into v_apt from public.apartments where id = v_task.apartment_id;
  insert into public.tasks (organization_id, apartment_id, title, description, type, priority, status, parent_task_id, created_by, photos)
  values (v_task.organization_id, v_task.apartment_id, p_title,
    coalesce(p_description, '') || E'\nგამოვლინდა: ' || v_task.title || ' (' || coalesce(v_name, 'თანამშრომელი') || ')',
    'maintenance', case when p_urgent then 'urgent' else 'normal' end, 'new', v_task.id, auth.uid(),
    case when p_photo_url is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url', p_photo_url, 'phase', 'problem', 'at', now())) end)
  returning id into v_new;
  insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description, metadata)
  values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'), 'problem_reported', 'პრობლემა: ' || p_title, p_description, jsonb_build_object('task_id', v_new));
  perform public.notify_managers(v_task.organization_id, case when p_urgent then 'სასწრაფო პრობლემა: ' else 'პრობლემა: ' end || p_title,
    coalesce(v_apt, '') || ' · ' || coalesce(v_name, ''), 'problem', '/app/?view=tasks', null);
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. TELEGRAM WEBHOOK RPCs (called with the anon key from /api/telegram)
-- -----------------------------------------------------------------------------
create function public.link_telegram_chat(p_chat_id bigint, p_org_id uuid, p_user_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org record;
begin
  select id, name, city into v_org from public.organizations where id = p_org_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Organization not found'); end if;
  insert into public.telegram_chats (chat_id, organization_id, user_name) values (p_chat_id, p_org_id, p_user_name)
  on conflict (chat_id) do update set organization_id = excluded.organization_id, user_name = coalesce(excluded.user_name, telegram_chats.user_name), linked_at = now();
  return jsonb_build_object('success', true, 'org_id', v_org.id, 'org_name', v_org.name, 'city', v_org.city);
end;
$$;

create function public.get_linked_telegram_org(p_chat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('orgId', o.id, 'orgName', o.name, 'city', o.city)
  from public.telegram_chats tc join public.organizations o on o.id = tc.organization_id where tc.chat_id = p_chat_id;
$$;

create function public.get_telegram_org(p_org_id uuid)
returns table (id uuid, name text, city text) language sql stable security definer set search_path = public as $$
  select id, name, city from public.organizations where id = p_org_id;
$$;

create function public.get_telegram_apartments(p_org_id uuid)
returns table (id uuid, name text, address text, unit_number text, status text) language sql stable security definer set search_path = public as $$
  select id, name, address, unit_number, status from public.apartments
  where organization_id = p_org_id and status <> 'archived' order by created_at desc;
$$;

create function public.telegram_create_task_record(p_org_id uuid, p_apt_id uuid, p_title text, p_description text, p_cost numeric default 0, p_source text default 'Telegram')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_task uuid; v_repair uuid; v_owner uuid; v_appr uuid; v_token text;
begin
  if not exists (select 1 from public.apartments where id = p_apt_id and organization_id = p_org_id) then
    return jsonb_build_object('success', false, 'error', 'Apartment not found');
  end if;
  select owner_id into v_owner from public.apartments where id = p_apt_id;
  insert into public.tasks (organization_id, apartment_id, title, description, type, priority, status)
  values (p_org_id, p_apt_id, p_title, p_description, 'repair', 'urgent', 'new') returning id into v_task;
  if coalesce(p_cost, 0) > 0 then
    insert into public.repairs (organization_id, apartment_id, task_id, issue, description, estimate_amount, requires_owner_approval, approval_status, status)
    values (p_org_id, p_apt_id, v_task, p_title, p_description, p_cost, v_owner is not null, case when v_owner is null then 'not_requested' else 'pending' end, 'estimated')
    returning id into v_repair;
    if v_owner is not null then
      insert into public.approvals (organization_id, apartment_id, repair_id, task_id, owner_id, title, amount, description)
      values (p_org_id, p_apt_id, v_repair, v_task, v_owner, p_title, p_cost, p_title || coalesce(E'\n' || p_description, ''))
      returning id, token into v_appr, v_token;
      insert into public.expenses (organization_id, apartment_id, repair_id, approval_id, task_id, category, amount, description, status)
      values (p_org_id, p_apt_id, v_repair, v_appr, v_task, 'repair', p_cost, p_title, 'proposed');
    end if;
  end if;
  insert into public.activity_events (organization_id, apartment_id, actor_name, event_type, title, description, metadata)
  values (p_org_id, p_apt_id, 'Telegram ბოტი', 'telegram_task_created', 'ახალი საქმე: ' || p_title, p_description, jsonb_build_object('task_id', v_task));
  return jsonb_build_object('success', true, 'task_id', v_task, 'repair_id', v_repair, 'approval_id', v_appr, 'token', v_token);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.owners enable row level security;
alter table public.apartments enable row level security;
alter table public.reservations enable row level security;
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
alter table public.telegram_chats enable row level security; -- no policies: only reachable through RPCs

create policy org_select on public.organizations for select using (
  id in (select public.get_user_org_ids(auth.uid())) or id in (select organization_id from public.owners where user_id = auth.uid()));
create policy org_update on public.organizations for update using (public.is_org_admin(id));

create policy members_select on public.organization_members for select using (organization_id in (select public.get_user_org_ids(auth.uid())));
create policy members_insert on public.organization_members for insert with check (public.is_org_admin(organization_id));
create policy members_update on public.organization_members for update using (public.is_org_admin(organization_id));
create policy members_delete on public.organization_members for delete using (public.is_org_admin(organization_id) and role <> 'owner');

-- Managers write, admins delete
do $$
declare t text;
begin
  foreach t in array array['owners', 'apartments', 'reservations', 'tasks', 'repairs', 'approvals', 'expenses', 'income',
                           'condition_reports', 'monthly_reports', 'activity_events', 'invitations'] loop
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_org_admin(organization_id))', t);
  end loop;
end $$;

create policy owners_select on public.owners for select using (public.is_org_manager(organization_id) or user_id = auth.uid());
create policy apartments_select on public.apartments for select using (
  public.is_org_manager(organization_id)
  or owner_id in (select public.my_owner_ids())
  or exists (select 1 from public.tasks t where t.apartment_id = apartments.id and t.status in ('assigned', 'in_progress', 'blocked')
             and t.assigned_to = public.my_member_id(apartments.organization_id)));
create policy tasks_select on public.tasks for select using (public.is_org_manager(organization_id) or assigned_to = public.my_member_id(organization_id));
create policy repairs_select on public.repairs for select using (public.is_org_manager(organization_id));
create policy condition_reports_select on public.condition_reports for select using (public.is_org_manager(organization_id));
create policy invitations_select on public.invitations for select using (public.is_org_manager(organization_id));
create policy approvals_select on public.approvals for select using (public.is_org_manager(organization_id) or owner_id in (select public.my_owner_ids()));
create policy expenses_select on public.expenses for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy income_select on public.income for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy reservations_select on public.reservations for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy monthly_reports_select on public.monthly_reports for select using (public.is_org_manager(organization_id) or (public.is_my_apartment(apartment_id) and status in ('finalized', 'sent')));
create policy activity_events_select on public.activity_events for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));

create policy notif_select on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update using (user_id = auth.uid());
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 10. FUNCTION PERMISSIONS
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from authenticated;
revoke execute on function public.notify_managers(uuid, text, text, text, text, text) from authenticated;
-- Public approval page and Telegram webhook use the anon key
grant execute on function public.get_public_approval(text), public.respond_public_approval(text, text, text) to anon;
grant execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint), public.get_telegram_org(uuid),
  public.get_telegram_apartments(uuid), public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) to anon;

-- -----------------------------------------------------------------------------
-- 11. FILE STORAGE (receipts and photos under <organization_id>/...)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('rigzea-files', 'rigzea-files', true) on conflict (id) do nothing;

create function public.can_write_org_folder(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_folder text := split_part(p_path, '/', 1);
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$$;
grant execute on function public.can_write_org_folder(text) to authenticated;

create policy "rigzea files read" on storage.objects for select using (bucket_id = 'rigzea-files');
create policy "rigzea files upload" on storage.objects for insert to authenticated with check (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));
create policy "rigzea files update" on storage.objects for update to authenticated using (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));
create policy "rigzea files delete" on storage.objects for delete to authenticated using (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));
