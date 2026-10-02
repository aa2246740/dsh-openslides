# Insert a shape or a line

`[data-control="insert.shape"]` opens `#shape-palette`. Driver id `insert-shape`
(`drivers/editing.mjs`).

## What a user does

- The gallery (`#shape-grid .shape-cell`) lists many shapes; `#shape-search` filters it.
- Clicking a cell inserts one `shape` element, closes the palette and selects the new element.
- The `#lib-tabs [data-lib="line"]` tab shows `#line-presets button`; clicking one inserts a `line`.

## What the driver proves

Gallery size, the search narrowing, one shape element appended on disk (`insert` command), palette
closed, new shape selected, and a line element from the line tab.

## Gotchas

- Search matches the English shape titles only. `圆` finds nothing; `arrow` does.
- Insert is a command: `waitForCommand(page, "insert")` before the click.
- New elements are appended to the current page; compare with the element count before.
