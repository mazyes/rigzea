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
$$;;
