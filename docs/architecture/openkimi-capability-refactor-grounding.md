# OpenKimi capability refactor grounding

Date: 2026-08-21

> **Kernel note (post-ADR-0009):** "Pi" below was the production kernel when this
> was written. The kernel is now DSH; read "Pi" as "the Agent Director running in
> the DSH kernel" and "Pi extension" as the `dsh-slides-host` tool surface. The
> byte-exact source-read and fail-closed requirements are unchanged; Pi-era gate
> ceremony (design-contract visa, deck overview, nine-axis taste) was removed by
> the ADR-0008 revision.

## Goal

Preserve the vendored OpenKimi capability pack byte for byte, expose the required original material to Pi without summaries or silent truncation, and make every required production step enforceable by the harness.

The target is an independent Open SlideStudio product. Production must not call a Kimi iframe, Kimi CDN, or the vendored export scripts.

## Observed failures

1. `playbook.ts` replaces the original OpenKimi `SKILL.md` and `reference/pptd.md` with host-written excerpts. It also caps the selected category, category guide, and design file.
2. The Pi prompt and skill-path note explicitly tell Pi not to read the original `SKILL.md` or `reference/pptd.md`.
3. `render_page` creates a PNG and a data URL, but the Pi extension returns text only. The selected model never receives the pixels.
4. `visual-review.json` treats a render event or an on-disk PNG as proof that the model saw the page.
5. `review_pages` is structural QA and always reports `visualQa: skipped`. It does not measure rendered text overflow, footer intrusion, or collisions.
6. The native idle canvas flattens paragraph breaks. The editor and PPTX exporter preserve them. One PPTD document therefore has different text geometry in preview and export.
7. Intent matching checks promotion terms before report terms. A brief containing both `brand` and `monthly report` can load the wrong category and design system.
8. Native PPTX export has no post-export render and visual acceptance gate.

## Product law to preserve

- Pi is the only production Agent Kernel and the only content and page-design director.
- YAML PPTD v2 on disk is the document SSOT.
- The host supplies sources, tools, persistence, deterministic validation, rendering, and export. It must not paint, restamp, or finish pages after Pi.
- Screenshots are review evidence, not a second document model.
- Production has zero Kimi iframe, CDN, API generation, and official export-script dependency.
- Export remains hybrid native and editable. A full-page raster is a failure mode.

## Required facts and gates

The implementation must keep these facts separate:

1. Original source exists and its hash matches the manifest.
2. Pi read the exact required byte or line ranges.
3. A page raster was produced for the current page revision.
4. The raster bytes were delivered to the model as image content.
5. The model recorded a review decision for that exact revision.
6. Any reported issue was followed by a new page revision and another review.
7. Structural and rendered-layout checks passed.
8. The final PPTX was exported and, where a target renderer is available, rendered and reviewed separately from the native canvas.

No event name, file count, or successful earlier stage may stand in for a later fact.

## Architecture rubric

Candidate designs are judged on:

- Every vendored file remains addressable, with path and SHA-256. Required files are returned exactly in deterministic chunks with no summary or truncation marker.
- Production state transitions reject skipped reference reads, missing page renders, missing image delivery, missing review decisions, stale review revisions, failed layout checks, and incomplete todo coverage.
- The Pi extension returns real image content supported by Pi, not a path or data URL embedded in text.
- The native renderer, edit state, layout diagnostics, and PPTX exporter share the same line-break and text-box contract.
- Pi remains the designer. Harness checks may reject and request revision, but cannot edit the page.
- State is explicit, versioned, idempotent, and recoverable from disk.
- Public interfaces remain small and typed. Boundary input is validated from `unknown`.
- Existing no-iframe, no-host-finish, editable-export, and authentic-generation gates continue to work.

## Historical rationale

The source caps were introduced as an early context-budget workaround and later made explicit in commit `769652e`. No ADR promotes that workaround to product law. The same commit accepted Pi as the single kernel and banned host-finish behavior. Those two decisions remain valid.

The native line-break flattening was added in commit `c5315da` to match a frozen oracle screenshot. No ADR or export contract defines it as PPTD document semantics.

## Design question

Choose the smallest architecture that makes the complete source pack available and the production sequence unskippable without creating a second orchestration kernel or allowing the host to design slides.
