# Insert an image

`[data-control="insert.image"]` opens the OS file chooser. Driver id `insert-image`
(`drivers/editing.mjs`).

## What the driver proves

Choosing a PNG/JPEG copies it into `media/`, appends an `image` element pointing at `media/…`, and paints
`#slide .el.image`. An `.svg` is refused: no extra element (the server answers 400, listed in
`ignoreErrors`).

## Gotchas

- Catch the chooser with `page.waitForEvent("filechooser")` before the click; the native picker is
  never opened, so this proves the upload path, not the OS dialog.
- Use an image from `fixtures/okp-yu7-ppt/media/`; nothing is downloaded.
