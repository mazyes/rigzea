-- =============================================================================
-- RIGZEA patch 11 — When the trial ends the workspace moves to the free plan
--   1. An ended trial counts as the free plan (it used to lock the workspace).
--   2. Paid features are checked in the database, not only in the app.
--   3. Properties above the plan limit stay in the workspace, but their public
--      links are paused until the plan fits them again.
-- Nothing is deleted: properties, selections, documents and branding stay stored
-- and come back as soon as a plan that includes them is active.
-- Additive. Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Effective plan
-- -----------------------------------------------------------------------------
create or replace function public.org_effective_plan(p_org uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when coalesce(o.plan, 'trial') = 'trial' then case when o.trial_ends_at is not null and o.trial_ends_at < now() then 'starter' else 'trial' end
    when o.plan <> 'starter' and o.plan_expires_at is not null and o.plan_expires_at < now() then 'starter'
    else o.plan
  end
  from public.organizations o where o.id = p_org;
$$;

-- -----------------------------------------------------------------------------
-- 2. Features per plan (mirrors PLANS in rigzea/app/app.js)
-- -----------------------------------------------------------------------------
create or replace function public.plan_has_feature(p_plan text, p_feature text)
returns boolean language sql immutable as $$
  select case p_plan
    when 'trial' then true
    when 'agency' then true
    when 'top' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders', 'selections', 'analytics', 'export')
    when 'pro' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders')
    else false
  end;
$$;

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.plan_has_feature(public.org_effective_plan(p_org), p_feature), false);
$$;
revoke execute on function public.org_has_feature(uuid, text) from public, anon;
grant execute on function public.org_has_feature(uuid, text) to authenticated;

-- New selections and documents need a plan that includes them. Existing rows stay readable.
create or replace function public.enforce_plan_feature()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_feature constant text := tg_argv[0];
begin
  if auth.uid() is null or public.org_has_feature(new.organization_id, v_feature) then return new; end if;
  raise exception 'ეს ფუნქცია შენს პაკეტში არ შედის. გადადი უფრო მაღალ პაკეტზე.' using errcode = 'P0001', hint = 'PLAN_FEATURE_' || upper(v_feature);
end $$;
revoke execute on function public.enforce_plan_feature() from public, anon, authenticated;

create or replace trigger trg_selections_plan before insert on public.selections
  for each row execute function public.enforce_plan_feature('selections');
create or replace trigger trg_contracts_plan before insert on public.contracts
  for each row execute function public.enforce_plan_feature('contracts');

-- Branding: a new logo or public name needs "profile", a brand colour needs "whitelabel".
-- Clearing a value is always allowed.
create or replace function public.protect_org_branding()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_platform_admin() then return new; end if;
  if ((new.logo_url is not null and new.logo_url is distinct from old.logo_url)
      or (new.agent_display_name is not null and new.agent_display_name is distinct from old.agent_display_name))
     and not public.org_has_feature(new.id, 'profile') then
    raise exception 'ბრენდინგი შენს პაკეტში არ შედის. გადადი უფრო მაღალ პაკეტზე.' using errcode = 'P0001', hint = 'PLAN_FEATURE_PROFILE';
  end if;
  if new.brand_color is not null and new.brand_color is distinct from old.brand_color
     and not public.org_has_feature(new.id, 'whitelabel') then
    raise exception 'ბრენდის ფერი შენს პაკეტში არ შედის. გადადი უფრო მაღალ პაკეტზე.' using errcode = 'P0001', hint = 'PLAN_FEATURE_WHITELABEL';
  end if;
  return new;
end $$;
revoke execute on function public.protect_org_branding() from public, anon, authenticated;

create or replace trigger trg_organizations_branding
  before update of logo_url, agent_display_name, brand_color on public.organizations
  for each row execute function public.protect_org_branding();

-- -----------------------------------------------------------------------------
-- 3. Properties above the plan limit
--    The oldest active properties, up to the limit, keep their public links.
-- -----------------------------------------------------------------------------
create or replace function public.apartment_within_plan(p_apartment uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_org uuid; v_created timestamptz; v_cap integer; v_before integer;
begin
  select organization_id, created_at into v_org, v_created from public.apartments where id = p_apartment;
  if not found then return false; end if;
  v_cap := public.plan_limit(public.org_effective_plan(v_org), 'apartments');
  if v_cap is null then return true; end if;
  select count(*) into v_before from public.apartments b
   where b.organization_id = v_org and b.status <> 'archived' and coalesce(b.is_archived, false) = false
     and (b.created_at, b.id) < (v_created, p_apartment);
  return v_before < v_cap;
end $$;
revoke execute on function public.apartment_within_plan(uuid) from public, anon, authenticated;

create or replace function public.get_public_listing(p_ref text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_apt public.apartments%rowtype;
  v_org public.organizations%rowtype;
  v_id uuid;
  v_profile boolean;
begin
  if v_ref = '' or length(v_ref) > 100 then
    return jsonb_build_object('success', false);
  end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_ref::uuid;
  end if;

  select * into v_apt from public.apartments
  where (slug = v_ref or public_slug = v_ref or id = v_id)
    and coalesce(is_archived, false) = false
    and status <> 'archived'
    and is_published
  limit 1;
  if not found or not public.apartment_within_plan(v_apt.id) then
    return jsonb_build_object('success', false);
  end if;

  select * into v_org from public.organizations where id = v_apt.organization_id;
  v_profile := public.org_has_feature(v_org.id, 'profile');

  return jsonb_build_object(
    'success', true,
    'apartment', jsonb_build_object(
      'id', v_apt.id,
      'slug', v_apt.slug,
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
      'checkin_time', v_apt.checkin_time,
      'checkout_time', v_apt.checkout_time,
      'agent_phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone),
      'photos', coalesce(v_apt.photos, '[]'::jsonb),
      'description', v_apt.description,
      'description_en', v_apt.description_en,
      'amenities', coalesce(v_apt.amenities, '[]'::jsonb),
      'badge', v_apt.badge,
      'lat', v_apt.lat,
      'lng', v_apt.lng,
      'status', v_apt.status,
      'updated_at', v_apt.updated_at
    ),
    'agency', jsonb_build_object(
      'name', v_org.name,
      'logo_url', case when v_profile then v_org.logo_url end,
      'brand_color', case when public.org_has_feature(v_org.id, 'whitelabel') then v_org.brand_color end,
      'agent_name', coalesce(nullif(v_apt.agent_name, ''), case when v_profile then v_org.agent_display_name end),
      'phone', coalesce(nullif(v_apt.agent_phone, ''), v_org.contact_phone)
    )
  );
end $$;

create or replace function public.get_public_selection(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_sel public.selections;
  v_org public.organizations;
  v_apts jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]{8,40}$' then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  select * into v_sel from public.selections where slug = p_slug and is_active;
  if not found or not public.org_has_feature(v_sel.organization_id, 'selections') then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  select * into v_org from public.organizations where id = v_sel.organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'slug', a.slug,
      'title', a.name,
      'transaction_type', a.transaction_type,
      'price', case when a.transaction_type = 'sale' then a.sale_price else a.monthly_rent end,
      'currency', coalesce(a.currency, 'USD'),
      'rooms', a.rooms,
      'bedrooms', a.bedrooms,
      'area_sqm', a.area_sqm,
      'floor', a.floor,
      'total_floors', a.total_floors,
      'district', a.district,
      'city', a.city,
      'pets_allowed', coalesce(a.pets_allowed, false),
      'photos', (select coalesce(jsonb_agg(p.value), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(a.photos, '[]'::jsonb)) with ordinality as p(value, n)
                  where p.n <= 4),
      'agent_phone', a.agent_phone
    ) order by s.n), '[]'::jsonb)
    into v_apts
    from unnest(v_sel.apartment_ids) with ordinality as s(id, n)
    join public.apartments a on a.id = s.id
   where a.organization_id = v_sel.organization_id
     and coalesce(a.is_archived, false) = false
     and a.status <> 'archived'
     and a.is_published
     and public.apartment_within_plan(a.id);

  if jsonb_array_length(v_apts) = 0 then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'selection', jsonb_build_object('client_name', v_sel.client_name, 'created_at', v_sel.created_at),
    'apartments', v_apts,
    'agency', jsonb_build_object(
      'name', v_org.name, 'phone', v_org.contact_phone,
      'logo_url', case when public.org_has_feature(v_org.id, 'profile') then v_org.logo_url end,
      'brand_color', case when public.org_has_feature(v_org.id, 'whitelabel') then v_org.brand_color end,
      'fx_rate', v_org.fx_rate));
end $$;
