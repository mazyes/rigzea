# Rigzea app performance plan

Checked against the code on 2026-10-17. An earlier draft of this file got several things wrong:
the logo SVGs and bot avatar are never loaded by the app, the scripts already sit at the end of
`<body>`, `backdrop-filter` appears only on the landing page, and photos already use `loading="lazy"`.

## Done

- **Fonts (largest win).** The app downloaded the full FiraGO files, about 1 MB for four weights.
  `app/app.css` now uses the ~38 KB subsets (Latin, Georgian, punctuation, ₾, €) through
  `unicode-range`. The full files still load, per weight, only when a page shows a character
  outside the subset, such as Cyrillic or ↔. Pages in Georgian download roughly 150 KB instead of 1 MB.
- **Supabase preconnect** in `app/index.html`, so the TLS handshake starts before `supabase.js` runs.
- **Animations that repaint every frame:** the loading skeleton (`background-position`) now animates
  opacity, and the stale-data bar animates `transform`. Both run on the compositor.
- **Global search** (`openSearch` in `app.js`) waits 150 ms after typing before scanning all
  apartments, tasks and contacts. Before, it scanned on every keystroke.
- **Build bug:** `scripts/stamp-assets.mjs` added a new `__RIGZEA_ASSET_VERSIONS` script tag on every
  run, because `app/index.html` is both its input and its output. It now replaces the old tag.

## Next, ranked by effect on slow PCs

1. **Full re-render on every filter click.** Filters call `App.render()`, which rebuilds the shell
   and the whole view with `innerHTML`. On large lists, re-rendering only the list would remove most
   of the lag.
2. **Document-wide MutationObserver** (`app.js`, `rewriteLinks`) watches every node and `href` change
   and runs `querySelectorAll` on each added subtree. Generating page URLs directly in the views'
   link markup would let it go.
3. **`select('*')` in `fetchData`** downloads every column, including large JSON fields, for up to
   500 rows per table. Naming the columns cuts payload and parse time. Each view needs checking
   for the fields it reads, so this is a careful change rather than a quick one.
4. **Long lists without paging in the DOM.** Apartments and contacts render every row. Showing the
   first 100 with a "show more" button limits layout cost.

## Not worth doing

- `defer` on scripts: they are already at the end of `<body>`.
- Image compression for `rigzea-bot-avatar.jpg` and the 337 KB logo SVGs: the app never loads them.
  They could be deleted or shrunk to tidy the repo, but users would not notice.

## Tests

The unit tests and multi-page suite pass. The e2e suite passes 15 of 35, the same result as an
untouched copy of the branch, so those 20 failures were already there (for example 17, 18, 19, 27:
`#a-edit` and `#a-share` are never found).
