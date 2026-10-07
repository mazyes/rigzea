-- =============================================================================
-- RIGZEA · Operations workflows
-- Reservations, task lifecycle, staff access, owner portal, finance workflow,
-- monthly statements and notifications, with role-based RLS.
-- Applies on top of the live schema (tasks.type, apartments.name, etc.).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. ROLE HELPERS
-- -----------------------------------------------------------------------------
create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.organization_members
  where organization_id = p_org and user_id = auth.uid() limit 1;
$$;

create or replace function public.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid()
      and role in ('owner', 'admin', 'manager')
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.my_member_id(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.organization_members
  where organization_id = p_org and user_id = auth.uid() limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 2. SCHEMA CHANGES
-- -----------------------------------------------------------------------------

-- Owners: portal login link
alter table public.owners add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.owners add column if not exists payout_account text;
create index if not exists idx_owners_user on public.owners(user_id);

create or replace function public.my_owner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.owners where user_id = auth.uid();
$$;

create or replace function public.is_my_apartment(p_apartment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.apartments a
    join public.owners o on o.id = a.owner_id
    where a.id = p_apartment and o.user_id = auth.uid()
  );
$$;

-- Apartments: access + turnover defaults + commission
alter table public.apartments add column if not exists door_code text;
alter table public.apartments add column if not exists wifi_name text;
alter table public.apartments add column if not exists wifi_password text;
alter table public.apartments add column if not exists parking_info text;
alter table public.apartments add column if not exists checkin_time time default '14:00';
alter table public.apartments add column if not exists checkout_time time default '12:00';
alter table public.apartments add column if not exists cleaning_minutes integer default 180;
alter table public.apartments add column if not exists commission_pct numeric(5,2) default 20;

-- Reservations
create table if not exists public.reservations (
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
create index if not exists idx_reservations_org_dates on public.reservations(organization_id, check_in, check_out);
create index if not exists idx_reservations_apt on public.reservations(apartment_id, check_in);

-- Income can be recorded from a reservation (once)
alter table public.income add column if not exists reservation_id uuid references public.reservations(id) on delete set null;
create unique index if not exists uq_income_reservation on public.income(reservation_id) where reservation_id is not null;

-- Tasks: full lifecycle
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks set status = case status
  when 'pending_approval' then 'blocked'
  when 'completed' then 'done'
  else status end;
update public.tasks set status = 'assigned' where status = 'new' and assigned_to is not null;
alter table public.tasks add constraint tasks_status_check
  check (status in ('new', 'assigned', 'in_progress', 'blocked', 'done', 'cancelled'));
alter table public.tasks alter column status set default 'new';

alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check
  check (type in ('cleaning', 'maintenance', 'repair', 'inspection', 'payment', 'other'));

alter table public.tasks add column if not exists reservation_id uuid references public.reservations(id) on delete set null;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete set null;
alter table public.tasks add column if not exists scheduled_start timestamptz;
alter table public.tasks add column if not exists blocked_reason text;
alter table public.tasks add column if not exists assigned_at timestamptz;
alter table public.tasks add column if not exists started_at timestamptz;
alter table public.tasks add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.tasks alter column checklist set default '[]'::jsonb;
alter table public.tasks alter column photos set default '[]'::jsonb;
create unique index if not exists uq_tasks_turnover on public.tasks(reservation_id) where type = 'cleaning' and reservation_id is not null;
create index if not exists idx_tasks_assignee on public.tasks(assigned_to, status);
create index if not exists idx_tasks_due on public.tasks(organization_id, due_date);

-- Approvals: title + links
alter table public.approvals add column if not exists title text;
alter table public.approvals add column if not exists task_id uuid references public.tasks(id) on delete set null;
alter table public.approvals alter column token set default encode(extensions.gen_random_bytes(16), 'hex');

-- Expenses: finance workflow
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check
  check (category in ('cleaning', 'repair', 'maintenance', 'utility', 'supplies', 'laundry', 'other'));
alter table public.expenses add column if not exists status text not null default 'incurred';
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check
  check (status in ('proposed', 'approved', 'declined', 'incurred', 'paid'));
alter table public.expenses add column if not exists receipt_required boolean not null default true;
alter table public.expenses add column if not exists charge_to_owner boolean not null default true;
alter table public.expenses add column if not exists approved_at timestamptz;
alter table public.expenses add column if not exists incurred_at timestamptz;
alter table public.expenses add column if not exists paid_at timestamptz;
alter table public.expenses add column if not exists task_id uuid references public.tasks(id) on delete set null;
alter table public.expenses add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists idx_expenses_status on public.expenses(organization_id, status);

-- Monthly statements
alter table public.monthly_reports add column if not exists commission numeric(10,2) default 0;
alter table public.monthly_reports add column if not exists owner_id uuid references public.owners(id) on delete set null;
create unique index if not exists uq_monthly_reports_apt_month on public.monthly_reports(apartment_id, month_period);

-- Notifications: dedup
alter table public.notifications add column if not exists dedup_key text;
create unique index if not exists uq_notifications_dedup on public.notifications(user_id, dedup_key) where dedup_key is not null;

-- -----------------------------------------------------------------------------
-- 3. NOTIFICATION HELPERS
-- -----------------------------------------------------------------------------
create or replace function public.notify_user(
  p_org uuid, p_user uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (organization_id, user_id, title, message, type, link, dedup_key)
  values (p_org, p_user, p_title, p_message, p_type, p_link, p_dedup)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
end;
$$;

create or replace function public.notify_managers(
  p_org uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text default null
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.organization_members
           where organization_id = p_org and role in ('owner', 'admin', 'manager') loop
    perform public.notify_user(p_org, r.user_id, p_title, p_message, p_type, p_link, p_dedup);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. TASK LIFECYCLE TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.tasks_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
  v_user uuid;
  v_apt text;
begin
  new.updated_at := now();

  -- Assignment drives new <-> assigned
  if new.assigned_to is not null and new.status = 'new' then
    new.status := 'assigned';
  elsif new.assigned_to is null and new.status = 'assigned' then
    new.status := 'new';
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
    if not v_ok then
      raise exception 'სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status;
    end if;
  end if;

  if new.status = 'blocked' and coalesce(trim(new.blocked_reason), '') = '' then
    raise exception 'შეჩერებისთვის მიუთითეთ მიზეზი';
  end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;

  if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    select user_id into v_user from public.organization_members where id = new.assigned_to;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(
      new.organization_id, v_user,
      'ახალი დავალება: ' || new.title,
      coalesce(v_apt, '') || coalesce(' · ვადა ' || to_char(new.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'), ''),
      'assignment', '/staff/',
      'assign:' || new.id || ':' || new.assigned_to
    );
  end if;

  return new;
end;
$$;


create or replace trigger trg_tasks_lifecycle before insert or update on public.tasks
  for each row execute function public.tasks_lifecycle();

-- -----------------------------------------------------------------------------
-- 5. EXPENSE WORKFLOW TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.expenses_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
  v_apt text;
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
    if not v_ok then
      raise exception 'ხარჯის სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status;
    end if;
  end if;

  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  if new.status in ('incurred', 'paid') and new.incurred_at is null then new.incurred_at := now(); end if;
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;

  if new.status in ('incurred', 'paid') and new.receipt_required and new.receipt_url is null then
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_managers(
      new.organization_id,
      'ქვითარი აკლია: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || coalesce(new.description, new.category),
      'receipt', '/app/?view=finance',
      'receipt:' || new.id
    );
  end if;
  return new;
end;
$$;


create or replace trigger trg_expenses_workflow before insert or update on public.expenses
  for each row execute function public.expenses_workflow();

-- -----------------------------------------------------------------------------
-- 6. APPROVAL TRIGGERS (request + response notifications, expense sync)
-- -----------------------------------------------------------------------------
create or replace function public.approvals_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner_user uuid;
  v_owner_name text;
  v_apt text;
  v_title text;
begin
  select name into v_apt from public.apartments where id = new.apartment_id;
  select user_id, name into v_owner_user, v_owner_name from public.owners where id = new.owner_id;
  v_title := coalesce(new.title, new.description, 'ხარჯი');

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_user(
      new.organization_id, v_owner_user,
      'საჭიროა თანხმობა: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || v_title,
      'approval_request', '/owner/',
      'approval_req:' || new.id
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'declined') then
    update public.expenses
      set status = new.status
      where approval_id = new.id and status = 'proposed';
    perform public.notify_managers(
      new.organization_id,
      case when new.status = 'approved' then 'თანხმობა მიღებულია · ' else 'უარი თანხმობაზე · ' end || coalesce(v_apt, ''),
      coalesce(v_owner_name, 'მფლობელი') || ' · ₾' || new.amount || ' · ' || v_title
        || coalesce(' — „' || new.response_note || '“', ''),
      'approval_response', '/app/?view=finance',
      'approval_resp:' || new.id
    );
  end if;
  return new;
end;
$$;


create or replace trigger trg_approvals_notify after insert or update on public.approvals
  for each row execute function public.approvals_notify();

-- Public token response: logic only; notifications come from the trigger
create or replace function public.respond_public_approval(p_token text, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_approval record;
  v_owner text;
begin
  if p_decision not in ('approved', 'declined') then
    return jsonb_build_object('success', false, 'error', 'არასწორი გადაწყვეტილება');
  end if;
  select * into v_approval from public.approvals where token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა');
  end if;
  if v_approval.status <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია');
  end if;

  update public.approvals
    set status = p_decision, response_note = p_note, responded_at = now(), updated_at = now()
    where id = v_approval.id;

  if v_approval.repair_id is not null then
    update public.repairs set approval_status = p_decision, updated_at = now() where id = v_approval.repair_id;
  end if;

  select name into v_owner from public.owners where id = v_approval.owner_id;
  insert into public.activity_events (organization_id, apartment_id, actor_name, event_type, title, description, metadata)
  values (
    v_approval.organization_id, v_approval.apartment_id, coalesce(v_owner, 'მფლობელი'),
    case when p_decision = 'approved' then 'owner_approved' else 'owner_declined' end,
    case when p_decision = 'approved' then 'მფლობელმა დაადასტურა ₾' || v_approval.amount
         else 'მფლობელმა უარი თქვა ₾' || v_approval.amount || '-ზე' end,
    coalesce(p_note, coalesce(v_approval.title, v_approval.description)),
    jsonb_build_object('approval_id', v_approval.id, 'amount', v_approval.amount, 'decision', p_decision)
  );
  return jsonb_build_object('success', true, 'status', p_decision);
end;
$$;

-- Owner portal response (authenticated owner)
create or replace function public.owner_respond_approval(p_approval uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  select a.token into v_token
  from public.approvals a join public.owners o on o.id = a.owner_id
  where a.id = p_approval and o.user_id = auth.uid();
  if v_token is null then
    return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა');
  end if;
  return public.respond_public_approval(v_token, p_decision, p_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. STATEMENTS
-- -----------------------------------------------------------------------------
create or replace function public.generate_statement(p_apartment uuid, p_month text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_apt record;
  v_from date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_to date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_income numeric := 0;
  v_exp numeric := 0;
  v_comm numeric := 0;
  v_snapshot jsonb;
  v_id uuid;
begin
  select * into v_apt from public.apartments where id = p_apartment;
  if not found or not public.is_org_manager(v_apt.organization_id) then
    raise exception 'წვდომა შეზღუდულია';
  end if;
  if exists (select 1 from public.monthly_reports where apartment_id = p_apartment and month_period = p_month and status <> 'draft') then
    raise exception 'ამ თვის ამონაწერი უკვე დასრულებულია';
  end if;

  select coalesce(sum(amount), 0) into v_income from public.income
    where apartment_id = p_apartment and income_date >= v_from and income_date < v_to;
  select coalesce(sum(amount), 0) into v_exp from public.expenses
    where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid')
      and expense_date >= v_from and expense_date < v_to;
  v_comm := round(v_income * coalesce(v_apt.commission_pct, 0) / 100, 2);

  v_snapshot := jsonb_build_object(
    'apartment', v_apt.name,
    'commission_pct', coalesce(v_apt.commission_pct, 0),
    'income', coalesce((select jsonb_agg(jsonb_build_object('date', income_date, 'source', source, 'amount', amount, 'description', description) order by income_date)
      from public.income where apartment_id = p_apartment and income_date >= v_from and income_date < v_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('date', expense_date, 'category', category, 'amount', amount, 'description', description, 'status', status, 'receipt_url', receipt_url) order by expense_date)
      from public.expenses where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid')
        and expense_date >= v_from and expense_date < v_to), '[]'::jsonb)
  );

  insert into public.monthly_reports (organization_id, apartment_id, owner_id, month_period, total_income, total_expenses, commission, net_result, status, snapshot_data)
  values (v_apt.organization_id, p_apartment, v_apt.owner_id, p_month, v_income, v_exp, v_comm, v_income - v_exp - v_comm, 'draft', v_snapshot)
  on conflict (apartment_id, month_period) do update set
    owner_id = excluded.owner_id, total_income = excluded.total_income, total_expenses = excluded.total_expenses,
    commission = excluded.commission, net_result = excluded.net_result, snapshot_data = excluded.snapshot_data, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.statements_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_apt text;
begin
  if new.status in ('finalized', 'sent') and (tg_op = 'INSERT' or old.status = 'draft') then
    new.finalized_at := coalesce(new.finalized_at, now());
    select o.user_id into v_user from public.owners o where o.id = new.owner_id;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(
      new.organization_id, v_user,
      'ამონაწერი მზადაა · ' || new.month_period,
      coalesce(v_apt, '') || ' · წმინდა ანაზღაურება ₾' || new.net_result,
      'statement', '/owner/?statement=' || new.id,
      'statement:' || new.id
    );
  end if;
  return new;
end;
$$;


create or replace trigger trg_statements_notify before insert or update on public.monthly_reports
  for each row execute function public.statements_notify();

-- -----------------------------------------------------------------------------
-- 8. STAFF RPCs (staff never update tasks directly)
-- -----------------------------------------------------------------------------
create or replace function public.staff_task_guard(p_task uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found then raise exception 'დავალება ვერ მოიძებნა'; end if;
  if not (public.is_org_manager(v_task.organization_id)
          or v_task.assigned_to = public.my_member_id(v_task.organization_id)) then
    raise exception 'ეს დავალება შენზე არ არის მიბმული';
  end if;
  return v_task;
end;
$$;

create or replace function public.staff_update_task(
  p_task uuid, p_status text default null, p_checklist jsonb default null,
  p_notes text default null, p_blocked_reason text default null
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks;
  v_name text;
begin
  v_task := public.staff_task_guard(p_task);
  if p_status = 'done' and exists (
    select 1 from jsonb_array_elements(coalesce(p_checklist, v_task.checklist)) e
    where coalesce((e->>'done')::boolean, false) = false
  ) then
    raise exception 'დასასრულებლად მონიშნე ჩეკლისტის ყველა პუნქტი';
  end if;
  if p_status = 'done' and v_task.type = 'cleaning' and not exists (
    select 1 from jsonb_array_elements(v_task.photos) e where e->>'phase' = 'after'
  ) then
    raise exception 'დასასრულებლად ატვირთე მინიმუმ ერთი „შემდეგ“ ფოტო';
  end if;
  if p_status is not null and p_status not in ('in_progress', 'blocked', 'done', 'assigned') then
    raise exception 'დაუშვებელი სტატუსი';
  end if;

  update public.tasks set
    status = coalesce(p_status, status),
    checklist = coalesce(p_checklist, checklist),
    notes = coalesce(p_notes, notes),
    blocked_reason = case when p_status = 'blocked' then p_blocked_reason else blocked_reason end
  where id = p_task returning * into v_task;

  if p_status is not null then
    select display_name into v_name from public.organization_members where id = v_task.assigned_to;
    insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description)
    values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'),
      'task_' || p_status,
      case p_status when 'in_progress' then 'დაიწყო: ' when 'done' then 'დასრულდა: ' when 'blocked' then 'შეჩერდა: ' else 'განახლდა: ' end || v_task.title,
      coalesce(p_blocked_reason, p_notes));
    if p_status = 'blocked' then
      perform public.notify_managers(v_task.organization_id, 'დავალება შეჩერდა: ' || v_task.title,
        coalesce(v_name, '') || ' · ' || coalesce(p_blocked_reason, ''), 'task_blocked', '/app/?view=tasks', null);
    end if;
  end if;
  return v_task;
end;
$$;

create or replace function public.staff_add_task_photo(p_task uuid, p_url text, p_phase text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  v_task := public.staff_task_guard(p_task);
  if p_phase not in ('before', 'after', 'problem') then raise exception 'არასწორი ფოტოს ტიპი'; end if;
  update public.tasks
    set photos = coalesce(photos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('url', p_url, 'phase', p_phase, 'at', now()))
    where id = p_task returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.staff_report_problem(p_task uuid, p_title text, p_description text default null, p_photo_url text default null, p_urgent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks;
  v_new uuid;
  v_name text;
  v_apt text;
begin
  v_task := public.staff_task_guard(p_task);
  if coalesce(trim(p_title), '') = '' then raise exception 'აღწერე პრობლემა'; end if;
  select display_name into v_name from public.organization_members where user_id = auth.uid() and organization_id = v_task.organization_id;
  select name into v_apt from public.apartments where id = v_task.apartment_id;

  insert into public.tasks (organization_id, apartment_id, title, description, type, priority, status, parent_task_id, created_by, photos)
  values (v_task.organization_id, v_task.apartment_id, p_title,
    coalesce(p_description, '') || E'\nგამოვლინდა: ' || v_task.title || ' (' || coalesce(v_name, 'თანამშრომელი') || ')',
    'maintenance', case when p_urgent then 'urgent' else 'normal' end, 'new', v_task.id, auth.uid(),
    case when p_photo_url is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('url', p_photo_url, 'phase', 'problem', 'at', now())) end)
  returning id into v_new;

  insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description)
  values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'), 'problem_reported', 'პრობლემა: ' || p_title, p_description);

  perform public.notify_managers(v_task.organization_id,
    case when p_urgent then 'სასწრაფო პრობლემა: ' else 'პრობლემა: ' end || p_title,
    coalesce(v_apt, '') || ' · ' || coalesce(v_name, ''), 'problem', '/app/?view=tasks', null);
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. OVERDUE / MISSING RECEIPT SCAN
-- -----------------------------------------------------------------------------
create or replace function public.scan_alerts(p_org uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_user uuid;
  v_count integer := 0;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then
    raise exception 'წვდომა შეზღუდულია';
  end if;
  for r in
    select t.*, a.name as apt_name from public.tasks t
    left join public.apartments a on a.id = t.apartment_id
    where t.status in ('new', 'assigned', 'in_progress', 'blocked')
      and t.due_date < now()
      and (p_org is null or t.organization_id = p_org)
  loop
    perform public.notify_managers(r.organization_id, 'ვადაგადაცილებული: ' || r.title,
      coalesce(r.apt_name, '') || ' · ვადა იყო ' || to_char(r.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'),
      'overdue', '/app/?view=tasks', 'overdue:' || r.id);
    if r.assigned_to is not null then
      select user_id into v_user from public.organization_members where id = r.assigned_to;
      perform public.notify_user(r.organization_id, v_user, 'ვადაგადაცილებული: ' || r.title,
        coalesce(r.apt_name, ''), 'overdue', '/staff/', 'overdue:' || r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. INVITATIONS + OWNER PORTAL LINKING
-- -----------------------------------------------------------------------------
create or replace function public.accept_my_invitations()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
  v_name text;
  r record;
  v_count integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email), raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = auth.uid();

  for r in select * from public.invitations
           where lower(email) = v_email and status = 'pending'
             and (expires_at is null or expires_at > now()) loop
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (r.organization_id, auth.uid(), r.role, coalesce(v_name, split_part(v_email, '@', 1)))
    on conflict (organization_id, user_id) do nothing;
    update public.invitations set status = 'accepted' where id = r.id;
    v_count := v_count + 1;
  end loop;

  -- Owner portal: link owner profiles by email
  update public.owners set user_id = auth.uid()
    where user_id is null and lower(email) = v_email;
  return v_count;
end;
$$;

