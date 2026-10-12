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
$$;;
