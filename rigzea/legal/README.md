# legal: legal pages and operator details

## Overview

Static legal pages (Georgian copy) plus one small script that fills in who operates Rigzea. The pages
themselves are HTML only: `cookies/`, `privacy/`, `refund/`, `terms/` (each an `index.html`), styled by
`legal.css`. The landing footer (`rigzea/index.html`) also loads `operator.js`.

## Interface

- `operator.js`
  - `window.RIGZEA_OPERATOR` `{ name, id, address, email, phone }`: the single place to edit operator details.
  - On load it fills `[data-op="<key>"]` elements (and sets `mailto:` / `tel:` on links), hides `[data-op-row="<key>"]` rows whose value is empty, writes the joined line into `[data-operator-line]`, and shows `[data-operator-notice]` while a required detail is missing.
- Subpages (no code): `cookies/`, `privacy/`, `refund/`, `terms/`.
- `legal.css`: shared legal page styles.

## Invariants

- Required operator details are `name`, `id`, `address`, `email`; while any is empty the legal pages show the notice. `phone` is optional and is left empty on purpose so it does not appear on the public site.
- Operator details are edited only in `operator.js`, never copied into the HTML.
- No em dash characters in any legal copy.

## Side Effects

- DOM updates only on pages that include the script. No network or storage access.

## Verification

- Run: `npm test` (from the repo root).
