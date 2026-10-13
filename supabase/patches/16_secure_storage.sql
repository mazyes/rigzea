-- 16_secure_storage.sql: Split storage buckets into rigzea-public and rigzea-private
insert into storage.buckets (id, name, public) values ('rigzea-public', 'rigzea-public', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('rigzea-private', 'rigzea-private', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('rigzea-files', 'rigzea-files', true) on conflict (id) do nothing;

create or replace function public.can_write_org_folder(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_folder text := split_part(p_path, '/', 1);
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$$;
grant execute on function public.can_write_org_folder(text) to authenticated;

-- Drop previous policies if they exist
drop policy if exists "rigzea files read" on storage.objects;
drop policy if exists "rigzea files upload" on storage.objects;
drop policy if exists "rigzea files update" on storage.objects;
drop policy if exists "rigzea files delete" on storage.objects;

drop policy if exists "rigzea public read" on storage.objects;
drop policy if exists "rigzea public upload" on storage.objects;
drop policy if exists "rigzea public update" on storage.objects;
drop policy if exists "rigzea public delete" on storage.objects;

drop policy if exists "rigzea private read" on storage.objects;
drop policy if exists "rigzea private upload" on storage.objects;
drop policy if exists "rigzea private update" on storage.objects;
drop policy if exists "rigzea private delete" on storage.objects;

-- Public bucket policies (listings, photos, branding)
create policy "rigzea public read" on storage.objects for select using (bucket_id in ('rigzea-public', 'rigzea-files'));
create policy "rigzea public upload" on storage.objects for insert to authenticated with check (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));
create policy "rigzea public update" on storage.objects for update to authenticated using (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));
create policy "rigzea public delete" on storage.objects for delete to authenticated using (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));

-- Private bucket policies (receipts, expenses, tasks)
create policy "rigzea private read" on storage.objects for select to authenticated using (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));
create policy "rigzea private upload" on storage.objects for insert to authenticated with check (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));
create policy "rigzea private update" on storage.objects for update to authenticated using (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));
create policy "rigzea private delete" on storage.objects for delete to authenticated using (bucket_id = 'rigzea-private' and public.can_write_org_folder(name));
