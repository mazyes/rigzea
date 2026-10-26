# Supabase Auth email templates

## Overview

The HTML bodies for the emails Supabase Auth sends itself (sign-up confirmation and
password reset). They use the same Rigzea email layout as the app's own emails, so
both kinds look the same in the inbox. The `.html` files are build output: Supabase
does not read this folder, they are pasted into the dashboard by hand.

## Interface

- `build.mjs`: run from the repo root with `node supabase/templates/build.mjs`. Imports
  `renderEmail` from `api/_email.js` and writes one file per entry in its `templates` map.
- `confirm-signup.html`: Authentication, Emails, "Confirm signup". Subject:
  `დაადასტურე ელფოსტა · Rigzea`.
- `reset-password.html`: Authentication, Emails, "Reset password". Subject:
  `პაროლის აღდგენა · Rigzea`.

## Invariants

- Edit the copy in `build.mjs` (or the layout in `api/_email.js`), never the generated
  `.html` files, then rebuild.
- Keep the literal `{{ .ConfirmationURL }}` placeholder as the button URL; Supabase fills
  it in when it sends the email. `renderEmail` must not escape or rewrite it.
- All copy is Georgian and follows `voicetone.md`. Never use the em dash character.
- Subjects are set in the dashboard, not in these files; the comment above each entry in
  `build.mjs` records the subject to use.

## Side Effects

- `build.mjs` overwrites `confirm-signup.html` and `reset-password.html` in this folder.
  Nothing else; it makes no network calls.
- A template only goes live when someone pastes it into the Supabase dashboard
  (project `cuioodytwyzykqlrjfej`).

## Verification

- Run `node supabase/templates/build.mjs`, open the two `.html` files in a browser and
  check the button still points to `{{ .ConfirmationURL }}`.
- After pasting into the dashboard, send a test sign-up or reset and read the real email.
