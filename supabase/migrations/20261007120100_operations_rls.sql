-- =============================================================================
-- RIGZEA · Operations workflows: role-based RLS, storage scoping, scheduled scan
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (role-based)
-- -----------------------------------------------------------------------------
alter table public.reservations enable row level security;

-- Membership: no self-insert into arbitrary orgs
drop policy if exists org_members_insert on public.organization_members;
create policy org_members_insert on public.organization_members for insert
  with check (public.is_org_admin(organization_id));

-- Organizations: owner-portal users can read their manager's org
drop policy if exists org_select_owner_portal on public.organizations;
create policy org_select_owner_portal on public.organizations for select
  using (id in (select organization_id from public.owners where user_id = auth.uid()));

-- Generic: managers read/write, admins delete
do $$
declare t text;
begin
  foreach t in array array['owners', 'apartments', 'tasks', 'repairs', 'approvals', 'expenses', 'income',
                           'monthly_reports', 'condition_reports', 'activity_events', 'invitations', 'reservations'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_org_admin(organization_id))', t);
  end loop;
end $$;

create policy owners_select on public.owners for select
  using (public.is_org_manager(organization_id) or user_id = auth.uid());

create policy apartments_select on public.apartments for select
  using (
    public.is_org_manager(organization_id)
    or (owner_id in (select public.my_owner_ids()))
    or exists (
      select 1 from public.tasks t
      where t.apartment_id = apartments.id
        and t.status in ('assigned', 'in_progress', 'blocked')
        and t.assigned_to = public.my_member_id(apartments.organization_id)
    )
  );

create policy tasks_select on public.tasks for select
  using (public.is_org_manager(organization_id) or assigned_to = public.my_member_id(organization_id));

create policy repairs_select on public.repairs for select using (public.is_org_manager(organization_id));
create policy condition_reports_select on public.condition_reports for select using (public.is_org_manager(organization_id));
create policy invitations_select on public.invitations for select using (public.is_org_manager(organization_id));

create policy approvals_select on public.approvals for select
  using (public.is_org_manager(organization_id) or owner_id in (select public.my_owner_ids()));
create policy expenses_select on public.expenses for select
  using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy income_select on public.income for select
  using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy reservations_select on public.reservations for select
  using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy monthly_reports_select on public.monthly_reports for select
  using (public.is_org_manager(organization_id) or (public.is_my_apartment(apartment_id) and status in ('finalized', 'sent')));
create policy activity_events_select on public.activity_events for select
  using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));

drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());

-- Storage: uploads scoped to the org folder (<org_id>/...)
create or replace function public.can_write_org_folder(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_folder text := split_part(p_path, '/', 1);
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$$;

drop policy if exists "Authenticated users can upload Rigzea files" on storage.objects;
create policy "Authenticated users can upload Rigzea files" on storage.objects for insert
  with check (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));
drop policy if exists "Users can update/delete their org files" on storage.objects;
create policy "Users can update/delete their org files" on storage.objects for update
  using (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));
drop policy if exists "Users can delete their org files" on storage.objects;
create policy "Users can delete their org files" on storage.objects for delete
  using (bucket_id = 'rigzea-files' and public.can_write_org_folder(name));

-- -----------------------------------------------------------------------------
-- 12. GRANTS
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.reservations to authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_managers(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.scan_alerts(uuid) from public, anon;
grant execute on function public.scan_alerts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 13. SCHEDULED SCAN (every 15 minutes)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('rigzea_scan_alerts', '*/15 * * * *', $$select public.scan_alerts(null)$$);
