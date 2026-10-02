# Editor Agent interaction audit — 2026-09-05

Scope: the editor Agent workspace, its native-web attachment API, and the DSH `/slides/sessions/:sessionId/turn` bridge. The audit used a disposable copy of `fixtures/okp-yu7-ppt` and port `55482`.

## Result

The original office acceptance failure at `#work-thread .tool-row.is-expandable` was a test precondition error, not an authentication diagnosis. `editor-office-acceptance.mjs` copies a static fixture with no DSH session binding. The editor therefore correctly reaches `这份文稿没有可继续对话的 DSH Agent 会话`; before this repair, its cleanup left the composer hidden and made the failure look like a permanent running turn. The final office acceptance now verifies the sessionless error, restored input, released locks, and unchanged document, then continues through versions, export, and presentation. The final full run completed 15 steps and exercised all 102 editor action IDs; it does not claim a successful live model edit.

A provider credential by itself would not make this fixture editable by Agent. A real editor edit needs both a provider-ready Host and a project-bound DSH session whose state exposes page revision and SHA-256 facts.

## Interaction coverage

| Interaction | Evidence | Result |
| --- | --- | --- |
| Open, close, reopen Agent workspace | Real local browser/server | Passed two-way visible state change. |
| Enter / Shift+Enter | Real local browser/server | Enter submits; Shift+Enter inserts a newline without submitting. |
| No-session failure | Real local browser/server | Error is visible; input is restored and focused; form and notes unlock; no version is created. |
| Failure detail / retry | Real local browser/server | Failed tool row is expandable and contains the error; Retry restores the request for editing/resubmission. |
| Attachment selection | Real local browser/server | Composer uses a dedicated input. Supported types are explicitly limited to TXT, Markdown, CSV, TSV, and JSON. |
| Attachment pending/removal | Real local browser/server | Upload returns an opaque ID, paints a removable chip, survives refresh while the sidecar remains up, and DELETE removes the exact context. |
| Upload/submit race | Real local browser/server | Submit is refused while an attachment upload is unresolved. Same-tick duplicate submits enqueue one turn. |
| Attachment send | Deterministic HTTP test double plus real DSH route unit test | Browser turn payload carries the pending ID. DSH resolves the ID before marking busy and puts the file text into the actual `createUserMessage` followup. |
| Attachment race | Deterministic HTTP test double | Submitted chips and upload control are frozen until success/failure; success consumes them, failure keeps them for retry. |
| Page scope | Deterministic HTTP test double | One selected/current page authorization is sent. |
| Whole-deck scope | Deterministic HTTP test double | Explicit confirmation is required and all eight fixture page revision/SHA pairs are sent. |
| Loading / cancel / restore | Deterministic HTTP test double | Cancel requests Host stop, waits for acknowledgement, restores the protected snapshot, releases the lock, and restores input. |
| Comment to Agent | Real local browser/server | Saved comment reaches recipient consent; without a known provider, Send is disabled and no model call occurs. |
| Tool expansion | Real local failure and deterministic success | Both failure and completion rows expose expandable details. |
| Refresh | Real local browser/server | Pending attachment chips rehydrate by ID. Persisted generation history remains covered by `editor-ai-workspace-generation.mjs`. |

## Attachment contract

1. The editor uploads each supported file to `POST /api/attachments` and keeps `{id, name, bytes}` as pending state.
2. The Agent turn sends `attachments: [id, ...]` alongside `editorEdit` authorization.
3. The DSH Host resolves every ID through the paired editor sidecar before `markBusy` or `agent.followup`.
4. Resolved text is wrapped in `<editor_attachments>` with a statement that it is user-selected reference data, not system instructions.
5. Missing, oversized, unknown, or unreadable attachments return `400 invalid_attachment` before the Agent is queued.
6. On verified success, the browser consumes and deletes the uploads. Failure or cancellation retains pending chips for an intentional retry.

The canvas `#image-file` remains separate. Image and Office attachments are not advertised by the Agent composer because this route cannot yet deliver them to the model faithfully.

## Evidence boundary

Run the deterministic browser audit:

```sh
QA_PORT=55482 node scripts/qa/editor-agent-human-audit.mjs
```

Observed result: nine scenarios passed. The script labels every result `real-local` or `http-test-double` and writes `output/qa-editor-agent/report.json` plus screenshots.

Run server and DSH contract tests:

```sh
node --test apps/native-web/src/review-threads.test.mjs
npm test -w @open-slidestudio/dsh-slides-host
```

Observed result: native-web `23/23` in the final integrated run; DSH Host `121/121`, including attachment content in the real followup object and rejection before busy; canvas-session `34/34`. The native server rejects unsupported image uploads before creating an ID or file. The focused attachment UI script also passed its supported-format, dedicated-input, upload, refresh, and deletion checks.

Credentialed model output remains unverified in this audit. No real provider turn was started because the disposable fixture has no DSH session. The success and cancel browser scenarios use explicit HTTP doubles to verify UI state and request shape; they do not prove model quality, provider availability, or a persisted page edit from a live model.

Active direct-edit recovery after a full server restart is still limited by the DSH session and project lock lifecycle. Browser refresh restores pending attachment state while the sidecar stays alive, and durable generation history is readable; a credentialed restart/resume acceptance run still needs a real session-bound generated project.

## Element-bound review addendum — 2026-09-06

Review comments now persist an immutable server-captured scope: explicit `elements` or `page` kind, page id, all selected element ids, the current run-ledger page revision when available, page SHA-256, and capture time. A later edit may change comment text or state through comment-revision CAS, but it cannot silently rebind the comment to another element set. Deleted targets return `REVIEW_TARGET_MISSING`; a changed page returns `REVIEW_SCOPE_STALE`; both responses tell the editor to select the current objects and create a new comment.

`POST /api/reviews/ai-lock` reads the persisted comment scope and comment revision. Direct Agent workspace edits use a separate explicit `workspaceEdit` contract, so a transaction id cannot impersonate a review comment. Every review read/write/lock request includes an explicit project path; the lock token binds version snapshot, verification, restore, and release to that root even if another browser tab opens another project.

The Host validates `editorEdit.reviewScope` against the authorized page revision/SHA and appends the server-verified element set to the actual DSH followup. The native verifier commits `aiStatus: applied` itself only after at least one target element changed and no page metadata, element order, deck metadata, or unselected element changed. No-op and out-of-scope results stay non-applied and are restored by the editor transaction. The cross-process guard includes the immutable baseline page body so the presentation writer can reject prospective out-of-scope writes before persistence while allowing more than one correction to the selected elements.

Focused evidence: native review/attachment/notes tests passed `23/23`; DSH Host tests passed `165/165`, including an actual `/slides/sessions/:sessionId/turn` route assertion over the produced followup object. The full native-web run passed `55/57`; its two failures were separate DOM/viewport tests (`chrome-overflow.test.mjs:171` and `generation-process-dom.test.mjs:110`) and are not counted as green. A credentialed real-Agent comment edit still requires a controlled session-bound acceptance run.
