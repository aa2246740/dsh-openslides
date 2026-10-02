# AI panel

The left column is the assistant chat. This feature is its chrome: open/close, suggestion chips, the single
morphing send/stop control and what a send does when the deck has no AI session. Driver id
`assistant-panel` (`drivers/assistant.mjs`), opened with `&workspace=1`.

## What a user does

- The panel `#work-chat` is open by default. An empty conversation shows `#work-empty` with three
  suggestion chips (`[data-agent-prompt]`).
- `#chat-close` (×) hides it; the bottom AI button `#btn-sparkles` toggles it and reports `aria-expanded`.
  Reopening puts focus in the composer `#work-brief`.
- A chip only fills the composer with its `data-agent-prompt`. It never sends.
- The composer has **one** submit control, `#work-form .composer-send`. Idle it is a send arrow. While a run
  is live and the box is empty it is the stop square (`.is-stopping`, `data-control="chrome.workspace.stop"`).
  Typing turns it back into send (steer, tooltip 发送补充); clearing the text restores stop.
- Enter with no AI session bound to the deck: the reason is shown (这份文稿没有 AI 对话记录…，仍可手动编辑；
  需要 AI 请回首页新建文稿) and the typed message stays.

## What the driver proves

- Open by default, three chips, × hides, the AI button reopens with focus in the composer, a chip fills
  the box and posts nothing (`/slides/assistant-intent` is never called).
- No session: the message is refused visibly and kept.
- Live session (fake, `busy` + phase `generating`, `&live=1&session=verify-session`): one submit control,
  stop while empty, send while typing, stop again once cleared.

## Gotchas

- The bound session is a fake DSH session at the network boundary; the stubbed `/events` stream is
  aborted, so `ERR_FAILED` and `status of 5xx` console lines are expected noise for this group.
- Comment send shows the same sentence (`comment-send-agent.md`); both come from `NO_AI_SESSION_MESSAGE` in
  `public/app.js`. A deck has a session only when it was generated from the Hub (`_agent/` binding files).
