-- =============================================================================
-- Patch 03: lease renewal reminders, Telegram link codes, Telegram RPC lockdown
-- Idempotent: safe to run more than once. Run after schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.notifications add column if not exists sent_telegram_at timestamptz;
create index if not exists idx_notifications_tg_pending on public.notifications(created_at) where sent_telegram_at is null;
alter table public.telegram_chats add column if not exists user_id uuid references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. One-time Telegram link codes (replace pasting the raw organization UUID)
-- -----------------------------------------------------------------------------
create table if not exists public.telegram_link_codes (
  code text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
alter table public.telegram_link_codes enable row level security; -- no policies: only reachable through RPCs

-- Called from the app by a signed-in manager. Returns { code, expires_at }.
create or replace function public.create_telegram_link_code(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  v_code text; v_i int; v_exp timestamptz := now() + interval '15 minutes';
begin
  if auth.uid() is null or not public.is_org_manager(p_org) then raise exception 'წვდომა შეზღუდულია'; end if;
  delete from public.telegram_link_codes where expires_at < now() - interval '1 day' or (user_id = auth.uid() and organization_id = p_org and used_at is null);
  loop
    v_code := '';
    for v_i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.telegram_link_codes (code, organization_id, user_id, expires_at) values (v_code, p_org, auth.uid(), v_exp);
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end;
$$;

-- Called by the bot (service role only). Consumes the code exactly once.
create or replace function public.consume_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row record; v_org record;
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
-- 3. Lease renewal scan: 30 / 14 / 3 days before apartments.lease_end
--    A lease that first appears inside a window (e.g. 10 days left) gets the
--    nearest threshold notice (14) once, so a missed cron day never loses a reminder.
-- -----------------------------------------------------------------------------
create or replace function public.scan_lease_renewals(p_org uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; v_today date := (now() at time zone 'Asia/Tbilisi')::date; v_days int; v_bucket int; v_count integer := 0; v_when text;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then raise exception 'წვდომა შეზღუდულია'; end if;
  for r in select a.id, a.organization_id, a.name, a.tenant_name, a.lease_end from public.apartments a
           where a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
             and a.lease_end >= v_today and a.lease_end <= v_today + 30 and (p_org is null or a.organization_id = p_org) loop
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
-- 4. Telegram delivery helpers (service role only)
-- -----------------------------------------------------------------------------
-- One row per (chat, event): managers each get their own notification row, the chat gets one message.
create or replace function public.pending_telegram_notifications(p_limit integer default 200)
returns table (chat_id bigint, organization_id uuid, title text, message text, type text, link text, ids uuid[])
language sql stable security definer set search_path = public as $$
  select tc.chat_id, n.organization_id, min(n.title), min(n.message), min(n.type), min(n.link), array_agg(n.id)
  from public.notifications n join public.telegram_chats tc on tc.organization_id = n.organization_id
  where n.sent_telegram_at is null and n.type in ('renewal', 'overdue') and n.created_at > now() - interval '3 days'
  group by tc.chat_id, n.organization_id, coalesce(n.dedup_key, n.id::text)
  order by min(n.created_at) limit p_limit;
$$;

create or replace function public.mark_telegram_sent(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now() where id = any(p_ids) and sent_telegram_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Notifications with no linked chat (or too old to send) are closed so they never pile up.
create or replace function public.close_stale_telegram_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now()
  where sent_telegram_at is null and type in ('renewal', 'overdue') and created_at <= now() - interval '3 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- For the /renewals bot command: leases ending within p_days (or already expired in the last 30 days).
create or replace function public.get_telegram_renewals(p_org_id uuid, p_days integer default 30)
returns table (name text, tenant_name text, lease_end date, days_left integer)
language sql stable security definer set search_path = public as $$
  select a.name, a.tenant_name, a.lease_end, (a.lease_end - (now() at time zone 'Asia/Tbilisi')::date)::integer
  from public.apartments a
  where a.organization_id = p_org_id and a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
    and a.lease_end <= (now() at time zone 'Asia/Tbilisi')::date + least(greatest(p_days, 1), 365)
    and a.lease_end >= (now() at time zone 'Asia/Tbilisi')::date - 30
  order by a.lease_end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permissions. The anon key is public, so the bot must never rely on it:
--    every Telegram RPC (including the old raw-UUID link) is service_role only.
-- -----------------------------------------------------------------------------
revoke execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint), public.get_telegram_org(uuid),
  public.get_telegram_apartments(uuid), public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint), public.get_telegram_org(uuid),
  public.get_telegram_apartments(uuid), public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) to service_role;

revoke execute on function public.consume_telegram_link_code(text, bigint, text), public.pending_telegram_notifications(integer),
  public.mark_telegram_sent(uuid[]), public.close_stale_telegram_notifications(), public.get_telegram_renewals(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_telegram_link_code(text, bigint, text), public.pending_telegram_notifications(integer),
  public.mark_telegram_sent(uuid[]), public.close_stale_telegram_notifications(), public.get_telegram_renewals(uuid, integer) to service_role;

revoke execute on function public.create_telegram_link_code(uuid) from public, anon;
grant execute on function public.create_telegram_link_code(uuid) to authenticated;

-- scan_lease_renewals: managers (checked inside) and the service role / cron
revoke execute on function public.scan_lease_renewals(uuid) from public, anon;
grant execute on function public.scan_lease_renewals(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Daily schedule: 09:00 Asia/Tbilisi = 05:00 UTC. Skipped silently when pg_cron
--    is unavailable (the Vercel cron /api/cron-reminders runs the same scan).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron unavailable (%), skipping schedule; rely on the Vercel cron', sqlerrm;
    end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'rigzea-scan-lease-renewals'$q$;
      execute $q$select cron.schedule('rigzea-scan-lease-renewals', '0 5 * * *', 'select public.scan_lease_renewals()')$q$;
    exception when others then
      raise notice 'could not schedule pg_cron job: %', sqlerrm;
    end;
  end if;
end
$$;
