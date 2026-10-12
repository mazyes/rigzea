-- =============================================================================
-- Sharing foundations: readable listing links, publish switch, secure Telegram linking
-- Safe to run more than once. Changes no existing data except to fill in missing slugs.
--
-- DEPLOY ORDER: section 3 removes anonymous access to the Telegram functions. Deploy the
-- bot code that uses SUPABASE_SERVICE_ROLE_KEY (api/telegram.js) and set that variable in
-- Vercel BEFORE applying this, or the bot stops answering until you do.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. CATCH-UP: the live database predates the agent features in schema.sql.
--    Checked on 2026-10-12: apartments had 23 of 47 columns and the deals table did not exist.
--    Every statement is a no-op where the object is already there.
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists rental_type text default 'short_term' check (rental_type in ('short_term', 'long_term', 'hybrid'));
alter table public.apartments add column if not exists district text;
alter table public.apartments add column if not exists currency text default 'USD' check (currency in ('USD', 'GEL'));
alter table public.apartments add column if not exists rooms integer default 2;
alter table public.apartments add column if not exists floor text;
alter table public.apartments add column if not exists total_floors integer;
alter table public.apartments add column if not exists area_sqm numeric(8,2);
alter table public.apartments add column if not exists pets_allowed boolean default false;
alter table public.apartments add column if not exists utilities_estimate numeric(10,2);
alter table public.apartments add column if not exists prepayment_terms text;
alter table public.apartments add column if not exists agent_phone text;
alter table public.apartments add column if not exists agent_commission_percent numeric(5,2) default 50.00;
alter table public.apartments add column if not exists owner_bonus numeric(10,2) default 0;
alter table public.apartments add column if not exists cobroker_split numeric(5,2) default 50.00;
alter table public.apartments add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.apartments add column if not exists description text;
alter table public.apartments add column if not exists description_en text;
alter table public.apartments add column if not exists amenities jsonb not null default '[]'::jsonb;
alter table public.apartments add column if not exists tenant_name text;
alter table public.apartments add column if not exists tenant_phone text;
alter table public.apartments add column if not exists monthly_rent numeric(10,2);
alter table public.apartments add column if not exists rent_due_day integer default 1;
alter table public.apartments add column if not exists deposit_amount numeric(10,2);
alter table public.apartments add column if not exists lease_end date;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete set null,
  client_name text not null,
  client_phone text,
  client_email text,
  stage text not null default 'active' check (stage in ('active', 'viewing', 'deposit', 'closed', 'lost')),
  deal_amount numeric(10,2) default 0,
  currency text not null default 'USD' check (currency in ('USD', 'GEL')),
  commission_percent numeric(5,2) default 50.00,
  commission_amount numeric(10,2) default 0,
  owner_bonus numeric(10,2) default 0,
  partner_agent text,
  partner_phone text,
  cobroker_split numeric(5,2) default 50.00,
  net_commission numeric(10,2) default 0,
  viewing_date timestamptz,
  deposit_paid_at timestamptz,
  closed_at timestamptz,
  target_move_in date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_deals_org on public.deals(organization_id, created_at desc);
alter table public.deals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_select') then
    create policy deals_select on public.deals for select using (public.is_org_manager(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_insert') then
    create policy deals_insert on public.deals for insert with check (public.is_org_manager(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_update') then
    create policy deals_update on public.deals for update using (public.is_org_manager(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_delete') then
    create policy deals_delete on public.deals for delete using (public.is_org_admin(organization_id));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. LISTINGS: public slug and publish switch
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists public_slug text;
alter table public.apartments add column if not exists is_published boolean not null default true;

update public.apartments set public_slug = substr(md5(gen_random_uuid()::text), 1, 10) where public_slug is null or public_slug = '';

create unique index if not exists uq_apartments_public_slug on public.apartments(public_slug);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartments_public_slug_format') then
    alter table public.apartments add constraint apartments_public_slug_format check (public_slug ~ '^[a-z0-9-]{6,80}$');
  end if;
end $$;

-- The app sends a readable slug; this covers rows created any other way (import, SQL, older clients).
create or replace function public.apartments_set_slug()
returns trigger language plpgsql as $$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := substr(md5(gen_random_uuid()::text), 1, 10);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apartments_slug on public.apartments;
create trigger trg_apartments_slug before insert on public.apartments
  for each row execute function public.apartments_set_slug();

-- -----------------------------------------------------------------------------
-- 2. PUBLIC LISTING LOOKUP (slug or id). Missing, archived and unpublished all look the same.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_listing(p_ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_apt public.apartments%rowtype;
  v_org record;
  v_id uuid;
begin
  if p_ref is null or length(p_ref) > 100 then
    return jsonb_build_object('success', false);
  end if;
  if p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_ref::uuid;
  end if;

  select * into v_apt from public.apartments
  where (public_slug = lower(p_ref) or id = v_id)
    and coalesce(is_archived, false) = false
    and status <> 'archived'
    and is_published
  limit 1;
  if not found then
    return jsonb_build_object('success', false);
  end if;

  select name, contact_phone into v_org from public.organizations where id = v_apt.organization_id;

  -- Only fields meant for the public. Owner details, door code, wifi and notes never leave here.
  return jsonb_build_object(
    'success', true,
    'apartment', jsonb_build_object(
      'id', v_apt.id,
      'public_slug', v_apt.public_slug,
      'name', v_apt.name,
      'address', v_apt.address,
      'city', v_apt.city,
      'district', v_apt.district,
      'rooms', coalesce(v_apt.rooms, v_apt.bedrooms),
      'bedrooms', v_apt.bedrooms,
      'floor', v_apt.floor,
      'total_floors', v_apt.total_floors,
      'area_sqm', v_apt.area_sqm,
      'monthly_rent', v_apt.monthly_rent,
      'currency', coalesce(v_apt.currency, 'USD'),
      'rental_type', v_apt.rental_type,
      'pets_allowed', coalesce(v_apt.pets_allowed, false),
      'utilities_estimate', v_apt.utilities_estimate,
      'prepayment_terms', v_apt.prepayment_terms,
      'deposit_amount', v_apt.deposit_amount,
      'agent_phone', coalesce(v_apt.agent_phone, v_org.contact_phone),
      'photos', coalesce(v_apt.photos, '[]'::jsonb),
      'description', v_apt.description,
      'description_en', v_apt.description_en,
      'amenities', coalesce(v_apt.amenities, '[]'::jsonb)
    ),
    'agency', jsonb_build_object(
      'name', v_org.name,
      'phone', coalesce(v_apt.agent_phone, v_org.contact_phone)
    )
  );
end;
$$;

-- Old links call the id-based function; route them through the same rules.
create or replace function public.get_public_showcase(p_apartment_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.get_public_listing(p_apartment_id::text);
$$;

revoke execute on function public.get_public_listing(text) from public;
grant execute on function public.get_public_listing(text) to anon, authenticated, service_role;
revoke execute on function public.get_public_showcase(uuid) from public;
grant execute on function public.get_public_showcase(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. TELEGRAM: link by one-time code, per user. Linking by organisation id is closed.
-- -----------------------------------------------------------------------------
alter table public.telegram_chats add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.telegram_chats add column if not exists notify_views text not null default 'all';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_chats_notify_views_check') then
    alter table public.telegram_chats add constraint telegram_chats_notify_views_check check (notify_views in ('all', 'named', 'off'));
  end if;
end $$;

create index if not exists idx_telegram_chats_org on public.telegram_chats(organization_id);

create table if not exists public.telegram_link_codes (
  code text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz
);
alter table public.telegram_link_codes enable row level security; -- no policies: only reachable through the functions below

-- A signed-in manager asks for a code, then sends it to the bot.
create or replace function public.create_telegram_link_code(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_org_manager(p_org) then
    raise exception 'not allowed';
  end if;
  delete from public.telegram_link_codes where user_id = auth.uid() or expires_at < now();
  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.telegram_link_codes (code, organization_id, user_id) values (v_code, p_org, auth.uid());
  return v_code;
end;
$$;

-- Called by the bot with the service key. A code works once and for 15 minutes.
create or replace function public.redeem_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.telegram_link_codes%rowtype; v_org record;
begin
  select * into v_row from public.telegram_link_codes
  where code = upper(trim(p_code)) and used_at is null and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('success', false);
  end if;
  update public.telegram_link_codes set used_at = now() where code = v_row.code;

  insert into public.telegram_chats (chat_id, organization_id, user_id, user_name)
  values (p_chat_id, v_row.organization_id, v_row.user_id, p_user_name)
  on conflict (chat_id) do update
    set organization_id = excluded.organization_id, user_id = excluded.user_id,
        user_name = coalesce(excluded.user_name, telegram_chats.user_name), linked_at = now();

  select id, name, city into v_org from public.organizations where id = v_row.organization_id;
  return jsonb_build_object('success', true, 'org_id', v_org.id, 'org_name', v_org.name, 'city', v_org.city);
end;
$$;

-- What the settings screen shows for the signed-in user.
create or replace function public.get_my_telegram_link(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('linked', true, 'user_name', user_name, 'linked_at', linked_at, 'notify_views', notify_views)
     from public.telegram_chats where user_id = auth.uid() and organization_id = p_org order by linked_at desc limit 1),
    jsonb_build_object('linked', false));
$$;

create or replace function public.set_my_telegram_notify(p_org uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('all', 'named', 'off') then raise exception 'invalid mode'; end if;
  update public.telegram_chats set notify_views = p_mode where user_id = auth.uid() and organization_id = p_org;
end;
$$;

create or replace function public.unlink_my_telegram(p_org uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.telegram_chats where user_id = auth.uid() and organization_id = p_org;
$$;

revoke execute on function public.create_telegram_link_code(uuid), public.get_my_telegram_link(uuid),
  public.set_my_telegram_notify(uuid, text), public.unlink_my_telegram(uuid) from public, anon;
grant execute on function public.create_telegram_link_code(uuid), public.get_my_telegram_link(uuid),
  public.set_my_telegram_notify(uuid, text), public.unlink_my_telegram(uuid) to authenticated;

revoke execute on function public.redeem_telegram_link_code(text, bigint, text) from public, anon, authenticated;
grant execute on function public.redeem_telegram_link_code(text, bigint, text) to service_role;

-- These trusted a caller-supplied organisation id, and organisation ids are visible in public file URLs.
-- From here on only the bot's server key may call them.
revoke execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint),
  public.get_telegram_org(uuid), public.get_telegram_apartments(uuid),
  public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.get_linked_telegram_org(bigint), public.get_telegram_apartments(uuid),
  public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) to service_role;
