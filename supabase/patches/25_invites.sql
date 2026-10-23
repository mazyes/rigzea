-- 25_invites.sql
-- Invitation links that work: a private token in the link, a landing page that knows who invited whom,
-- a safe way to accept (the signed in email must be the invited email) and a limited email resend.
-- Re-runnable. Needs the invitations table and the organization_members seat trigger from earlier patches.

alter table public.invitations add column if not exists send_count integer not null default 0;
alter table public.invitations add column if not exists last_sent_at timestamptz;
-- New invitations are valid for 14 days (older rows without a date keep working).
alter table public.invitations alter column expires_at set default (now() + interval '14 days');
create unique index if not exists invitations_token_key on public.invitations (token) where token is not null;

-- What the invitation link shows before anyone signs in: who invited you, to which workspace, in which role.
-- The token is a random 128 bit secret, so only the person who got the link can look it up.
create or replace function public.get_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select i.email, i.role, i.status, i.expires_at, o.name as org_name,
         (select m.display_name from public.organization_members m where m.user_id = i.invited_by and m.organization_id = i.organization_id limit 1) as inviter
    into r
    from public.invitations i join public.organizations o on o.id = i.organization_id
   where i.token = p_token;
  if not found then return null; end if;
  return jsonb_build_object('email', r.email, 'role', r.role, 'org_name', r.org_name, 'inviter', r.inviter,
    'state', case when r.status <> 'pending' then r.status
                  when r.expires_at is not null and r.expires_at <= now() then 'expired'
                  else 'pending' end);
end;
$$;
revoke all on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

-- Accepting: only the person whose email was invited, only while pending and not expired.
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_name text; r public.invitations;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  select lower(email), raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = auth.uid();
  select * into r from public.invitations where token = p_token for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if lower(r.email) <> v_email then
    raise exception 'invitation is for another email' using errcode = '42501';
  end if;
  if r.status = 'accepted' and exists (select 1 from public.organization_members m where m.organization_id = r.organization_id and m.user_id = auth.uid()) then
    return jsonb_build_object('organization_id', r.organization_id, 'role', r.role, 'already', true);
  end if;
  if r.status <> 'pending' then
    raise exception 'invitation is %', r.status using errcode = '22023';
  end if;
  if r.expires_at is not null and r.expires_at <= now() then
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  insert into public.organization_members (organization_id, user_id, role, display_name)
    values (r.organization_id, auth.uid(), r.role, coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)))
    on conflict (organization_id, user_id) do nothing;
  update public.invitations set status = 'accepted' where id = r.id;
  return jsonb_build_object('organization_id', r.organization_id, 'role', r.role, 'already', false);
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- The email: only an owner or admin of that workspace, only for a pending invitation, at most 5 sends and 30 seconds apart.
-- Resending also extends the validity. The server function gets everything it writes into the email from here.
create or replace function public.invitation_email_data(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare r public.invitations; v_org text; v_inviter text; v_until timestamptz;
begin
  select * into r from public.invitations where id = p_id;
  if not found or not public.is_org_admin(r.organization_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'invitation is not pending' using errcode = '22023';
  end if;
  if r.send_count >= 5 then
    raise exception 'too many emails for this invitation' using errcode = '54000';
  end if;
  if r.last_sent_at is not null and r.last_sent_at > now() - interval '30 seconds' then
    raise exception 'wait a moment before sending again' using errcode = '54000';
  end if;
  update public.invitations
     set send_count = send_count + 1, last_sent_at = now(),
         expires_at = case when expires_at is null or expires_at < now() + interval '7 days' then now() + interval '14 days' else expires_at end
   where id = p_id returning expires_at into v_until;
  select name into v_org from public.organizations where id = r.organization_id;
  select coalesce(nullif(m.display_name, ''), u.email) into v_inviter
    from auth.users u left join public.organization_members m on m.user_id = u.id and m.organization_id = r.organization_id
   where u.id = auth.uid();
  return jsonb_build_object('email', r.email, 'role', r.role, 'token', r.token, 'org_name', v_org, 'inviter', v_inviter, 'expires_at', v_until);
end;
$$;
revoke all on function public.invitation_email_data(uuid) from public, anon;
grant execute on function public.invitation_email_data(uuid) to authenticated;
