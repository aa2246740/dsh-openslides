# PPTD write

Slide `[960, 540]`. A page is `pageType` + `elements[]`. Each element: `elementId`, `elementType`, `bounds` `[x,y,w,h]`.

- text: `content.text` (+ `fontSize`, `bold`, `color`)
- shape: `shapeName` + `fill: { type: solid, color }`
- table: `columnWidths` + `rows[][]`
- chart: `data` + `series`
- image: only with an existing `media/` file

One `write_page` per page. YAML `notes` stay off the canvas. `role` + `bullets` is not the page model.

If the brief lists table columns, the header row must include every listed name (营收/环比/同比/毛利/库存天/退货率/渠道/负责人). Owner names stay in cells. Do not drop 负责人 to fit the grid — shrink fontSize (not below 11) and stay inside `[960,540]`.
