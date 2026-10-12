-- =============================================================================
-- Link tracking: named client links, view and contact events, notification targets
-- Safe to run more than once. Run after 20261012120000_sharing_foundations.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NAMED LINKS: a listing link made for one client, so an open can be tied to that link
-- -----------------------------------------------------------------------------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{8,24}$'),
  recipient_name text not null,
  deal_id uuid references public.deals(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_share_links_apartment on public.share_links(apartment_id);
create index if not exists idx_share_links_org on public.share_links(organization_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. EVENTS: one row per counted open or contact tap. No IP address, no user agent.
--    visitor_id is a random id kept in the visitor's own browser.
-- -----------------------------------------------------------------------------
create table if not exists public.link_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  share_link_id uuid references public.share_links(id) on delete set null,
  kind text not null check (kind in ('view', 'whatsapp', 'call')),
  visitor_id text not null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_link_events_apartment on public.link_events(apartment_id, created_at desc);
create index if not exists idx_link_events_org on public.link_events(organization_id, created_at desc);
create index if not exists idx_link_events_visitor on public.link_events(visitor_id, created_at desc);

alter table public.share_links enable row level security;
alter table public.link_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'share_links' and policyname = 'share_links_select') then
    create policy share_links_select on public.share_links for select using (public.is_org_manager(organization_id));
    create policy share_links_insert on public.share_links for insert with check (public.is_org_manager(organization_id));
    create policy share_links_update on public.share_links for update using (public.is_org_manager(organization_id));
    create policy share_links_delete on public.share_links for delete using (public.is_org_manager(organization_id));
  end if;
  -- Events are read-only for the organisation's managers. Nobody inserts directly: only record_link_event does.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'link_events' and policyname = 'link_events_select') then
    create policy link_events_select on public.link_events for select using (public.is_org_manager(organization_id));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. RECORDING. Called only by the server (api/track.js) with the service key.
--    Returns whether the event was counted and, when a notification is due, who to tell.
-- -----------------------------------------------------------------------------
create or replace function public.record_link_event(p_ref text, p_kind text, p_visitor text, p_recipient text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_apt public.apartments%rowtype;
  v_id uuid;
  v_link public.share_links%rowtype;
  v_has_link boolean := false;
  v_event bigint;
  v_title text;
  v_message text;
  v_chats jsonb;
begin
  if p_kind not in ('view', 'whatsapp', 'call') or p_ref is null or length(p_ref) > 100
     or p_visitor is null or p_visitor !~ '^[a-z0-9-]{8,64}$' then
    return jsonb_build_object('ok', false);
  end if;
  if p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_ref::uuid;
  end if;

  select * into v_apt from public.apartments
  where (public_slug = lower(p_ref) or id = v_id)
    and coalesce(is_archived, false) = false and status <> 'archived' and is_published
  limit 1;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  -- Rate limits: one browser, then one listing, per minute.
  if (select count(*) from public.link_events where visitor_id = p_visitor and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.link_events where apartment_id = v_apt.id and created_at > now() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  -- A refresh is not a new open: the same browser, listing and action count once per 30 minutes.
  if exists (select 1 from public.link_events
             where visitor_id = p_visitor and apartment_id = v_apt.id and kind = p_kind
               and created_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', true, 'counted', false);
  end if;

  if p_recipient is not null then
    select * into v_link from public.share_links
    where token = lower(p_recipient) and apartment_id = v_apt.id and is_active
      and (expires_at is null or expires_at > now());
    v_has_link := found;
  end if;

  insert into public.link_events (organization_id, apartment_id, share_link_id, kind, visitor_id)
  values (v_apt.organization_id, v_apt.id, case when v_has_link then v_link.id end, p_kind, p_visitor)
  returning id into v_event;

  -- Notify at most once per browser and listing per hour, and at most 20 times per organisation per hour.
  if exists (select 1 from public.link_events
             where visitor_id = p_visitor and apartment_id = v_apt.id and notified_at > now() - interval '60 minutes')
     or (select count(*) from public.link_events
         where organization_id = v_apt.organization_id and notified_at > now() - interval '60 minutes') >= 20 then
    return jsonb_build_object('ok', true, 'counted', true);
  end if;

  update public.link_events set notified_at = now() where id = v_event;

  v_title := case p_kind when 'view' then 'ბმული გაიხსნა: ' when 'whatsapp' then 'WhatsApp-ით დაკავშირება: ' else 'ზარის ღილაკი: ' end || v_apt.name;
  -- A link can be forwarded, so the wording names the link, never the person.
  v_message := case when v_has_link then '„' || v_link.recipient_name || '“-სთვის გაგზავნილი ბმულიდან.' else 'ბინის საერთო ბმულიდან.' end;

  if v_has_link and v_link.created_by is not null then
    perform public.notify_user(v_apt.organization_id, v_link.created_by, v_title, v_message, 'info',
      '/app/#/apartments/' || v_apt.id, 'link:' || v_event);
  else
    perform public.notify_managers(v_apt.organization_id, v_title, v_message, 'info',
      '/app/#/apartments/' || v_apt.id, 'link:' || v_event);
  end if;

  select coalesce(jsonb_agg(chat_id), '[]'::jsonb) into v_chats from (
    select chat_id from public.telegram_chats
    where organization_id = v_apt.organization_id
      and notify_views <> 'off'
      and (notify_views = 'all' or v_has_link)
      and (not v_has_link or v_link.created_by is null or user_id is null or user_id = v_link.created_by)
    limit 10) t;

  return jsonb_build_object('ok', true, 'counted', true, 'notify', jsonb_build_object(
    'chat_ids', v_chats, 'kind', p_kind, 'apartment_id', v_apt.id, 'apartment_name', v_apt.name,
    'recipient', case when v_has_link then v_link.recipient_name end));
end;
$$;

revoke execute on function public.record_link_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_link_event(text, text, text, text) to service_role;
