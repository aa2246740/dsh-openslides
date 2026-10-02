# Execution projection boundary

The remediation retains YAML PPTD v2, the append-only ledger and `PresentationRun.execute/inspect`. It does not add a mutable workflow aggregate or a second editable document model.

## Interfaces

- `projectExecution(ProjectExecutionInput)` is pure. It receives ledger facts, page identity resolution, a domain inspection, capabilities and optional Host lifecycle evidence. It does not read files, clocks or environment variables.
- `inspectProjectExecution(ProjectExecutionObservationInput)` is the separate IO adapter. It observes the directory under the existing synchronous PPTD lock where the directory exists, then calls the same projector. Missing directories are not created by observation.
- `generation-activity` calls the same pure projector with its existing domain observation. It no longer fabricates `agentBusy: false`. Host activity integration remains a separate required step.
- `ExecutionProjection.next` is the first blocker action or null. Unsupported human-resolution conditions do not invent tool names.

## Conservative decisions

- Full plans require explicit page ID, title, layout family and typed exhibits. IDs use the single page-identity normalizer. Missing fields, unknown exhibits and canonical collisions do not become complete plans. A one-page plan is valid.
- An unreadable project is not an empty resolved project. Identity collisions and unreadable documents block mutation without changing filenames or history.
- Current domain inspection results are used instead of treating any historical structural-review or compose fact as a pass. Further current-material/seal hardening in the domain inspector and export path remains required.
- Undefined Agent activity means unknown, not idle. A rate-limit fault does not imply an active retry timer. `retryScheduled` must come from actual Host lifecycle state.
- Delivery is supplied only by an actual current-operation receipt verifier. The projector does not search for arbitrary old export reports and stamp them with the current fingerprint. Even supplied delivery metadata cannot override missing plan/QA or an active Agent.

## Verification state

The expanded presentation suite passed 239 cases, including the previously omitted execution tests, on 2026-09-14. The Host consumer build passed. These are implementation regressions, not provider or PPTX acceptance. Strict plan admission, canonical mutations/history, current-material QA/export receipts and Host lifecycle integration are still being completed before product integration and real-model testing.
