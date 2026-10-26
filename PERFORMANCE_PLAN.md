# Rigzea app performance plan

Checked against the code on 2026-10-17, and again on 2026-10-26 after commit `9cbedcf` (EGM Goldfish
review). Facts that an earlier draft got wrong: the logo SVGs and bot avatar are never loaded by the app,
the scripts already sit at the end of `<body>`, and most photos already use `loading="lazy"` (not
`views-portfolio.js:177` or `views-chat.js:184, 306`).

## Done

- **Fonts (largest win).** The app downloaded the full FiraGO files, about 1 MB for four weights.
  `app/app.css` now uses the ~38 KB subsets (Latin, Georgian, punctuation, ₾, €) through
  `unicode-range`. The full files still load, per weight, only when a page shows a character
  outside the subset, such as Cyrillic, ↔ or a zero-width character. Pages in Georgian download
  roughly 150 KB instead of 1 MB.
- **Supabase preconnect** in `app/index.html`, so the TLS handshake starts before `supabase.js` runs.
- **Animations that repaint every frame:** the loading skeleton (`background-position`) now animates
  opacity, and the stale-data bar animates `transform`. Both run on the compositor.
- **Global search** (`openSearch` in `app.js`) waits 150 ms after typing before scanning the records.
  Before, it scanned on every keystroke. Its first open still fetches every table again.
- **Build bug:** `scripts/stamp-assets.mjs` added a new `__RIGZEA_ASSET_VERSIONS` script tag on every
  run, because `app/index.html` is both its input and its output. It now replaces the old tag.
- **Saved data and faster boot (`9cbedcf`):** the last loaded data of each workspace is kept in
  IndexedDB (`dataCache` in `app.js`) and shown read-only at once on the next visit while fresh data
  loads; session, workspace and data requests start in parallel; hashed `/app` and `/js` assets are
  served `immutable` (`vercel.json`).
- **Area switching:** nav clicks swap areas in place without a page load. Each load fetches only the
  optional tables the current area needs (`areaNeeds` in `app.js`), so an area whose data is not in
  memory loads its page instead (fixed 2026-10-26; before, Apartments then Finance showed no income).

## Next, ranked by effect on slow PCs

No item below has been measured; profile on a slow PC before and after each change.

1. **Blur on slow PCs.** `app.css` uses `backdrop-filter` in six places (lines 1515, 1526, 1529, 1555,
   1936, 2101). It is switched off only in lite mode, which turns on automatically only for 2 cores or
   2 GB of memory or less (`core.js`). Turning it off for more devices is a cheap first step.
2. **Re-rendering the apartments list.** Apartment and approval filters call `App.render()`, which
   rebuilds the whole view with `innerHTML` (contacts already redraw only `#o-body`). Each apartment
   row also scans all tasks, approvals and reservations. Build those lookups once per render, then
   redraw only the list, keeping the chips, select-all and selection bar in step.
3. **Long lists without paging in the DOM.** Apartments and contacts render every loaded row. Showing
   the first 100 with a "show more" button limits layout cost. Server paging ("load more") and the
   search's show-more already exist; reuse that pattern, and keep select-all acting on the whole list.
4. **`select('*')` in `fetchData`** downloads every column for up to 500 or 300 rows per table (`PAGED`).
   Risky: the edit forms write back the full row they were filled from, so a column left out of the
   select would be saved as empty. Only list fetches could be narrowed, with a `dataCache` version bump,
   and the e2e mock ignores column lists, so tests cannot catch a mistake.
5. **Document-wide MutationObserver** (`rewriteLinks` in `app.js`) rewrites `#/` links in every added
   subtree. Its cost is small next to the `innerHTML` parse that triggers it; leave it unless a profile
   says otherwise. Removing it means generating about 120 links through `toUrl`, which the demo needs.

## Not worth doing

- `defer` on scripts: they are already at the end of `<body>`.
- Image compression for `rigzea-bot-avatar.jpg` and the 337 KB logo SVGs: the app never loads them.
  They could be deleted or shrunk to tidy the repo, but users would not notice.

## Tests

`npm test` on 2026-10-26 (branch `egm-audit`): every unit suite and the landing audit pass; the e2e
suite (`node tests/e2e.js`, 89 tests) fails D1, 14.4, 15, 1h, 19 and 1zh, the same six that failed
before the audit fixes.
