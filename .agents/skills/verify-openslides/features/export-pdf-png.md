# Export PDF and PNG

Same dialog as `export-pptx.md`, formats `#export-pdf` and `#export-png`. Driver id `export-pdf-png`
(`drivers/review.mjs`).

## What a user sees

- PDF: all pages, an image-based version; the scope says 全部 8 页 … PDF and the font-embedding option
  is hidden.
- PNG: the current page; the scope says 当前第 3 页 when the tab is on page 3.

## What the driver proves

The PDF starts with `%PDF-`, ends with `%%EOF`, has 8 pages and a `.pdf` name; the PNG has the PNG
signature and is named `…-p3.png` when the tab is on page 3 (the export request carries the tab id, so
the server renders that tab's page, not the default session's).

## Gotchas

- PDF/PNG rasterise on the server: about 13 s for both together in a full run. The driver waits up to
  2 minutes per download before giving up.
- Read the page number from the file name (`-pN.png`), not from the dialog.
