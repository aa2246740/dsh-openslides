# PRD / Deliverable parity — honest status

**Question:** Did we 1:1 restore `/Kimi_Slides_Complete_Deliverable`?

**Answer: No.** We rebuilt an **open-source product spine** (PPTD + real LLM → editable PPTX + workspace chrome) inspired by the deliverable’s PRD and 34 keyframes. We did **not** pixel-match the prototype, nor ship every MVP acceptance criterion.

Last audit: 2026-08-04.

## Scope we intentionally diverged from

| Topic | Deliverable | Open SlideStudio |
|-------|-------------|------------------|
| Brand | KIMI chrome / wordmark | Soft rebrand (Open SlideStudio) |
| Generation quality | Demo-polished decks in video | Design-brain pipeline (improving; not claim consulting-grade) |
| Prototype | Click-through high-fidelity mock | Production monorepo + real export |

## MVP checklist (PRD §18) vs product

| MVP item | Status | Notes |
|----------|--------|--------|
| Create Hub + categories + prompt | **Partial** | Templates exist; covers/styling thinner than frames 15–16 |
| Reference attach (PDF/PPTX/…) | **Partial** | Modal + parse states; not full OCR / brand extraction |
| Agent tool timeline + result card | **Partial** | Steps + summary; less polish than frames 03–05 |
| Split Kimi Work workspace | **Partial** | Chat + editor; no drag split; chat width tuned |
| Thumbnails / page switch | **Yes** | Order sync; drag reorder limited |
| Element select / basic edit | **Partial** | Text nudge + inline text; no multi-select/group/resize handles |
| **Chart data table** | **Was missing → shipping** | AC-06 critical gap |
| **SmartArt node edit** | **Partial → shipping** | Model+render existed; node text edit weak |
| NL refinement + versions | **Yes** | Vn / restore / readonly history |
| Comments pin | **Yes — agent work orders (scoped)** | Process-all: nearest text/chart/SmartArt edits; version only if ≥1 ok; fail keeps pin+reason; Real+Mock both honor pin-batch |
| Play | **Yes** | Keyboard nav |
| Share entry | **Yes (honest local)** | Link copy; session-level; no real ACL (PRD also [I]) |
| Export PPTX | **Yes** | Native-ish; report coverage + Gate1 script |
| Export PDF / PNG | **Yes** | Canvas/print-level, not design-perfect |
| **Image rebuild pipeline** | **Yes (structured)** | Detect intent → portrait PPTD (cards/connectors/QA); not full OCR vision model |
| Context toolbar on selection | **Yes** | Chart/SmartArt node edit |
| Template wall + auto default | **Yes** | Categories + Freestyle auto default |

## 34 keyframe coverage (FRAME_BY_FRAME)

| # | Theme | Ours |
|---|--------|------|
| 01–02 | Create empty/filled | Partial UI |
| 03–05 | Agent tools | Partial |
| 06–11 | Editor / data / timeline / SmartArt | Structure yes; visual polish no |
| 12–14 | Chart toolbar + data editor + SmartArt edit | **Was gap; implementing** |
| 15–16 | Template tabs | Partial |
| 17–19 | Upload/parse | Partial |
| 20–23 | Split + refine | Partial–Yes |
| 24–27 | Comment + version | Yes |
| 28–32 | Image rebuild | **Partial** (structured rebuild path; demo SMART_CONNECTIONS.png) |
| 33–34 | Export + PPTX editable | PPTX Yes; fidelity varies |

## What “1:1” would still require

1. Image → editable slide (OCR + structure rebuild + portrait canvas)
2. Full selection chrome (resize, multi-select, layers, image insert polish)
3. SmartArt auto-layout + connectors as first-class edit
4. Template visual fidelity + brand extract from PPTX/PDF
5. Split-pane drag, Messages, real Share ACL
6. Agent vision QA / repair loop
7. Frame-by-frame visual QA against `analysis/source-truth/`

## Working rule

Until this matrix is mostly **Yes**, do not claim “complete Kimi clone” or “1:1 restore.” Ship product gaps in AC order (chart data, SmartArt, export variants, image rebuild).
