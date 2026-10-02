# Insert a table

`[data-control="insert.table"]` opens `#table-size`; hovering a cell of `#table-size-grid` updates
`#table-size-label`; clicking inserts. Driver id `insert-table` (`drivers/editing.mjs`).

## What the driver proves

Hovering row 3, column 4 labels `3×4`; clicking writes a `table` element with 3 rows and 4 columns to
the page file and paints `#slide .el.table`.

## Gotchas

- Cells are addressed with `data-r` and `data-c` (1-based). The label uses `×`.
- Column widths live in `columnWidths`; row data under `rows`. Read the page file, not the canvas.
