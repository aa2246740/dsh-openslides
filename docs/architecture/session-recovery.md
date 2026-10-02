# Same-session recovery and export receipts

This is the Host lifecycle portion of the 2026-09-14 remediation contract. It does not prove a real-model run.

## Session transition mutex

`POST /slides/sessions/:id/turn` and `POST /slides/sessions/:id/model` share `withSessionTransition`. Input (text, attachments, `modelSelection`, `expectedAttemptId`) is validated before any wait cancellation, model switch, resume, or followup.

Inside the lock:

- A busy Agent returns 409 `session_busy`.
- Generation recovery (`resumeGeneration: true`) that is no longer paused/failed and idle returns 409 `generation_resume_conflict`.
- `expectedAttemptId`, when sent, must match `_agent/attempt.v1.json`.
- Optional `modelSelection: { provider, model, reasoningEffort? }` runs through the same idle check as `/model`.
- A new attempt is recorded. A previous terminal fault is marked `recovering` and is not deleted.

## Durable faults

Undelivered terminal faults are written to `_agent/dsh-agent-error.json` with `attemptId`. Pause faults are not cleared by `page-ready` or by a successful `write_page`. They close only after a recovering attempt reaches a new page-ready/complete result, or on an explicit operator supersede/stop path.

Serialization failures become `serialization-error` with a field path and JS type. Original values, credentials and model text are not stored. The classifier does not name a provider.

## State

`GET /slides/state/:sessionId` includes the shared `execution` projection and `attemptId`. Host `agentBusy` and a live rate-limit wait file are the activity inputs. Delivery is `readVerifiedDelivery`: current export fact plus re-read artifact/report hashes and material fingerprint. An arbitrary old `_agent/export/export-report.json` is not a delivery.

## Export publication

Exporter work stays outside the PPTD lock. Publication uses an isolated `opId` directory, re-reads the written PPTX and report, writes `receipt.json`, and records `export.succeeded`. Previous successful files are not overwritten.

## Remaining

Native editor composer/model-switch UI, product integration, browser verification and real-model PPTX evidence are separate.
