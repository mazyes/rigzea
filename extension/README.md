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
