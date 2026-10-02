# Page rail

The left rail lists pages. Driver id `page-rail` (`drivers/editor-core.mjs`).

## What a user does

- Click a thumb: page changes, `#page-count` updates, `.thumb.active` (`data-page-index`, 0-based) moves.
  There is no URL hash.
- `#btn-rail-add` appends an empty page (a new `.page` file, manifest entry, counter `N+1 / N+1`).
- Right-click a thumb: `#ctx-menu` offers 上移, 下移, 复制, 删除. 复制 inserts `<name>_copy…` right after the
  source; 下移 swaps neighbours in the manifest; 删除 removes the manifest entry.
- Drag a thumb more than ~6px to reorder (`reorderPage`).
- `#btn-rail-view` flips the persisted mode (`localStorage["oss.railView"]`); `#btn-rail` (in the
  toolbar, not in the rail) shows or hides the rail (`pageRail` command).

## What the driver proves

Each operation through the manifest on disk and the thumb count, not only the DOM: add, duplicate,
reorder, delete, drag-reorder, view mode, rail toggle.

## Gotchas

- Sync with `waitForCommand(page, "addPage" | "duplicatePage" | "reorderPage" | "deletePage" |
  "goToPage" | "pageRail")` registered before the click.
- Deleting a page leaves its `.page` file in `pages/` (only the manifest entry goes). Judge the deck by
  the manifest.
- The drag needs intermediate mouse moves; a single jump does not start a drag.
