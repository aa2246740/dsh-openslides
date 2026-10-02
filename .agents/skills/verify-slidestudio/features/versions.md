# Version history

`#btn-versions` opens `#version-menu`. Versions are directory snapshots under `.versions/`. Driver id
`versions` (`drivers/review.mjs`).

## What a user does

- The **first edit** of a deck creates the V1 baseline (`baseline:original` in `.versions/manifest.json`).
- `#version-save` (手动快照) adds a version. Clicking `[data-version-id]` previews it read-only:
  `#history-bar` shows `#history-readonly` (只读, the version label), the canvas shows that version,
  undo/redo are disabled. `#history-back` leaves the preview; `#history-restore` rewrites the live deck
  and leaves 恢复前 and 从 v1 恢复 snapshots.

## What the driver proves

A scratch deck has no `.versions/` until the first edit; the V1 baseline is created by an `insert`; the
menu lists V1; a manual snapshot adds a version on disk; preview shows the baseline element count and
disables undo/redo; 返回 keeps the edited deck; 恢复 restores the baseline element count with the two
snapshot labels.

## Gotchas

- Copy the fixture without its own `.versions/` (git-ignored leftover of a live editor);
  `ctx.deck()` already does.
- `manifest.json` may be an array or `{ versions: […] }`; the driver accepts both.
- Preview URL state is not in the address bar; wait for `#history-bar`.
