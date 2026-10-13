-- =============================================================================
-- RIGZEA patch 05 — Sales & Rentals Unified CRM
-- Adds property sales fields, 7-stage sales pipeline, buyer/seller contacts,
-- viewing appointments, and sales public listing support.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Apartments (Sales & Transaction Types)
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists transaction_type text not null default 'long_term';
alter table public.apartments add column if not exists property_type text not null default 'apartment';
alter table public.apartments add column if not exists sale_price numeric(12,2);
alter table public.apartments add column if not exists price_sqm numeric(10,2);
alter table public.apartments add column if not exists bathrooms integer default 1;

-- Backfill transaction_type for existing records
update public.apartments
set transaction_type = case
  when rental_type = 'short_term' then 'daily'
  else 'long_term'
end
where transaction_type is null or transaction_type = 'long_term';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartments_transaction_type_check') then
    alter table public.apartments add constraint apartments_transaction_type_check
      check (transaction_type in ('sale', 'long_term', 'daily'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'apartments_property_type_check') then
    alter table public.apartments add constraint apartments_property_type_check
      check (property_type in ('apartment', 'house', 'commercial', 'land'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Deals (Sales Pipeline & Commissions)
-- -----------------------------------------------------------------------------
alter table public.deals add column if not exists deal_type text not null default 'rental';
alter table public.deals add column if not exists contact_type text default 'buyer';
alter table public.deals add column if not exists commission_type text default 'percent';
alter table public.deals add column if not exists lead_source text;
alter table public.deals add column if not exists assigned_agent_id uuid references public.organization_members(id) on delete set null;
alter table public.deals add column if not exists seller_id uuid references public.owners(id) on delete set null;
alter table public.deals add column if not exists follow_up_date timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_deal_type_check') then
    alter table public.deals add constraint deals_deal_type_check
      check (deal_type in ('sale', 'rental', 'daily'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'deals_commission_type_check') then
    alter table public.deals add constraint deals_commission_type_check
      check (commission_type in ('percent', 'fixed'));
  end if;

  -- Relax or update stage check constraint to allow full 7 sales stages + legacy stages
  if exists (select 1 from pg_constraint where conname = 'deals_stage_check') then
    alter table public.deals drop constraint deals_stage_check;
  end if;
  alter table public.deals add constraint deals_stage_check
    check (stage in ('enquiry', 'contacted', 'viewing', 'offer', 'negotiation', 'deposit', 'closed', 'lost', 'active'));
end $$;

-- -----------------------------------------------------------------------------
-- 3. Owners / Contacts (Buyers, Sellers, Renters, Owners)
-- -----------------------------------------------------------------------------
alter table public.owners add column if not exists contact_type text not null default 'owner';
alter table public.owners add column if not exists budget_min numeric(12,2);
alter table public.owners add column if not exists budget_max numeric(12,2);
alter table public.owners add column if not exists budget_currency text default 'USD';
alter table public.owners add column if not exists preferred_city text;
alter table public.owners add column if not exists preferred_district text;
alter table public.owners add column if not exists requirements jsonb not null default '{}'::jsonb;
alter table public.owners add column if not exists lead_source text;
alter table public.owners add column if not exists assigned_to uuid references public.organization_members(id) on delete set null;
alter table public.owners add column if not exists follow_up_date timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'owners_contact_type_check') then
    alter table public.owners add constraint owners_contact_type_check
      check (contact_type in ('owner', 'seller', 'buyer', 'renter', 'other'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Tasks (Viewing appointments & Follow-ups)
-- -----------------------------------------------------------------------------
alter table public.tasks add column if not exists deal_id uuid references public.deals(id) on delete set null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tasks_type_check') then
    alter table public.tasks drop constraint tasks_type_check;
  end if;
  alter table public.tasks add constraint tasks_type_check
    check (type in ('cleaning', 'maintenance', 'repair', 'inspection', 'payment', 'viewing', 'followup', 'meeting', 'other'));
end $$;

-- -----------------------------------------------------------------------------
-- 5. Public Listing Function (Includes Sales Information Safely)
-- -----------------------------------------------------------------------------
create or replace function public.get_public_listing(p_ref text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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

  -- Only fields meant for the public. Owner details, door code, wifi and internal notes never leave here.
  return jsonb_build_object(
    'success', true,
    'apartment', jsonb_build_object(
      'id', v_apt.id,
      'public_slug', v_apt.public_slug,
      'name', v_apt.name,
      'address', v_apt.address,
      'city', v_apt.city,
      'district', v_apt.district,
      'transaction_type', coalesce(v_apt.transaction_type, case when v_apt.rental_type = 'short_term' then 'daily' else 'long_term' end),
      'property_type', coalesce(v_apt.property_type, 'apartment'),
      'sale_price', v_apt.sale_price,
      'price_sqm', v_apt.price_sqm,
      'bathrooms', coalesce(v_apt.bathrooms, 1),
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
$function$;
