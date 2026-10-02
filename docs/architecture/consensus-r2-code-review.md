# Code review consensus — round 2

**Advisor commit reviewed:** `e3d2677`  
**Grok follow-up fixes:** see subsequent commit on `main`.

## Advisor P0 findings — Grok disposition

| Finding | Advisor | Grok | Action |
|---------|---------|------|--------|
| Smoke not end-to-end (export used separate sample deck) | P0 | **Accept** | Smoke now exports `generateDeck()` / `refineDeck()` results |
| No visual delivery proof | P0 | **Accept (partial)** | Structural ZIP/PPTX checks in smoke; browser golden deferred to next session |
| Fake model options | P0 | **Accept** | Only `Mock Offline` listed in UI catalog |
| exporter `pptd-shim` dual types | P1 | **Accept** | Shim deleted; types from `@open-slidestudio/pptd` |
| `createAgentRun` silent Mock default | P1 | **Accept** | Requires injected provider; web injects `MockProvider` at store |
| Charts best-effort drop | P1 | **Accept-amended** | Smoke fails on hard-loss; whitelist policy in next pass |
| design-brain runtime inject | P1 | **Defer v0.2** | Documented; not blocking structural slice |

## Remaining disagreements

1. Full LibreOffice/PPTX screenshot golden — agreed needed; not done this commit (time-box).
2. Rename `LlmProvider` → `AgentBackend` — deferred naming PR.
3. Chart whitelist enforcement in mapper — next 48h item after smoke E2E is green.

## Demo-ready bar (shared)

Not demo-ready until: same-deck smoke green, no fake models, no type shim, browser create→export evidence, PPTX openable.
