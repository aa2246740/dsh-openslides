# Send → editor hand-off

Send validates, stores the request in `sessionStorage` (`launch-flow.js`) and navigates at once to
`index.html?launch=<id>&workspace=1&live=1`. The editor shows the message under `#workspace-cover`,
does the model's intent read and session creation, then rewrites the URL in place. Driver id
`hub-launch` (`drivers/hub.mjs`).

## What the driver proves (with `/slides/assistant-intent` held open, session creation stubbed)

- The editor opens before the intent read returns: `#workspace-cover-brief` shows the brief, the
  detail says 正在让模型理解你的需求…, step 理解需求 has `aria-current="step"`; no session exists yet.
- The intent call carries `hub:true` and the chosen model; the create call carries the brief, the 4:3
  layout and `conversationMode: "generate"`.
- After the intent resolves the URL becomes `?project=…&session=…&live=1&workspace=1` with no
  `launch=`, `window.__samePage` survives (no reload), and reloading creates no second session.
- Ctrl+Enter in `#brief` sends. A `discuss` intent creates a `discuss` session.
- Failure: `#workspace-cover.is-failed` with `role=alert`, the cause, the message kept,
  `.launch-retry` re-runs the intent read and completes once the kernel recovers, `.launch-back`
  (回首页修改) returns to `/` with the draft restored and `?draft=` removed. A session-creation
  error shows the server's reason. A `202 {queued:true,position}` answer shows 排队中 · 前面还有 N 个任务
  and re-posts the same `clientRequestId`.

## Gotchas

- Register page routes after `fakeSession()`: Playwright tries the newest route first.
- The queue UI is a client contract; today's server never queues.
- The launched project is a scratch deck; nothing calls a model.
