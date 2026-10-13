-- =============================================================================
-- RIGZEA patch 13 — Link import and the PDF presentation belong to paid plans
--   The free plan no longer includes filling a property from a MyHome.ge,
--   SS.ge or Place.ge link, nor the PDF presentation. Both are open on the
--   trial and from "pro" up (mirrors PLANS in rigzea/app/app.js).
--   my_org_has_feature lets the import route check the caller's own workspace.
-- Additive. Safe to run more than once.
-- =============================================================================

create or replace function public.plan_has_feature(p_plan text, p_feature text)
returns boolean language sql immutable as $$
  select case p_plan
    when 'trial' then true
    when 'agency' then true
    when 'top' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation', 'selections', 'analytics', 'export')
    when 'pro' then p_feature in ('profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation')
    else false
  end;
$$;

-- True only for a member of the workspace whose plan includes the feature.
create or replace function public.my_org_has_feature(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members where organization_id = p_org and user_id = auth.uid())
     and public.org_has_feature(p_org, p_feature);
$$;
revoke execute on function public.my_org_has_feature(uuid, text) from public, anon;
grant execute on function public.my_org_has_feature(uuid, text) to authenticated;
