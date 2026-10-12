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
$$;;
