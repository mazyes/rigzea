revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from authenticated;
revoke execute on function public.notify_managers(uuid, text, text, text, text, text) from authenticated;
grant execute on function public.get_public_approval(text), public.respond_public_approval(text, text, text) to anon;
grant execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint), public.get_telegram_org(uuid),
  public.get_telegram_apartments(uuid), public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) to anon;

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
create policy "rigzea files delete" on storage.objects for delete to authenticated using (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));;
