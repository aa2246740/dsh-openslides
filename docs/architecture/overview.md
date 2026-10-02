# Architecture overview — Open SlideStudio

## First principles

1. **Meaning lives in structure.** A slide is a tree of editable elements with geometry and style, not a PNG.
2. **Generation is command production.** Agents emit reversible PPTD commands; the editor and exporter share the same apply path.
3. **Models are replaceable.** Providers implement a thin chat/tool interface; planning tools and PPTD schemas are vendor-neutral.
4. **Design is a contract.** Theme tokens, layout archetypes, and anti-slop rules are explicit documents consumed by compose tools.
5. **Versions are snapshots of PPTD + metadata**, created on agent batches and explicit restore points.

## Runtime surfaces

| Surface | Responsibility |
|---------|----------------|
| Create Hub (`:13080/`) | Prompt, local DSH models except Antigravity, `POST /slides/sessions` |
| Unique root (`:13080/`) | Open SlideStudio product chrome on the DSH `slides` profile |
| Agent Run | DSH session + `PresentationRun`; streaming tools, pause, resume, model switch |
| Workspace | Native editor on PPTD v2 via `/app`; versions; hybrid PPTX export |

## Package boundaries

```
DSH slides profile (:13080)
  → dsh-slides-client (unique root)
  → dsh-slides-host (tools, /slides, /app proxy)
  → presentation-run (catalog, receipts, gates, page write/render/review, inspect)
  → pptd-v2 / project-store / exporter-native / canvas-session

apps/native-web sidecar (:55200)
  → editor + raster + export only
  → POST /api/generate returns 410

Freeze / fixtures (not the slides profile)
  → agent-harness (`createPiBrain`, host painters, playbook brains)
```

No circular deps. The host may not introduce a second writable deck model or paint missing pages after the agent stops.

## Agent pipeline (native generate)

See `docs/adr/0009-dsh-is-the-single-agent-kernel.md`. Hub create opens a DSH session. Generate is MiniMax China, or OpenRouter MiniMax free when China keys are empty or CN returns 401/403. `createPiBrain` is not the product path.

```
brief → DSH session + PresentationRun (self-directed unless user named a style)
      → list_references (76/44) → read_reference → commit_design receipts
      → [write_page → native raster → review_page] × pages
      → compose_deck → PPTD → editor → exporter-native PPTX
      ↘ quota / auth / timeout → paused, never “PPT 已完成”
```

## PPTD (sketch)

See `packages/pptd-v2` for authoritative types. Conceptual:

- `deck.pptd` indexes YAML `.page` files and media
- each page contains editable elements with slide-local geometry, content, style, and optional layout role
- renderer, editor, layout diagnostics, version store, and exporter consume the same PPTD v2 project

Legacy `apps/web` + `agent-core` is not the generate SSOT and cannot satisfy product provenance.

## Open decisions (challenge with advisor)

1. SPA-only vs full-stack Start for v0.1 (proposal: SPA + later API worker).
2. Chart export: pptxgenjs charts vs hand-authored OOXML for true Edit Data.
3. Whether design-brain embeds Ultimate Design OKF excerpts or only repo contracts.
