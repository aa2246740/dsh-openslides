# Chat turn

One conversation turn with a bound session: send, the draft clears, the reply renders, then failure and
recovery, then history after a reload. Driver id `assistant-chat-turn` (`drivers/assistant.mjs`).
Replies are canned strings written by the driver; this proves the UI and request contract only.

## What a user does

- Type in `#work-brief`, Enter sends, Shift+Enter inserts a newline. Enter while an IME candidate is being
  confirmed (`isComposing` / keyCode 229) does nothing.
- The server accepting the request is the line between draft and message: the box clears, the user's text
  appears in `#editor-generation-event-list`, the reply renders as markdown (`.md-body`, bold visible).
- The panel status `#editor-generation-status` follows the session phase and reads 继续聊聊 while the
  session sits in `discussion`.
- If the request fails, the cause appears in the thread with 重试 (`.assistant-reply-actions`). The input
  always belongs to the next draft: retrying does not overwrite what the user has typed since.
- After a reload the thread is rebuilt from the session history.

## What the driver proves

- IME Enter and Shift+Enter behave as above; no request was made for the IME case.
- One intent read (`s.plans`) and one turn (`s.turns`); a discussion turn is `conversationMode: "discuss"`
  and carries **no** `editorEdit`, so the host keeps it read-only.
- Bold markdown in the reply, the draft clears on acceptance, status 继续聊聊.
- Intent failure (`s.intentFail`): cause shown, 重试 re-sends and succeeds, the newer draft survives.
- Reload restores both messages.

## Gotchas

- Status 继续聊聊 needs the fake session's phase to be `discussion`; the driver sets it in `s.onTurn`.
- Intent routing (discuss / generate / edit) is decided by the model in production. The fake returns a
  fixed intent, so routing quality is not covered.
