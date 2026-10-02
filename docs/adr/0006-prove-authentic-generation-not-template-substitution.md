---
status: accepted
---

# Prove Authentic Generation instead of scoring subjective output quality

> Kernel note: "Pi Agent Run" / "Pi session" below predates [ADR-0009](0009-dsh-is-the-single-agent-kernel.md). The production kernel is now DSH — read those as a provider-backed DSH Agent Run and its DSH session id.

The first generation acceptance gate is authenticity, not a subjective comparison of whether one deck looks better than another model's deck. Open SlideStudio must prove that a real provider-backed Pi Agent Run researched or interpreted the current materials, planned the story and pages, made task-specific visual decisions, wrote and reviewed the PPTD Project, and reached its own completion decision.

A normal Agent Run must never select a substantially predesigned deck, replace its text, replay a fixture, or let the Tool Host finish the design while presenting the result as AI generation. Deterministic host operations remain valid for authentication, file and project storage, parsing, rendering, validation, export, and other infrastructure that does not decide presentation content or composition.

Reusable fonts, tokens, icons, low-level layout primitives, design guidance, and examples are allowed. They become Template Substitution when the product chooses a precomposed deck or page sequence and the Agent Director merely fills slots.

## Considered options

- Gate the first real-generation milestone on a cross-model aesthetic benchmark.
- Gate it on inspectable Generation Provenance and anti-substitution evidence, then improve subjective quality without confusing it with runtime truth.

The second option is accepted. A visually attractive fixture cannot prove an agent product, while an honest Agent Run can be inspected and improved.

## Consequences

- Every successful Agent Run retains its provider and model identity, Pi session identifier, ordered tool events, PPTD artifact changes, validation results, and agent-issued completion decision.
- Missing credentials, a disabled provider, or a failed Pi session cannot produce a successful deck through another path.
- Anti-substitution checks use materially different briefs and verify task-specific differences in narrative, page structure, composition, and created artifacts rather than text alone.
- The normal UI must never label fixture, demo, playbook, or Template Mode output as an Agent Run.
- The normal UI presents an Agent Timeline derived from the same ordered events retained in Generation Provenance; it must not synthesize plausible-looking progress independently of the run.
- The Agent Director may combine Design Primitives and study reference examples, but it must create the task-specific page structure and composition rather than select completed slide templates.
- No Kimi-versus-Open SlideStudio aesthetic score is required for this authenticity gate. Passing authenticity alone does not waive the separately accepted UI interaction parity, editable export, or product-completion gates.
