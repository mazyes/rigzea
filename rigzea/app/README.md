# app: the Rigzea CRM workspace

## Overview

The signed-in CRM for agents and agencies: today screen, tasks, apartments (portfolio), contacts (owners),
deals, finance, team, settings and internal chat. `app.js` is the shell (session, workspace selection, data
loading, routing, plan limits, top bar); each area's screens live in a `views-*.js` chunk that registers
itself on `App.views`. Styling is `app.css`.

Each area is its own page (`/app/`, `/app/tasks/`, `/app/apartments/`, `/app/owners/`, `/app/deals/`,
`/app/finance/`, `/app/team/`, `/app/settings/`, `/app/chat/`), and an item is `?id=<id>[&sub=<tab>]`.
Only `index.html` is edited by hand: the area subfolders (`apartments/`, `chat/`, `deals/`, `finance/`,
`owners/`, `settings/`, `tasks/`, `team/`) contain generated `index.html` copies that differ only in the
title, written with hashed `?v=` asset URLs by `node scripts/stamp-assets.mjs` (also Vercel's build command).

## Interface

- `index.html`: the single source page. Loads `/js/supabase.js`, `/js/config.js`, `/js/core.js`, `/js/i18n.js` (English only), `/js/plans.js`, `/js/site-tools.js`, then `app.js`. `window.__RIGZEA_ASSET_VERSIONS` maps each view chunk to its hash.
- `app.js` exposes `window.App`:
  - State and lookups: `S` (user, orgs, org, member, data, limits, totals), `H` (lookups such as `apt`, `aptName`, `owner`, `member`, `memberName`, `deal`, `task`, `contactByPhone`, `isOpen`, `isOverdue`, `approvalLink`, `dueText`, `assigneeText`), `views`.
  - Roles: `isManager`, `isAdmin`, `isAgent`.
  - Navigation: `go(target)`, `route()`, `toUrl(hash)`, `taskHref`, `closeTaskOverlay`, `render`, `renderShell`, `refresh`, `loadMore`.
  - Data: `upsertLocal(table, row)`, `logEvent(apartmentId, type, title, description, metadata)`.
  - Plans: `PLANS`, `PLAN_ORDER`, `FEATURE_LABEL`, `planState`, `can`, `guardLimit(kind, add)`, `guardFeature(feature)`, `openUpgrade`, `planCardsHtml`, `activeApartments`, `pausedApartmentIds`, `seatsUsed`, `openKisaCheckoutModal` / `startKisaCheckout`.
  - Tools: `openCommissionCalculator`, `openMatchmaker`, `openSocialPostGenerator`, `openDocChooser`, `openPresentation`, `setTheme`, `setNavMode`, `openWelcome`, `setChatUnread`, `docBrand`, `emptyInline`, `monthLabel`.
- View chunks (each reads `App.S`/`App.H` and adds to `App`):
  - `views-ops.js`: `App.views.today`, `App.views.tasks`; task drawer and form (`openTaskDrawer`, `openTaskForm`, `openAssign`, `planTurnover`, `planCleaningAfter`, `shareApproval`, `approvalsList`, `activityList`).
  - `views-portfolio.js`: `App.views.apartments`, `App.views.owners`; `openApartmentForm`, `openOwnerForm`, `openApprovalForm`, `createApproval`, `openListingPhotos`, `openWatermarkModal`, `openOwnerReportModal`, `openCollectionModal`; listing import via `/api/import-listing/`.
  - `views-deals.js`: `App.views.deals`; `openDealForm`, `calcSplit`, `matchScore`, `openMatchmakerModal`, `openReverseMatchmakerModal`, `addSelection`, `openPostGenerator`, `openLeaseAgreementGenerator`, `openLeasePreview`, `leaseHtml`, `openCoBrokerShare`, `copyRenterLink`, `dealsUtil`.
  - `views-docs.js`: `DOCS`, `openDocChooser`, `openPresentation`, `presentationHtml`, `openLegalDoc`, `docHtml`, `renderDocuments`, `openNapr`, `naprButton`, `bindNapr`, `invalidateDocs` (PDF presentation via print, sale contract templates, NAPR registry check).
  - `views-finance.js`: `App.views.finance`; `openExpenseForm`, `openIncomeForm`; expense workflow (proposed, approved, incurred, paid) and monthly owner statements.
  - `views-admin.js`: `App.views.team`, `App.views.settings`; `exportDialog`, `exportApartments`, `exportDeals`, `exportFinance`; invitations, organization settings, Excel/CSV import, platform admin tools.
  - `views-chat.js`: `App.views.chat`; `chatReady`, `chatWarm` (company channel and direct messages).
- `app.css`: all workspace styles. `ios-emoji-chat.ttf` (with `ios-emoji-LICENSE.txt`) is the chat emoji font.

## Invariants

- Edit only `app/index.html`; never edit the generated area pages. Re-run `node scripts/stamp-assets.mjs` after changing any `/app/*` or `/js/*` asset so the `?v=` hashes match.
- Views are loaded lazily, but `ensureViewLoaded` loads every chunk (the requested area first) because chunks call each other's `App.*` functions. Chunks run in request order (`async = false`); `views-docs.js` reads `App.dealsUtil` at load.
- Code writes links as `#/area/id/sub?x=1`; `toUrl()` turns them into page addresses. The offline demo (`/demo/`) is one page and keeps `#/` addresses.
- Paged lists (`PAGED` in `app.js`) are capped per query; when the server holds more rows the app shows a notice instead of dropping them silently.
- Manager roles are `owner`, `admin`, `manager`; field staff use `/staff/`. Plan limits and features come from `/js/plans.js` and are also enforced in the database.
- All UI copy is Georgian, with no em dash characters. Everything in `innerHTML` goes through `esc()`, stored URLs through `R.safeUrl()`, money through `R.money()`.
- Forms keep rarely used fields in `<details class="form-more">`. New contacts and deals default to lead source `direct`.
- Chat permissions are enforced by `supabase/patches/24_chat.sql`; the client only draws.

## Side Effects

- Supabase reads and writes on org-scoped tables (`apartments`, `owners`, `tasks`, `approvals`, `expenses`, `income`, `reservations`, `repairs`, `deals`, `selections`, `contracts`, `monthly_reports`, `activity_events`, `notifications`, `organizations`, `organization_members`, `invitations`, `chat_*`) and RPCs (`get_invitation`, `accept_invitation`, `accept_my_invitations`, `is_platform_admin`, `create_user_organization`, `scan_alerts`, `generate_statement`, `get_link_stats`, `create_telegram_link_code`, `chat_*`, `admin_*`, platform admin grants).
- Supabase Realtime channel `chat-<org>` on `chat_messages`, `chat_reactions`, `chat_channel_members`.
- Calls Vercel functions: `/api/kisa-checkout`, `/api/import-listing/`, `/api/invite-email`, `/api/plan-email/`.
- File uploads through `R.uploadFile` (private bucket for receipts, task and approval photos).
- `localStorage`: `rigzea_selected_org_id`, `rigzea_invite`, `rigzea_theme`, `rigzea_nav`, `rigzea_lang`, `rigzea_ios_hint`, `rigzea_visits`. IndexedDB `rigzea-cache` keeps data from the last visit, shown (marked stale) while fresh data loads; `sessionStorage` `rigzea_handoff` passes loaded data between area pages.
- Listens to service worker messages (update offers from `/service-worker.js`).

## Verification

- Run: `npm test` (from the repo root). For a subset: `node tests/e2e.js <number>`. Tests mock Supabase, so RLS, grants and SQL must be checked against the live database separately.
