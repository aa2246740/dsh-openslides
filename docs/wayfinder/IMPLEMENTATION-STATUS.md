# Open SlideStudio implementation status

> **Superseded snapshot (kernel layer).** This page is a 2026-08-20 point-in-time
> record written when Pi was the production kernel. The production kernel is now
> native DSH — see `docs/adr/0009-dsh-is-the-single-agent-kernel.md` and the
> revised `docs/adr/0008-openkimi-source-and-review-receipts.md` (design-contract
> visa, rendered deck overview, and nine-axis taste-review ceremony removed).
> Rows below that say "Pi" describe the Pi era; read "Agent Kernel" as DSH.
> Startup/entry commands in this file are still accurate (`npm start` → Hub on
> :13080).

**As of:** 2026-08-20
**Product entry:** `npm start` -> local Create Hub -> DSH Agent Run -> PPTD v2 -> editor -> native PPTX
**Freeze target:** `codex/pi-single-kernel`
**Primary gate:** `npm run qa:all`

This page was the source of truth on 2026-08-20. Earlier Host-produce, optional-Pi, automatic
playbook-fallback, and Kimi-iframe product plans are superseded by ADR-0002 through
ADR-0007 and remain available only in Git history; the Pi kernel selection itself is
superseded by ADR-0009.

## Product contract (2026-08-20 snapshot)

| Area | State as of 2026-08-20 |
|---|---|
| Product shell | Local web product; Create Hub is `/`, editor is `/index.html?project=...` |
| Agent kernel | ~~Repository-pinned `@earendil-works/pi-coding-agent@0.80.10` only~~ → now DSH `dsh-v0.1.5-rc.2` (ADR-0009) |
| Provider auth | In-product BYOK and provider OAuth; exact selected provider is used |
| Document model | YAML PPTD v2 is the disk SSOT; no bitmap or legacy TypeScript IR substitution |
| Normal generation | ~~Real Pi session~~ → DSH session + `PresentationRun`, task-specific plan, per-page writes/renders, review, compose, and independent provenance verification |
| Failure behavior | Pause/fail with checkpoint; no Host-finish, template substitution, or playbook fallback |
| Template Mode | Development/test CLI and fixtures only; never shown as an Agent Run |
| Production Kimi dependency | None; no Kimi iframe or CDN |
| Export | Hybrid native PPTX; text, tables, charts, and supported shapes stay editable |
| UI reference | Frozen Kimi v1 reference in `docs/editor-oracle/baselines/kimi-v1-2026-08-20/` |
| Product UI | Kimi-aligned Create Hub/editor, shared accessible tooltips, micro-buttons, versions, comments, play, attachments, and editable export |

## Verified locally on 2026-08-20

| Gate | Result |
|---|---|
| `npm run build:native` | pass |
| `npm run test:native` | 244 / 244 tests pass |
| `npm run qa:all` | pass; local browser/UI suite, 112 native-editor assertions, 28 tail-mine assertions, and full editor journey |
| `npm run oracle:validate` | pass; 108 oracle rows |
| `npm run oracle:baseline` | pass; 15 frozen hashes, 125 controls, 5 captured official tooltips |
| `npm run pi:verify` | pass; read-only pinned-runtime check (freeze fixture; Pi is not the product kernel) |
| Production health | `kimiRuntime: false`, `kernel: "dsh"`, checkout ownership reported separately from the open project |

The local QA aggregate intentionally excludes tests that contact an external model. Those
scripts require `QA_ALLOW_EXTERNAL_MODEL=1`; they may not inject an old output card or
turn a failed run into a visual success.

## Acceptance still open

- Run the normal Hub path against one explicitly authorized real provider/model and retain
  its provenance evidence. Local gates do not substitute for this external acceptance.
- Continue frame-by-frame visual parity work from the frozen baseline, especially uncaptured
  state combinations and exact icon geometry. Do not claim Phase G or complete 1:1 parity yet.
- Long-document output, 4:3 canvas, official account/queue/payment, Google Slides, cloud ACL,
  and multi-user realtime collaboration are intentionally outside this local-product release.

## Commands

```bash
npm install
npm start

# Local, no external model call:
npm run build:native
npm run test:native
npm run qa:all
npm run oracle:baseline

# Development/fixture CLI only. It is not the product acceptance path:
npm run native:generate -- "fixture brief" -o ./output/fixture --brain playbook
```

For the user-facing flow and hard pass/fail checks, see `docs/ACCEPTANCE.md`. For the
decisions behind the product boundary, see `CONTEXT.md` and `docs/adr/0002-*.md` through
`docs/adr/0009-*.md`.
