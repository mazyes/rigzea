# staff: field staff "My jobs" app

## Overview

A small mobile-first page at `/staff/` for cleaners and other field staff. It lists only the tasks assigned
to the signed-in member, with the apartment access details needed for them, and lets staff update status,
add before/after photos and report problems. It uses the shared `/js/core.js` helpers.

## Interface

- `index.html`: loads `/js/supabase.js`, `/js/config.js`, `/js/core.js`, then `staff.js`; renders into `#staff-view`.
- `staff.js` (self-contained IIFE, no globals): `load()`, `render()`, `renderList()`, `renderJob(id)`, `save(task, args)`, `reportProblem(task)`, `refresh()`.

## Invariants

- Without a session the page redirects to `/app/` to sign in.
- Reads are limited to the member's own memberships, tasks assigned to them (open statuses `assigned`, `in_progress`, `blocked`), the apartments of those tasks and their organization names.
- All writes go through `staff_*` RPCs (`staff_update_task`, `staff_add_task_photo`, `staff_report_problem`); the page never updates tables directly.
- Task photos are uploaded with `R.uploadFile(orgId, 'tasks/<task id>', file)`, so they land in the private bucket as signed links.

## Side Effects

- Supabase: `accept_my_invitations` RPC, selects on `organization_members`, `tasks`, `apartments`, `organizations`, and the `staff_*` RPCs above.
- Storage upload to `rigzea-private`.

## Verification

- Run: `npm test` (from the repo root).
