# Export the deck as editable PPTX

`#btn-export` opens `#export-dialog`; 下载 (`#export-download`) posts to `/api/export` and the browser
saves a `.pptx` that unzips to real slide XML. Driver id `export-pptx` (`drivers/review.mjs`).

## What a user sees

- `#export-pptx` is the default format (`.on`). `#export-scope` says 全部 N 页, editable. The chosen format
  persists. Choosing a format never downloads; only 下载 does.
- `#export-result` names the file, page count and size. A failure shows `#export-error` with
  `#export-error-text` and `#export-retry`.

## What the driver proves

The download is `*.pptx` named after the deck, the result line matches it (8 页, KB/MB), the archive holds 8
`ppt/slides/slideN.xml`, slide 1 carries real `<a:t>` text runs (not one raster picture), the blob URL
is revoked no sooner than ~2s after the click, exporting does not change the deck, a forced 500
(`route.fulfill` on `/api/export`) shows the reason and a retry that succeeds once the fault clears.

## Gotchas

- Text runs are `<a:t>` (DrawingML), not `<p:t>`.
- `#export-embed-fonts` only applies to PPTX; Office/WPS faces read as built-in.
- Install the `URL.revokeObjectURL` hook with `addInitScript` before `goto`.
- The forced failure logs a 500 to the console; the feature lists it in `ignoreErrors`.
