-- =============================================================================
-- Patch 14: reminders and Telegram delivery on the live database
-- Idempotent: safe to run more than once.
--
-- The live database never received patch 03, so /api/cron-reminders and the bot
-- called functions that did not exist. This patch adds exactly those pieces and
-- nothing else from 03:
--   * notifications.sent_telegram_at and the delivery helpers for the daily cron;
--   * scan_lease_renewals (30 / 14 / 3 days), only for plans that include reminders;
--   * consume_telegram_link_code and get_telegram_renewals for the bot;
--   * track_link_event_notify: the link statistics event plus who to tell in Telegram.
-- Every bot / cron function is service_role only: the anon key is public.
--
-- Additive only: one nullable column, one index and seven new functions. No
-- existing table data, policy or function is changed. To undo:
--   drop function if exists public.track_link_event_notify(text, text, text, uuid), public.get_telegram_renewals(uuid, integer),
--     public.close_stale_telegram_notifications(), public.mark_telegram_sent(uuid[]), public.pending_telegram_notifications(integer),
--     public.scan_lease_renewals(uuid), public.consume_telegram_link_code(text, bigint, text);
--   drop index if exists public.idx_notifications_tg_pending;
--   alter table public.notifications drop column if exists sent_telegram_at;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Delivery state
-- -----------------------------------------------------------------------------
alter table public.notifications add column if not exists sent_telegram_at timestamptz;
create index if not exists idx_notifications_tg_pending on public.notifications (created_at) where sent_telegram_at is null;

-- -----------------------------------------------------------------------------
-- 2. One-time link code, consumed by the bot ("/start CODE")
-- -----------------------------------------------------------------------------
create or replace function public.consume_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_row public.telegram_link_codes%rowtype; v_org record;
begin
  update public.telegram_link_codes set used_at = now()
  where code = upper(trim(p_code)) and used_at is null and expires_at > now()
  returning * into v_row;
  if not found then return jsonb_build_object('success', false, 'error', 'invalid_or_expired'); end if;
  select id, name, city into v_org from public.organizations where id = v_row.organization_id;
  insert into public.telegram_chats (chat_id, organization_id, user_name, user_id) values (p_chat_id, v_row.organization_id, p_user_name, v_row.user_id)
  on conflict (chat_id) do update set organization_id = excluded.organization_id, user_id = excluded.user_id,
    user_name = coalesce(excluded.user_name, telegram_chats.user_name), linked_at = now();
  return jsonb_build_object('success', true, 'org_id', v_org.id, 'org_name', v_org.name, 'city', v_org.city);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Lease renewal scan: 30 / 14 / 3 days before apartments.lease_end.
--    A lease that first appears inside a window gets the nearest threshold once,
--    so a missed cron day never loses a reminder. Reminders are a paid feature.
-- -----------------------------------------------------------------------------
create or replace function public.scan_lease_renewals(p_org uuid default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_today date := (now() at time zone 'Asia/Tbilisi')::date; v_days int; v_bucket int; v_count integer := 0; v_when text;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then raise exception 'წვდომა შეზღუდულია'; end if;
  for r in select a.id, a.organization_id, a.name, a.tenant_name, a.lease_end from public.apartments a
           where a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
             and a.lease_end >= v_today and a.lease_end <= v_today + 30 and (p_org is null or a.organization_id = p_org)
             and public.org_has_feature(a.organization_id, 'reminders') loop
    v_days := r.lease_end - v_today;
    v_bucket := case when v_days <= 3 then 3 when v_days <= 14 then 14 else 30 end;
    v_when := case v_days when 0 then 'დღეს იწურება' when 1 then 'ხვალ იწურება' else v_days || ' დღეში იწურება' end;
    perform public.notify_managers(r.organization_id, 'ხელშეკრულება იწურება: ' || r.name,
      coalesce(r.tenant_name || ' · ', '') || 'ვადა ' || to_char(r.lease_end, 'DD.MM.YYYY') || ' · ' || v_when,
      'renewal', '/app/#/apartments/' || r.id, 'renewal:' || r.id || ':' || r.lease_end || ':' || v_bucket);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Telegram delivery helpers for the daily cron
-- -----------------------------------------------------------------------------
-- Managers each get their own notification row; the chat gets one message per event.
create or replace function public.pending_telegram_notifications(p_limit integer default 200)
returns table (chat_id bigint, organization_id uuid, title text, message text, type text, link text, ids uuid[])
language sql stable security definer set search_path to 'public' as $$
  select tc.chat_id, n.organization_id, min(n.title), min(n.message), min(n.type), min(n.link), array_agg(n.id)
  from public.notifications n join public.telegram_chats tc on tc.organization_id = n.organization_id
  where n.sent_telegram_at is null and n.type in ('renewal', 'overdue') and n.created_at > now() - interval '3 days'
  group by tc.chat_id, n.organization_id, coalesce(n.dedup_key, n.id::text)
  order by min(n.created_at) limit p_limit;
$$;

create or replace function public.mark_telegram_sent(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now() where id = any(p_ids) and sent_telegram_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Notifications with no linked chat (or too old to send) are closed so they never pile up.
create or replace function public.close_stale_telegram_notifications()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now()
  where sent_telegram_at is null and type in ('renewal', 'overdue') and created_at <= now() - interval '3 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- For the /renewals bot command: leases ending within p_days (or expired in the last 30 days).
create or replace function public.get_telegram_renewals(p_org_id uuid, p_days integer default 30)
returns table (name text, tenant_name text, lease_end date, days_left integer)
language sql stable security definer set search_path to 'public' as $$
  select a.name, a.tenant_name, a.lease_end, (a.lease_end - (now() at time zone 'Asia/Tbilisi')::date)::integer
  from public.apartments a
  where a.organization_id = p_org_id and a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
    and a.lease_end <= (now() at time zone 'Asia/Tbilisi')::date + least(greatest(p_days, 1), 365)
    and a.lease_end >= (now() at time zone 'Asia/Tbilisi')::date - 30
  order by a.lease_end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Link opened / WhatsApp / call: count it and say who to tell.
--    Called by /api/link-event with the service role. Counting, dedup and rate
--    limits stay in track_link_event; this adds the in-app notification and the
--    Telegram chats, at most once per visitor and listing per hour and at most
--    20 per workspace per hour.
-- -----------------------------------------------------------------------------
create or replace function public.track_link_event_notify(p_ref text, p_kind text, p_visitor text default null, p_selection_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_visitor text := nullif(left(regexp_replace(coalesce(p_visitor, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_id uuid; v_apt public.apartments; v_event bigint; v_title text; v_chats jsonb;
begin
  if not public.track_link_event(p_ref, p_kind, p_visitor, p_selection_id) then
    return jsonb_build_object('ok', true, 'counted', false);
  end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id := v_ref::uuid; end if;
  select * into v_apt from public.apartments where slug = v_ref or public_slug = v_ref or id = v_id limit 1;
  if not found or v_visitor is null then return jsonb_build_object('ok', true, 'counted', true); end if;

  select id into v_event from public.link_events
  where apartment_id = v_apt.id and visitor = v_visitor and kind = p_kind order by id desc limit 1;

  if v_event is null
     or exists (select 1 from public.link_events
                where apartment_id = v_apt.id and visitor = v_visitor and notified_at > now() - interval '60 minutes')
     or (select count(*) from public.link_events
         where organization_id = v_apt.organization_id and notified_at > now() - interval '60 minutes') >= 20 then
    return jsonb_build_object('ok', true, 'counted', true);
  end if;
  update public.link_events set notified_at = now() where id = v_event;

  v_title := case p_kind when 'view' then 'ბმული გაიხსნა: ' when 'whatsapp' then 'WhatsApp-ით დაკავშირება: ' else 'ზარის ღილაკი: ' end || v_apt.name;
  perform public.notify_managers(v_apt.organization_id, v_title,
    case when p_selection_id is not null then 'შერჩეული ბინების ბმულიდან.' else 'ბინის ბმულიდან.' end,
    'info', '/app/#/apartments/' || v_apt.id, 'link:' || v_event);

  select coalesce(jsonb_agg(chat_id), '[]'::jsonb) into v_chats from (
    select chat_id from public.telegram_chats
    where organization_id = v_apt.organization_id and notify_views = 'all' limit 10) t;

  return jsonb_build_object('ok', true, 'counted', true, 'notify', jsonb_build_object(
    'chat_ids', v_chats, 'kind', p_kind, 'apartment_id', v_apt.id, 'apartment_name', v_apt.name));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.consume_telegram_link_code(text, bigint, text), public.pending_telegram_notifications(integer),
  public.mark_telegram_sent(uuid[]), public.close_stale_telegram_notifications(), public.get_telegram_renewals(uuid, integer),
  public.track_link_event_notify(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_telegram_link_code(text, bigint, text), public.pending_telegram_notifications(integer),
  public.mark_telegram_sent(uuid[]), public.close_stale_telegram_notifications(), public.get_telegram_renewals(uuid, integer),
  public.track_link_event_notify(text, text, text, uuid) to service_role;

-- scan_lease_renewals: managers (checked inside) and the service role / cron
revoke execute on function public.scan_lease_renewals(uuid) from public, anon;
grant execute on function public.scan_lease_renewals(uuid) to authenticated, service_role;
