# Speaker notes

`#btn-notes-link` opens `#notes-panel` with `#notes-text` for the current page; `#btn-notes-close`
closes it. Driver id `notes` (`drivers/editor-core.mjs`).

## What a user sees

- Typing saves into the **current page's** `.page` file (`setNotes` command) as `notes`. Other pages
  keep their own text; switching pages swaps the textarea content.
- Opening/closing the panel is a session command (`notes`), so wait for it like any other.
- A fresh tab reads the note from disk.

## What the driver proves

Marker in page 1's file and in no other page, page 2 empty, restored on return, panel closes, and a new
browser context shows the note after opening the panel.

## Gotchas

- Close is asynchronous: register `waitForCommand(page, "notes")` before clicking
  `#btn-notes-close`, or the next assertion sees the old state.
- The panel is hidden by default (`hidden` attribute), not by CSS class.
