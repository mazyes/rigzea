-- 24_chat.sql
-- Internal company chat: one company-wide channel per workspace plus direct messages.
-- Owners, admins, managers and agents can chat; staff (cleaners, technicians) cannot.
-- Every rule lives here, in row level security, triggers and RPCs, not in the browser.
-- Re-runnable. Needs: is_org_admin(uuid) from earlier patches and patch 23 (can_write_org_folder).

-- 1. Who may chat: a member of the workspace with one of these roles. Checked live on every request,
--    so a role change or removal cuts access at once, even in an open session.
create or replace function public.chat_allowed(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'manager', 'agent'));
$$;
revoke all on function public.chat_allowed(uuid) from public, anon;
grant execute on function public.chat_allowed(uuid) to authenticated;

-- 2. Tables
create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('company', 'direct')),
  dm_key text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists chat_channels_one_company on public.chat_channels (organization_id) where kind = 'company';
create unique index if not exists chat_channels_one_direct on public.chat_channels (organization_id, dm_key) where kind = 'direct';

create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user on public.chat_channel_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null,
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.chat_messages(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_time on public.chat_messages (channel_id, created_at desc);

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '🙏', '👀')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.chat_reactions replica identity full; -- realtime delete events carry the whole row

-- 3. Membership check used by the policies (security definer: no recursion through the members table)
create or replace function public.chat_member(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_channel_members cm
    where cm.channel_id = p_channel and cm.user_id = auth.uid() and public.chat_allowed(cm.organization_id));
$$;
revoke all on function public.chat_member(uuid) from public, anon;
grant execute on function public.chat_member(uuid) to authenticated;

-- 4. Row level security. No delete policy on messages: removal is a soft delete done by an update.
alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;

drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels for select to authenticated using (public.chat_member(id));

drop policy if exists chat_members_select on public.chat_channel_members;
create policy chat_members_select on public.chat_channel_members for select to authenticated using (public.chat_member(channel_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select to authenticated using (public.chat_member(channel_id));
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_member(channel_id)
    and organization_id = (select c.organization_id from public.chat_channels c where c.id = channel_id));
drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages for update to authenticated
  using (public.chat_member(channel_id) and (sender_id = auth.uid() or public.is_org_admin(organization_id)))
  with check (public.chat_member(channel_id) and (sender_id = auth.uid() or public.is_org_admin(organization_id)));

drop policy if exists chat_reactions_select on public.chat_reactions;
create policy chat_reactions_select on public.chat_reactions for select to authenticated using (public.chat_member(channel_id));
drop policy if exists chat_reactions_insert on public.chat_reactions;
create policy chat_reactions_insert on public.chat_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.chat_member(channel_id)
    and exists (select 1 from public.chat_messages m where m.id = message_id and m.channel_id = chat_reactions.channel_id and m.organization_id = chat_reactions.organization_id and m.deleted_at is null));
drop policy if exists chat_reactions_delete on public.chat_reactions;
create policy chat_reactions_delete on public.chat_reactions for delete to authenticated using (user_id = auth.uid());

-- Grants: nothing for anon, only what the app needs for signed in users.
revoke all on public.chat_channels, public.chat_channel_members, public.chat_messages, public.chat_reactions from anon, authenticated;
grant select on public.chat_channels, public.chat_channel_members to authenticated;
grant select, insert, update on public.chat_messages to authenticated;
grant select, insert, delete on public.chat_reactions to authenticated;

-- 5. Message rules that policies cannot express
create or replace function public.chat_messages_before_insert()
returns trigger language plpgsql set search_path = public as $$
declare a jsonb; n int;
begin
  new.body := btrim(coalesce(new.body, ''));
  if jsonb_typeof(new.attachments) is distinct from 'array' or jsonb_array_length(new.attachments) > 5 then
    raise exception 'at most 5 attachments' using errcode = '22023';
  end if;
  if new.body = '' and jsonb_array_length(new.attachments) = 0 then
    raise exception 'empty message' using errcode = '22023';
  end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if coalesce(a->>'path', '') not like (new.organization_id::text || '/chat/' || new.channel_id::text || '/%') or position('..' in a->>'path') > 0 then
      raise exception 'attachment must be in this conversation folder' using errcode = '22023';
    end if;
  end loop;
  if new.reply_to is not null and not exists (select 1 from public.chat_messages r where r.id = new.reply_to and r.channel_id = new.channel_id) then
    raise exception 'reply must be in the same conversation' using errcode = '22023';
  end if;
  select count(*) into n from public.chat_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute';
  if n >= 30 then
    raise exception 'too many messages, wait a moment' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

create or replace function public.chat_messages_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.channel_id <> old.channel_id or new.organization_id <> old.organization_id
     or new.sender_id <> old.sender_id or new.created_at <> old.created_at or new.reply_to is distinct from old.reply_to then
    raise exception 'this part of a message cannot change' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'a deleted message cannot change' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    -- delete: the author or an owner/admin; the text and files are wiped, only the tombstone stays
    if old.sender_id <> auth.uid() and not public.is_org_admin(old.organization_id) then
      raise exception 'only the author or an admin can delete' using errcode = '42501';
    end if;
    new.deleted_by := auth.uid();
    new.body := '';
    new.attachments := '[]'::jsonb;
    return new;
  end if;
  if new.attachments is distinct from old.attachments or new.deleted_by is distinct from old.deleted_by then
    raise exception 'this part of a message cannot change' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if old.sender_id <> auth.uid() then
      raise exception 'only the author edits a message' using errcode = '42501';
    end if;
    new.body := btrim(new.body);
    if new.body = '' and jsonb_array_length(old.attachments) = 0 then
      raise exception 'empty message' using errcode = '22023';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists chat_messages_before_update on public.chat_messages;
create trigger chat_messages_before_update before update on public.chat_messages
  for each row execute function public.chat_messages_before_update();

-- 6. RPCs: the only way to start a direct chat or move the read mark
create or replace function public.chat_open_direct(p_org uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_key text; v_id uuid;
begin
  if v_me is null or not public.chat_allowed(p_org) then
    raise exception 'chat is not available for this account' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'pick another member' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_members m where m.organization_id = p_org and m.user_id = p_other and m.role in ('owner', 'admin', 'manager', 'agent')) then
    raise exception 'that person cannot use chat' using errcode = '42501';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select id into v_id from public.chat_channels where organization_id = p_org and kind = 'direct' and dm_key = v_key;
  if v_id is null then
    insert into public.chat_channels (organization_id, kind, dm_key, created_by) values (p_org, 'direct', v_key, v_me)
      on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.chat_channels where organization_id = p_org and kind = 'direct' and dm_key = v_key;
    end if;
  end if;
  insert into public.chat_channel_members (channel_id, organization_id, user_id) values (v_id, p_org, v_me), (v_id, p_org, p_other)
    on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function public.chat_open_direct(uuid, uuid) from public, anon;
grant execute on function public.chat_open_direct(uuid, uuid) to authenticated;

create or replace function public.chat_mark_read(p_channel uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_channel_members cm set last_read_at = now()
   where cm.channel_id = p_channel and cm.user_id = auth.uid() and public.chat_allowed(cm.organization_id);
$$;
revoke all on function public.chat_mark_read(uuid) from public, anon;
grant execute on function public.chat_mark_read(uuid) to authenticated;

-- Unread messages per conversation for the signed in person (runs with their rights, so RLS applies).
create or replace function public.chat_unread_counts(p_org uuid)
returns table (channel_id uuid, unread bigint) language sql stable set search_path = public as $$
  select cm.channel_id, count(msg.id)
    from public.chat_channel_members cm
    join public.chat_messages msg on msg.channel_id = cm.channel_id and msg.created_at > cm.last_read_at
         and msg.sender_id <> cm.user_id and msg.deleted_at is null
   where cm.user_id = auth.uid() and cm.organization_id = p_org
   group by cm.channel_id;
$$;
revoke all on function public.chat_unread_counts(uuid) from public, anon;
grant execute on function public.chat_unread_counts(uuid) to authenticated;

-- 7. The company channel exists for every workspace and follows the role list
create or replace function public.chat_company_channel(p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.chat_channels where organization_id = p_org and kind = 'company';
  if v_id is null then
    insert into public.chat_channels (organization_id, kind) values (p_org, 'company') on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from public.chat_channels where organization_id = p_org and kind = 'company'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.chat_company_channel(uuid) from public, anon, authenticated;

create or replace function public.chat_sync_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.chat_channel_members cm using public.chat_channels c
     where cm.channel_id = c.id and c.kind = 'company' and cm.organization_id = old.organization_id and cm.user_id = old.user_id;
    return old;
  end if;
  if new.role in ('owner', 'admin', 'manager', 'agent') then
    insert into public.chat_channel_members (channel_id, organization_id, user_id)
      values (public.chat_company_channel(new.organization_id), new.organization_id, new.user_id) on conflict do nothing;
  else
    delete from public.chat_channel_members cm using public.chat_channels c
     where cm.channel_id = c.id and c.kind = 'company' and cm.organization_id = new.organization_id and cm.user_id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists chat_sync_member on public.organization_members;
create trigger chat_sync_member after insert or update of role or delete on public.organization_members
  for each row execute function public.chat_sync_member();

create or replace function public.chat_new_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.chat_company_channel(new.id);
  return new;
end;
$$;
drop trigger if exists chat_new_org on public.organizations;
create trigger chat_new_org after insert on public.organizations for each row execute function public.chat_new_org();

-- Backfill: a company channel for every workspace and everyone who may chat in it.
insert into public.chat_channels (organization_id, kind)
  select o.id, 'company' from public.organizations o
   where not exists (select 1 from public.chat_channels c where c.organization_id = o.id and c.kind = 'company');
insert into public.chat_channel_members (channel_id, organization_id, user_id)
  select c.id, m.organization_id, m.user_id
    from public.organization_members m join public.chat_channels c on c.organization_id = m.organization_id and c.kind = 'company'
   where m.role in ('owner', 'admin', 'manager', 'agent')
  on conflict do nothing;

-- 8. Attachments: <org>/chat/<channel id>/<file>, only for members of that conversation
create or replace function public.can_write_org_folder(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_folder text := split_part(p_path, '/', 1);
  v_sub text := split_part(p_path, '/', 2);
  v_user text := split_part(p_path, '/', 3);
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  if v_sub = 'branding' then
    return public.is_org_admin(v_folder::uuid);
  end if;
  if v_sub = 'avatars' then
    return auth.uid() is not null and v_user = auth.uid()::text and public.is_org_member(v_folder::uuid, auth.uid());
  end if;
  if v_sub = 'chat' then
    return v_user ~ '^[0-9a-f-]{36}$' and public.chat_allowed(v_folder::uuid)
      and exists (select 1 from public.chat_channel_members cm
        where cm.channel_id = v_user::uuid and cm.organization_id = v_folder::uuid and cm.user_id = auth.uid());
  end if;
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$$;
grant execute on function public.can_write_org_folder(text) to authenticated;

-- 9. Realtime: people only receive rows their select policy allows
do $$
declare t text;
begin
  foreach t in array array['chat_messages', 'chat_reactions', 'chat_channel_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 10. Trigger functions are not callable through the API
revoke all on function public.chat_new_org() from public, anon, authenticated;
revoke all on function public.chat_sync_member() from public, anon, authenticated;
revoke all on function public.chat_messages_before_insert() from public, anon, authenticated;
revoke all on function public.chat_messages_before_update() from public, anon, authenticated;
