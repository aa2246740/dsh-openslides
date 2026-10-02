# Edit a chart

Charts come from the agent; there is **no** `insert.chart` button. A selected chart shows chart tools in
the context bar. Driver id `chart-edit` (`drivers/editing.mjs`).

## What a user does

- Select the chart: `#ctx-bar` shows `#pop-chart-type` (type popover) and
  `[data-control="element.chart.data.set"]`.
- Type popover → 折线 turns a bar chart into a line chart.
- The data button opens `#chart-overlay` with an editable grid `#chart-grid`: rename a series header,
  `+ 行` adds a row, cells take numbers; a non-numeric value gets `.is-invalid` and is not saved.
- Clicking the slide closes the overlay.

## What the driver proves

The absence of `insert.chart`, seeding a chart through the command path (`POST /api/command
{cmd:"insert",kind:"chart"}`, then reload), type switch repaints with a `<polyline>` and persists,
renamed series and new row `D=7` land on disk, invalid input is flagged.

## Gotchas

- Seed the chart through the command endpoint, then reload; the toolbar cannot create one.
- Closing the overlay: dispatch a `pointerdown` on `#slide`; a plain click can land on the chart.
- The overlay writes on `change`, so dispatch `change` after `fill`.
