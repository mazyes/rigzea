alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.owners enable row level security;
alter table public.apartments enable row level security;
alter table public.reservations enable row level security;
alter table public.tasks enable row level security;
alter table public.repairs enable row level security;
alter table public.approvals enable row level security;
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.condition_reports enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.telegram_chats enable row level security;

create policy org_select on public.organizations for select using (
  id in (select public.get_user_org_ids(auth.uid())) or id in (select organization_id from public.owners where user_id = auth.uid()));
create policy org_update on public.organizations for update using (public.is_org_admin(id));

create policy members_select on public.organization_members for select using (organization_id in (select public.get_user_org_ids(auth.uid())));
create policy members_insert on public.organization_members for insert with check (public.is_org_admin(organization_id));
create policy members_update on public.organization_members for update using (public.is_org_admin(organization_id));
create policy members_delete on public.organization_members for delete using (public.is_org_admin(organization_id) and role <> 'owner');

do $$
declare t text;
begin
  foreach t in array array['owners', 'apartments', 'reservations', 'tasks', 'repairs', 'approvals', 'expenses', 'income',
                           'condition_reports', 'monthly_reports', 'activity_events', 'invitations'] loop
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_org_admin(organization_id))', t);
  end loop;
end $$;

create policy owners_select on public.owners for select using (public.is_org_manager(organization_id) or user_id = auth.uid());
create policy apartments_select on public.apartments for select using (
  public.is_org_manager(organization_id)
  or owner_id in (select public.my_owner_ids())
  or exists (select 1 from public.tasks t where t.apartment_id = apartments.id and t.status in ('assigned', 'in_progress', 'blocked')
             and t.assigned_to = public.my_member_id(apartments.organization_id)));
create policy tasks_select on public.tasks for select using (public.is_org_manager(organization_id) or assigned_to = public.my_member_id(organization_id));
create policy repairs_select on public.repairs for select using (public.is_org_manager(organization_id));
create policy condition_reports_select on public.condition_reports for select using (public.is_org_manager(organization_id));
create policy invitations_select on public.invitations for select using (public.is_org_manager(organization_id));
create policy approvals_select on public.approvals for select using (public.is_org_manager(organization_id) or owner_id in (select public.my_owner_ids()));
create policy expenses_select on public.expenses for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy income_select on public.income for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy reservations_select on public.reservations for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));
create policy monthly_reports_select on public.monthly_reports for select using (public.is_org_manager(organization_id) or (public.is_my_apartment(apartment_id) and status in ('finalized', 'sent')));
create policy activity_events_select on public.activity_events for select using (public.is_org_manager(organization_id) or public.is_my_apartment(apartment_id));

create policy notif_select on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update using (user_id = auth.uid());
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());;
