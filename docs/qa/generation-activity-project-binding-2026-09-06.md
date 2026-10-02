# Generation activity project binding — 2026-09-06

## Observed failure

The native web process serves several editor tabs but keeps `projectPath` and the canvas `session` as process-global state. A poll from the new `236942c8…` editor tab could therefore read `/api/generation-activity` after another tab or an Agent render had changed the global project. The canvas showed the new cover while the progress panel showed the older `b7c22a8e…` paused run.

## Bounded repair

- The editor derives a generation activity URL only from its own `location.search` and sends `project` plus the optional live `session` as `sessionId`.
- Every generation activity read used by polling, full-deck consent, comment consent, page review and deck review now uses that URL.
- The server resolves the requested project with the same `resolveProjectPath` path used by `/api/open`; it reads activity from that root without changing global editor state.
- If a `sessionId` is present and the selected project's durable activity has another session id, the endpoint returns HTTP 409 with `GENERATION_SESSION_PROJECT_MISMATCH`.
- Calls without a project query retain the existing global-project fallback for non-live editor routes.

## Regression evidence

`apps/native-web/src/generation-activity-project.test.mjs` interleaves A → B → A requests while deliberately passing the opposite project as process-global fallback. Each request returns its query-bound session. It also verifies that a session from B is rejected for project A and that no raw editor call remains to the unqualified endpoint.

Targeted verification:

```text
node --check apps/native-web/public/app.js
node --check apps/native-web/src/server.mjs
node --test \
  apps/native-web/src/generation-activity-project.test.mjs \
  apps/native-web/src/generation-process.test.mjs \
  apps/native-web/src/session-trace-journal.test.mjs

18 tests passed, 0 failed
```

## Remaining shared-state risk

This change does not make the native web server multi-project. `/api/model`, `/api/command`, `/api/reviews`, `/api/versions`, `/api/export`, `/media/*` and several review-lock operations still use process-global `projectPath` or `session`. `/api/open` also replaces those globals. Two tabs can therefore still interfere outside generation-activity polling, especially if they edit, export, restore a version, or acquire a review lock concurrently.

The current review lock prevents some cross-project switches after the lock exists, but the project selection immediately before lock acquisition remains global. A complete repair needs request-scoped project/session identity across those APIs or per-project server session storage. That broader state change is intentionally outside this patch.

The source fix has not been deployed or used to restart the busy live service. Live acceptance must wait for the current generation to stop, then verify two editor tabs with different `project` and `session` query values keep distinct progress histories.
