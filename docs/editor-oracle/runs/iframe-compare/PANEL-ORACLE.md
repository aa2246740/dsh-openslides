# Official iframe panel oracle — why this is not a schema job

**Date:** 2026-08-14  
**Host:** `http://127.0.0.1:55180/?project=yu7` (official iframe connected)  
**Production:** still `kimiRuntime: false`. This host is oracle only.

## What schema already gives us

PPTD YAML + `presetShapeDefinitions.xml` + Font Awesome names are enough for:

- 177 shape **paths** and adjustment formulas
- image `crop` / `cropShape` fields
- icon `fas:name`
- page `animations[]` (effect / trigger / direction)

They do **not** give pixel layout of the official chrome that edits those fields.

## What still has to be clicked in the official iframe

| Panel | Why schema is not enough | Current native |
|-------|--------------------------|----------------|
| Animation timeline | Track height, playhead, stagger chips, “on click / with previous” chrome | Right-side list + add/remove |
| Image crop handles | Corner vs edge vs mask outline, live dimming of discarded pixels | Context sliders + CSS mask |
| Icon popover | Grid columns, category tabs, search placement, FA style switch | Searchable grid |

## Why earlier passes stalled (corrected 2026-08-16)

Parent-page WebBridge cannot see into the cross-origin child. That is **not** a login wall. Compare host already injects a local editable deck via Penpal `setPPTD` — no Kimi account.

## How to walk the official iframe (no login)

1. `npm run oracle:compare` → `http://127.0.0.1:55180/?project=yu7&view=official`
2. Wait for status `官方已连接`
3. Click pixels in the official pane, or run `npm run oracle:inventory` (Playwright Frame API dumps buttons + shots)
4. Dual-channel when needed: official action → `window.oracleCompare.getPPTD()` / native YAML

Until animation / crop / icon panels have official `before.png` + `after.png`, do not claim 1:1 chrome.
