# 批注 (annotate)

批注 mode turns a click or a dragged box into a comment target. A floating card next to the click takes
the text; adding queues the comment above the chat input. Driver id `comment-annotate`
(`drivers/review.mjs`), started with `&workspace=1`.

## What a user does

- `#btn-comments` (`aria-pressed`) turns annotation mode on; `#comment-mode-hint` explains the gesture.
- Click an element, or drag a box over several: `#comment-panel` (a floating dialog) opens beside the
  cursor. `#comment-target` says 已选 N 个对象 and `#comment-targets li` lists them. Type in
  `#comment-draft`; `#comment-add` is disabled until there is text. Ctrl/Cmd+Enter adds, Esc cancels.
- Adding closes the card and **leaves annotation mode**. The comment appears as a chip in
  `#work-comment-items .comment-attachment` under `#work-comment-batch` ("1 条批注"), and the composer
  send button's `aria-label` becomes "发送 1 条批注". There is no right-hand comment list.
- Pins (`#comment-layer .pin`) are drawn only while annotation mode is on. Esc leaves the mode. The chip's
  × (`.comment-attachment-remove`) removes it.

## What the driver proves

The store: `PATCH /api/reviews` writes `_agent/review-threads.v1.json` with
`pages[<pageId>][] = { text, scope: { kind: "elements", elementIds: […] }, resolved: false, aiStatus:
"idle" }`. Adding leaves the mode, the chip survives a reload, the pin appears once the mode is on, a
dragged box selects at least two targets and Esc cancels, removing the chip marks the stored comment
`resolved: true`, and commenting never edits a page file.

## Gotchas

- The card is `#comment-panel`; `#comment-list` and `#comment-add` in old notes belong to a removed
  side panel. The chat queue is `#work-comment-items`.
- A chip leaves the queue when the send is accepted (`comment-send-agent.md`), not at add time.
- Comments store immutable page/element ids plus revision and hash; a deleted target makes a later send
  fail with a recovery action.
