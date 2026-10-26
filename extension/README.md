# Rigzea extension (SS.ge / MyHome.ge)

Receives a listing from the "გამოქვეყნება SS.ge / MyHome.ge-ზე" button in the Rigzea app, opens the posting form and fills it. The agent presses publish.

## Install (unpacked)
1. Chrome: `chrome://extensions`, turn on Developer mode, "Load unpacked", pick this `extension/` folder.
2. Log in to ss.ge and myhome.ge in the same Chrome.
3. In Rigzea open an apartment and press the button.

## Status
Forms mapped live on 2026-10-16:
- ss.ge `home.ss.ge/ka/udzravi-qoneba/create`: tile wizard (type, deal) then fields by `name` (`totalArea`, `floor`, `floors`, `house-number`, `cadastral-code-1`).
- myhome.ge `statements.myhome.ge/ka/statement/create`: one page, controls found by `<label for>` text.

The extension fills the form and stops. Both sites require building status and condition, which Rigzea does not store, so the agent picks them and presses publish. Auto-submit comes back once those fields exist on the apartment.
Street and city pickers, bedrooms, and the dry-run on a full real listing are not verified. It never solves captchas.

## Overview

Manifest V3 Chrome extension, shipped outside the Vercel site. Flow: the app page posts
`rigzea:post` (see `sendToPortals()` in `rigzea/app/views-portfolio.js`), `content/bridge.js` relays
it to `background.js`, which stores one job per target and opens the posting form; the site filler in
`content/` then fills that form.

## Interface

- `manifest.json`: permissions `storage`; host permissions `https://*.ss.ge/*`, `https://*.myhome.ge/*`;
  service worker `background.js`; content scripts (see [content/README.md](./content/README.md)).
- `background.js`: `chrome.runtime.onMessage` handler for `{ type: 'rigzea:post', targets, listing }`.
  `targets` is filtered to the keys of `FORMS` (`ss`, `myhome`); replies `{ ok: true }` when at least one
  target is valid.
- `FORMS`: posting form URLs per target (`https://home.ss.ge/ka/udzravi-qoneba/create`,
  `https://statements.myhome.ge/ka/statement/create?referrer=myhome`).
- [content/README.md](./content/README.md): `bridge.js`, the shared `window.RigzeaFill` helpers and the
  `ss.js` / `myhome.js` fillers.

## Invariants

- The message contract is shared with the app: `rigzea:post` (page to extension) and `rigzea:ack`
  (extension to page). The page waits 1.2 s for the ack, then shows the install guide.
- Job keys are `job:<target>` in `chrome.storage.session` with `{ listing, at }`; the fillers expect this shape.
- The bridge only runs on `https://rigzea.com/*` and `http://localhost:3000/*`; other Rigzea origins
  (preview deploys, `vercel dev` on another port) get no ack.
- The download offered in the app, `rigzea/downloads/rigzea-extension.zip`, is a committed copy of this
  folder. No script rebuilds it: re-zip it by hand after changing anything here.
- UI strings (manifest name and description, banners) are Georgian with no em dash.

## Side Effects

- Writes `chrome.storage.session` (cleared when the browser closes).
- Opens one new tab per valid target with `chrome.tabs.create`.
- Content scripts mutate third-party pages on ss.ge and myhome.ge and fetch listing photo URLs.

## Verification

- Run: `npm test` (covers the app side only; the extension has no automated tests).
- Manual: load unpacked, log in to both portals, press the button on an apartment, check the banner.
