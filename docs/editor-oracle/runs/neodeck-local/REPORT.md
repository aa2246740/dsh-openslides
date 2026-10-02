# NeoDeck Local / open-kimi-ppt RE capture

**Date:** 2026-08-08  
**Host:** 上游桌面版记录（`open-kimi-ppt-skill serve --port 55173`）。**本产品不适用**：不启动本地服务、不使用外部编辑器。  
**URL:** http://127.0.0.1:55173/  
**Session:** WebBridge `kimi-try-now`

## Verdict

| Question | Answer |
|----------|--------|
| Is open-kimi-ppt a full offline editor? | **No.** It is a **local file host** that embeds **public** `https://www.kimi.com/neo-ppt/` via iframe. |
| Production usable offline? | **No** — requires Kimi + Moonshot CDN. |
| Useful for our RE? | **Yes** — Penpal RPC surface + PPTD load/save protocol + functional chrome flags. |
| Our production path | `apps/native-web` + `packages/*` native stack — **zero Kimi runtime**. |

## Network footprint (reload host)

| Host | Role |
|------|------|
| `127.0.0.1:55173` | NeoDeck shell (HTML/JS/CSS) |
| `www.kimi.com` | `/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local&…` editor iframe |
| `statics.moonshot.cn` | penpal, vue, common-utils, rolldown-runtime assets |

Observed asset hashes (ephemeral; will break on frontend rotate):

- `penpal-C4NjirZE.js`
- `vue-0jkFZGjG.js`
- `common-utils-G6HD4Ji1.js`
- `rolldown-runtime-DWdDZTNf.js`

## Iframe query contract

```
sdkMode=ppt-editor
pptPlatform=neodeck-local
functional={ fullscreen, present, export:true, close:false, annotation:false, feedback:false, share:false, versionHistory:false }
sdkSaveMode=external
sdkImageMode=external
```

## Penpal RPC (parent → child methods used)

Child remote API (from host `setDeck` / connect):

| Method | Use |
|--------|-----|
| `setPPTD(id, { pptdContent, pages, basePath, pptdPath, isCreate })` | Load deck |
| `setEditable(bool)` | Edit lock |
| `getSlideStatus()` | Status after load |
| `setSlideConfig({ editable, locale, theme })` | Locale/theme |

Parent methods exposed to iframe:

| Method | Behavior in NeoDeck |
|--------|---------------------|
| `onSave(payload)` | Write PPTD file changes to directory handle / memory |
| `getImages(...)` | Resolve local media for external image mode |
| `close` / `reenter` / `toggleFullScreen` | Host chrome |
| `showMessage` / `hideMessage` | Toasts |
| `sendPrompt` | Stub toast (AI not wired) |
| annotation* | No-ops |

## Demo deck (built-in)

- 2 pages JSON-in-memory PPTD (not YAML on disk until open folder)
- Rich text in `content.text` as HTML `<p><span style=…>`
- Animations array on page 1 (`fade-in` on title)

## Screenshots

- `../webbridge-offpeak/12-open-kimi-ppt-local.png` — connected demo canvas
- `../webbridge-offpeak/13-open-kimi-ppt-editor.png` — same after settle
- Export button lives **inside cross-origin iframe** — host DOM has no 导出; cannot click via top-frame WebBridge without CDP into iframe.

## Implications for native 1:1

1. **Do not ship NeoDeck as product runtime** (OOP-20 / AGENTS.md).
2. Treat PPTD YAML + open-kimi `reference/pptd.md` as SSOT format.
3. Replicate UX from iframe chrome oracle rows; implement with native canvas.
4. Export = our hybrid OOXML (`exporter-native`), not Kimi writer.

## Next oracle actions (when membership/queue allows)

1. Load `fixtures/okp-yu7-ppt` via NeoDeck folder picker (manual).
2. CDP into iframe for S0–S12 control inventory.
3. Dual-channel: edit → host `onSave` file diff + screenshots.
