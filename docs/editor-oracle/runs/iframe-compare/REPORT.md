# Official iframe vs native compare

**Date:** 2026-08-14  
**Host:** `npm run oracle:compare` → http://127.0.0.1:55180/?project=yu7  
**Not production.** Production remains zero Kimi iframe/CDN.

## Verdict

| Question | Answer |
|----------|--------|
| Can our PPTD load in the official neo-ppt iframe? | **Yes.** Parent Penpal `setPPTD` + `getImages` is enough. |
| Can we A/B official render vs native? | **Yes.** Dual-pane host; capture with a real desktop screenshot (WebBridge blanks cross-origin iframes). |
| Same YAML, both renderers? | YU7 fixture: visually close on cover. Pi generate: official accepts the YAML and paints the green-rail cover. |
| Pixel 1:1? | **Not claimed.** Cover is close; chrome, type wrap, and zoom still differ. |

## How it is wired

Official child is public `https://www.kimi.com/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local`.  
Parent (`scripts/oracle-compare/`) does the same handshake as vendor NeoDeck Local:

1. Penpal connect  
2. `setSlideConfig({ editable, locale, theme })`  
3. `setPPTD(id, { pptdContent, pages, basePath, pptdPath, isCreate })`  
4. Parent `getImages` returns local media as data URLs  

Native pane uses `@open-slidestudio/canvas-session` `renderModel` of the same directory.

## Ran this session

| Project | Official | Native | Shot |
|---------|----------|--------|------|
| `fixtures/okp-yu7-ppt` | 8 pages, cover photo + 小米 YU7, export/play chrome | same cover | `04-yu7-desktop.png` |
| YU7 page rail + native p3 | official thumbs 01–08; native `优雅动感 / 1:3 头身比` | `06-yu7-official-pages.png` |
| `output/pi-rpc-demo` | 6 pages, title 华北区域 Q3…, green rail cover | same cover | `08-pi-rpc-desktop.png` |

`getSlideStatus()` after YU7 load: `{ currentPage: "pages/1_cover", selectedPages: ["pages/1_cover"] }`.

## Capture caveat

WebBridge `screenshot` of the parent tab paints the official iframe as empty (black/white). The live window is not empty — ScreenCaptureKit / accessibility tree show the official slide, 导出, and page rail. Use desktop capture for visual A/B.

## 2026-08-15 — generated direction decks

Same method, new YAML: four playbook decks (`ab-consulting` / `ab-academic` / `ab-promo` / `ab-work`) all loaded in official neo-ppt. See `GENERATE-AB.md` and `ab-generate/*-full.png`.

## 2026-08-16 — no login; official-only view

Kimi account is **not** required. Parent Penpal `setPPTD` is enough.

- Official fullscreen: `http://127.0.0.1:55180/?project=yu7&view=official`
- Inventory: `npm run oracle:inventory` → `docs/editor-oracle/runs/iframe-compare/official-walk/`
- Functional flags now include `annotation`, `share`, `versionHistory` so more official chrome is visible.
- 2026-08-16 walk (no login): 111 clickable nodes; clicked 去试试 / 新建页面 / 批注 / 编辑 / canvas text. Official 批注 mode hides insert tools and shows `在页面上留下批注`. 导出/分享 exist but stay disabled in this sdk host.

## Production rule

Do not ship this host. Use it only as a dev oracle to see what official neo-ppt does with our YAML.

## S1 follow-up (same day)

Official chrome was catalogued into `docs/editor-oracle/catalog/` (S1 + insert bar). Native editor at `http://127.0.0.1:55200/` now mirrors that chrome (title / 导出 / play / fullscreen / rail / undo-redo / zoom / 新建页面 / insert pill disabled / 演讲者备注). Shots: `09-native-s1-chrome.png`, `10-native-s1-page3.png`. S2–S12 still open. 1:1 not claimed.
