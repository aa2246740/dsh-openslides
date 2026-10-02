---
status: accepted
---

# Agent-directed generation fails closed

> Kernel note: "Pi" below predates [ADR-0009](0009-dsh-is-the-single-agent-kernel.md). The production Agent Kernel is now DSH; this decision is kernel-agnostic and still stands.

The Agent Director is the only component allowed to make presentation content and design decisions during an Agent Run. The Tool Host supplies tools, storage, rendering, validation, and export, but it must not paint missing pages, restamp agent pages, salvage-compose a partial run, or silently replace an agent failure with a scripted deck.

When credentials are missing, the product requests configuration or provider login. Any interrupted provider session—quota, expired login, timeout, overload, process loss, or an incomplete agent turn—pauses the same durable run. The user may restore credentials or choose another logged-in provider and continue from disk. Integrity failures that make the stored run untrustworthy remain failed. A deterministic template or demo path is permitted only through development, fixture, or test entry points; it is absent from the normal creation experience and must never report agent-produced success.

## Considered options

- Let the Tool Host finish incomplete decks so every request returns a file.
- Preserve the Agent Run's truth even when that means pausing or failing.

The second option is accepted because host-authored fallback makes agent quality impossible to measure and disguises broken generation as success. This supersedes earlier implementation notes that required playbook fallback after agent failure.

## Consequences

- Ready status requires Generation Provenance showing that the selected provider executed through Pi and that the Agent Director completed the declared page plan and review cycle.
- Host painters may remain only in isolated tests or explicit Template Mode code paths.
- Checkpoints, resume, and honest failure states are product behavior, not error-handling details.
- Resume reuses the same project, design contract, todo, page revisions, and current review evidence. A new model context must receive the exact sources, selected preview, and committed contract again; those current-context receipts cannot be inherited from the failed session.
- The normal creation page must request provider login or BYOK instead of offering an offline playbook model.
- A loading animation, elapsed timer, or completed file is not proof that an Agent Run occurred.
