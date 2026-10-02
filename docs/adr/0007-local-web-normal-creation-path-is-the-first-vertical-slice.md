---
status: accepted
---

# The first vertical slice is the Local Web Product's Normal Creation Path

> Kernel note: "Pi-backed Agent Run" / "real Pi session" below predates [ADR-0009](0009-dsh-is-the-single-agent-kernel.md). The production kernel is now DSH; the milestone wording is otherwise unchanged.

The first implementation milestone that may be called "running" is a user completing the Normal Creation Path in the Local Web Product: enter a real brief in the Create Hub, connect or reuse an authorized provider, start a real Pi-backed Agent Run, observe its Agent Timeline, receive a newly written YAML PPTD v2 project, and open that project in the Self Canvas.

A CLI or harness-only demonstration is useful diagnostic evidence but does not satisfy this milestone. A packaged macOS desktop wrapper is not required; the product starts locally and runs in a browser.

## Considered options

- Prove the agent in a CLI first and integrate the product UI later.
- Require the first accepted vertical slice to cross the normal product boundary end to end.

The second option is accepted because the product, rather than an internal harness, is the deliverable.

## Consequences

- Product status and Agent Timeline events must come from the real Pi session and persisted run state.
- A successful run opens the exact PPTD Project created during that run; the host must not swap in a fixture or previously generated deck.
- Existing command-line and fixture paths remain tests or developer tools only and cannot be cited as completion of the Normal Creation Path.
- Editor depth, editable export, and full frozen-baseline parity remain required later gates; they are not reasons to replace this first vertical slice with a fake end-to-end demo.
