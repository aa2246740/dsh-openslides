# Edit a text element

Double-click a text element to edit it in place, format it from the inspector, add a link. Driver id
`edit-text` (`drivers/editing.mjs`).

## What a user does

- Double-click the element: the node becomes `contenteditable` and focused. Type. Click blank canvas
  (`#viewport` at a corner) to **commit**; Escape **discards**. Enter inserts a newline.
- Select the element (single click) and use the inspector `#property-panel`: bold
  (`[data-control="element.text.toolbar.bold.toggle"]`), font size `#ctx-fontsize`, link
  (`[data-control="element.text.toolbar.link.set"]` → `#text-link-dialog`, `#text-link-input`,
  `#text-link-save`).
- `#btn-undo` reverts the last edit.

## What the driver proves

Commit writes the text into `pages/*.page` (polled), the canvas shows it; Escape does not touch disk or
canvas; bold and font size 31 change the element on disk; the link lands in the page file and undo removes
it; the committed text survives a reload; the element set is unchanged.

## Gotchas

- Use element ids from the fixture (`slogan`, `cover-en`): `#slide .el[data-id="slogan"]`.
- The inspector may be a 48px strip while the AI panel is open. `ensureInspector` waits for the panel and
  expands it. With nothing selected the panel is hidden with width 0.
- Blank-canvas click clears the selection; that is the commit gesture, not a bug.
- Disk writes lag the response: poll (`rec.until`) instead of reading once.
