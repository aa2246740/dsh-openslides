# Editor 1:1 — living goal

**Product:** Open SlideStudio  
**Oracle:** official neo-ppt iframe (dev only). Production stays `kimiRuntime: false`.  
**SSOT:** YAML PPTD v2. No dual IR. No dead button without an oracle row.

This is the goal Cola set: recreate **all official editor capabilities**, not just generate.

## In this increment

| Official (frames / PRD) | Native |
|-------------------------|--------|
| Compact selection pill (12, 32) | Icon ctx-bar + popovers; no Chinese dump |
| Chart Edit data spreadsheet (13) | Overlay with category / S1, row numbers, +行 / +列, TSV/CSV header expands series |
| SmartArt nodes + connectors (14, AC-07) | `insert.smartart` + node add/delete/layout; `smartArt` on PPTD elements |
| SmartArt pin | Moving a node sets `pinned`; relayout on add/delete keeps its position |
| Selection Tab | `selection.tab` — Tab / Shift+Tab cycles, Esc clears |
| Copy / paste / multi-select (PRD 5.5) | Cmd/Ctrl+C X V, context menu, arrow nudge |
| Right-click menu | Cut / copy / paste / duplicate / arrange / group / ungroup / lock / delete |
| Ctx-bar (frames 12/32) | Icon pill only; B/I/U and type tools live in the font popover |
| Chart paint | Single-series bars use the per-category legend swatch; multi-series grouped bars use series color |
| SmartArt connector | Selectable, italic edge label (`element.line.label.set`); insert finds empty space |
| Page rail | Defaults open when `pageCount > 1` (frame 06) |
| Generate palette | `extractPalette` honors labeled signature colors (black-gold, cream, red-black) |
| Generate tool rows (AC-03) | DSH `POST /slides/sessions` streams session/tool events; hub paints running/completed rows live instead of fake seeds (`/api/generate` returns 410) |
| Generate runtime | Normal product generation is the pinned DSH kernel only (ADR-0009): `list_references` / `read_reference` / `commit_design` / `write_todo` / `write_page` / `render_page` / `review_page(s)` / `compose_deck`. 429/5xx pause or fail; no one-shot JSON, playbook, or host fallback can publish a result. No official iframe. |
| Split workspace generate | `?generate=<brief>` runs the tool rows in the left pane with a slide skeleton (frame 20); result card lands in-thread |
| Refine (AC-08) | Workspace composer runs Think → Edit, appends a version card with the new Vn |
| Comments (AC-09) | Pins bind to the selected element corner; resolve keeps history; rail shows "N 条评论" |
| Cover copy | From the brief, not the design-system id / product name |
| Deck structure | The Agent Director chooses a design system and creates the page structure from the brief (teach / decide / report / promo / academic). Complete page/deck templates are forbidden; design tokens and primitives are allowed. Page count is not a constant 7. |
| Inline text edit (32, PRD 5.5) | Dblclick or insert drops into plain-text edit; Esc cancels, outside commits; list/runs edit raw text; style commands apply live during edit |
| Selection stability | Click on selected element is a no-op; select updates chrome in place; ctx-bar restores open popover + focus across rebuilds |
| Chart tool (12/13, PRD 5.6) | Type switcher (bar/line/area/pie), per-series colors, axis titles; grid edits headers, deletes rows/cols, debounced live cells, invalid numbers keep last valid |
| Marquee + guides (PRD 5.5) | Empty-canvas drag rubber-band selects; move/resize paints page-center + neighbor snap lines |
| Rotate handle | White circular handle; ctx-bar flips below the element instead of covering it |
| Context menu | Closes on Esc, outside pointerdown, scroll, zoom |
| Export report (PRD 5.10) | Dialog shows progress, then filename · pages · size · raster-fallback count; retry on failure |
| Version meta (PRD 5.9) | Rows show zh relative time + 手动/Agent trigger; refine notes `refine:<instruction>`; preview shows 只读 badge |
| Comment pins (PRD 5.8) | Element-bound pins follow moves; orphaned pins dim in place |
| Present chrome (PRD 5.5) | Playing hides insert pill, ctx-bar, comments, chart overlay |
| Hub generate | Exact selected provider must be logged in through BYOK or OAuth (DSH Provider Connection). The kernel streams the run; provider/quota/tool failure pauses or fails without publishing a result. No playbook or host fallback is allowed in the normal product path. |
| Rich text runs (PRD 8.2) | Kimi-style `<p><span style>` fragments are the disk truth; parse/serialize round-trip; `setTextRangeStyle` styles plain-text offset ranges; sanitizer strips scripts |
| Range style UI | Insert/dblclick always enters rich edit; B/I/U/字号/颜色 apply to the selected character range (not the whole box); live spans refresh; commit writes HTML so a later `setText` cannot wipe runs; ⌘/Ctrl+B I U work while editing; toolbar on-state follows the range |
| Table spreadsheet (PRD 5.6) | Cell click selects without dragging the table; dblclick/Enter/F2 edit; Tab/Shift+Tab/arrows move; Shift+click range + merge; fill color picker; +行/+列 insert after the current cell; header row is visually distinct |
| Align / distribute | 3+ selection shows 水平分布 / 垂直分布 in the align popover |
| Reference attachments (PRD 5.2/10) | Real upload with per-file progress; txt/md/csv/tsv/json parsed, images/office honestly degraded; parsed text feeds the LLM prompt as quote-only 参考资料 and the offline deck cites source names verbatim |
| Kind/layout honesty | Report → management-report structure; Docs and 4:3 disabled with 即将支持 instead of silent no-ops |
| Reload continuity | Server remembers last page per project; reload lands where the user was |
| Command hardening | 75-case fuzz: non-finite numbers rejected, invalid JSON → 400, no NaN reaches the model |
| Shape live preview | Fill / gradient / border `input` paints the SVG path; adj sliders and yellow diamonds remorph `pathD` via `/api/shape-geometry` before persist |
| Image crop mode | 「裁切」enters mode without forcing an 8% inset; selected-but-not-cropping shows the cropped result; Esc / 完成 / outside click exits; handle drag updates dim + frame live |
| Generate layout | Cover kicker defaults to `内部讨论 · 草稿`; cover title scales 24–34px; TOC rail is tall enough for the path blurb; 3 claims → cards; 4 → 2×2; timeline labels alternate and do not overlap |
| Deploy landing | `GET /` is Create Hub; editor stays at `/index.html?project=`; `npm start` builds native packages and serves `:55200` |
| Chinese chrome | Hub + editor titlebar / insert pill / dialogs / attach modal are Chinese; supplier/model names and API-key labels retain their official spelling |
| Frozen tooltip baseline | Current official live probes are `全屏 / 预览模式 / 收起 / 缩小 / 放大`; native controls use one product-owned dark rounded tooltip layer with a directional triangle, hover delay, and focus accessibility. |
| Messages control | `#btn-messages` opens an honest local panel (no cloud inbox), with jumps to 评论 / 工作对话 |
| Table grab-to-move | Cell click still selects; pointerdown on a `td` + drag past 8px moves the whole table (cells previously swallowed move) |
| Chrome hover | Hub chips / editor pills / insert / export rows / table cells change paint on hover |
| Case catalog | `docs/ACCEPTANCE-CASES.md` — predicted operations per surface. Official iframe is the oracle: compare host `setPPTD`, no Kimi login. `?view=official` + `npm run oracle:inventory`. ego lite is macOS-only and is not required. |

## Still not 1:1 (do not claim Phase G)

1. **Official generate / account / Google Slides** — out of product scope (`wont-port` or separate hub).
2. **Pixel chrome** — ctx-bar icons are a recreation of frames 12/32, not a traced official SVG set.
3. **Official iframe dual-channel shots** for leftover / new SmartArt rows — self-test only so far. For frames without an iframe replay, the editor can load any source-truth frame as a slide via `/api/load-image` and be compared pixel-for-pixel against it.
4. ~~SmartArt pin~~ — moving a node pins it; relayout on add/delete keeps pinned positions.
5. ~~Chart paste multi-series~~ — TSV/CSV header row expands series; `+ 列` adds a series.
6. **Image rebuild (AC-11)** — no separate OCR/VLM service. The brain is the only vision capability: `LlmPort.completeJsonWithImages` sends the image to the configured intranet/local multimodal LLM; a text-only backend (or `SLIDESTUDIO_LLM_IMAGE=0`) throws and the editor falls back to the prompt-label path. `/api/health` reports `llmConfigured` + `lastRebuildMode`. Image **insert** reads real PNG/JPEG/GIF/WebP dimensions and fits to the source aspect (`contain`).
7. **`chrome.neodeck.connect`** — official iframe only (`specified`).

## Law

- Disk write path is PPTD YAML only.
- New clickable controls need a catalog row at `specified|implemented|verified`.
- Mark AC-01… gaps here until verified with official dual-channel evidence.
