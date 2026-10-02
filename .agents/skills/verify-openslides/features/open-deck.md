# Open a deck in the editor

Load a PPTD project directory and see its pages rendered in the native canvas, the baseline every other
feature builds on. Driver id `open-deck` (`drivers/editor-core.mjs`).

## What a user sees

- `index.html?project=<abs dir>`: the title in `#doc-title`, one `#rail .thumb` per manifest page,
  `#page-count` reading `1 / N`, the first thumb active (`aria-current="page"`), the first page
  painted in `#slide .el[data-id]`.
- The project manifest is `<name>.pptd` (`yu7.pptd` for the fixture); pages are `pages/*.page`.

## What the driver proves

Title equals the manifest title, thumb count equals `pages.length`, counter `1/N`, active thumb, elements
painted, `/api/health` names the product, and opening writes **nothing** to the project (sha1 snapshot
before/after; `.versions/` and `_agent/` excluded).

## Gotchas

- `project` must be absolute and inside the repo or `os.tmpdir()`; anything else is refused
  (`__outside-workspace__`). On macOS `/tmp` literally is not `os.tmpdir()`.
- Wait for the cover: `#workspace-cover` hides only after the canvas size is stable. `openEditor()` in
  `lib.mjs` does this. Do not screenshot before.
- A session-bound URL (`session=`, `live=1`) pulls in the generation UI; use `&workspace=1` only when
  the AI panel is wanted.
- Thumbnails are `.thumb` rows in `#rail` without `img`/`canvas` children.
