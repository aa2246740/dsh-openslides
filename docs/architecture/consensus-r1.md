# Architecture consensus — round 1 (Grok × Advisor)

**Date:** 2026-08-04  
**Sources:** Grok bootstrap proposal + ChatGPT Pro deliberate review (partial transcript recovered).

## Verdict table

| Decision | Advisor | Grok final | Notes |
|----------|---------|------------|-------|
| Monorepo packages | **Amend** | **Accept-as-workspace** | Keep package dirs for ownership; do not pretend independent publish. Dependency must stay one-way: `agent-core → pptd ← exporter-pptx`; exporter never calls agent or design inference. |
| Vite + React SPA | **Accept** | **Accept** | Preview/editor shell only. PPTD is not React state shape; exporter never depends on DOM. |
| PPTD IR | **Amend** | **Accept-amended** | Renderable results only (slides, elements, geometry, text, images, chart data snapshots, styles). No prompts, agent traces, candidates, or design reasoning. Version + runtime schema validation required. |
| MockProvider | **Accept w/ constraint** | **Accept** | Implements the same `LlmProvider` interface with deterministic fixtures — not a demo-only protocol. |
| pptxgenjs MVP export | **Accept** | **Accept** | Encapsulated in `exporter-pptx`. PPTD must not leak library-specific fields. |
| design-brain | **Amend** (contracts compile-time, impl runtime inject) | **Accept-amended** | Consumers depend on pure contract/prompt assembly APIs. Avoid design-model clients and singletons. `agent-core` may depend on design-brain *types/helpers* but design must remain swappable via injection for real providers. |
| Rebrand depth | **Amend** | **Accept** | Product name, package namespace, README, minimal chrome first. Deep brand system after first export proof. |
| Native chart “Edit Data” as default bar | **Reject for v0.1** | **Amend (challenge)** | Advisor wants to avoid chart risk. **Grok counter:** PRD AC-12 and product promise require editable charts as a north star. **Consensus:** v0.1 uses pptxgenjs charts best-effort and records degradations; full OOXML workbook fidelity is kill-gated P1, not a blocker for first vertical slice. |

## Thinnest vertical slice (agreed)

```
MockProvider fixture input
  → PPTD JSON (sample research / single-page fixture)
  → React preview from same IR
  → exporter-pptx → PPTX blob
  → open/download + structural smoke
```

Minimum fixture content: title, body text, shape/card, optional image, simple chart data.

## Explicit open disagreements (≤3)

1. **Chart fidelity bar for “MVP done”** — Advisor: snapshot-only OK; Grok: best-effort native chart + degradation report. Kill criteria: if pptxgenjs charts are unopenable in PowerPoint, fall back to table + note.
2. **When to split design-brain publish boundary** — Advisor: delay independence proof; Grok: keep package now for parallel ownership; revisit after slice ships.
3. **Agent timeline fidelity** — not fully debated; Grok keeps tool timeline UI as product chrome (from evidence), separate from PPTD document.

## This-week implementation order

1. Finish packages + wire web Create → Agent → Workspace.
2. Prove export download from mock deck.
3. Typecheck/build; push GitHub; second advisor code review round.
4. Only then deepen SmartArt / image rebuild / real LLM providers.
