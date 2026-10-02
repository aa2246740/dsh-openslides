# Undo / redo

Toolbar and keyboard history for canvas edits. Driver id `undo-redo` (`drivers/editor-core.mjs`).

## What a user sees

- `#btn-undo` and `#btn-redo` are icon buttons with the DOM `disabled` property when the stack is
  empty (not `aria-disabled`). Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes. There is no Ctrl+Y.
- Undo/redo are commands (`undo`, `redo`) and rewrite the `.page` file.
- History lives in the server session keyed by the tab id, so a same-tab reload keeps it; a new
  browser context starts empty.

## What the driver proves

Both buttons start disabled; an `insert` text edit adds one element on canvas and disk and enables
undo; undo removes it from canvas and disk and enables redo; redo restores it; the keyboard shortcuts do
the same after a click on blank canvas. Records whether undo is still enabled after a reload.

## Gotchas

- Press Escape after inserting text so the box leaves editing; otherwise the shortcut is swallowed by
  the text editor.
- Assert element content or count, not selection state (selection is not undoable).
- The icons are SVG-only; find them by id, not by text.
