-- 23_profile_branding.sql
-- Profile pictures, self-service profile edits and stricter storage folders.
-- Re-runnable. Needs: is_org_admin(uuid), is_org_member(uuid, uuid) from earlier patches.

-- 1. A profile picture per workspace member (the display name already lives here).
alter table public.organization_members add column if not exists avatar_url text;

-- 2. Storage folders. Everything keeps the old rule (any member of the workspace in the first folder),
--    except two sub-folders:
--      <org>/branding/...            only owners and admins (company logo)
--      <org>/avatars/<user id>/...   only that user (profile picture)
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
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$$;
grant execute on function public.can_write_org_folder(text) to authenticated;

-- 3. A member changes only their own name and picture. The role and every other column stay untouchable
--    from here (the members_update policy still limits direct updates to owners and admins).
create or replace function public.update_my_profile(
  p_org uuid, p_name text, p_avatar text default null, p_clear_avatar boolean default false)
returns public.organization_members
language plpgsql security definer set search_path = public, auth as $$
declare
  v_row public.organization_members;
  v_email text;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_prefix text := '/storage/v1/object/public/rigzea-public/' || p_org::text || '/avatars/' || auth.uid()::text || '/';
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  -- A real first and last name in Georgian letters (the account owner's address is exempt, as in the app).
  if v_name is not null and v_email is distinct from 'akhalaianika44@gmail.com'
     and v_name !~ '^[ა-ჿ]{2,}(-[ა-ჿ]{2,})*( [ა-ჿ]{2,}(-[ა-ჿ]{2,})*)+$' then
    raise exception 'name must be a first and last name in Georgian' using errcode = '22023';
  end if;
  if p_avatar is not null and (length(p_avatar) > 600 or p_avatar !~ '^https://[^ ]+$' or position(v_prefix in p_avatar) = 0) then
    raise exception 'picture must be in your own folder' using errcode = '22023';
  end if;
  update public.organization_members m
     set display_name = coalesce(v_name, m.display_name),
         avatar_url = case when p_clear_avatar then null when p_avatar is not null then p_avatar else m.avatar_url end
   where m.organization_id = p_org and m.user_id = auth.uid()
   returning m.* into v_row;
  if not found then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return v_row;
end;
$$;
revoke all on function public.update_my_profile(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_my_profile(uuid, text, text, boolean) to authenticated;
