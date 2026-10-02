# ADR 0001: Monorepo + PPTD as source of truth

## Status

Accepted (bootstrap). Open to advisor challenge.

## Context

Reverse-engineered PRD requires editable charts, SmartArt, versions, and native PPTX. A UI-only image prototype cannot satisfy export editability or multi-model compose.

## Decision

1. Use an npm workspaces monorepo named `open-slidestudio`.
2. Introduce package `@open-slidestudio/pptd` as the sole document truth.
3. Agent, canvas, and exporter all operate on PPTD commands.
4. Rebrand product chrome away from KIMI; keep interaction patterns from PRD.

## Consequences

- Higher initial structure cost; enables parallel package ownership.
- Mock agent can produce valid decks without LLMs.
- Image-only demos are temporary scaffolds, not the architecture.
