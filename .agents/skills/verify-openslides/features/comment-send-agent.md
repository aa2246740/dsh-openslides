# Send queued comments to the agent

The composer's send button submits every queued comment plus any typed text as **one** agent turn (the
only AI entry point for comments). Driver id `comment-send-agent` (`drivers/review.mjs`).

## What the driver proves

- Part 1, on a scratch deck without a DSH session: sending shows a toast that the deck has no AI
  conversation record and that it can still be edited by hand, posts **no** turn, keeps the chip queued
  for a retry, and leaves the deck files untouched.
- Part 2 runs `scripts/qa/editor-comment-batch.mjs`, the repo's own outer-boundary QA (real server, stubbed
  DSH host): the batch project lock, the protected "AI 修改前" snapshot, one turn carrying
  `editorEdit.pages[]` and `reviewScope.items[]`, scope verification, resolve/rollback, failure and retry
  staying on the original message. Its log is kept in the feature's evidence folder; it exits 0.

## Gotchas

- A real model edit needs provider credentials and is not covered. The script proves the contract
  around it.
- The script writes its own report under `output/qa-editor-comment-batch/`.
- The no-session sentence is shared with the plain chat send (`assistant-panel.md`): 这份文稿没有 AI 对话记录…，
  仍可手动编辑；需要 AI 请回首页新建文稿。
