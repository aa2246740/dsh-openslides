---
status: accepted
---

# Full Kimi-aligned parity is the completion gate

Open SlideStudio will not treat a working core journey as final completion. The product is complete only when the full in-scope Parity Baseline has been reproduced with equivalent visual treatment and behavior, including tooltips, micro-buttons, hover, focus, selected, disabled, loading, and error states, while retaining Open SlideStudio branding and shipping no Kimi runtime dependency.

Development may use the official Kimi iframe as an oracle to capture screenshots, behavior, and golden evidence. Production must generate, render, edit, persist, and export without contacting or embedding that iframe, Kimi/Moonshot hosts, CDNs, or official export scripts.

## Considered options

- Stop at core-flow parity and keep the remaining editor surface as backlog.
- Make full Kimi-aligned visual and behavioral parity the completion gate.

The second option is accepted. A core-flow gate may remain as an internal milestone, but it is not the product completion claim. This supersedes prior statements that cloning every Kimi chrome detail was out of scope.

## Consequences

- Every visible control needs an Interaction Row, including tooltip and transient-state behavior.
- Representative screenshots are insufficient; the S0-S13 frontier must be exhausted.
- Kimi trademarks and brand identity are not copied into the shipped product.
- Stored oracle evidence may be used offline; live Kimi access is never a production or CI dependency.
- The baseline and its narrow official-service exclusions are governed by ADR-0005.
