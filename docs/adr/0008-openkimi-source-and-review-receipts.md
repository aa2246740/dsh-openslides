---
status: accepted
date: 2026-08-21
revised: 2026-09-04 — rewritten for the native DSH kernel (ADR-0009); Pi-era ceremony removed
---

# OpenKimi source and rendered-review receipts are production gates

## Context

The vendored OpenKimi skill pack is present in the repository, but a host that only feeds the model short excerpts leaves its design process unverifiable and its visual claims false. Early versions also treated render events and raster file counts as evidence the model had seen a page, which they do not prove.

The agent kernel is now native DSH (ADR-0009). The gates below are kernel-agnostic: they bind *what the agent must have read and what must be persisted on disk*, not any specific provider or orchestration library. Pi-era ceremony that presupposed a fixed pipeline — a committed design-contract visa, a rendered whole-deck overview, a nine-axis taste review, Pi image content blocks — is removed. The DSH tool surface has no step that could produce those artifacts, so requiring them deadlocks every run.

## Decision

Open SlideStudio uses one versioned `RunLedger` (`_agent/run-ledger.v1.json`) as the production execution record. YAML PPTD v2 remains the only document model; the ledger stores source hashes, exact chunk receipts, page revisions, raster hashes, image-delivery facts, review decisions, layout reports, and compose seals. It never stores a second copy of page content.

**Source preflight.** Required OpenKimi files are returned to the agent as contiguous original UTF-8 chunks, unsummarized. Every required chunk must be read in the current `contextEpochId` before `commit_design`/`write_todo` may commit a plan. A provider/model route change mints a fresh epoch and invalidates prior reads; a process restart resumes the persisted epoch and does not.

**Plan and coverage.** `commit_design`/`write_todo` commits an explicit ordered `{pageId, title, layoutFamily}[]` plan. Every planned page must exist as a persisted `write_page` revision on disk before `compose_deck` may seal. This is a hard gate for every model, including text-only ones.

**Rendered layout.** `render_page` records a raster fact bound to the exact `pageSha256` revision and the `rendered-layout-gate` version. Deterministic layout measurement (overflow, collisions, empty pages) must pass for each current revision. Changing measurement semantics invalidates older passes rather than grandfathering them.

**Visual delivery and review (vision models only).** When the active model accepts image input, the rendered raster must be emitted to it and `review_page` must return the delivery token for that same revision and raster hash, recording a pass or revise verdict. A page rewrite invalidates its prior raster, delivery, and review receipts. Text-only models skip this ceremony; they still owe plan, coverage, rendered layout, and structural review.

**Structural review.** `review_pages` reviews the pages as persisted on disk — never a cached or in-memory copy — and records a verdict bound to the exact current revision snapshot. Any subsequent page rewrite requires a fresh structural pass (or explicit editor authorization for targeted repairs).

**Compose.** `compose_deck` seals current persisted PPTD pages and accepts only a title. It cannot submit pages, materialize a fallback IR, or let the host finish the deck. Source coverage, plan coverage, current rendered layout, current visual receipts (vision models), and a current structural pass are hard gates. Strict runs with no ledger fail closed.

**Export verification.** Export produces its own receipt. Until target-rendered PPTX pages are reviewed, export status is `exported-unverified`, not final visual acceptance.

## Consequences

- The DSH agent is the only production content and page-design director.
- The host may reject a page and return diagnostics, but it cannot move, resize, recolor, rewrite, restamp, or add slide elements.
- Production remains independent of Kimi iframe, CDN, APIs, and vendored export scripts.
- `_agent/hands-state.json`, `hands-log.jsonl`, rasters, and `visual-review.json` are historical evidence only. They cannot satisfy the gates.
- Native-canvas review, edit rendering, DOM measurement, and PPTX export share PPTD line-break and text-box semantics.
- Image-delivery facts bind the model-visible raster to the exact persisted page revision; audit text must not claim access to a provider's private vision pipeline.

## Rejected alternatives

- More booleans in `hands-state.json`. They cannot distinguish current and stale page revisions.
- Raster file counts or tool names as visual evidence. They do not prove image delivery or review.
- A second mutable presentation model inside the harness. It would violate PPTD disk SSOT.
- Host layout repair. It would make agent quality unmeasurable and reintroduce template substitution.
- Loading summaries instead of original files. It repeats the capability loss this decision fixes.
- Restoring the Pi-era design contract / deck overview / taste review as blocking gates. They describe a pipeline the DSH kernel does not run; keeping them as requirements would deadlock generation while adding no verifiable evidence.
