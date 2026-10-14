-- 17_missing_columns.sql: Add missing columns required across patches and align schema

-- 1. Apartments: public_slug and is_published
alter table public.apartments add column if not exists public_slug text;
alter table public.apartments add column if not exists is_published boolean not null default true;
create index if not exists idx_apartments_public_slug on public.apartments (public_slug);

-- 2. Link events: visitor_id and notified_at
create table if not exists public.link_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  selection_id uuid,
  kind text not null check (kind in ('view', 'whatsapp', 'call')),
  visitor text,
  visitor_id text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.link_events enable row level security;
revoke all on public.link_events from anon;

alter table public.link_events add column if not exists visitor_id text;
alter table public.link_events add column if not exists notified_at timestamptz;
create index if not exists idx_link_events_notified on public.link_events (organization_id, notified_at);

-- 3. Telegram chats: notify_views and notify_reminders
alter table public.telegram_chats add column if not exists notify_views text default 'all';
alter table public.telegram_chats add column if not exists notify_reminders boolean default true;
