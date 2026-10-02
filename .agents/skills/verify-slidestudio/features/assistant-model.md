# Model picker

`#assistant-model` in the composer chooses the model for the next message. Driver id `assistant-model`
(`drivers/assistant.mjs`).

## What a user does

- With no bound session the picker holds one neutral option, 当前模型.
- With a bound session the roster comes from the kernel: one `<optgroup>` per **ready** provider, one option
  per model (`value` = `provider/model`, for example `test/model-a`). The session's own model is
  preselected.
- Choosing a different model changes only the next message. The turn carries
  `modelSelection: {provider, model}`. Picking the session's own model sends no `modelSelection`.
- After the turn the session's model is the chosen one, so a reload shows it selected.

## What the driver proves

- No session: the first option is 当前模型.
- Bound session: options are exactly `test/model-a`, `test/model-b`, `model-a` preselected.
- Selecting `model-b` and sending posts `modelSelection` equal to `{provider:"test",model:"model-b"}`.
- After reload the picker reads `test/model-b` (the fake session records the switch in `s.onTurn`).

## Gotchas

- The roster is painted once per page (`select.dataset.loaded`) and only when the session reports its
  provider; a page without a session never loads it.
- The model list comes from the stubbed kernel roster. A real provider's models, keys and OAuth state are
  covered only by `hub-settings.md` at the UI level.
