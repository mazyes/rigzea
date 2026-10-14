-- 18_security_hardening.sql
--   1. Guest guide: the door code and Wi-Fi password were readable by anyone who
--      knew the apartment id, and that id is public on every /p/ listing. The full
--      guide now needs a random per-apartment token; the old id-based RPC only
--      returns the public part, so printed ?apt= cards keep working.
--   2. Storage: "rigzea public read" let anonymous users list every org's files.
--      Public buckets serve files by URL without a SELECT policy, so listing is
--      now limited to members of the folder's org.
--   3. Fixed search_path on the functions the advisor flags.

-- 1. Guest guide token -------------------------------------------------------
alter table public.apartments add column if not exists guide_token text;
update public.apartments set guide_token = replace(gen_random_uuid()::text, '-', '') where guide_token is null;
alter table public.apartments alter column guide_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.apartments alter column guide_token set not null;
create unique index if not exists idx_apartments_guide_token on public.apartments (guide_token);

create or replace function public.get_guest_guide_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'city', a.city,
    'address', a.address,
    'unit_number', a.unit_number,
    'wifi_name', a.wifi_name,
    'wifi_password', a.wifi_password,
    'door_code', a.door_code,
    'checkin_time', to_char(a.checkin_time, 'HH24:MI'),
    'checkout_time', to_char(a.checkout_time, 'HH24:MI'),
    'access_instructions', a.access_instructions,
    'parking_info', a.parking_info,
    'contact_phone', coalesce(a.agent_phone, o.contact_phone)
  )
  from public.apartments a
  left join public.organizations o on o.id = a.organization_id
  where length(coalesce(p_token, '')) >= 24
    and a.guide_token = p_token
    and a.is_archived = false
    and a.status != 'archived';
$$;
revoke execute on function public.get_guest_guide_by_token(text) from public;
grant execute on function public.get_guest_guide_by_token(text) to anon, authenticated;

create or replace function public.get_guest_guide(p_apartment_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'city', a.city,
    'address', a.address,
    'unit_number', a.unit_number,
    'checkin_time', to_char(a.checkin_time, 'HH24:MI'),
    'checkout_time', to_char(a.checkout_time, 'HH24:MI'),
    'parking_info', a.parking_info,
    'contact_phone', coalesce(a.agent_phone, o.contact_phone)
  )
  from public.apartments a
  left join public.organizations o on o.id = a.organization_id
  where a.id = p_apartment_id
    and a.is_archived = false
    and a.status != 'archived';
$$;
revoke execute on function public.get_guest_guide(uuid) from public;
grant execute on function public.get_guest_guide(uuid) to anon, authenticated;

-- 2. Storage listing ---------------------------------------------------------
alter policy "rigzea public read" on storage.objects
  to authenticated
  using (bucket_id in ('rigzea-public', 'rigzea-files') and public.can_write_org_folder(name));

-- 3. search_path -------------------------------------------------------------
alter function public.apartments_set_slug() set search_path = public;
alter function public.apartments_sync_slug() set search_path = public;
alter function public.plan_limit(text, text) set search_path = public;
alter function public.plan_has_feature(text, text) set search_path = public;
