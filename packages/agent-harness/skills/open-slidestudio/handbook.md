# Handbook pages

For travel, report, decision, promo, academic. Not the classroom six-type lock.

Each body page is title + one exhibit + support.

- **Cover:** place or period as the title; one promise line; optional scene shape or image if a file exists.
- **Day / area / cluster:** one region or one day. A map-like path, a table, or a short sequence — not five equal text columns.
- **Evidence:** a table or chart when numbers exist; 占位 when they do not. A 月报 with no company name and no numbers is a refuse — do not write pages or invent a 示意 company. A metric marked 缺失/待补 must appear by name with 「缺失，待补」. If the brief lists table columns, every column (including 负责人) and listed owner names must be in the table.
- **Numeric fidelity:** in a structured `【第N页】` brief, every locked amount, percentage, percentage-point value, rate, duration, and count belongs to that same page. Keep its numeric value exactly. Do not turn `7.9%` into words, round `105.4%` to `105%`, or omit a component because another number from the page is present. Chart and table cells count; hidden notes do not.
- **Chart contract:** supported editable types are `bar`/`column`, `line`, `area`, `pie`, `waterfall`, and `scatter`. Never name an unsupported type and expect a bar fallback. `scatter` must encode two distinct numeric columns as `series[0].encode.x/y`; the remaining column is the point label. `waterfall` must encode category/value columns as `x/y`; first and last rows are totals, signed middle rows are changes, and an optional `encode.isTotal` column marks additional totals. A `chart:combo` must contain at least two series types and mark at least one series `axis: secondary`; put its right-axis title in `chart.axis.secondaryY`. Every other chart must choose explicit `#RRGGBB` swatches. Use `series[i].fill` or `colors[i]` for each series. For `pie`, set top-level `colors` to one swatch per `data.rows` entry. A lone `series.fill` cannot color separate slices. Render and inspect the actual geometry, not the type string.
- **Exhibit contract:** every `write_todo` item declares `exhibits`. The declared list is additive with visual requirements inferred from the corresponding page section in the brief. Implement each requested chart as that chart type and each table as a table element. Mark editable diagram contributors with bare roles: `funnel`, `gauge`, `pyramid`, `matrix`, or `timeline`. Do not put the `diagram:` prefix in `exhibitRole`. KPI and comparison shapes use `kpi-card` and `comparison-card`. A prose summary, a diagram name in an element id, or one unrelated chart does not satisfy the contract.
- **Close:** what to do next (pack list, next ask, decision).

Travel: group days if seven equal day-columns would crush type. Food, sites, and transit are exhibits, not a wall of bullets.

Use the exact design and PPTD source chunks returned by `read_reference`. `read_playbook` is not a production tool.
