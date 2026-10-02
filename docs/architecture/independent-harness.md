# Independent harness vs OpenKimi

Pinned goal: Open SlideStudio is a standalone generate product. The **agent** is the director. The host is hands + editor + export. Official Kimi iframe / `export_images.py` / `export_pptx.py` / kimi.com login stay out of production.

This file is evidence, not aspiration.

## Answer

Until this change, **yes — the host was the director.**

| Surface | Evidence | What it did |
|---------|----------|-------------|
| Hub 内网模型 | `apps/native-web/src/server.mjs` (was `createHostBrain`) | Host for-loop painted PPTD. Model only filled copy. |
| Host painters | `packages/agent-harness/src/exhibit-paint.ts` `paintExhibit` | KPI cards / tables / charts stamped by TypeScript. |
| Pi after death | `packages/agent-harness/src/pi-brain.ts` `finishScriptedPages` (was called after `agent_end`) | Host painted every `【第N页】` the agent did not write. Trace: `host-finish:N`. |
| Docs | `docs/architecture/agent-runtime.md` (was “Host produce is the product path”) | Law said the model must not be director. |

**Reversed in the product path:** Hub generate is DSH `POST /slides/sessions` plus `PresentationRun`. `POST /api/generate` and `/api/pi/*` return 410. `createPiBrain` is not the product path. Direct LLM and offline playbook code are developer fixtures.

## How OpenKimi actually produces (Codex / Claude Code)

OpenKimi is a **skill for a coding agent**, not a product runtime.

Evidence: `vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt/SKILL.md`

| Step | What the coding agent does | What it assumes the host already is |
|------|----------------------------|-------------------------------------|
| 0 | `node` / `python3` / Chromium | A laptop with bash |
| 1–2 | Read uploads + `reference/pptd.md` + scenario + design_system | Files on disk |
| 3 | **The model writes YAML `.page` files** (often many in parallel) | Generic `write` / bash |
| 4 | Visual QA: `scripts/export_images.py`; the coding agent inspects exported page images and edits `.page` files | **Kimi public editor iframe** (`www.kimi.com` + `statics.moonshot.cn`) as renderer |
| 5 | PPTX: `scripts/export_pptx.py` | Same official iframe as browser-side OOXML writer |
| serve | ~~`npx open-kimi-ppt-skill serve`~~ | 上游桌面工作流的本地编辑器壳；**本产品不适用**：编辑器与导出内置于 Open SlideStudio，不经 CLI/localhost |

That is why “drop the skill into Codex and you get Kimi-looking slides”: **Codex is the director**. The skill is markdown + scripts. OpenKimi does not call a Kimi LLM or ask the iframe to redesign the deck. The external coding agent writes PPTD, reads page images, and repairs it; the official iframe supplies rendering and browser-side export behavior.

We will not ship that iframe. The substitute is already in this repo: native `#slide` raster + `@open-slidestudio/exporter-native`. Those are product work, not a physics blocker.

## Current architecture (after reversal)

```
Hub MiniMax China BYOK
        ↓
DSH session + PresentationRun
        ↓
agent tools: think → list_references → read_reference (all required exact chunks)
           → plan commit (commit_design / write_todo → ordered {pageId,title,layoutFamily}[])
           → write_page → render_page (#slide PNG) → review_page (per revision, vision models)
           → rewrite/render/review until visual + layout pass
           → review_pages (structural)
           → compose_deck
        ↓
YAML PPTD v2 on disk  →  native editor  →  exporter-native PPTX
```

| Surface | Brain | Director |
|------|-----------|----------|
| Normal product | DSH `slides` profile + MiniMax-M3 | **The selected model**, via exact source reads, page write/render/visual-review loops, structural review, and compose. |
| HandsPort (retired) | was `runPiHand` | Freeze fixture only. Production execute is `PresentationRun`. |
| Dev/test only | `createPlaybookBrain` / `createAgentBrain` / `createPiBrain` | Explicit fixtures; `/api/generate` returns 410. |

## Current gaps and evidence boundary

The architecture reversal is implemented. The remaining uncertainty is no longer whether an
independent product can exist; it is whether a real selected model completes the whole contract
and whether the resulting deck reaches the intended visual bar.

| Area | Implemented | Evidence still required |
|---|---|---|
| Supplier login | Hub BYOK/OAuth, exact-provider selection, credential redaction | One explicitly authorized external-provider run through the normal Hub, including the exact vendor chunks, current PPTD, and review PNGs that the same model context must receive |
| Agent clock | Immutable receipts bind exact source chunks, todo, page revision, raster hash, image delivery, model review, layout, structural review, and compose | Real-model trace, including a longer brief, without host-finish or fallback events |
| Design | Agent receives the exact selected design text and preview and commits an explicit ordered page plan, then composes PPTD elements; complete page templates remain forbidden | Human inspection of a newly generated deck against the selected reference and plan |
| Visual QA | Native page rasters are emitted to the model as actual image content (vision models). Page reviews bind current hashes and tokens | Confirm the selected model repairs every page-level issue it marks `revise` during the authorized run |
| Export | `exporter-native` emits hybrid editable PPTX | Continue fidelity checks in PowerPoint/WPS; never replace the deck with full-page images |
| UI parity | Frozen official baseline, 125 controls, five captured tooltips, local interaction QA | Continue frame/state coverage and exact icon/spacing work; Phase G is not claimed |

The compose gate rejects `compose_deck` until required source-chunk receipts are current in the
active `contextEpochId`, every planned page exists as a persisted `write_page` revision and passes
raster/image/visual/layout checks, and `review_pages` structural QA passes on the current revision
snapshot (ADR-0008 revised; the Pi-era full-deck overview and nine-axis taste review were removed —
the DSH tool surface has no `render_deck`/`review_deck`). Host painters remain development fixtures
and cannot pass generate success.

## First-principles boundary

| Claim | OpenKimi + coding agent proves | Open SlideStudio counterpart |
|---|---|---|
| “A long deck needs a host director” | The coding agent writes many `.page` files from one plan | The Agent Director receives typed page tools and cannot compose before the todo is exhausted |
| “Kimi-level design needs the official iframe” | The model creates PPTD elements; the iframe is its QA/export shell | The agent creates PPTD; native editor raster and native exporter replace that shell |
| “Visual QA needs kimi.com” | OpenKimi gives the model rendered pages | `render_page` captures the local `#slide`; production never calls Kimi |
| “Editable PPTX needs the official writer” | The official writer maps PPTD to OOXML | `exporter-native` maps supported objects to editable PPTX and reports degradations |

## Acceptance not yet claimed

A real product run is accepted only with all of:

1. A normal Hub result whose run is a DSH session + `PresentationRun` (`/slides/state/:sessionId` reports `kernel: "dsh"`, `hostDirected: false`), backed by the selected provider/model.
2. A complete tool trace with no fallback, `host-produce`, `host-finish`, or host-salvage event.
3. Every required byte-exact source chunk was returned in the current `contextEpochId` before the plan commit.
4. Todo, required editable exhibits, page-locked numeric facts, current PPTD revisions, raster hashes, actual image emissions to the model, visual decisions, deterministic layout passes, and structural review all agree.
5. Native-editor screenshots of the new pages plus an `exporter-native` PPTX containing editable objects.

Local unit/UI gates prove the enforcement machinery; they do not prove the external run. That last
run must wait for explicit consent because a fresh provider context must receive the exact vendored
OpenKimi chunks, current PPTD pages, and rendered PNGs in addition to the test brief.
