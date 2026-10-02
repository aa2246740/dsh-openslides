# Agent questions in the chat

When the agent needs information it asks through DSH's native question flow. The questions are a card in
the conversation, one question per page. Driver id `assistant-questions` (`drivers/assistant.mjs`).
The fake session serves the pending question (`s.questions`) and records what the page posts (`s.answers`).

## What a user does

- A pending set appears as `.assistant-question-card` in `#editor-generation-event-list`. It is not a modal.
- The card shows `问题 n/N`, one question at a time, numbered options and a 推荐 badge. The badge is parsed
  from the label suffix `（推荐）`; the answer keeps the original label.
- On a single-choice page, picking an option advances. Multi-select and free-text pages wait for 下一题.
  上一题 goes back and keeps the choice. 跳过本题 leaves the question unanswered. 提交 exists only on the
  last page.
- Submitting a page with nothing chosen is refused with 请选择一个选项或填写自定义答案。
- A failed submit shows the reason (for example 连接中断，请重试) and keeps the typed answer; submit again
  to retry.
- 放弃整组问题 cancels the set.
- The settled card becomes a compact question → answer summary (`.assistant-question-answer`), skipped
  ones read 已跳过. The conversation is the durable record.

## What the driver proves

- One card, 问题 1/3, no dialog, 推荐 as a badge, no 提交 on page 1.
- Choose → advance, back keeps the choice, skip, empty submit refused, failed submit keeps `8 页`.
- The posted body is exactly
  `{answers:[{id:"scope",selected:["互联网产品（推荐）"]},{id:"data",selected:[]},{id:"pages",selected:[],custom:"8 页"}]}`.
- Settled summary shows the choice, 已跳过 and the custom text.
- A second set is cancelled with `action: "cancel"` and the card reads 已取消.

## Gotchas

- Reload persistence and the "interrupted" label for an abandoned host request belong to the server's
  question store and are not exercised here.
- The fake session is at the network boundary; whether a real model resumes after an answer is not proven.
