# Inspector and arrangement

The selected-object inspector `#property-panel` (X/Y/W/H, opacity, duplicate), dragging, multi-select
and delete. Driver id `inspector-arrange` (`drivers/editing.mjs`), three scratch decks.

## What a user does

- Select an element: the inspector titles itself (`#property-title`). Section
  `[data-inspector-section="position-arrange"]` holds `#ctx-bounds-0..3` (X, Y, 宽, 高). Width/height
  reject 0 with an inline error. Opacity is `input[data-control="element.opacity.set"]` (50 → `0.5`).
- Drag the element on the canvas to move it; size stays.
- Shift-click a second element: two are selected and the title says so. A blank-canvas click clears the
  selection and the inspector gives its space back (`.is-empty`, width 0).
- `[data-control="element.duplicate"]` adds one; the Delete key removes the selection.

## What the driver proves

All of the above on disk (bounds, opacity, element counts), not just in the DOM.

## Gotchas

- Each field sends only the number it changed. The command writes that number onto the bounds already
  saved, so a repaint between two edits cannot put an older value back. The driver proves it by committing
  Y and height in the same tick. Wait for the `setBounds` answer between ordinary edits.
- Moving or resizing can park an element under another, so pointer steps use a fresh deck.
- At 1440px with the AI panel open the inspector collapses to a strip; the driver uses 1600px and
  `ensureInspector`.
