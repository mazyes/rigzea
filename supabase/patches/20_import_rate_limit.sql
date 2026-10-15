-- 20_import_rate_limit.sql
-- Link import (api/import-listing.js) is a paid feature, but nothing stopped a signed-in user from
-- pulling listings in a tight loop. Every call is an outbound fetch to MyHome.ge, SS.ge or
-- Place.ge, so one account could use up the workspace's hourly budget and get those sites to
-- block us. This adds a cap of 10 imports an hour per user, counted in the database so it holds
-- across serverless instances.
--
-- The attempt is recorded inside the function, so a caller cannot choose not to be counted. The
-- API fails open when this function is missing, which is what lets the code ship before this
-- patch is applied.

create table if not exists public.import_requests (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_import_requests_user_time
  on public.import_requests (user_id, created_at desc);

alter table public.import_requests enable row level security;

create or replace function public.register_import(p_org uuid, p_limit int default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user  uuid := auth.uid();
  v_count int;
begin
  if v_user is null then return false; end if;

  -- Only members of the workspace they are importing into.
  if not exists (select 1 from public.organization_members
                  where organization_id = p_org and user_id = v_user) then
    return false;
  end if;

  -- Keep the table small: only the last day is ever needed.
  delete from public.import_requests where created_at < now() - interval '1 day';

  select count(*) into v_count
    from public.import_requests
   where user_id = v_user and created_at > now() - interval '1 hour';

  if v_count >= greatest(coalesce(p_limit, 10), 1) then
    return false;
  end if;

  insert into public.import_requests (organization_id, user_id) values (p_org, v_user);
  return true;
end
$fn$;

-- The table is written only through the function, so no API role may touch it directly.
revoke all on public.import_requests from anon, authenticated;
grant select, insert, update, delete on public.import_requests to service_role;

revoke execute on function public.register_import(uuid, int) from public;
grant execute on function public.register_import(uuid, int) to authenticated;
