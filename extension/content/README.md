# Extension content scripts

## Overview

Content scripts of the Rigzea Chrome extension. `bridge.js` runs on the Rigzea app and relays the
listing to the service worker; `fill.js` plus one site filler (`ss.js`, `myhome.js`) run on the
portal posting forms and fill them from the stored job. Parent contract: [../README.md](../README.md).

## Interface

- `bridge.js` (on `https://rigzea.com/*`, `http://localhost:3000/*`): listens for a same-window
  `postMessage` `{ type: 'rigzea:post', targets, listing }`, forwards it with
  `chrome.runtime.sendMessage`, and posts `{ type: 'rigzea:ack' }` back to the page when the service
  worker replies `ok`. Sender side: `sendToPortals()` in `rigzea/app/views-portfolio.js`.
- `fill.js` defines `window.RigzeaFill`, shared by the site fillers:
  - `run(target, fillFn)`: reads `job:<target>` from `chrome.storage.session`, calls `fillFn(listing)`,
    removes the job and shows the result banner. `fillFn` returns `{ submitted?, note? }`.
  - Field helpers: `setValue`, `field(re)`, `byName(name, value)`, `byLabel(text, value)`,
    `clickText(re)`, `clickExact(text)`, `clickInGroup(heading, option)`, `pickSelect(inputId, text)`,
    `fillText(re, value)`.
  - Utilities: `sleep`, `norm`, `waitFor(fn, timeout)`, `attachPhotos(urls)`, `needsHuman()`, `banner(text, kind)`.
- `ss.js` (on `https://*.ss.ge/*`): `RigzeaFill.run('ss', ...)`. Tile wizard (property, deal type) found by
  exact Georgian text, then inputs by `name` (`totalArea`, `floor`, `floors`, `house-number`,
  `cadastral-code-1`) and street via `react-select-3-input`.
- `myhome.js` (on `https://statements.myhome.ge/*`): `RigzeaFill.run('myhome', ...)`. One page; controls
  found by `<label for>` text because ids are random.
- Listing fields read by the fillers: `property_type`, `transaction_type`, `address`, `cadastral_code`,
  `currency`, `price`, `area_sqm`, `floor`, `total_floors`, `rooms`, `bedrooms` (MyHome only),
  `bathrooms`, `description`, `photos` (URL list).

## Invariants

- `fill.js` must load before the site filler (order in `../manifest.json`); fillers read `window.RigzeaFill`.
- A job is ignored if older than 10 minutes, and is removed after one fill attempt (success or not).
- Fillers never press publish: they always return a `note` asking the agent to pick building status and
  condition (not stored in Rigzea) and publish by hand. `submitted: true` is supported by `run` but unused.
- Automation stops when `needsHuman()` finds a captcha (`recaptcha`, `hcaptcha`, `[data-sitekey]`) or a
  password field. Captchas are never solved.
- Values are set through the native `value` setter plus `input`, `change`, `blur` events so React forms
  register them. Empty, `null` or `undefined` values are skipped.
- Selectors (Georgian tile texts, `name` attributes, label texts, `react-select-3-input`) were mapped on the
  live forms on 2026-10-16; site changes break them silently, reported as "could not fill" fields.
- Address is split into street and house number by a trailing-number regex (`splitAddress`, duplicated in
  both fillers).
- Banner and note copy is Georgian with no em dash.

## Side Effects

- `bridge.js`: `chrome.runtime.sendMessage` to the service worker; `window.postMessage` ack to the page origin.
- `fill.js`: reads and removes `chrome.storage.session` keys `job:ss` / `job:myhome`; injects a fixed
  `#rigzea-banner` element; `attachPhotos` fetches up to 30 photo URLs and sets them on the page's file input.
- `ss.js`, `myhome.js`: mutate the third-party posting form (clicks, field values, photo upload). No submit.

## Verification

- Run: `npm test` (e2e covers only the Rigzea side: the install dialog and ZIP link in `tests/e2e.js`).
- The fillers have no automated tests; check them by hand in Chrome with the unpacked extension while
  logged in to ss.ge and myhome.ge.
