-- supabase/schema.sql
-- GENERATED SNAPSHOT of the live database (project cuioodytwyzykqlrjfej). Do not edit by hand.
-- Refresh with:  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node scripts/dump-schema.mjs
--
-- This is the authoritative structure of production (tables, constraints, indexes, functions,
-- triggers, RLS policies and grants). It is a snapshot, not a re-runnable migration: run it only
-- against an empty database. Day-to-day changes still go through supabase/patches/NN_*.sql.


-- ===========================================================================
-- extensions (4)
-- ===========================================================================

create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ===========================================================================
-- tables (25)
-- ===========================================================================

create table public.activity_events (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid,
  actor_id uuid,
  actor_name text,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now());
create table public.apartments (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid,
  name text not null,
  address text,
  city text,
  unit_number text,
  management_type text,
  status text not null default 'active'::text,
  bedrooms integer,
  access_instructions text,
  door_code text,
  wifi_name text,
  wifi_password text,
  parking_info text,
  checkin_time time without time zone default '14:00:00'::time without time zone,
  checkout_time time without time zone default '12:00:00'::time without time zone,
  cleaning_minutes integer default 180,
  commission_pct numeric(5,2) default 20,
  notes text,
  is_archived boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  rental_type text default 'short_term'::text,
  district text,
  currency text default 'USD'::text,
  rooms integer default 2,
  floor text,
  total_floors integer,
  area_sqm numeric(8,2),
  pets_allowed boolean default false,
  utilities_estimate numeric(10,2),
  prepayment_terms text,
  agent_phone text,
  agent_commission_percent numeric(5,2) default 50.00,
  owner_bonus numeric(10,2) default 0,
  cobroker_split numeric(5,2) default 50.00,
  photos jsonb not null default '[]'::jsonb,
  description text,
  description_en text,
  amenities jsonb not null default '[]'::jsonb,
  tenant_name text,
  tenant_phone text,
  monthly_rent numeric(10,2),
  rent_due_day integer default 1,
  deposit_amount numeric(10,2),
  lease_end date,
  public_slug text,
  is_published boolean not null default true,
  transaction_type text not null default 'long_term'::text,
  property_type text not null default 'apartment'::text,
  sale_price numeric(12,2),
  price_sqm numeric(10,2),
  bathrooms integer default 1,
  cadastral_code text,
  listing_agent_id uuid,
  slug text,
  lat double precision,
  lng double precision,
  badge text,
  agent_name text,
  guide_token text not null default replace((gen_random_uuid())::text, '-'::text, ''::text));
create table public.approvals (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  repair_id uuid,
  task_id uuid,
  owner_id uuid,
  title text,
  amount numeric(10,2) not null default 0,
  description text,
  photos jsonb not null default '[]'::jsonb,
  token text not null default encode(gen_random_bytes(16), 'hex'::text),
  status text not null default 'pending'::text,
  response_note text,
  responded_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.condition_reports (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  report_type text,
  inspector_name text,
  rooms_condition jsonb default '{}'::jsonb,
  meter_readings jsonb default '{}'::jsonb,
  keys_handover jsonb default '{}'::jsonb,
  overall_notes text,
  photos jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now());
create table public.contracts (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid,
  deal_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone not null default now());
create table public.deals (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid,
  client_name text not null,
  client_phone text,
  client_email text,
  stage text not null default 'active'::text,
  deal_amount numeric(10,2) default 0,
  currency text not null default 'USD'::text,
  commission_percent numeric(5,2) default 50.00,
  commission_amount numeric(10,2) default 0,
  owner_bonus numeric(10,2) default 0,
  partner_agent text,
  partner_phone text,
  cobroker_split numeric(5,2) default 50.00,
  net_commission numeric(10,2) default 0,
  viewing_date timestamp with time zone,
  deposit_paid_at timestamp with time zone,
  closed_at timestamp with time zone,
  target_move_in date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deal_type text not null default 'rental'::text,
  contact_type text default 'buyer'::text,
  commission_type text default 'percent'::text,
  lead_source text,
  assigned_agent_id uuid,
  seller_id uuid,
  follow_up_date timestamp with time zone,
  criteria jsonb not null default '{}'::jsonb,
  listing_agent_id uuid,
  selling_agent_id uuid,
  listing_split numeric(5,2) not null default 25,
  selling_split numeric(5,2) not null default 25,
  listing_paid boolean not null default false,
  selling_paid boolean not null default false);
create table public.expenses (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  repair_id uuid,
  approval_id uuid,
  task_id uuid,
  category text not null default 'other'::text,
  amount numeric(10,2) not null,
  expense_date date default CURRENT_DATE,
  description text,
  vendor text,
  receipt_url text,
  paid_by text,
  status text not null default 'incurred'::text,
  receipt_required boolean not null default true,
  charge_to_owner boolean not null default true,
  approved_at timestamp with time zone,
  incurred_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.income (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  reservation_id uuid,
  amount numeric(10,2) not null,
  income_date date default CURRENT_DATE,
  source text not null default 'rental'::text,
  period text,
  description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.invitations (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  email text not null,
  role text not null,
  token text default encode(gen_random_bytes(16), 'hex'::text),
  expires_at timestamp with time zone,
  invited_by uuid,
  status text not null default 'pending'::text,
  created_at timestamp with time zone default now());
create table public.link_events (id bigint not null generated always as identity,
  organization_id uuid not null,
  apartment_id uuid not null,
  share_link_id uuid,
  kind text not null,
  visitor_id text not null,
  notified_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  visitor text,
  selection_id uuid);
create table public.monthly_reports (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  owner_id uuid,
  month_period text not null,
  total_income numeric(10,2) default 0,
  total_expenses numeric(10,2) default 0,
  commission numeric(10,2) default 0,
  net_result numeric(10,2) default 0,
  status text not null default 'draft'::text,
  snapshot_data jsonb default '{}'::jsonb,
  finalized_at timestamp with time zone,
  sent_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.notifications (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  title text not null,
  message text,
  type text default 'info'::text,
  link text,
  dedup_key text,
  is_read boolean default false,
  created_at timestamp with time zone default now(),
  sent_telegram_at timestamp with time zone);
create table public.organization_members (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  role text not null,
  display_name text,
  phone text,
  created_at timestamp with time zone default now());
create table public.organizations (id uuid not null default gen_random_uuid(),
  name text not null,
  slug text,
  city text default 'თბილისი'::text,
  portfolio_size text,
  plan text default 'trial'::text,
  logo_url text,
  contact_email text,
  contact_phone text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  fx_rate numeric(10,4),
  trial_ends_at timestamp with time zone,
  plan_expires_at timestamp with time zone,
  brand_color text,
  agent_display_name text);
create table public.owners (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid,
  name text not null,
  phone text,
  email text,
  payout_account text,
  preferred_language text default 'ka'::text,
  notes text,
  is_archived boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  contact_type text not null default 'owner'::text,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  budget_currency text default 'USD'::text,
  preferred_city text,
  preferred_district text,
  requirements jsonb default '{}'::jsonb,
  lead_source text,
  assigned_to uuid,
  follow_up_date timestamp with time zone,
  is_flagged boolean not null default false,
  flag_note text,
  flagged_at timestamp with time zone,
  flagged_by_name text,
  personal_id text);
create table public.platform_admin_log (id bigint not null generated always as identity,
  action text not null,
  actor_id uuid,
  target_user_id uuid,
  target_org_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now());
create table public.platform_admins (user_id uuid not null,
  created_at timestamp with time zone default now(),
  granted_by uuid,
  revoked_at timestamp with time zone);
create table public.repairs (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  task_id uuid,
  issue text not null,
  description text,
  reported_date timestamp with time zone default now(),
  estimate_amount numeric(10,2),
  final_cost numeric(10,2),
  contractor_name text,
  contractor_phone text,
  requires_owner_approval boolean not null default true,
  approval_status text not null default 'not_requested'::text,
  status text not null default 'reported'::text,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.reservations (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  guest_name text not null,
  guest_phone text,
  guests_count integer default 1,
  source text not null default 'airbnb'::text,
  check_in date not null,
  check_out date not null,
  check_in_time time without time zone default '14:00:00'::time without time zone,
  check_out_time time without time zone default '12:00:00'::time without time zone,
  expected_income numeric(10,2) default 0,
  status text not null default 'confirmed'::text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());
create table public.selections (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  deal_id uuid,
  slug text not null,
  client_name text,
  apartment_ids uuid[] not null default '{}'::uuid[],
  criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamp with time zone not null default now());
create table public.share_links (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid not null,
  token text not null,
  recipient_name text not null,
  deal_id uuid,
  created_by uuid,
  is_active boolean not null default true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now());
create table public.tasks (id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  apartment_id uuid,
  reservation_id uuid,
  parent_task_id uuid,
  title text not null,
  description text,
  type text not null default 'other'::text,
  priority text not null default 'normal'::text,
  status text not null default 'new'::text,
  assigned_to uuid,
  scheduled_start timestamp with time zone,
  due_date timestamp with time zone,
  blocked_reason text,
  assigned_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  checklist jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deal_id uuid);
create table public.telegram_chats (chat_id bigint not null,
  organization_id uuid,
  user_name text,
  linked_at timestamp with time zone default now(),
  user_id uuid,
  notify_views text not null default 'all'::text,
  notify_reminders boolean default true);
create table public.telegram_link_codes (code text not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + '00:15:00'::interval),
  used_at timestamp with time zone);
create table public.trial_grants (user_id uuid not null,
  organization_id uuid,
  created_at timestamp with time zone not null default now());

-- ===========================================================================
-- constraints (145)
-- ===========================================================================

alter table public.activity_events add constraint activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.activity_events add constraint activity_events_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.activity_events add constraint activity_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.activity_events add constraint activity_events_pkey PRIMARY KEY (id);
alter table public.apartments add constraint apartments_cadastral_code_format CHECK (((cadastral_code IS NULL) OR (cadastral_code ~ '^\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}(\.\d{2}(\.\d{3})?)?$'::text)));
alter table public.apartments add constraint apartments_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'GEL'::text])));
alter table public.apartments add constraint apartments_lat_range CHECK (((lat IS NULL) OR ((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision))));
alter table public.apartments add constraint apartments_lng_range CHECK (((lng IS NULL) OR ((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision))));
alter table public.apartments add constraint apartments_property_type_check CHECK ((property_type = ANY (ARRAY['apartment'::text, 'house'::text, 'commercial'::text, 'land'::text])));
alter table public.apartments add constraint apartments_public_slug_format CHECK ((public_slug ~ '^[a-z0-9-]{6,80}$'::text));
alter table public.apartments add constraint apartments_rental_type_check CHECK ((rental_type = ANY (ARRAY['short_term'::text, 'long_term'::text, 'hybrid'::text])));
alter table public.apartments add constraint apartments_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'::text)));
alter table public.apartments add constraint apartments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'reserved'::text, 'rented'::text, 'sold'::text, 'maintenance'::text, 'vacant'::text, 'archived'::text])));
alter table public.apartments add constraint apartments_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['sale'::text, 'long_term'::text, 'daily'::text])));
alter table public.apartments add constraint apartments_listing_agent_id_fkey FOREIGN KEY (listing_agent_id) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.apartments add constraint apartments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.apartments add constraint apartments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL;
alter table public.apartments add constraint apartments_pkey PRIMARY KEY (id);
alter table public.approvals add constraint approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'cancelled'::text])));
alter table public.approvals add constraint approvals_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.approvals add constraint approvals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.approvals add constraint approvals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE;
alter table public.approvals add constraint approvals_repair_id_fkey FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE;
alter table public.approvals add constraint approvals_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.approvals add constraint approvals_pkey PRIMARY KEY (id);
alter table public.approvals add constraint approvals_token_key UNIQUE (token);
alter table public.condition_reports add constraint condition_reports_report_type_check CHECK ((report_type = ANY (ARRAY['check_in'::text, 'check_out'::text, 'inspection'::text])));
alter table public.condition_reports add constraint condition_reports_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.condition_reports add constraint condition_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.condition_reports add constraint condition_reports_pkey PRIMARY KEY (id);
alter table public.contracts add constraint contracts_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
alter table public.contracts add constraint contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.contracts add constraint contracts_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
alter table public.contracts add constraint contracts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.contracts add constraint contracts_pkey PRIMARY KEY (id);
alter table public.deals add constraint deals_commission_type_check CHECK ((commission_type = ANY (ARRAY['percent'::text, 'fixed'::text])));
alter table public.deals add constraint deals_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'GEL'::text])));
alter table public.deals add constraint deals_deal_type_check CHECK ((deal_type = ANY (ARRAY['sale'::text, 'rental'::text, 'daily'::text])));
alter table public.deals add constraint deals_split_check CHECK (((listing_split >= (0)::numeric) AND (selling_split >= (0)::numeric) AND ((listing_split + selling_split) <= (100)::numeric)));
alter table public.deals add constraint deals_stage_check CHECK ((stage = ANY (ARRAY['enquiry'::text, 'contacted'::text, 'viewing'::text, 'offer'::text, 'negotiation'::text, 'deposit'::text, 'closed'::text, 'lost'::text, 'active'::text])));
alter table public.deals add constraint deals_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_listing_agent_id_fkey FOREIGN KEY (listing_agent_id) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.deals add constraint deals_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES owners(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_selling_agent_id_fkey FOREIGN KEY (selling_agent_id) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.deals add constraint deals_pkey PRIMARY KEY (id);
alter table public.expenses add constraint expenses_category_check CHECK ((category = ANY (ARRAY['cleaning'::text, 'repair'::text, 'maintenance'::text, 'utility'::text, 'supplies'::text, 'laundry'::text, 'other'::text])));
alter table public.expenses add constraint expenses_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'declined'::text, 'incurred'::text, 'paid'::text])));
alter table public.expenses add constraint expenses_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.expenses add constraint expenses_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.expenses add constraint expenses_repair_id_fkey FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.income add constraint income_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.income add constraint income_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.income add constraint income_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.income add constraint income_pkey PRIMARY KEY (id);
alter table public.invitations add constraint invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'agent'::text, 'staff'::text])));
alter table public.invitations add constraint invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])));
alter table public.invitations add constraint invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table public.invitations add constraint invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.invitations add constraint invitations_pkey PRIMARY KEY (id);
alter table public.link_events add constraint link_events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'whatsapp'::text, 'call'::text])));
alter table public.link_events add constraint link_events_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.link_events add constraint link_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.link_events add constraint link_events_share_link_id_fkey FOREIGN KEY (share_link_id) REFERENCES share_links(id) ON DELETE SET NULL;
alter table public.link_events add constraint link_events_pkey PRIMARY KEY (id);
alter table public.monthly_reports add constraint monthly_reports_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text, 'sent'::text])));
alter table public.monthly_reports add constraint monthly_reports_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.monthly_reports add constraint monthly_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.monthly_reports add constraint monthly_reports_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL;
alter table public.monthly_reports add constraint monthly_reports_pkey PRIMARY KEY (id);
alter table public.monthly_reports add constraint monthly_reports_apartment_id_month_period_key UNIQUE (apartment_id, month_period);
alter table public.notifications add constraint notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.organization_members add constraint organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'staff'::text])));
alter table public.organization_members add constraint organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.organization_members add constraint organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.organization_members add constraint organization_members_pkey PRIMARY KEY (id);
alter table public.organization_members add constraint organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);
alter table public.organizations add constraint organizations_brand_color_check CHECK (((brand_color IS NULL) OR (brand_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table public.organizations add constraint organizations_plan_check CHECK ((plan = ANY (ARRAY['trial'::text, 'starter'::text, 'pro'::text, 'top'::text, 'agency'::text])));
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.owners add constraint owners_contact_type_check CHECK ((contact_type = ANY (ARRAY['owner'::text, 'seller'::text, 'buyer'::text, 'renter'::text, 'other'::text])));
alter table public.owners add constraint owners_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.owners add constraint owners_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.owners add constraint owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.owners add constraint owners_pkey PRIMARY KEY (id);
alter table public.platform_admin_log add constraint platform_admin_log_pkey PRIMARY KEY (id);
alter table public.platform_admins add constraint platform_admins_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.platform_admins add constraint platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.platform_admins add constraint platform_admins_pkey PRIMARY KEY (user_id);
alter table public.repairs add constraint repairs_approval_status_check CHECK ((approval_status = ANY (ARRAY['not_requested'::text, 'pending'::text, 'approved'::text, 'declined'::text])));
alter table public.repairs add constraint repairs_status_check CHECK ((status = ANY (ARRAY['reported'::text, 'estimated'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
alter table public.repairs add constraint repairs_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.repairs add constraint repairs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.repairs add constraint repairs_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.repairs add constraint repairs_pkey PRIMARY KEY (id);
alter table public.reservations add constraint reservations_check CHECK ((check_out > check_in));
alter table public.reservations add constraint reservations_source_check CHECK ((source = ANY (ARRAY['airbnb'::text, 'booking'::text, 'direct'::text, 'other'::text])));
alter table public.reservations add constraint reservations_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])));
alter table public.reservations add constraint reservations_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.reservations add constraint reservations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.reservations add constraint reservations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.reservations add constraint reservations_pkey PRIMARY KEY (id);
alter table public.selections add constraint selections_apartments_count CHECK (((cardinality(apartment_ids) >= 1) AND (cardinality(apartment_ids) <= 20)));
alter table public.selections add constraint selections_slug_format CHECK ((slug ~ '^[a-z0-9]{8,40}$'::text));
alter table public.selections add constraint selections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.selections add constraint selections_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
alter table public.selections add constraint selections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.selections add constraint selections_pkey PRIMARY KEY (id);
alter table public.selections add constraint selections_slug_key UNIQUE (slug);
alter table public.share_links add constraint share_links_token_check CHECK ((token ~ '^[a-z0-9]{8,24}$'::text));
alter table public.share_links add constraint share_links_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.share_links add constraint share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.share_links add constraint share_links_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
alter table public.share_links add constraint share_links_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.share_links add constraint share_links_pkey PRIMARY KEY (id);
alter table public.share_links add constraint share_links_token_key UNIQUE (token);
alter table public.tasks add constraint tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'urgent'::text])));
alter table public.tasks add constraint tasks_status_check CHECK ((status = ANY (ARRAY['new'::text, 'assigned'::text, 'in_progress'::text, 'blocked'::text, 'done'::text, 'cancelled'::text])));
alter table public.tasks add constraint tasks_type_check CHECK ((type = ANY (ARRAY['cleaning'::text, 'maintenance'::text, 'repair'::text, 'inspection'::text, 'payment'::text, 'viewing'::text, 'followup'::text, 'meeting'::text, 'other'::text])));
alter table public.tasks add constraint tasks_apartment_id_fkey FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES organization_members(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.telegram_chats add constraint telegram_chats_notify_views_check CHECK ((notify_views = ANY (ARRAY['all'::text, 'named'::text, 'off'::text])));
alter table public.telegram_chats add constraint telegram_chats_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.telegram_chats add constraint telegram_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.telegram_chats add constraint telegram_chats_pkey PRIMARY KEY (chat_id);
alter table public.telegram_link_codes add constraint telegram_link_codes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.telegram_link_codes add constraint telegram_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.telegram_link_codes add constraint telegram_link_codes_pkey PRIMARY KEY (code);
alter table public.trial_grants add constraint trial_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.trial_grants add constraint trial_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trial_grants add constraint trial_grants_pkey PRIMARY KEY (user_id);

-- ===========================================================================
-- indexes (34)
-- ===========================================================================

CREATE INDEX apartments_org_cadastral_idx ON public.apartments USING btree (organization_id, cadastral_code) WHERE (cadastral_code IS NOT NULL);
CREATE UNIQUE INDEX apartments_slug_key ON public.apartments USING btree (slug);
CREATE INDEX contracts_deal_idx ON public.contracts USING btree (deal_id);
CREATE INDEX contracts_org_idx ON public.contracts USING btree (organization_id, created_at DESC);
CREATE UNIQUE INDEX idx_apartments_guide_token ON public.apartments USING btree (guide_token);
CREATE INDEX idx_apartments_org ON public.apartments USING btree (organization_id);
CREATE INDEX idx_approvals_org ON public.approvals USING btree (organization_id);
CREATE INDEX idx_deals_org ON public.deals USING btree (organization_id, created_at DESC);
CREATE INDEX idx_events_org ON public.activity_events USING btree (organization_id, created_at DESC);
CREATE INDEX idx_expenses_org_status ON public.expenses USING btree (organization_id, status);
CREATE INDEX idx_income_org ON public.income USING btree (organization_id);
CREATE INDEX idx_link_events_apartment ON public.link_events USING btree (apartment_id, created_at DESC);
CREATE INDEX idx_link_events_apt_visitor ON public.link_events USING btree (apartment_id, visitor, kind, created_at DESC);
CREATE INDEX idx_link_events_org ON public.link_events USING btree (organization_id, created_at DESC);
CREATE INDEX idx_link_events_selection ON public.link_events USING btree (selection_id) WHERE (selection_id IS NOT NULL);
CREATE INDEX idx_link_events_visitor ON public.link_events USING btree (visitor_id, created_at DESC);
CREATE INDEX idx_members_user ON public.organization_members USING btree (user_id);
CREATE INDEX idx_notifications_tg_pending ON public.notifications USING btree (created_at) WHERE (sent_telegram_at IS NULL);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read);
CREATE INDEX idx_owners_org ON public.owners USING btree (organization_id);
CREATE INDEX idx_owners_user ON public.owners USING btree (user_id);
CREATE INDEX idx_reservations_apt ON public.reservations USING btree (apartment_id, check_in);
CREATE INDEX idx_reservations_org_dates ON public.reservations USING btree (organization_id, check_in, check_out);
CREATE INDEX idx_share_links_apartment ON public.share_links USING btree (apartment_id);
CREATE INDEX idx_share_links_org ON public.share_links USING btree (organization_id, created_at DESC);
CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assigned_to, status);
CREATE INDEX idx_tasks_org_due ON public.tasks USING btree (organization_id, due_date);
CREATE INDEX idx_telegram_chats_org ON public.telegram_chats USING btree (organization_id);
CREATE INDEX owners_org_flagged_idx ON public.owners USING btree (organization_id) WHERE is_flagged;
CREATE INDEX selections_org_idx ON public.selections USING btree (organization_id, created_at DESC);
CREATE UNIQUE INDEX uq_apartments_public_slug ON public.apartments USING btree (public_slug);
CREATE UNIQUE INDEX uq_income_reservation ON public.income USING btree (reservation_id) WHERE (reservation_id IS NOT NULL);
CREATE UNIQUE INDEX uq_notifications_dedup ON public.notifications USING btree (user_id, dedup_key) WHERE (dedup_key IS NOT NULL);
CREATE UNIQUE INDEX uq_tasks_turnover ON public.tasks USING btree (reservation_id) WHERE ((type = 'cleaning'::text) AND (reservation_id IS NOT NULL));

-- ===========================================================================
-- functions (74)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.accept_my_invitations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_email text; v_name text; r record; v_count integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email), raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = auth.uid();
  for r in select * from public.invitations where lower(email) = v_email and status = 'pending' and (expires_at is null or expires_at > now()) loop
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (r.organization_id, auth.uid(), r.role, coalesce(v_name, split_part(v_email, '@', 1)))
    on conflict (organization_id, user_id) do nothing;
    update public.invitations set status = 'accepted' where id = r.id;
    v_count := v_count + 1;
  end loop;
  update public.owners set user_id = auth.uid() where user_id is null and lower(email) = v_email;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_list_orgs()
 RETURNS TABLE(id uuid, name text, city text, plan text, effective_plan text, trial_ends_at timestamp with time zone, plan_expires_at timestamp with time zone, created_at timestamp with time zone, owner_email text, apartments_count bigint, members_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_platform_admin() then raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501'; end if;
  return query
    select o.id, o.name, o.city, o.plan, public.org_effective_plan(o.id), o.trial_ends_at, o.plan_expires_at, o.created_at,
      (select u.email::text from public.organization_members m join auth.users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1),
      (select count(*) from public.apartments a where a.organization_id = o.id and a.status <> 'archived' and coalesce(a.is_archived, false) = false),
      (select count(*) from public.organization_members m where m.organization_id = o.id)
    from public.organizations o order by o.created_at desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_org_plan(p_org uuid, p_plan text, p_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org public.organizations; v_old text;
begin
  if not public.is_platform_admin() then raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501'; end if;
  if p_plan not in ('trial', 'starter', 'pro', 'top', 'agency') then raise exception 'უცნობი პაკეტი: %', p_plan; end if;
  select plan into v_old from public.organizations where id = p_org;
  update public.organizations set
    plan = p_plan,
    trial_ends_at = case when p_plan = 'trial' then now() + make_interval(days => coalesce(p_days, 14)) else trial_ends_at end,
    plan_expires_at = case when p_plan in ('trial', 'starter') then null
                           when p_days is null then null
                           else greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => p_days) end,
    updated_at = now()
  where id = p_org returning * into v_org;
  if not found then raise exception 'სამუშაო სივრცე ვერ მოიძებნა.'; end if;
  insert into public.platform_admin_log (action, actor_id, target_org_id, detail)
    values ('set_plan', auth.uid(), p_org, jsonb_build_object('from', v_old, 'to', p_plan, 'days', p_days));
  return jsonb_build_object('id', v_org.id, 'plan', v_org.plan, 'trial_ends_at', v_org.trial_ends_at, 'plan_expires_at', v_org.plan_expires_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.agent_can_see_contact(p_contact uuid, p_org uuid, p_assigned uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_org_agent(p_org) and (
    p_assigned = public.my_member_id(p_org)
    or exists (select 1 from public.apartments a where a.owner_id = p_contact and public.agent_has_viewing(a.id)));
$function$
;
CREATE OR REPLACE FUNCTION public.agent_has_viewing(p_apartment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tasks t
    where t.apartment_id = p_apartment and t.type = 'viewing' and t.status <> 'cancelled'
      and (t.created_by = auth.uid() or t.assigned_to = public.my_member_id(t.organization_id)));
$function$
;
CREATE OR REPLACE FUNCTION public.apartment_within_plan(p_apartment uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.apartments_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := substr(md5(gen_random_uuid()::text), 1, 10);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.apartments_sync_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(nullif(new.public_slug, ''), substr(md5(gen_random_uuid()::text), 1, 10));
  else
    new.slug := lower(btrim(new.slug));
    if new.slug ~ '^[a-z0-9-]{6,80}$' and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
      new.public_slug := new.slug;
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.approvals_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner_user uuid; v_owner_name text; v_apt text; v_title text;
begin
  select name into v_apt from public.apartments where id = new.apartment_id;
  select user_id, name into v_owner_user, v_owner_name from public.owners where id = new.owner_id;
  v_title := coalesce(new.title, new.description, 'ხარჯი');
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_user(new.organization_id, v_owner_user, 'საჭიროა თანხმობა: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || v_title, 'approval_request', '/approve/?token=' || new.token, 'approval_req:' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'declined') then
    update public.expenses set status = new.status where approval_id = new.id and status = 'proposed';
    perform public.notify_managers(new.organization_id,
      case when new.status = 'approved' then 'თანხმობა მიღებულია · ' else 'უარი თანხმობაზე · ' end || coalesce(v_apt, ''),
      coalesce(v_owner_name, 'მფლობელი') || ' · ₾' || new.amount || ' · ' || v_title || coalesce(' — „' || new.response_note || '“', ''),
      'approval_response', '/app/?view=owners', 'approval_resp:' || new.id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.can_write_org_folder(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_folder text := split_part(p_path, '/', 1);
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_org_member(v_folder::uuid, auth.uid());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.close_stale_telegram_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now()
  where sent_telegram_at is null and type in ('renewal', 'overdue') and created_at <= now() - interval '3 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.consume_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.telegram_link_codes%rowtype; v_org record;
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
$function$
;
CREATE OR REPLACE FUNCTION public.create_telegram_link_code(p_org uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.create_user_organization(p_org_name text, p_city text DEFAULT 'თბილისი'::text, p_portfolio_size text DEFAULT '6-20'::text, p_display_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_user uuid := auth.uid(); v_org uuid; v_email text; v_name text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('new-org-' || v_user::text));
  if exists (select 1 from public.trial_grants where user_id = v_user)
     or exists (select 1 from public.organization_members where user_id = v_user and role = 'owner') then
    raise exception 'ამ ანგარიშს უკვე აქვს სამუშაო სივრცე. საცდელი პერიოდი ერთ ანგარიშზე ერთხელ გაიცემა.' using errcode = 'P0001', hint = 'ONE_WORKSPACE';
  end if;
  select email, raw_user_meta_data->>'full_name' into v_email, v_name from auth.users where id = v_user;
  v_name := coalesce(p_display_name, v_name, split_part(v_email, '@', 1), 'მმართველი');
  insert into public.organizations (name, city, portfolio_size, contact_email, plan, trial_ends_at)
    values (coalesce(nullif(trim(p_org_name), ''), 'ჩემი კომპანია'), p_city, p_portfolio_size, v_email, 'trial', now() + interval '14 days') returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, display_name) values (v_org, v_user, 'owner', v_name);
  insert into public.trial_grants (user_id, organization_id) values (v_user, v_org);
  insert into public.activity_events (organization_id, actor_id, actor_name, event_type, title) values (v_org, v_user, v_name, 'organization_created', 'სამუშაო სივრცე შეიქმნა');
  return v_org;
end $function$
;
CREATE OR REPLACE FUNCTION public.deals_split_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or public.is_org_manager(new.organization_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.listing_split := 25; new.selling_split := 25; new.listing_paid := false; new.selling_paid := false;
  else
    new.listing_agent_id := old.listing_agent_id; new.selling_agent_id := old.selling_agent_id;
    new.listing_split := old.listing_split; new.selling_split := old.selling_split;
    new.listing_paid := old.listing_paid; new.selling_paid := old.selling_paid;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.enforce_apartment_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_plan text; v_cap integer; v_count integer;
begin
  if auth.uid() is null then return new; end if;
  if new.status = 'archived' or coalesce(new.is_archived, false) then return new; end if;
  -- An edit that neither reactivates the property nor moves it to another workspace adds nothing.
  if tg_op = 'UPDATE' and new.organization_id = old.organization_id
     and not (old.status = 'archived' or coalesce(old.is_archived, false)) then return new; end if;
  v_plan := public.org_effective_plan(new.organization_id);
  v_cap := public.plan_limit(v_plan, 'apartments');
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('apt-plan-' || new.organization_id::text));
  select count(*) into v_count from public.apartments
    where organization_id = new.organization_id and status <> 'archived' and coalesce(is_archived, false) = false and id <> new.id;
  if v_count + 1 > v_cap then
    raise exception 'ობიექტების ლიმიტი ამოიწურა: შენს პაკეტში მაქსიმუმ % აქტიური ობიექტია. გადადი უფრო მაღალ პაკეტზე.', v_cap using errcode = 'P0001', hint = 'PLAN_LIMIT_APARTMENTS';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.enforce_plan_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_feature constant text := tg_argv[0];
begin
  if auth.uid() is null or public.org_has_feature(new.organization_id, v_feature) then return new; end if;
  raise exception 'ეს ფუნქცია შენს პაკეტში არ შედის. გადადი უფრო მაღალ პაკეტზე.' using errcode = 'P0001', hint = 'PLAN_FEATURE_' || upper(v_feature);
end $function$
;
CREATE OR REPLACE FUNCTION public.enforce_seat_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_plan text; v_cap integer; v_count integer;
begin
  if auth.uid() is null or new.role = 'staff' then return new; end if;
  if new.status is distinct from 'pending' then return new; end if;
  v_plan := public.org_effective_plan(new.organization_id);
  v_cap := public.plan_limit(v_plan, 'seats');
  if v_cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('seat-plan-' || new.organization_id::text));
  select (select count(*) from public.organization_members where organization_id = new.organization_id and role <> 'staff')
       + (select count(*) from public.invitations where organization_id = new.organization_id and status = 'pending' and role <> 'staff'
            and (expires_at is null or expires_at > now()) and id <> new.id)
    into v_count;
  if v_count + 1 > v_cap then
    if v_plan = 'locked' then
      raise exception 'საცდელი პერიოდი დასრულდა. გუნდის გასაფართოებლად აირჩიე პაკეტი.' using errcode = 'P0001', hint = 'PLAN_LOCKED';
    end if;
    raise exception 'გუნდის ლიმიტი ამოიწურა: შენს პაკეტში % სამუშაო ადგილია. გადადი უფრო მაღალ პაკეტზე. თანამშრომლის (staff) მოწვევა ლიმიტში არ ითვლება.', v_cap using errcode = 'P0001', hint = 'PLAN_LIMIT_SEATS';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.expenses_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ok boolean; v_apt text;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_ok := case old.status
      when 'proposed' then new.status in ('approved', 'declined')
      when 'approved' then new.status in ('incurred', 'paid', 'proposed')
      when 'declined' then new.status in ('proposed')
      when 'incurred' then new.status in ('paid', 'approved')
      when 'paid'     then new.status in ('incurred')
      else false end;
    if not v_ok then raise exception 'ხარჯის სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status; end if;
  end if;
  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  if new.status in ('incurred', 'paid') and new.incurred_at is null then new.incurred_at := now(); end if;
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  if new.status in ('incurred', 'paid') and new.receipt_required and new.receipt_url is null then
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_managers(new.organization_id, 'ქვითარი აკლია: ₾' || new.amount,
      coalesce(v_apt, '') || ' · ' || coalesce(new.description, new.category), 'receipt', '/app/?view=finance', 'receipt:' || new.id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_statement(p_apartment uuid, p_month text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_apt record;
  v_from date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_to date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_income numeric; v_exp numeric; v_comm numeric; v_id uuid;
begin
  select * into v_apt from public.apartments where id = p_apartment;
  if not found or not public.is_org_manager(v_apt.organization_id) then raise exception 'წვდომა შეზღუდულია'; end if;
  if exists (select 1 from public.monthly_reports where apartment_id = p_apartment and month_period = p_month and status <> 'draft') then
    raise exception 'ამ თვის ამონაწერი უკვე დასრულებულია';
  end if;
  select coalesce(sum(amount), 0) into v_income from public.income where apartment_id = p_apartment and income_date >= v_from and income_date < v_to;
  select coalesce(sum(amount), 0) into v_exp from public.expenses where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid') and expense_date >= v_from and expense_date < v_to;
  v_comm := round(v_income * coalesce(v_apt.commission_pct, 0) / 100, 2);
  insert into public.monthly_reports (organization_id, apartment_id, owner_id, month_period, total_income, total_expenses, commission, net_result, status, snapshot_data)
  values (v_apt.organization_id, p_apartment, v_apt.owner_id, p_month, v_income, v_exp, v_comm, v_income - v_exp - v_comm, 'draft', jsonb_build_object(
    'apartment', v_apt.name, 'commission_pct', coalesce(v_apt.commission_pct, 0),
    'income', coalesce((select jsonb_agg(jsonb_build_object('date', income_date, 'source', source, 'amount', amount, 'description', description) order by income_date)
      from public.income where apartment_id = p_apartment and income_date >= v_from and income_date < v_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('date', expense_date, 'category', category, 'amount', amount, 'description', description, 'status', status, 'receipt_url', receipt_url) order by expense_date)
      from public.expenses where apartment_id = p_apartment and charge_to_owner and status in ('approved', 'incurred', 'paid') and expense_date >= v_from and expense_date < v_to), '[]'::jsonb)))
  on conflict (apartment_id, month_period) do update set owner_id = excluded.owner_id, total_income = excluded.total_income, total_expenses = excluded.total_expenses,
    commission = excluded.commission, net_result = excluded.net_result, snapshot_data = excluded.snapshot_data
  returning id into v_id;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_guest_guide(p_apartment_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'city', a.city, 'address', a.address, 'unit_number', a.unit_number,
    'checkin_time', to_char(a.checkin_time, 'HH24:MI'), 'checkout_time', to_char(a.checkout_time, 'HH24:MI'),
    'parking_info', a.parking_info, 'contact_phone', coalesce(a.agent_phone, o.contact_phone))
  from public.apartments a
  left join public.organizations o on o.id = a.organization_id
  where a.id = p_apartment_id and a.is_archived = false and a.status != 'archived';
$function$
;
CREATE OR REPLACE FUNCTION public.get_guest_guide_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'city', a.city, 'address', a.address, 'unit_number', a.unit_number,
    'wifi_name', a.wifi_name, 'wifi_password', a.wifi_password, 'door_code', a.door_code,
    'checkin_time', to_char(a.checkin_time, 'HH24:MI'), 'checkout_time', to_char(a.checkout_time, 'HH24:MI'),
    'access_instructions', a.access_instructions, 'parking_info', a.parking_info,
    'contact_phone', coalesce(a.agent_phone, o.contact_phone))
  from public.apartments a
  left join public.organizations o on o.id = a.organization_id
  where length(coalesce(p_token, '')) >= 24 and a.guide_token = p_token
    and a.is_archived = false and a.status != 'archived';
$function$
;
CREATE OR REPLACE FUNCTION public.get_link_stats(p_apartment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_out jsonb;
begin
  select organization_id into v_org from public.apartments where id = p_apartment_id;
  if v_org is null or not public.is_org_member(v_org, auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'views', count(*) filter (where kind = 'view'),
    'visitors', count(distinct coalesce(visitor, visitor_id)) filter (where kind = 'view'),
    'whatsapp', count(*) filter (where kind = 'whatsapp'),
    'calls', count(*) filter (where kind = 'call'),
    'views_7d', count(*) filter (where kind = 'view' and created_at > now() - interval '7 days'),
    'last_view_at', max(created_at) filter (where kind = 'view')
  ) into v_out
  from public.link_events where apartment_id = p_apartment_id;
  return v_out;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_linked_telegram_org(p_chat_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('orgId', o.id, 'orgName', o.name, 'city', o.city)
  from public.telegram_chats tc join public.organizations o on o.id = tc.organization_id where tc.chat_id = p_chat_id;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_telegram_link(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select jsonb_build_object('linked', true, 'user_name', user_name, 'linked_at', linked_at, 'notify_views', notify_views)
     from public.telegram_chats where user_id = auth.uid() and organization_id = p_org order by linked_at desc limit 1),
    jsonb_build_object('linked', false));
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_approval(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_a record; v_apt record; v_owner record; v_org record;
begin
  select * into v_a from public.approvals where token = p_token;
  if not found then return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა ან გაუქმებულია'); end if;
  select name, address, unit_number, city into v_apt from public.apartments where id = v_a.apartment_id;
  select name into v_owner from public.owners where id = v_a.owner_id;
  select name, contact_phone into v_org from public.organizations where id = v_a.organization_id;
  return jsonb_build_object('success', true,
    'approval', jsonb_build_object('id', v_a.id, 'title', v_a.title, 'amount', v_a.amount, 'description', v_a.description, 'status', v_a.status,
      'photos', v_a.photos, 'created_at', v_a.created_at, 'responded_at', v_a.responded_at, 'response_note', v_a.response_note, 'expires_at', v_a.expires_at),
    'apartment', jsonb_build_object('name', v_apt.name, 'address', v_apt.address, 'unit_number', v_apt.unit_number, 'city', v_apt.city),
    'owner', jsonb_build_object('name', v_owner.name),
    'organization', jsonb_build_object('name', v_org.name, 'contact_phone', v_org.contact_phone),
    'repair', '{}'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_listing(p_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.get_public_selection(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.get_public_showcase(p_apartment_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.get_public_listing(p_apartment_id::text);
$function$
;
CREATE OR REPLACE FUNCTION public.get_telegram_apartments(p_org_id uuid)
 RETURNS TABLE(id uuid, name text, address text, unit_number text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, name, address, unit_number, status from public.apartments
  where organization_id = p_org_id and status <> 'archived' order by created_at desc;
$function$
;
CREATE OR REPLACE FUNCTION public.get_telegram_org(p_org_id uuid)
 RETURNS TABLE(id uuid, name text, city text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, name, city from public.organizations where id = p_org_id;
$function$
;
CREATE OR REPLACE FUNCTION public.get_telegram_renewals(p_org_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(name text, tenant_name text, lease_end date, days_left integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.name, a.tenant_name, a.lease_end, (a.lease_end - (now() at time zone 'Asia/Tbilisi')::date)::integer
  from public.apartments a
  where a.organization_id = p_org_id and a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
    and a.lease_end <= (now() at time zone 'Asia/Tbilisi')::date + least(greatest(p_days, 1), 365)
    and a.lease_end >= (now() at time zone 'Asia/Tbilisi')::date - 30
  order by a.lease_end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_org_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from public.organization_members where user_id = p_user_id;
$function$
;
CREATE OR REPLACE FUNCTION public.grant_platform_admin(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_target uuid; v_confirmed timestamptz; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  select id, email_confirmed_at into v_target, v_confirmed from auth.users where lower(email) = v_email;
  if v_target is null then raise exception 'ამ ელფოსტით მომხმარებელი ვერ მოიძებნა.' using errcode = 'P0001'; end if;
  if v_confirmed is null then raise exception 'ამ მომხმარებელს ელფოსტა დადასტურებული არ აქვს.' using errcode = 'P0001'; end if;
  insert into public.platform_admins (user_id, granted_by) values (v_target, auth.uid())
    on conflict (user_id) do update set revoked_at = null, granted_by = excluded.granted_by;
  insert into public.platform_admin_log (action, actor_id, target_user_id, detail)
    values ('grant', auth.uid(), v_target, jsonb_build_object('email', v_email));
  return jsonb_build_object('user_id', v_target, 'email', v_email);
end $function$
;
CREATE OR REPLACE FUNCTION public.is_my_apartment(p_apartment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.apartments a join public.owners o on o.id = a.owner_id
    where a.id = p_apartment and o.user_id = auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role in ('owner', 'admin'));
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_agent(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role = 'agent');
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_manager(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and role in ('owner', 'admin', 'manager'));
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organization_members where organization_id = p_org_id and user_id = p_user_id);
$function$
;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and revoked_at is null);
$function$
;
CREATE OR REPLACE FUNCTION public.link_telegram_chat(p_chat_id bigint, p_org_id uuid, p_user_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org record;
begin
  select id, name, city into v_org from public.organizations where id = p_org_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Organization not found'); end if;
  insert into public.telegram_chats (chat_id, organization_id, user_name) values (p_chat_id, p_org_id, p_user_name)
  on conflict (chat_id) do update set organization_id = excluded.organization_id, user_name = coalesce(excluded.user_name, telegram_chats.user_name), linked_at = now();
  return jsonb_build_object('success', true, 'org_id', v_org.id, 'org_name', v_org.name, 'city', v_org.city);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_platform_admins()
 RETURNS TABLE(user_id uuid, email text, granted_at timestamp with time zone, granted_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, a.created_at, g.email::text
    from public.platform_admins a
    join auth.users u on u.id = a.user_id
    left join auth.users g on g.id = a.granted_by
    where a.revoked_at is null
    order by a.created_at;
end $function$
;
CREATE OR REPLACE FUNCTION public.mark_telegram_sent(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  update public.notifications set sent_telegram_at = now() where id = any(p_ids) and sent_telegram_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.my_member_id(p_org uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.organization_members where organization_id = p_org and user_id = auth.uid() limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.my_org_has_feature(p_org uuid, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members where organization_id = p_org and user_id = auth.uid())
     and public.org_has_feature(p_org, p_feature);
$function$
;
CREATE OR REPLACE FUNCTION public.my_owner_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.owners where user_id = auth.uid();
$function$
;
CREATE OR REPLACE FUNCTION public.notify_managers(p_org uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  for r in select user_id from public.organization_members where organization_id = p_org and role in ('owner', 'admin', 'manager') loop
    perform public.notify_user(p_org, r.user_id, p_title, p_message, p_type, p_link, p_dedup);
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_user(p_org uuid, p_user uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null then return; end if;
  insert into public.notifications (organization_id, user_id, title, message, type, link, dedup_key)
  values (p_org, p_user, p_title, p_message, p_type, p_link, p_dedup)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.org_effective_plan(p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(o.plan, 'trial') = 'trial' then case when o.trial_ends_at is not null and o.trial_ends_at < now() then 'starter' else 'trial' end
    when o.plan <> 'starter' and o.plan_expires_at is not null and o.plan_expires_at < now() then 'starter'
    else o.plan
  end
  from public.organizations o where o.id = p_org;
$function$
;
CREATE OR REPLACE FUNCTION public.org_has_feature(p_org uuid, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.plan_has_feature(public.org_effective_plan(p_org), p_feature), false);
$function$
;
CREATE OR REPLACE FUNCTION public.pending_telegram_notifications(p_limit integer DEFAULT 200)
 RETURNS TABLE(chat_id bigint, organization_id uuid, title text, message text, type text, link text, ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tc.chat_id, n.organization_id, min(n.title), min(n.message), min(n.type), min(n.link), array_agg(n.id)
  from public.notifications n join public.telegram_chats tc on tc.organization_id = n.organization_id
  where n.sent_telegram_at is null and n.type in ('renewal', 'overdue') and n.created_at > now() - interval '3 days'
  group by tc.chat_id, n.organization_id, coalesce(n.dedup_key, n.id::text)
  order by min(n.created_at) limit p_limit;
$function$
;
CREATE OR REPLACE FUNCTION public.plan_has_feature(p_plan text, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_plan
    when 'trial' then true
    when 'agency' then true
    when 'top' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation', 'selections', 'analytics', 'export')
    when 'pro' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation')
    else false
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_kind text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_kind
    when 'apartments' then case p_plan when 'trial' then 50 when 'starter' then 3 when 'pro' then 50 when 'top' then 150 when 'agency' then null else 0 end
    when 'seats' then case p_plan when 'trial' then 3 when 'starter' then 1 when 'pro' then 1 when 'top' then 3 when 'agency' then null else 0 end
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.platform_admin_caller_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_platform_admin()
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$function$
;
CREATE OR REPLACE FUNCTION public.protect_org_branding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.protect_org_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_platform_admin() then new.plan := 'trial'; new.plan_expires_at := null; new.trial_ends_at := null; end if;
    if new.plan = 'trial' and new.trial_ends_at is null then new.trial_ends_at := now() + interval '14 days'; end if;
    return new;
  end if;
  if auth.uid() is not null and not public.is_platform_admin() then
    new.plan := old.plan; new.trial_ends_at := old.trial_ends_at; new.plan_expires_at := old.plan_expires_at;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_link_event(p_ref text, p_kind text, p_visitor text, p_recipient text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_apt public.apartments%rowtype;
  v_id uuid;
  v_link public.share_links%rowtype;
  v_has_link boolean := false;
  v_event bigint;
  v_title text;
  v_message text;
  v_chats jsonb;
begin
  if p_kind not in ('view', 'whatsapp', 'call') or p_ref is null or length(p_ref) > 100
     or p_visitor is null or p_visitor !~ '^[a-z0-9-]{8,64}$' then
    return jsonb_build_object('ok', false);
  end if;
  if p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_ref::uuid;
  end if;

  select * into v_apt from public.apartments
  where (public_slug = lower(p_ref) or id = v_id)
    and coalesce(is_archived, false) = false and status <> 'archived' and is_published
  limit 1;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  -- Rate limits: one browser, then one listing, per minute.
  if (select count(*) from public.link_events where visitor_id = p_visitor and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.link_events where apartment_id = v_apt.id and created_at > now() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  -- A refresh is not a new open: the same browser, listing and action count once per 30 minutes.
  if exists (select 1 from public.link_events
             where visitor_id = p_visitor and apartment_id = v_apt.id and kind = p_kind
               and created_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', true, 'counted', false);
  end if;

  if p_recipient is not null then
    select * into v_link from public.share_links
    where token = lower(p_recipient) and apartment_id = v_apt.id and is_active
      and (expires_at is null or expires_at > now());
    v_has_link := found;
  end if;

  insert into public.link_events (organization_id, apartment_id, share_link_id, kind, visitor_id)
  values (v_apt.organization_id, v_apt.id, case when v_has_link then v_link.id end, p_kind, p_visitor)
  returning id into v_event;

  -- Notify at most once per browser and listing per hour, and at most 20 times per organisation per hour.
  if exists (select 1 from public.link_events
             where visitor_id = p_visitor and apartment_id = v_apt.id and notified_at > now() - interval '60 minutes')
     or (select count(*) from public.link_events
         where organization_id = v_apt.organization_id and notified_at > now() - interval '60 minutes') >= 20 then
    return jsonb_build_object('ok', true, 'counted', true);
  end if;

  update public.link_events set notified_at = now() where id = v_event;

  v_title := case p_kind when 'view' then 'ბმული გაიხსნა: ' when 'whatsapp' then 'WhatsApp-ით დაკავშირება: ' else 'ზარის ღილაკი: ' end || v_apt.name;
  -- A link can be forwarded, so the wording names the link, never the person.
  v_message := case when v_has_link then '„' || v_link.recipient_name || '“-სთვის გაგზავნილი ბმულიდან.' else 'ბინის საერთო ბმულიდან.' end;

  if v_has_link and v_link.created_by is not null then
    perform public.notify_user(v_apt.organization_id, v_link.created_by, v_title, v_message, 'info',
      '/app/#/apartments/' || v_apt.id, 'link:' || v_event);
  else
    perform public.notify_managers(v_apt.organization_id, v_title, v_message, 'info',
      '/app/#/apartments/' || v_apt.id, 'link:' || v_event);
  end if;

  select coalesce(jsonb_agg(chat_id), '[]'::jsonb) into v_chats from (
    select chat_id from public.telegram_chats
    where organization_id = v_apt.organization_id
      and notify_views <> 'off'
      and (notify_views = 'all' or v_has_link)
      and (not v_has_link or v_link.created_by is null or user_id is null or user_id = v_link.created_by)
    limit 10) t;

  return jsonb_build_object('ok', true, 'counted', true, 'notify', jsonb_build_object(
    'chat_ids', v_chats, 'kind', p_kind, 'apartment_id', v_apt.id, 'apartment_name', v_apt.name,
    'recipient', case when v_has_link then v_link.recipient_name end));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.redeem_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.respond_public_approval(p_token text, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_a record; v_owner text;
begin
  if p_decision not in ('approved', 'declined') then return jsonb_build_object('success', false, 'error', 'არასწორი გადაწყვეტილება'); end if;
  select * into v_a from public.approvals where token = p_token for update;
  if not found then return jsonb_build_object('success', false, 'error', 'მოთხოვნა ვერ მოიძებნა'); end if;
  if v_a.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია'); end if;
  if v_a.expires_at is not null and v_a.expires_at < now() then return jsonb_build_object('success', false, 'error', 'მოთხოვნის ვადა ამოიწურა'); end if;
  update public.approvals set status = p_decision, response_note = p_note, responded_at = now(), updated_at = now() where id = v_a.id;
  if v_a.repair_id is not null then update public.repairs set approval_status = p_decision, updated_at = now() where id = v_a.repair_id; end if;
  select name into v_owner from public.owners where id = v_a.owner_id;
  insert into public.activity_events (organization_id, apartment_id, actor_name, event_type, title, description, metadata)
  values (v_a.organization_id, v_a.apartment_id, coalesce(v_owner, 'მფლობელი'),
    case when p_decision = 'approved' then 'owner_approved' else 'owner_declined' end,
    case when p_decision = 'approved' then 'მფლობელმა დაადასტურა ₾' || v_a.amount else 'მფლობელმა უარი თქვა ₾' || v_a.amount || '-ზე' end,
    coalesce(p_note, coalesce(v_a.title, v_a.description)),
    jsonb_build_object('approval_id', v_a.id, 'task_id', v_a.task_id, 'amount', v_a.amount, 'decision', p_decision));
  return jsonb_build_object('success', true, 'status', p_decision);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.revoke_platform_admin(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_target uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.platform_admin_caller_ok() then
    raise exception 'ამ მოქმედების უფლება არ გაქვს.' using errcode = '42501';
  end if;
  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is null or not exists (select 1 from public.platform_admins where user_id = v_target and revoked_at is null) then
    raise exception 'ამ ელფოსტით პლატფორმის ადმინი ვერ მოიძებნა.' using errcode = 'P0001';
  end if;
  if auth.uid() is not null and (select count(*) from public.platform_admins where revoked_at is null) <= 1 then
    raise exception 'ბოლო ადმინის უფლების მოხსნა შეუძლებელია.' using errcode = 'P0001';
  end if;
  update public.platform_admins set revoked_at = now() where user_id = v_target;
  insert into public.platform_admin_log (action, actor_id, target_user_id, detail)
    values ('revoke', auth.uid(), v_target, jsonb_build_object('email', v_email));
  return jsonb_build_object('user_id', v_target, 'email', v_email);
end $function$
;
CREATE OR REPLACE FUNCTION public.scan_alerts(p_org uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_user uuid; v_count integer := 0;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then raise exception 'წვდომა შეზღუდულია'; end if;
  for r in select t.*, a.name as apt_name from public.tasks t left join public.apartments a on a.id = t.apartment_id
           where t.status in ('new', 'assigned', 'in_progress', 'blocked') and t.due_date < now() and (p_org is null or t.organization_id = p_org) loop
    perform public.notify_managers(r.organization_id, 'ვადაგადაცილებული: ' || r.title,
      coalesce(r.apt_name, '') || ' · ვადა იყო ' || to_char(r.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'), 'overdue', '/app/?view=tasks', 'overdue:' || r.id);
    if r.assigned_to is not null then
      select user_id into v_user from public.organization_members where id = r.assigned_to;
      perform public.notify_user(r.organization_id, v_user, 'ვადაგადაცილებული: ' || r.title, coalesce(r.apt_name, ''), 'overdue', '/staff/', 'overdue:' || r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.scan_lease_renewals(p_org uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_today date := (now() at time zone 'Asia/Tbilisi')::date; v_days int; v_bucket int; v_count integer := 0; v_when text;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_manager(p_org)) then raise exception 'წვდომა შეზღუდულია'; end if;
  for r in select a.id, a.organization_id, a.name, a.tenant_name, a.lease_end from public.apartments a
           where a.lease_end is not null and coalesce(a.is_archived, false) = false and a.status <> 'archived'
             and a.lease_end >= v_today and a.lease_end <= v_today + 30 and (p_org is null or a.organization_id = p_org)
             and public.org_has_feature(a.organization_id, 'reminders') loop
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
$function$
;
CREATE OR REPLACE FUNCTION public.selections_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1 from unnest(new.apartment_ids) as x(id)
    where not exists (select 1 from public.apartments a where a.id = x.id and a.organization_id = new.organization_id)
  ) then
    raise exception 'შერჩევაში მხოლოდ თქვენი კომპანიის ბინების დამატებაა შესაძლებელი';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_my_telegram_notify(p_org uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_mode not in ('all', 'named', 'off') then raise exception 'invalid mode'; end if;
  update public.telegram_chats set notify_views = p_mode where user_id = auth.uid() and organization_id = p_org;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.staff_add_task_photo(p_task uuid, p_url text, p_phase text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task public.tasks;
begin
  v_task := public.staff_task_guard(p_task);
  if p_phase not in ('before', 'after', 'problem') then raise exception 'არასწორი ფოტოს ტიპი'; end if;
  update public.tasks set photos = coalesce(photos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('url', p_url, 'phase', p_phase, 'at', now()))
  where id = p_task returning * into v_task;
  return v_task;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.staff_report_problem(p_task uuid, p_title text, p_description text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_urgent boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_new uuid; v_name text; v_apt text;
begin
  v_task := public.staff_task_guard(p_task);
  if coalesce(trim(p_title), '') = '' then raise exception 'აღწერე პრობლემა'; end if;
  select display_name into v_name from public.organization_members where user_id = auth.uid() and organization_id = v_task.organization_id;
  select name into v_apt from public.apartments where id = v_task.apartment_id;
  insert into public.tasks (organization_id, apartment_id, title, description, type, priority, status, parent_task_id, created_by, photos)
  values (v_task.organization_id, v_task.apartment_id, p_title,
    coalesce(p_description, '') || E'\nგამოვლინდა: ' || v_task.title || ' (' || coalesce(v_name, 'თანამშრომელი') || ')',
    'maintenance', case when p_urgent then 'urgent' else 'normal' end, 'new', v_task.id, auth.uid(),
    case when p_photo_url is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url', p_photo_url, 'phase', 'problem', 'at', now())) end)
  returning id into v_new;
  insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description, metadata)
  values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'), 'problem_reported', 'პრობლემა: ' || p_title, p_description, jsonb_build_object('task_id', v_new));
  perform public.notify_managers(v_task.organization_id, case when p_urgent then 'სასწრაფო პრობლემა: ' else 'პრობლემა: ' end || p_title,
    coalesce(v_apt, '') || ' · ' || coalesce(v_name, ''), 'problem', '/app/?view=tasks', null);
  return v_new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.staff_task_guard(p_task uuid)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found then raise exception 'დავალება ვერ მოიძებნა'; end if;
  if not (public.is_org_manager(v_task.organization_id) or v_task.assigned_to = public.my_member_id(v_task.organization_id)) then
    raise exception 'ეს დავალება შენზე არ არის მიბმული';
  end if;
  return v_task;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.staff_update_task(p_task uuid, p_status text DEFAULT NULL::text, p_checklist jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text, p_blocked_reason text DEFAULT NULL::text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_name text;
begin
  v_task := public.staff_task_guard(p_task);
  if p_status is not null and p_status not in ('in_progress', 'blocked', 'done', 'assigned') then raise exception 'დაუშვებელი სტატუსი'; end if;
  if p_status = 'done' and exists (select 1 from jsonb_array_elements(coalesce(p_checklist, v_task.checklist)) e where coalesce((e->>'done')::boolean, false) = false) then
    raise exception 'დასასრულებლად მონიშნე ჩეკლისტის ყველა პუნქტი';
  end if;
  if p_status = 'done' and v_task.type = 'cleaning' and not exists (select 1 from jsonb_array_elements(v_task.photos) e where e->>'phase' = 'after') then
    raise exception 'დასასრულებლად ატვირთე მინიმუმ ერთი „შემდეგ“ ფოტო';
  end if;
  update public.tasks set status = coalesce(p_status, status), checklist = coalesce(p_checklist, checklist), notes = coalesce(p_notes, notes),
    blocked_reason = case when p_status = 'blocked' then p_blocked_reason else blocked_reason end
  where id = p_task returning * into v_task;
  if p_status is not null then
    select display_name into v_name from public.organization_members where id = v_task.assigned_to;
    insert into public.activity_events (organization_id, apartment_id, actor_id, actor_name, event_type, title, description, metadata)
    values (v_task.organization_id, v_task.apartment_id, auth.uid(), coalesce(v_name, 'თანამშრომელი'), 'task_' || p_status,
      case p_status when 'in_progress' then 'დაიწყო: ' when 'done' then 'დასრულდა: ' when 'blocked' then 'შეჩერდა: ' else 'განახლდა: ' end || v_task.title,
      coalesce(p_blocked_reason, p_notes), jsonb_build_object('task_id', v_task.id));
    if p_status = 'blocked' then
      perform public.notify_managers(v_task.organization_id, 'დავალება შეჩერდა: ' || v_task.title, coalesce(v_name, '') || ' · ' || coalesce(p_blocked_reason, ''), 'task_blocked', '/app/?view=tasks', null);
    end if;
  end if;
  return v_task;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.statements_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid; v_apt text;
begin
  new.updated_at := now();
  if new.status in ('finalized', 'sent') and (tg_op = 'INSERT' or old.status = 'draft') then
    new.finalized_at := coalesce(new.finalized_at, now());
    select o.user_id into v_user from public.owners o where o.id = new.owner_id;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(new.organization_id, v_user, 'ამონაწერი მზადაა · ' || new.month_period,
      coalesce(v_apt, '') || ' · წმინდა ანაზღაურება ₾' || new.net_result, 'statement', null, 'statement:' || new.id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tasks_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ok boolean; v_user uuid; v_apt text;
begin
  new.updated_at := now();
  if new.assigned_to is not null and new.status = 'new' then new.status := 'assigned';
  elsif new.assigned_to is null and new.status = 'assigned' then new.status := 'new';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_ok := case old.status
      when 'new'         then new.status in ('assigned', 'in_progress', 'cancelled')
      when 'assigned'    then new.status in ('new', 'in_progress', 'blocked', 'cancelled', 'done')
      when 'in_progress' then new.status in ('assigned', 'blocked', 'done', 'cancelled')
      when 'blocked'     then new.status in ('assigned', 'in_progress', 'cancelled', 'new')
      when 'done'        then new.status in ('in_progress', 'assigned')
      when 'cancelled'   then new.status in ('new', 'assigned')
      else false end;
    if not v_ok then raise exception 'სტატუსის შეცვლა „%“ → „%“ დაუშვებელია', old.status, new.status; end if;
  end if;

  if new.status = 'blocked' and coalesce(trim(new.blocked_reason), '') = '' then raise exception 'შეჩერებისთვის მიუთითეთ მიზეზი'; end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;
  if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  if new.status = 'done' then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;

  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    select user_id into v_user from public.organization_members where id = new.assigned_to;
    select name into v_apt from public.apartments where id = new.apartment_id;
    perform public.notify_user(new.organization_id, v_user, 'ახალი დავალება: ' || new.title,
      coalesce(v_apt, '') || coalesce(' · ვადა ' || to_char(new.due_date at time zone 'Asia/Tbilisi', 'DD.MM HH24:MI'), ''),
      'assignment', '/staff/', 'assign:' || new.id || ':' || new.assigned_to);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.telegram_create_task_record(p_org_id uuid, p_apt_id uuid, p_title text, p_description text, p_cost numeric DEFAULT 0, p_source text DEFAULT 'Telegram'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task uuid; v_repair uuid; v_owner uuid; v_appr uuid; v_token text;
begin
  if not exists (select 1 from public.apartments where id = p_apt_id and organization_id = p_org_id) then
    return jsonb_build_object('success', false, 'error', 'Apartment not found');
  end if;
  select owner_id into v_owner from public.apartments where id = p_apt_id;
  insert into public.tasks (organization_id, apartment_id, title, description, type, priority, status)
  values (p_org_id, p_apt_id, p_title, p_description, 'repair', 'urgent', 'new') returning id into v_task;
  if coalesce(p_cost, 0) > 0 then
    insert into public.repairs (organization_id, apartment_id, task_id, issue, description, estimate_amount, requires_owner_approval, approval_status, status)
    values (p_org_id, p_apt_id, v_task, p_title, p_description, p_cost, v_owner is not null, case when v_owner is null then 'not_requested' else 'pending' end, 'estimated')
    returning id into v_repair;
    if v_owner is not null then
      insert into public.approvals (organization_id, apartment_id, repair_id, task_id, owner_id, title, amount, description)
      values (p_org_id, p_apt_id, v_repair, v_task, v_owner, p_title, p_cost, p_title || coalesce(E'\n' || p_description, ''))
      returning id, token into v_appr, v_token;
      insert into public.expenses (organization_id, apartment_id, repair_id, approval_id, task_id, category, amount, description, status)
      values (p_org_id, p_apt_id, v_repair, v_appr, v_task, 'repair', p_cost, p_title, 'proposed');
    end if;
  end if;
  insert into public.activity_events (organization_id, apartment_id, actor_name, event_type, title, description, metadata)
  values (p_org_id, p_apt_id, 'Telegram ბოტი', 'telegram_task_created', 'ახალი საქმე: ' || p_title, p_description, jsonb_build_object('task_id', v_task));
  return jsonb_build_object('success', true, 'task_id', v_task, 'repair_id', v_repair, 'approval_id', v_appr, 'token', v_token);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.track_link_event(p_ref text, p_kind text, p_visitor text DEFAULT NULL::text, p_selection_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_id uuid;
  v_apt public.apartments;
  v_visitor text := nullif(left(regexp_replace(coalesce(p_visitor, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_window interval;
begin
  if p_kind not in ('view', 'whatsapp', 'call') or v_ref = '' or length(v_ref) > 100 then return false; end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id := v_ref::uuid; end if;

  select * into v_apt from public.apartments
  where (slug = v_ref or public_slug = v_ref or id = v_id)
    and coalesce(is_archived, false) = false and status <> 'archived' and is_published
  limit 1;
  if not found then return false; end if;

  if auth.uid() is not null and public.is_org_member(v_apt.organization_id, auth.uid()) then return false; end if;

  if (select count(*) from public.link_events
      where apartment_id = v_apt.id and created_at > now() - interval '1 hour') >= 600 then
    return false;
  end if;

  if v_visitor is not null then
    if (select count(*) from public.link_events
        where visitor = v_visitor and created_at > now() - interval '1 hour') >= 60 then
      return false;
    end if;
    v_window := case when p_kind = 'view' then interval '30 minutes' else interval '2 minutes' end;
    if exists (select 1 from public.link_events
               where apartment_id = v_apt.id and visitor = v_visitor and kind = p_kind
                 and created_at > now() - v_window) then
      return false;
    end if;
  end if;

  insert into public.link_events (organization_id, apartment_id, selection_id, kind, visitor, visitor_id)
  values (v_apt.organization_id, v_apt.id, p_selection_id, p_kind, v_visitor, coalesce(v_visitor, 'anonymous'));
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.track_link_event_notify(p_ref text, p_kind text, p_visitor text DEFAULT NULL::text, p_selection_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text := lower(btrim(coalesce(p_ref, '')));
  v_visitor text := nullif(left(regexp_replace(coalesce(p_visitor, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_id uuid; v_apt public.apartments; v_event bigint; v_title text; v_chats jsonb;
begin
  if not public.track_link_event(p_ref, p_kind, p_visitor, p_selection_id) then
    return jsonb_build_object('ok', true, 'counted', false);
  end if;
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id := v_ref::uuid; end if;
  select * into v_apt from public.apartments where slug = v_ref or public_slug = v_ref or id = v_id limit 1;
  if not found or v_visitor is null then return jsonb_build_object('ok', true, 'counted', true); end if;

  select id into v_event from public.link_events
  where apartment_id = v_apt.id and visitor = v_visitor and kind = p_kind order by id desc limit 1;

  if v_event is null
     or exists (select 1 from public.link_events
                where apartment_id = v_apt.id and visitor = v_visitor and notified_at > now() - interval '60 minutes')
     or (select count(*) from public.link_events
         where organization_id = v_apt.organization_id and notified_at > now() - interval '60 minutes') >= 20
     -- per listing cap: rotating the visitor id must not flood the chat
     or (select count(*) from public.link_events
         where apartment_id = v_apt.id and notified_at > now() - interval '60 minutes') >= 3 then
    return jsonb_build_object('ok', true, 'counted', true);
  end if;
  update public.link_events set notified_at = now() where id = v_event;

  v_title := case p_kind when 'view' then 'ბმული გაიხსნა: ' when 'whatsapp' then 'WhatsApp-ით დაკავშირება: ' else 'ზარის ღილაკი: ' end || v_apt.name;
  perform public.notify_managers(v_apt.organization_id, v_title,
    case when p_selection_id is not null then 'შერჩეული ბინების ბმულიდან.' else 'ბინის ბმულიდან.' end,
    'info', '/app/#/apartments/' || v_apt.id, 'link:' || v_event);

  select coalesce(jsonb_agg(chat_id), '[]'::jsonb) into v_chats from (
    select chat_id from public.telegram_chats
    where organization_id = v_apt.organization_id and notify_views = 'all' limit 10) t;

  return jsonb_build_object('ok', true, 'counted', true, 'notify', jsonb_build_object(
    'chat_ids', v_chats, 'kind', p_kind, 'apartment_id', v_apt.id, 'apartment_name', v_apt.name));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.unlink_my_telegram(p_org uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.telegram_chats where user_id = auth.uid() and organization_id = p_org;
$function$
;

-- ===========================================================================
-- triggers (14)
-- ===========================================================================

CREATE TRIGGER trg_apartments_plan BEFORE INSERT OR UPDATE OF status, is_archived, organization_id ON public.apartments FOR EACH ROW EXECUTE FUNCTION enforce_apartment_plan();
CREATE TRIGGER trg_apartments_slug BEFORE INSERT ON public.apartments FOR EACH ROW EXECUTE FUNCTION apartments_set_slug();
CREATE TRIGGER trg_apartments_slug_sync BEFORE INSERT OR UPDATE ON public.apartments FOR EACH ROW EXECUTE FUNCTION apartments_sync_slug();
CREATE TRIGGER trg_approvals_notify AFTER INSERT OR UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION approvals_notify();
CREATE TRIGGER trg_contracts_plan BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION enforce_plan_feature('contracts');
CREATE TRIGGER trg_deals_split_guard BEFORE INSERT OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION deals_split_guard();
CREATE TRIGGER trg_expenses_workflow BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION expenses_workflow();
CREATE TRIGGER trg_invitations_plan BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION enforce_seat_plan();
CREATE TRIGGER trg_statements_notify BEFORE INSERT OR UPDATE ON public.monthly_reports FOR EACH ROW EXECUTE FUNCTION statements_notify();
CREATE TRIGGER trg_organizations_branding BEFORE UPDATE OF logo_url, agent_display_name, brand_color ON public.organizations FOR EACH ROW EXECUTE FUNCTION protect_org_branding();
CREATE TRIGGER trg_organizations_plan BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION protect_org_plan();
CREATE TRIGGER trg_selections_guard BEFORE INSERT OR UPDATE OF apartment_ids, organization_id ON public.selections FOR EACH ROW EXECUTE FUNCTION selections_guard();
CREATE TRIGGER trg_selections_plan BEFORE INSERT ON public.selections FOR EACH ROW EXECUTE FUNCTION enforce_plan_feature('selections');
CREATE TRIGGER trg_tasks_lifecycle BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_lifecycle();

-- ===========================================================================
-- row level security (25)
-- ===========================================================================

alter table public.activity_events enable row level security;
alter table public.apartments enable row level security;
alter table public.approvals enable row level security;
alter table public.condition_reports enable row level security;
alter table public.contracts enable row level security;
alter table public.deals enable row level security;
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.invitations enable row level security;
alter table public.link_events enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.notifications enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;
alter table public.owners enable row level security;
alter table public.platform_admin_log enable row level security;
alter table public.platform_admins enable row level security;
alter table public.repairs enable row level security;
alter table public.reservations enable row level security;
alter table public.selections enable row level security;
alter table public.share_links enable row level security;
alter table public.tasks enable row level security;
alter table public.telegram_chats enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.trial_grants enable row level security;

-- ===========================================================================
-- policies (82)
-- ===========================================================================

create policy activity_events_delete on public.activity_events for delete using (is_org_admin(organization_id));
create policy activity_events_insert on public.activity_events for insert;
create policy activity_events_select on public.activity_events for select using ((is_org_manager(organization_id) OR is_my_apartment(apartment_id)));
create policy activity_events_update on public.activity_events for update using (is_org_manager(organization_id));
create policy apartments_delete on public.apartments for delete using (is_org_admin(organization_id));
create policy apartments_insert on public.apartments for insert;
create policy apartments_select on public.apartments for select using ((is_org_manager(organization_id) OR is_org_agent(organization_id) OR (owner_id IN ( SELECT my_owner_ids() AS my_owner_ids)) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.apartment_id = apartments.id) AND (t.status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'blocked'::text])) AND (t.assigned_to = my_member_id(apartments.organization_id)))))));
create policy apartments_update on public.apartments for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (listing_agent_id = my_member_id(organization_id)))));
create policy approvals_delete on public.approvals for delete using (is_org_admin(organization_id));
create policy approvals_insert on public.approvals for insert;
create policy approvals_select on public.approvals for select using ((is_org_manager(organization_id) OR (owner_id IN ( SELECT my_owner_ids() AS my_owner_ids))));
create policy approvals_update on public.approvals for update using (is_org_manager(organization_id));
create policy condition_reports_delete on public.condition_reports for delete using (is_org_admin(organization_id));
create policy condition_reports_insert on public.condition_reports for insert;
create policy condition_reports_select on public.condition_reports for select using (is_org_manager(organization_id));
create policy condition_reports_update on public.condition_reports for update using (is_org_manager(organization_id));
create policy contracts_delete on public.contracts for delete using (is_org_admin(organization_id));
create policy contracts_insert on public.contracts for insert;
create policy contracts_select on public.contracts for select using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (created_by = auth.uid()))));
create policy contracts_update on public.contracts for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (created_by = auth.uid()))));
create policy deals_delete on public.deals for delete using (is_org_admin(organization_id));
create policy deals_insert on public.deals for insert;
create policy deals_select on public.deals for select using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND ((created_by = auth.uid()) OR (((my_member_id(organization_id) = assigned_agent_id) OR (my_member_id(organization_id) = listing_agent_id)) OR (my_member_id(organization_id) = selling_agent_id))))));
create policy deals_update on public.deals for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND ((created_by = auth.uid()) OR (((my_member_id(organization_id) = assigned_agent_id) OR (my_member_id(organization_id) = listing_agent_id)) OR (my_member_id(organization_id) = selling_agent_id))))));
create policy expenses_delete on public.expenses for delete using (is_org_admin(organization_id));
create policy expenses_insert on public.expenses for insert;
create policy expenses_select on public.expenses for select using ((is_org_manager(organization_id) OR is_my_apartment(apartment_id)));
create policy expenses_update on public.expenses for update using (is_org_manager(organization_id));
create policy income_delete on public.income for delete using (is_org_admin(organization_id));
create policy income_insert on public.income for insert;
create policy income_select on public.income for select using ((is_org_manager(organization_id) OR is_my_apartment(apartment_id)));
create policy income_update on public.income for update using (is_org_manager(organization_id));
create policy invitations_delete on public.invitations for delete using (is_org_admin(organization_id));
create policy invitations_insert on public.invitations for insert;
create policy invitations_select on public.invitations for select using (is_org_manager(organization_id));
create policy invitations_update on public.invitations for update using (is_org_manager(organization_id));
create policy link_events_select on public.link_events for select using (is_org_manager(organization_id));
create policy monthly_reports_delete on public.monthly_reports for delete using (is_org_admin(organization_id));
create policy monthly_reports_insert on public.monthly_reports for insert;
create policy monthly_reports_select on public.monthly_reports for select using ((is_org_manager(organization_id) OR (is_my_apartment(apartment_id) AND (status = ANY (ARRAY['finalized'::text, 'sent'::text])))));
create policy monthly_reports_update on public.monthly_reports for update using (is_org_manager(organization_id));
create policy notif_delete on public.notifications for delete using ((user_id = auth.uid()));
create policy notif_select on public.notifications for select using ((user_id = auth.uid()));
create policy notif_update on public.notifications for update using ((user_id = auth.uid()));
create policy members_delete on public.organization_members for delete using ((is_org_admin(organization_id) AND (role <> 'owner'::text)));
create policy members_insert on public.organization_members for insert;
create policy members_select on public.organization_members for select using ((organization_id IN ( SELECT get_user_org_ids(auth.uid()) AS get_user_org_ids)));
create policy members_update on public.organization_members for update using (is_org_admin(organization_id));
create policy org_select on public.organizations for select using (((id IN ( SELECT get_user_org_ids(auth.uid()) AS get_user_org_ids)) OR (id IN ( SELECT owners.organization_id
   FROM owners
  WHERE (owners.user_id = auth.uid())))));
create policy org_update on public.organizations for update using (is_org_admin(id));
create policy owners_delete on public.owners for delete using (is_org_admin(organization_id));
create policy owners_insert on public.owners for insert;
create policy owners_select on public.owners for select using ((is_org_manager(organization_id) OR (user_id = auth.uid()) OR agent_can_see_contact(id, organization_id, assigned_to)));
create policy owners_update on public.owners for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (assigned_to = my_member_id(organization_id)))));
create policy repairs_delete on public.repairs for delete using (is_org_admin(organization_id));
create policy repairs_insert on public.repairs for insert;
create policy repairs_select on public.repairs for select using (is_org_manager(organization_id));
create policy repairs_update on public.repairs for update using (is_org_manager(organization_id));
create policy reservations_delete on public.reservations for delete using (is_org_admin(organization_id));
create policy reservations_insert on public.reservations for insert;
create policy reservations_select on public.reservations for select using ((is_org_manager(organization_id) OR is_my_apartment(apartment_id)));
create policy reservations_update on public.reservations for update using (is_org_manager(organization_id));
create policy selections_delete on public.selections for delete using (is_org_manager(organization_id));
create policy selections_insert on public.selections for insert;
create policy selections_select on public.selections for select using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (created_by = auth.uid()))));
create policy selections_update on public.selections for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND (created_by = auth.uid()))));
create policy share_links_delete on public.share_links for delete using (is_org_manager(organization_id));
create policy share_links_insert on public.share_links for insert;
create policy share_links_select on public.share_links for select using (is_org_manager(organization_id));
create policy share_links_update on public.share_links for update using (is_org_manager(organization_id));
create policy tasks_delete on public.tasks for delete using (is_org_admin(organization_id));
create policy tasks_insert on public.tasks for insert;
create policy tasks_select on public.tasks for select using ((is_org_manager(organization_id) OR (assigned_to = my_member_id(organization_id)) OR (is_org_agent(organization_id) AND (created_by = auth.uid()))));
create policy tasks_update on public.tasks for update using ((is_org_manager(organization_id) OR (is_org_agent(organization_id) AND ((created_by = auth.uid()) OR (assigned_to = my_member_id(organization_id))))));
create policy "rigzea private delete" on storage.objects for delete to authenticated using (((bucket_id = 'rigzea-private'::text) AND can_write_org_folder(name)));
create policy "rigzea private read" on storage.objects for select to authenticated using (((bucket_id = 'rigzea-private'::text) AND can_write_org_folder(name)));
create policy "rigzea private update" on storage.objects for update to authenticated using (((bucket_id = 'rigzea-private'::text) AND can_write_org_folder(name)));
create policy "rigzea private upload" on storage.objects for insert to authenticated;
create policy "rigzea public delete" on storage.objects for delete to authenticated using (((bucket_id = ANY (ARRAY['rigzea-public'::text, 'rigzea-files'::text])) AND can_write_org_folder(name)));
create policy "rigzea public read" on storage.objects for select to authenticated using (((bucket_id = ANY (ARRAY['rigzea-public'::text, 'rigzea-files'::text])) AND can_write_org_folder(name)));
create policy "rigzea public update" on storage.objects for update to authenticated using (((bucket_id = ANY (ARRAY['rigzea-public'::text, 'rigzea-files'::text])) AND can_write_org_folder(name)));
create policy "rigzea public upload" on storage.objects for insert to authenticated;

-- ===========================================================================
-- table grants (469)
-- ===========================================================================

grant DELETE on table public.activity_events to anon;
grant INSERT on table public.activity_events to anon;
grant REFERENCES on table public.activity_events to anon;
grant SELECT on table public.activity_events to anon;
grant TRIGGER on table public.activity_events to anon;
grant TRUNCATE on table public.activity_events to anon;
grant UPDATE on table public.activity_events to anon;
grant DELETE on table public.activity_events to authenticated;
grant INSERT on table public.activity_events to authenticated;
grant REFERENCES on table public.activity_events to authenticated;
grant SELECT on table public.activity_events to authenticated;
grant TRIGGER on table public.activity_events to authenticated;
grant TRUNCATE on table public.activity_events to authenticated;
grant UPDATE on table public.activity_events to authenticated;
grant DELETE on table public.activity_events to service_role;
grant INSERT on table public.activity_events to service_role;
grant REFERENCES on table public.activity_events to service_role;
grant SELECT on table public.activity_events to service_role;
grant TRIGGER on table public.activity_events to service_role;
grant TRUNCATE on table public.activity_events to service_role;
grant UPDATE on table public.activity_events to service_role;
grant DELETE on table public.apartments to anon;
grant INSERT on table public.apartments to anon;
grant REFERENCES on table public.apartments to anon;
grant SELECT on table public.apartments to anon;
grant TRIGGER on table public.apartments to anon;
grant TRUNCATE on table public.apartments to anon;
grant UPDATE on table public.apartments to anon;
grant DELETE on table public.apartments to authenticated;
grant INSERT on table public.apartments to authenticated;
grant REFERENCES on table public.apartments to authenticated;
grant SELECT on table public.apartments to authenticated;
grant TRIGGER on table public.apartments to authenticated;
grant TRUNCATE on table public.apartments to authenticated;
grant UPDATE on table public.apartments to authenticated;
grant DELETE on table public.apartments to service_role;
grant INSERT on table public.apartments to service_role;
grant REFERENCES on table public.apartments to service_role;
grant SELECT on table public.apartments to service_role;
grant TRIGGER on table public.apartments to service_role;
grant TRUNCATE on table public.apartments to service_role;
grant UPDATE on table public.apartments to service_role;
grant DELETE on table public.approvals to anon;
grant INSERT on table public.approvals to anon;
grant REFERENCES on table public.approvals to anon;
grant SELECT on table public.approvals to anon;
grant TRIGGER on table public.approvals to anon;
grant TRUNCATE on table public.approvals to anon;
grant UPDATE on table public.approvals to anon;
grant DELETE on table public.approvals to authenticated;
grant INSERT on table public.approvals to authenticated;
grant REFERENCES on table public.approvals to authenticated;
grant SELECT on table public.approvals to authenticated;
grant TRIGGER on table public.approvals to authenticated;
grant TRUNCATE on table public.approvals to authenticated;
grant UPDATE on table public.approvals to authenticated;
grant DELETE on table public.approvals to service_role;
grant INSERT on table public.approvals to service_role;
grant REFERENCES on table public.approvals to service_role;
grant SELECT on table public.approvals to service_role;
grant TRIGGER on table public.approvals to service_role;
grant TRUNCATE on table public.approvals to service_role;
grant UPDATE on table public.approvals to service_role;
grant DELETE on table public.condition_reports to anon;
grant INSERT on table public.condition_reports to anon;
grant REFERENCES on table public.condition_reports to anon;
grant SELECT on table public.condition_reports to anon;
grant TRIGGER on table public.condition_reports to anon;
grant TRUNCATE on table public.condition_reports to anon;
grant UPDATE on table public.condition_reports to anon;
grant DELETE on table public.condition_reports to authenticated;
grant INSERT on table public.condition_reports to authenticated;
grant REFERENCES on table public.condition_reports to authenticated;
grant SELECT on table public.condition_reports to authenticated;
grant TRIGGER on table public.condition_reports to authenticated;
grant TRUNCATE on table public.condition_reports to authenticated;
grant UPDATE on table public.condition_reports to authenticated;
grant DELETE on table public.condition_reports to service_role;
grant INSERT on table public.condition_reports to service_role;
grant REFERENCES on table public.condition_reports to service_role;
grant SELECT on table public.condition_reports to service_role;
grant TRIGGER on table public.condition_reports to service_role;
grant TRUNCATE on table public.condition_reports to service_role;
grant UPDATE on table public.condition_reports to service_role;
grant DELETE on table public.contracts to authenticated;
grant INSERT on table public.contracts to authenticated;
grant REFERENCES on table public.contracts to authenticated;
grant SELECT on table public.contracts to authenticated;
grant TRIGGER on table public.contracts to authenticated;
grant TRUNCATE on table public.contracts to authenticated;
grant UPDATE on table public.contracts to authenticated;
grant DELETE on table public.contracts to service_role;
grant INSERT on table public.contracts to service_role;
grant REFERENCES on table public.contracts to service_role;
grant SELECT on table public.contracts to service_role;
grant TRIGGER on table public.contracts to service_role;
grant TRUNCATE on table public.contracts to service_role;
grant UPDATE on table public.contracts to service_role;
grant DELETE on table public.deals to anon;
grant INSERT on table public.deals to anon;
grant REFERENCES on table public.deals to anon;
grant SELECT on table public.deals to anon;
grant TRIGGER on table public.deals to anon;
grant TRUNCATE on table public.deals to anon;
grant UPDATE on table public.deals to anon;
grant DELETE on table public.deals to authenticated;
grant INSERT on table public.deals to authenticated;
grant REFERENCES on table public.deals to authenticated;
grant SELECT on table public.deals to authenticated;
grant TRIGGER on table public.deals to authenticated;
grant TRUNCATE on table public.deals to authenticated;
grant UPDATE on table public.deals to authenticated;
grant DELETE on table public.deals to service_role;
grant INSERT on table public.deals to service_role;
grant REFERENCES on table public.deals to service_role;
grant SELECT on table public.deals to service_role;
grant TRIGGER on table public.deals to service_role;
grant TRUNCATE on table public.deals to service_role;
grant UPDATE on table public.deals to service_role;
grant DELETE on table public.expenses to anon;
grant INSERT on table public.expenses to anon;
grant REFERENCES on table public.expenses to anon;
grant SELECT on table public.expenses to anon;
grant TRIGGER on table public.expenses to anon;
grant TRUNCATE on table public.expenses to anon;
grant UPDATE on table public.expenses to anon;
grant DELETE on table public.expenses to authenticated;
grant INSERT on table public.expenses to authenticated;
grant REFERENCES on table public.expenses to authenticated;
grant SELECT on table public.expenses to authenticated;
grant TRIGGER on table public.expenses to authenticated;
grant TRUNCATE on table public.expenses to authenticated;
grant UPDATE on table public.expenses to authenticated;
grant DELETE on table public.expenses to service_role;
grant INSERT on table public.expenses to service_role;
grant REFERENCES on table public.expenses to service_role;
grant SELECT on table public.expenses to service_role;
grant TRIGGER on table public.expenses to service_role;
grant TRUNCATE on table public.expenses to service_role;
grant UPDATE on table public.expenses to service_role;
grant DELETE on table public.income to anon;
grant INSERT on table public.income to anon;
grant REFERENCES on table public.income to anon;
grant SELECT on table public.income to anon;
grant TRIGGER on table public.income to anon;
grant TRUNCATE on table public.income to anon;
grant UPDATE on table public.income to anon;
grant DELETE on table public.income to authenticated;
grant INSERT on table public.income to authenticated;
grant REFERENCES on table public.income to authenticated;
grant SELECT on table public.income to authenticated;
grant TRIGGER on table public.income to authenticated;
grant TRUNCATE on table public.income to authenticated;
grant UPDATE on table public.income to authenticated;
grant DELETE on table public.income to service_role;
grant INSERT on table public.income to service_role;
grant REFERENCES on table public.income to service_role;
grant SELECT on table public.income to service_role;
grant TRIGGER on table public.income to service_role;
grant TRUNCATE on table public.income to service_role;
grant UPDATE on table public.income to service_role;
grant DELETE on table public.invitations to anon;
grant INSERT on table public.invitations to anon;
grant REFERENCES on table public.invitations to anon;
grant SELECT on table public.invitations to anon;
grant TRIGGER on table public.invitations to anon;
grant TRUNCATE on table public.invitations to anon;
grant UPDATE on table public.invitations to anon;
grant DELETE on table public.invitations to authenticated;
grant INSERT on table public.invitations to authenticated;
grant REFERENCES on table public.invitations to authenticated;
grant SELECT on table public.invitations to authenticated;
grant TRIGGER on table public.invitations to authenticated;
grant TRUNCATE on table public.invitations to authenticated;
grant UPDATE on table public.invitations to authenticated;
grant DELETE on table public.invitations to service_role;
grant INSERT on table public.invitations to service_role;
grant REFERENCES on table public.invitations to service_role;
grant SELECT on table public.invitations to service_role;
grant TRIGGER on table public.invitations to service_role;
grant TRUNCATE on table public.invitations to service_role;
grant UPDATE on table public.invitations to service_role;
grant DELETE on table public.link_events to anon;
grant INSERT on table public.link_events to anon;
grant REFERENCES on table public.link_events to anon;
grant SELECT on table public.link_events to anon;
grant TRIGGER on table public.link_events to anon;
grant TRUNCATE on table public.link_events to anon;
grant UPDATE on table public.link_events to anon;
grant DELETE on table public.link_events to authenticated;
grant INSERT on table public.link_events to authenticated;
grant REFERENCES on table public.link_events to authenticated;
grant SELECT on table public.link_events to authenticated;
grant TRIGGER on table public.link_events to authenticated;
grant TRUNCATE on table public.link_events to authenticated;
grant UPDATE on table public.link_events to authenticated;
grant DELETE on table public.link_events to service_role;
grant INSERT on table public.link_events to service_role;
grant REFERENCES on table public.link_events to service_role;
grant SELECT on table public.link_events to service_role;
grant TRIGGER on table public.link_events to service_role;
grant TRUNCATE on table public.link_events to service_role;
grant UPDATE on table public.link_events to service_role;
grant DELETE on table public.monthly_reports to anon;
grant INSERT on table public.monthly_reports to anon;
grant REFERENCES on table public.monthly_reports to anon;
grant SELECT on table public.monthly_reports to anon;
grant TRIGGER on table public.monthly_reports to anon;
grant TRUNCATE on table public.monthly_reports to anon;
grant UPDATE on table public.monthly_reports to anon;
grant DELETE on table public.monthly_reports to authenticated;
grant INSERT on table public.monthly_reports to authenticated;
grant REFERENCES on table public.monthly_reports to authenticated;
grant SELECT on table public.monthly_reports to authenticated;
grant TRIGGER on table public.monthly_reports to authenticated;
grant TRUNCATE on table public.monthly_reports to authenticated;
grant UPDATE on table public.monthly_reports to authenticated;
grant DELETE on table public.monthly_reports to service_role;
grant INSERT on table public.monthly_reports to service_role;
grant REFERENCES on table public.monthly_reports to service_role;
grant SELECT on table public.monthly_reports to service_role;
grant TRIGGER on table public.monthly_reports to service_role;
grant TRUNCATE on table public.monthly_reports to service_role;
grant UPDATE on table public.monthly_reports to service_role;
grant DELETE on table public.notifications to anon;
grant INSERT on table public.notifications to anon;
grant REFERENCES on table public.notifications to anon;
grant SELECT on table public.notifications to anon;
grant TRIGGER on table public.notifications to anon;
grant TRUNCATE on table public.notifications to anon;
grant UPDATE on table public.notifications to anon;
grant DELETE on table public.notifications to authenticated;
grant INSERT on table public.notifications to authenticated;
grant REFERENCES on table public.notifications to authenticated;
grant SELECT on table public.notifications to authenticated;
grant TRIGGER on table public.notifications to authenticated;
grant TRUNCATE on table public.notifications to authenticated;
grant UPDATE on table public.notifications to authenticated;
grant DELETE on table public.notifications to service_role;
grant INSERT on table public.notifications to service_role;
grant REFERENCES on table public.notifications to service_role;
grant SELECT on table public.notifications to service_role;
grant TRIGGER on table public.notifications to service_role;
grant TRUNCATE on table public.notifications to service_role;
grant UPDATE on table public.notifications to service_role;
grant DELETE on table public.organization_members to anon;
grant INSERT on table public.organization_members to anon;
grant REFERENCES on table public.organization_members to anon;
grant SELECT on table public.organization_members to anon;
grant TRIGGER on table public.organization_members to anon;
grant TRUNCATE on table public.organization_members to anon;
grant UPDATE on table public.organization_members to anon;
grant DELETE on table public.organization_members to authenticated;
grant INSERT on table public.organization_members to authenticated;
grant REFERENCES on table public.organization_members to authenticated;
grant SELECT on table public.organization_members to authenticated;
grant TRIGGER on table public.organization_members to authenticated;
grant TRUNCATE on table public.organization_members to authenticated;
grant UPDATE on table public.organization_members to authenticated;
grant DELETE on table public.organization_members to service_role;
grant INSERT on table public.organization_members to service_role;
grant REFERENCES on table public.organization_members to service_role;
grant SELECT on table public.organization_members to service_role;
grant TRIGGER on table public.organization_members to service_role;
grant TRUNCATE on table public.organization_members to service_role;
grant UPDATE on table public.organization_members to service_role;
grant DELETE on table public.organizations to anon;
grant INSERT on table public.organizations to anon;
grant REFERENCES on table public.organizations to anon;
grant SELECT on table public.organizations to anon;
grant TRIGGER on table public.organizations to anon;
grant TRUNCATE on table public.organizations to anon;
grant UPDATE on table public.organizations to anon;
grant DELETE on table public.organizations to authenticated;
grant INSERT on table public.organizations to authenticated;
grant REFERENCES on table public.organizations to authenticated;
grant SELECT on table public.organizations to authenticated;
grant TRIGGER on table public.organizations to authenticated;
grant TRUNCATE on table public.organizations to authenticated;
grant UPDATE on table public.organizations to authenticated;
grant DELETE on table public.organizations to service_role;
grant INSERT on table public.organizations to service_role;
grant REFERENCES on table public.organizations to service_role;
grant SELECT on table public.organizations to service_role;
grant TRIGGER on table public.organizations to service_role;
grant TRUNCATE on table public.organizations to service_role;
grant UPDATE on table public.organizations to service_role;
grant DELETE on table public.owners to anon;
grant INSERT on table public.owners to anon;
grant REFERENCES on table public.owners to anon;
grant SELECT on table public.owners to anon;
grant TRIGGER on table public.owners to anon;
grant TRUNCATE on table public.owners to anon;
grant UPDATE on table public.owners to anon;
grant DELETE on table public.owners to authenticated;
grant INSERT on table public.owners to authenticated;
grant REFERENCES on table public.owners to authenticated;
grant SELECT on table public.owners to authenticated;
grant TRIGGER on table public.owners to authenticated;
grant TRUNCATE on table public.owners to authenticated;
grant UPDATE on table public.owners to authenticated;
grant DELETE on table public.owners to service_role;
grant INSERT on table public.owners to service_role;
grant REFERENCES on table public.owners to service_role;
grant SELECT on table public.owners to service_role;
grant TRIGGER on table public.owners to service_role;
grant TRUNCATE on table public.owners to service_role;
grant UPDATE on table public.owners to service_role;
grant DELETE on table public.platform_admin_log to service_role;
grant INSERT on table public.platform_admin_log to service_role;
grant REFERENCES on table public.platform_admin_log to service_role;
grant SELECT on table public.platform_admin_log to service_role;
grant TRIGGER on table public.platform_admin_log to service_role;
grant TRUNCATE on table public.platform_admin_log to service_role;
grant UPDATE on table public.platform_admin_log to service_role;
grant DELETE on table public.platform_admins to service_role;
grant INSERT on table public.platform_admins to service_role;
grant REFERENCES on table public.platform_admins to service_role;
grant SELECT on table public.platform_admins to service_role;
grant TRIGGER on table public.platform_admins to service_role;
grant TRUNCATE on table public.platform_admins to service_role;
grant UPDATE on table public.platform_admins to service_role;
grant DELETE on table public.repairs to anon;
grant INSERT on table public.repairs to anon;
grant REFERENCES on table public.repairs to anon;
grant SELECT on table public.repairs to anon;
grant TRIGGER on table public.repairs to anon;
grant TRUNCATE on table public.repairs to anon;
grant UPDATE on table public.repairs to anon;
grant DELETE on table public.repairs to authenticated;
grant INSERT on table public.repairs to authenticated;
grant REFERENCES on table public.repairs to authenticated;
grant SELECT on table public.repairs to authenticated;
grant TRIGGER on table public.repairs to authenticated;
grant TRUNCATE on table public.repairs to authenticated;
grant UPDATE on table public.repairs to authenticated;
grant DELETE on table public.repairs to service_role;
grant INSERT on table public.repairs to service_role;
grant REFERENCES on table public.repairs to service_role;
grant SELECT on table public.repairs to service_role;
grant TRIGGER on table public.repairs to service_role;
grant TRUNCATE on table public.repairs to service_role;
grant UPDATE on table public.repairs to service_role;
grant DELETE on table public.reservations to anon;
grant INSERT on table public.reservations to anon;
grant REFERENCES on table public.reservations to anon;
grant SELECT on table public.reservations to anon;
grant TRIGGER on table public.reservations to anon;
grant TRUNCATE on table public.reservations to anon;
grant UPDATE on table public.reservations to anon;
grant DELETE on table public.reservations to authenticated;
grant INSERT on table public.reservations to authenticated;
grant REFERENCES on table public.reservations to authenticated;
grant SELECT on table public.reservations to authenticated;
grant TRIGGER on table public.reservations to authenticated;
grant TRUNCATE on table public.reservations to authenticated;
grant UPDATE on table public.reservations to authenticated;
grant DELETE on table public.reservations to service_role;
grant INSERT on table public.reservations to service_role;
grant REFERENCES on table public.reservations to service_role;
grant SELECT on table public.reservations to service_role;
grant TRIGGER on table public.reservations to service_role;
grant TRUNCATE on table public.reservations to service_role;
grant UPDATE on table public.reservations to service_role;
grant DELETE on table public.selections to authenticated;
grant INSERT on table public.selections to authenticated;
grant REFERENCES on table public.selections to authenticated;
grant SELECT on table public.selections to authenticated;
grant TRIGGER on table public.selections to authenticated;
grant TRUNCATE on table public.selections to authenticated;
grant UPDATE on table public.selections to authenticated;
grant DELETE on table public.selections to service_role;
grant INSERT on table public.selections to service_role;
grant REFERENCES on table public.selections to service_role;
grant SELECT on table public.selections to service_role;
grant TRIGGER on table public.selections to service_role;
grant TRUNCATE on table public.selections to service_role;
grant UPDATE on table public.selections to service_role;
grant DELETE on table public.share_links to anon;
grant INSERT on table public.share_links to anon;
grant REFERENCES on table public.share_links to anon;
grant SELECT on table public.share_links to anon;
grant TRIGGER on table public.share_links to anon;
grant TRUNCATE on table public.share_links to anon;
grant UPDATE on table public.share_links to anon;
grant DELETE on table public.share_links to authenticated;
grant INSERT on table public.share_links to authenticated;
grant REFERENCES on table public.share_links to authenticated;
grant SELECT on table public.share_links to authenticated;
grant TRIGGER on table public.share_links to authenticated;
grant TRUNCATE on table public.share_links to authenticated;
grant UPDATE on table public.share_links to authenticated;
grant DELETE on table public.share_links to service_role;
grant INSERT on table public.share_links to service_role;
grant REFERENCES on table public.share_links to service_role;
grant SELECT on table public.share_links to service_role;
grant TRIGGER on table public.share_links to service_role;
grant TRUNCATE on table public.share_links to service_role;
grant UPDATE on table public.share_links to service_role;
grant DELETE on table public.tasks to anon;
grant INSERT on table public.tasks to anon;
grant REFERENCES on table public.tasks to anon;
grant SELECT on table public.tasks to anon;
grant TRIGGER on table public.tasks to anon;
grant TRUNCATE on table public.tasks to anon;
grant UPDATE on table public.tasks to anon;
grant DELETE on table public.tasks to authenticated;
grant INSERT on table public.tasks to authenticated;
grant REFERENCES on table public.tasks to authenticated;
grant SELECT on table public.tasks to authenticated;
grant TRIGGER on table public.tasks to authenticated;
grant TRUNCATE on table public.tasks to authenticated;
grant UPDATE on table public.tasks to authenticated;
grant DELETE on table public.tasks to service_role;
grant INSERT on table public.tasks to service_role;
grant REFERENCES on table public.tasks to service_role;
grant SELECT on table public.tasks to service_role;
grant TRIGGER on table public.tasks to service_role;
grant TRUNCATE on table public.tasks to service_role;
grant UPDATE on table public.tasks to service_role;
grant DELETE on table public.telegram_chats to anon;
grant INSERT on table public.telegram_chats to anon;
grant REFERENCES on table public.telegram_chats to anon;
grant SELECT on table public.telegram_chats to anon;
grant TRIGGER on table public.telegram_chats to anon;
grant TRUNCATE on table public.telegram_chats to anon;
grant UPDATE on table public.telegram_chats to anon;
grant DELETE on table public.telegram_chats to authenticated;
grant INSERT on table public.telegram_chats to authenticated;
grant REFERENCES on table public.telegram_chats to authenticated;
grant SELECT on table public.telegram_chats to authenticated;
grant TRIGGER on table public.telegram_chats to authenticated;
grant TRUNCATE on table public.telegram_chats to authenticated;
grant UPDATE on table public.telegram_chats to authenticated;
grant DELETE on table public.telegram_chats to service_role;
grant INSERT on table public.telegram_chats to service_role;
grant REFERENCES on table public.telegram_chats to service_role;
grant SELECT on table public.telegram_chats to service_role;
grant TRIGGER on table public.telegram_chats to service_role;
grant TRUNCATE on table public.telegram_chats to service_role;
grant UPDATE on table public.telegram_chats to service_role;
grant DELETE on table public.telegram_link_codes to anon;
grant INSERT on table public.telegram_link_codes to anon;
grant REFERENCES on table public.telegram_link_codes to anon;
grant SELECT on table public.telegram_link_codes to anon;
grant TRIGGER on table public.telegram_link_codes to anon;
grant TRUNCATE on table public.telegram_link_codes to anon;
grant UPDATE on table public.telegram_link_codes to anon;
grant DELETE on table public.telegram_link_codes to authenticated;
grant INSERT on table public.telegram_link_codes to authenticated;
grant REFERENCES on table public.telegram_link_codes to authenticated;
grant SELECT on table public.telegram_link_codes to authenticated;
grant TRIGGER on table public.telegram_link_codes to authenticated;
grant TRUNCATE on table public.telegram_link_codes to authenticated;
grant UPDATE on table public.telegram_link_codes to authenticated;
grant DELETE on table public.telegram_link_codes to service_role;
grant INSERT on table public.telegram_link_codes to service_role;
grant REFERENCES on table public.telegram_link_codes to service_role;
grant SELECT on table public.telegram_link_codes to service_role;
grant TRIGGER on table public.telegram_link_codes to service_role;
grant TRUNCATE on table public.telegram_link_codes to service_role;
grant UPDATE on table public.telegram_link_codes to service_role;
grant DELETE on table public.trial_grants to service_role;
grant INSERT on table public.trial_grants to service_role;
grant REFERENCES on table public.trial_grants to service_role;
grant SELECT on table public.trial_grants to service_role;
grant TRIGGER on table public.trial_grants to service_role;
grant TRUNCATE on table public.trial_grants to service_role;
grant UPDATE on table public.trial_grants to service_role;

-- ===========================================================================
-- function grants (130)
-- ===========================================================================

grant execute on function public.accept_my_invitations() to authenticated;
grant execute on function public.accept_my_invitations() to service_role;
grant execute on function public.admin_list_orgs() to authenticated;
grant execute on function public.admin_list_orgs() to service_role;
grant execute on function public.admin_set_org_plan(p_org uuid, p_plan text, p_days integer) to authenticated;
grant execute on function public.admin_set_org_plan(p_org uuid, p_plan text, p_days integer) to service_role;
grant execute on function public.agent_can_see_contact(p_contact uuid, p_org uuid, p_assigned uuid) to authenticated;
grant execute on function public.agent_can_see_contact(p_contact uuid, p_org uuid, p_assigned uuid) to service_role;
grant execute on function public.agent_has_viewing(p_apartment uuid) to authenticated;
grant execute on function public.agent_has_viewing(p_apartment uuid) to service_role;
grant execute on function public.apartment_within_plan(p_apartment uuid) to service_role;
grant execute on function public.apartments_set_slug() to public;
grant execute on function public.apartments_set_slug() to authenticated;
grant execute on function public.apartments_set_slug() to service_role;
grant execute on function public.apartments_sync_slug() to public;
grant execute on function public.apartments_sync_slug() to authenticated;
grant execute on function public.apartments_sync_slug() to service_role;
grant execute on function public.approvals_notify() to service_role;
grant execute on function public.can_write_org_folder(p_path text) to authenticated;
grant execute on function public.can_write_org_folder(p_path text) to service_role;
grant execute on function public.close_stale_telegram_notifications() to service_role;
grant execute on function public.consume_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text) to service_role;
grant execute on function public.create_telegram_link_code(p_org uuid) to authenticated;
grant execute on function public.create_telegram_link_code(p_org uuid) to service_role;
grant execute on function public.create_user_organization(p_org_name text, p_city text, p_portfolio_size text, p_display_name text) to authenticated;
grant execute on function public.create_user_organization(p_org_name text, p_city text, p_portfolio_size text, p_display_name text) to service_role;
grant execute on function public.deals_split_guard() to service_role;
grant execute on function public.enforce_apartment_plan() to service_role;
grant execute on function public.enforce_plan_feature() to service_role;
grant execute on function public.enforce_seat_plan() to service_role;
grant execute on function public.expenses_workflow() to service_role;
grant execute on function public.generate_statement(p_apartment uuid, p_month text) to authenticated;
grant execute on function public.generate_statement(p_apartment uuid, p_month text) to service_role;
grant execute on function public.get_guest_guide(p_apartment_id uuid) to anon;
grant execute on function public.get_guest_guide(p_apartment_id uuid) to authenticated;
grant execute on function public.get_guest_guide(p_apartment_id uuid) to service_role;
grant execute on function public.get_guest_guide_by_token(p_token text) to anon;
grant execute on function public.get_guest_guide_by_token(p_token text) to authenticated;
grant execute on function public.get_guest_guide_by_token(p_token text) to service_role;
grant execute on function public.get_link_stats(p_apartment_id uuid) to authenticated;
grant execute on function public.get_link_stats(p_apartment_id uuid) to service_role;
grant execute on function public.get_linked_telegram_org(p_chat_id bigint) to service_role;
grant execute on function public.get_my_telegram_link(p_org uuid) to authenticated;
grant execute on function public.get_my_telegram_link(p_org uuid) to service_role;
grant execute on function public.get_public_approval(p_token text) to anon;
grant execute on function public.get_public_approval(p_token text) to authenticated;
grant execute on function public.get_public_approval(p_token text) to service_role;
grant execute on function public.get_public_listing(p_ref text) to anon;
grant execute on function public.get_public_listing(p_ref text) to authenticated;
grant execute on function public.get_public_listing(p_ref text) to service_role;
grant execute on function public.get_public_selection(p_slug text) to anon;
grant execute on function public.get_public_selection(p_slug text) to authenticated;
grant execute on function public.get_public_selection(p_slug text) to service_role;
grant execute on function public.get_public_showcase(p_apartment_id uuid) to anon;
grant execute on function public.get_public_showcase(p_apartment_id uuid) to authenticated;
grant execute on function public.get_public_showcase(p_apartment_id uuid) to service_role;
grant execute on function public.get_telegram_apartments(p_org_id uuid) to service_role;
grant execute on function public.get_telegram_org(p_org_id uuid) to service_role;
grant execute on function public.get_telegram_renewals(p_org_id uuid, p_days integer) to service_role;
grant execute on function public.get_user_org_ids(p_user_id uuid) to authenticated;
grant execute on function public.get_user_org_ids(p_user_id uuid) to service_role;
grant execute on function public.grant_platform_admin(p_email text) to authenticated;
grant execute on function public.grant_platform_admin(p_email text) to service_role;
grant execute on function public.is_my_apartment(p_apartment uuid) to authenticated;
grant execute on function public.is_my_apartment(p_apartment uuid) to service_role;
grant execute on function public.is_org_admin(p_org uuid) to authenticated;
grant execute on function public.is_org_admin(p_org uuid) to service_role;
grant execute on function public.is_org_agent(p_org uuid) to authenticated;
grant execute on function public.is_org_agent(p_org uuid) to service_role;
grant execute on function public.is_org_manager(p_org uuid) to authenticated;
grant execute on function public.is_org_manager(p_org uuid) to service_role;
grant execute on function public.is_org_member(p_org_id uuid, p_user_id uuid) to authenticated;
grant execute on function public.is_org_member(p_org_id uuid, p_user_id uuid) to service_role;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_platform_admin() to service_role;
grant execute on function public.link_telegram_chat(p_chat_id bigint, p_org_id uuid, p_user_name text) to service_role;
grant execute on function public.list_platform_admins() to authenticated;
grant execute on function public.list_platform_admins() to service_role;
grant execute on function public.mark_telegram_sent(p_ids uuid[]) to service_role;
grant execute on function public.my_member_id(p_org uuid) to authenticated;
grant execute on function public.my_member_id(p_org uuid) to service_role;
grant execute on function public.my_org_has_feature(p_org uuid, p_feature text) to authenticated;
grant execute on function public.my_org_has_feature(p_org uuid, p_feature text) to service_role;
grant execute on function public.my_owner_ids() to authenticated;
grant execute on function public.my_owner_ids() to service_role;
grant execute on function public.notify_managers(p_org uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text) to service_role;
grant execute on function public.notify_user(p_org uuid, p_user uuid, p_title text, p_message text, p_type text, p_link text, p_dedup text) to service_role;
grant execute on function public.org_effective_plan(p_org uuid) to authenticated;
grant execute on function public.org_effective_plan(p_org uuid) to service_role;
grant execute on function public.org_has_feature(p_org uuid, p_feature text) to authenticated;
grant execute on function public.org_has_feature(p_org uuid, p_feature text) to service_role;
grant execute on function public.pending_telegram_notifications(p_limit integer) to service_role;
grant execute on function public.plan_has_feature(p_plan text, p_feature text) to public;
grant execute on function public.plan_has_feature(p_plan text, p_feature text) to authenticated;
grant execute on function public.plan_has_feature(p_plan text, p_feature text) to service_role;
grant execute on function public.plan_limit(p_plan text, p_kind text) to authenticated;
grant execute on function public.plan_limit(p_plan text, p_kind text) to service_role;
grant execute on function public.platform_admin_caller_ok() to service_role;
grant execute on function public.protect_org_branding() to service_role;
grant execute on function public.protect_org_plan() to service_role;
grant execute on function public.record_link_event(p_ref text, p_kind text, p_visitor text, p_recipient text) to service_role;
grant execute on function public.redeem_telegram_link_code(p_code text, p_chat_id bigint, p_user_name text) to service_role;
grant execute on function public.respond_public_approval(p_token text, p_decision text, p_note text) to anon;
grant execute on function public.respond_public_approval(p_token text, p_decision text, p_note text) to authenticated;
grant execute on function public.respond_public_approval(p_token text, p_decision text, p_note text) to service_role;
grant execute on function public.revoke_platform_admin(p_email text) to authenticated;
grant execute on function public.revoke_platform_admin(p_email text) to service_role;
grant execute on function public.scan_alerts(p_org uuid) to authenticated;
grant execute on function public.scan_alerts(p_org uuid) to service_role;
grant execute on function public.scan_lease_renewals(p_org uuid) to authenticated;
grant execute on function public.scan_lease_renewals(p_org uuid) to service_role;
grant execute on function public.selections_guard() to service_role;
grant execute on function public.set_my_telegram_notify(p_org uuid, p_mode text) to authenticated;
grant execute on function public.set_my_telegram_notify(p_org uuid, p_mode text) to service_role;
grant execute on function public.staff_add_task_photo(p_task uuid, p_url text, p_phase text) to authenticated;
grant execute on function public.staff_add_task_photo(p_task uuid, p_url text, p_phase text) to service_role;
grant execute on function public.staff_report_problem(p_task uuid, p_title text, p_description text, p_photo_url text, p_urgent boolean) to authenticated;
grant execute on function public.staff_report_problem(p_task uuid, p_title text, p_description text, p_photo_url text, p_urgent boolean) to service_role;
grant execute on function public.staff_task_guard(p_task uuid) to service_role;
grant execute on function public.staff_update_task(p_task uuid, p_status text, p_checklist jsonb, p_notes text, p_blocked_reason text) to authenticated;
grant execute on function public.staff_update_task(p_task uuid, p_status text, p_checklist jsonb, p_notes text, p_blocked_reason text) to service_role;
grant execute on function public.statements_notify() to service_role;
grant execute on function public.tasks_lifecycle() to service_role;
grant execute on function public.telegram_create_task_record(p_org_id uuid, p_apt_id uuid, p_title text, p_description text, p_cost numeric, p_source text) to service_role;
grant execute on function public.track_link_event(p_ref text, p_kind text, p_visitor text, p_selection_id uuid) to anon;
grant execute on function public.track_link_event(p_ref text, p_kind text, p_visitor text, p_selection_id uuid) to authenticated;
grant execute on function public.track_link_event(p_ref text, p_kind text, p_visitor text, p_selection_id uuid) to service_role;
grant execute on function public.track_link_event_notify(p_ref text, p_kind text, p_visitor text, p_selection_id uuid) to service_role;
grant execute on function public.unlink_my_telegram(p_org uuid) to authenticated;
grant execute on function public.unlink_my_telegram(p_org uuid) to service_role;
