-- 15_guest_guide_rpc.sql: Secure guest guide access via SECURITY DEFINER function
create or replace function public.get_guest_guide(p_apartment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
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
  into v_res
  from public.apartments a
  left join public.organizations o on o.id = a.organization_id
  where a.id = p_apartment_id
    and a.is_archived = false
    and a.status != 'archived';

  return v_res;
end;
$$;

revoke execute on function public.get_guest_guide(uuid) from public;
grant execute on function public.get_guest_guide(uuid) to anon, authenticated;
