# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This monorepo (`packages/*`, `apps/*`) is **one product domain** (Open SlideStudio / PPTD). Do **not** use multi-context `CONTEXT-MAP.md` unless the product is later split into independent bounded contexts.

```
/
├── AGENTS.md
├── CONTEXT.md                 ← product vocabulary (native DSH path)
├── docs/
│   ├── agents/                ← this folder (issue tracker, triage, domain rules)
│   ├── adr/                   ← 0001…0009; kernel selection is 0009 (DSH)
│   └── architecture/
├── packages/
│   ├── pptd-v2/               ← YAML PPTD v2 SSOT
│   ├── project-store/         ← project versions
│   ├── exporter-native/       ← offline hybrid PPTX
│   ├── canvas-session/        ← editor session
│   ├── presentation-run/      ← Agent Run domain tools + receipts
│   ├── dsh-slides-host/       ← DSH slides-profile host (non-visual)
│   ├── dsh-slides-client/     ← product root plugin
│   ├── dsh-slides-bundle/     ← profile bundle
│   ├── agent-harness/         ← freeze fixture (createPiBrain, playbook)
│   └── pptd/ agent-core/ design-brain/ exporter-pptx/  ← legacy, not SSOT
└── apps/
    ├── native-web/            ← editor sidecar :55200
    └── web/ server/           ← archived legacy stack (:5173/:8787)
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/adr/`** — ADRs that touch the area you're about to work in (e.g. monorepo + PPTD).
- **`docs/architecture/`** — system design notes (`prd-parity.md`, `slide-design-brain.md`, etc.).
- **`AGENTS.md`** — product non-negotiables (PPTD IR, no KIMI branding, multi-model, design brain, editable PPTX).

If `CONTEXT.md` does not exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill creates it lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` or `AGENTS.md`. Prefer: **PPTD**, **deck**, **slide**, **element**, **design brain**, **recipe**, **CompositionPlan**, **Open SlideStudio**.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (monorepo and PPTD) — but worth reopening because…_
