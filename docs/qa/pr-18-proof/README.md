# PR 18 visual proof

LibreOffice Impress rasters of the exported yu7 PPTX (slide 1), plus generate-chrome viewport captures. These files exist so the PR can link `raw.githubusercontent.com` URLs. They are not the document model.

| File | What it shows |
| --- | --- |
| `yu7_export_slide1_before_black_overlay.png` | Pre-fix exporter: overlay collapsed to near-opaque black |
| `yu7_export_slide1_after_photo_visible.png` | This branch: coastal photo visible through `gradFill` |
| `chrome-overflow-before-editor.png` | Long generate brief stretches the document |
| `chrome-overflow-before-editor-viewport.png` | Same before state, viewport crop |
| `chrome-overflow-after-editor-viewport.png` | Collapsed brief chip; viewport stays 900px |
| `chrome-overflow-after-editor-chip-open.png` | Opened chip, source scrolls inside |
| `editor-chrome-long-input-stays-in-viewport.mp4` | Long input stays in viewport |
