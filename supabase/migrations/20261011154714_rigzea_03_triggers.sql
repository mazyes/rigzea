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
create trigger trg_statements_notify before insert or update on public.monthly_reports for each row execute function public.statements_notify();;
