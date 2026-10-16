-- =============================================================================
-- RIGZEA patch 21 — KISA & subscription payments
-- Stores payment transactions, ensures idempotency, and provides an RPC
-- to extend organizations.plan_expires_at when payment succeeds.
-- Idempotent: safe to run more than once.
-- =============================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  plan text not null check (plan in ('pro', 'top', 'agency')),
  amount numeric(10, 2) not null,
  currency text not null default 'GEL',
  provider text not null default 'kisa',
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_org_created
  on public.payments (organization_id, created_at desc);

create unique index if not exists idx_payments_provider_order
  on public.payments (provider, provider_order_id)
  where provider_order_id is not null;

alter table public.payments enable row level security;

-- Workspace members can see their organization's payment history
drop policy if exists payments_org_member on public.payments;
create policy payments_org_member on public.payments
  for select using (
    exists (
      select 1 from public.organization_members
      where organization_id = payments.organization_id and user_id = auth.uid()
    )
  );

-- RPC for service role to activate subscription upon successful payment
create or replace function public.activate_org_subscription(
  p_org uuid,
  p_plan text,
  p_days integer default 30,
  p_payment_id uuid default null,
  p_provider_payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org public.organizations;
  v_days integer := coalesce(p_days, 30);
  v_owner_email text;
  v_plan_name text;
begin
  if p_plan not in ('pro', 'top', 'agency') then
    raise exception 'არასწორი პაკეტი: %', p_plan using errcode = 'P0001';
  end if;

  -- 1. Update organization plan & expiration
  update public.organizations set
    plan = p_plan,
    plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => v_days),
    updated_at = now()
  where id = p_org
  returning * into v_org;

  if not found then
    raise exception 'ორგანიზაცია ვერ მოიძებნა.' using errcode = 'P0001';
  end if;

  -- 2. Update payment row if provided
  if p_payment_id is not null then
    update public.payments set
      status = 'completed',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
    where id = p_payment_id;
  elsif p_provider_payment_id is not null then
    update public.payments set
      status = 'completed',
      provider_payment_id = p_provider_payment_id,
      updated_at = now()
    where provider = 'kisa' and provider_order_id = p_provider_payment_id;
  end if;

  -- 3. Log event
  select email into v_owner_email
    from public.organization_members m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_org and m.role = 'owner'
   order by m.created_at limit 1;

  v_plan_name := case p_plan
    when 'pro' then 'პრო აგენტი'
    when 'top' then 'გუნდი'
    when 'agency' then 'სააგენტო'
    else p_plan
  end;

  insert into public.activity_events (organization_id, event_type, title, metadata)
  values (
    p_org,
    'plan_activated',
    'პაკეტი გააქტიურდა: ' || v_plan_name || ' (' || v_days || ' დღე)',
    jsonb_build_object('plan', p_plan, 'days', v_days, 'expires_at', v_org.plan_expires_at)
  );

  return jsonb_build_object(
    'ok', true,
    'org_id', v_org.id,
    'plan', v_org.plan,
    'plan_expires_at', v_org.plan_expires_at,
    'owner_email', v_owner_email
  );
end;
$$;

revoke all on function public.activate_org_subscription(uuid, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_org_subscription(uuid, text, integer, uuid, text) to service_role;
