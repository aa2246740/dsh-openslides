---
status: accepted
---

# Freeze each parity baseline and keep exclusions narrow

Every Open SlideStudio parity release targets a frozen official Kimi Slides baseline identified by capture date and reproducible evidence such as screenshots, asset identifiers or hashes, viewport, state, and interaction records. A later official change creates a new baseline version; it does not reopen an already accepted baseline silently.

The baseline includes the complete independent presentation experience: creation, Agent Run, workspace, editor controls, tooltips, micro-buttons, transient states, play, versions, attachments, and editable export. Parity Exclusions are limited to Kimi account, payment, and official cloud integrations, including third-party or Kimi-hosted services that are not part of the independent local product, unless an Open SlideStudio equivalent is explicitly approved.

## Considered options

- Track the latest live Kimi surface continuously.
- Freeze a baseline per parity release and treat later changes as a new version.

The second option is accepted so completion remains measurable.

The first baseline freezes the official Kimi Slides version observable at the time this decision is executed. Existing oracle rows and captures may seed discovery, but the baseline is not complete until the current surface and required states have reproducible evidence. The pinned OpenKimi material remains an agent and format reference; it is not a substitute for official-surface interaction evidence.

The first frozen capture is `docs/editor-oracle/baselines/kimi-v1-2026-08-20/`. Its manifest locks the capture time, public entry identity, dev-only oracle host, local PPTD fixture, viewport, pinned browser runtime, 125 visible clickable nodes, live tooltip probes, and SHA-256 hashes. Export/share cloud dialogs remain explicitly unproven because the official controls were disabled in SDK mode.

## Consequences

- `wont-port` is not an acceptable status for generation, editor, tooltip, or micro-interaction gaps.
- Each service exclusion must name the excluded external dependency and why it is outside the independent product boundary.
- Existing oracle rows marked verified are not sufficient until discovery covers every visible control and required state in the frozen baseline.
- Google Slides, Kimi account/payment, and official cloud collaboration are excluded from the first independent local-product baseline unless later replaced by an approved equivalent.
