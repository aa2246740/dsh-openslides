# Kimi Slides editor baseline v1 — 2026-08-20

This directory freezes the official editor surface that Open SlideStudio v1 targets. Later changes on the live Kimi site create a new baseline; they do not silently change this one.

## Capture identity

| Field | Frozen value |
|---|---|
| Captured at | `2026-08-20T10:50:54.495Z` |
| Public entry observed | `https://www.kimi.com/slides` — `Kimi PPT助手 一键生成PPT 免费使用` |
| Dev-only oracle host | `http://127.0.0.1:55180/?project=yu7&view=official` |
| Official child | `https://www.kimi.com/neo-ppt/...` in `sdkMode=ppt-editor` |
| Local source sent through Penpal | `fixtures/okp-yu7-ppt` (`yu7`) |
| Account state | No Kimi account; `loginRequired: false` |
| Host viewport | `1600 × 1000` |
| Capture runtime | Playwright `1.61.1`; Chromium Headless Shell revision `1228` |
| Connection state | `官方已连接 · 小米 YU7 · 豪华高性能纯电 SUV` |

The production app never imports this oracle host, iframe, or Kimi CDN. The iframe is evidence-gathering infrastructure only.

## What is frozen

- `editor-live/01-idle.png`: initial official editor chrome and eight-page rail.
- `editor-live/02-dismiss-annot.png`: first-use annotation prompt dismissed.
- `editor-live/05-add-page.png`: new-page interaction.
- `editor-live/06-annot.png` and `07-edit.png`: annotation/edit mode states.
- `editor-live/08-canvas-click.png`: selection/context toolbar state after a canvas click.
- `editor-live/controls.json`: 125 deduplicated visible clickable nodes with geometry.
- `editor-live/body-text.txt`: visible text inventory.
- `editor-live/hover-tooltips.json` and `hover-01.png` … `hover-05.png`: live hover evidence.
- `editor-live/REPORT.json`: complete machine record, including disabled official controls and post-click inventory.
- `manifest.json`: capture contract and SHA-256 integrity list.

## Live tooltip findings

| Official control | Revealed tooltip |
|---|---|
| top-right fullscreen icon | `全屏` |
| left grid icon | `预览模式` |
| rail-collapse icon | `收起` |
| zoom minus | `缩小` |
| zoom plus | `放大` |

The tooltip paint is a dark rounded rectangle with a directional triangle. Open SlideStudio must reproduce the behavior with product-owned DOM/CSS; a browser-native `title` bubble is not parity.

## Honest exclusions in this capture

- `导出` and `分享` were visible but disabled by the official SDK mode, so their cloud dialogs are not accepted by this evidence.
- This capture does not exercise Kimi account, payment, cloud inbox/collaboration, or Google Slides.
- It freezes editor interaction evidence, not generation quality. Authentic generation has its own Pi provenance gate.
- The public landing-page title/URL was observed separately; the captured pixels are from the official `neo-ppt` child loaded with local YAML.

Reproduce into a **new** output directory with `ORACLE_OUT=... npm run oracle:inventory`. Never overwrite this baseline in place.
