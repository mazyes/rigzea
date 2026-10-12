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
$$;;
