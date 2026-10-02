# Context menu

Right-click on an element or on blank canvas opens `#ctx-menu`. Driver id `context-menu`
(`drivers/editing.mjs`).

## What the driver proves

- Element menu offers 剪切, 复制, 粘贴, 复制副本, 置于顶层, 编组, 锁定, 删除; 复制副本 adds one element on disk
  and closes the menu.
- Blank-canvas menu is 粘贴 only; Escape closes it.

## Gotchas

- The fixture's pages carry a full-page shape, so a right-click "on the blank canvas" lands on that
  shape. The blank-canvas case uses the empty fixture `syn-empty` (`ctx.deck(name, "syn-empty")`).
- The page rail's thumbnail menu is the same `#ctx-menu` element with other entries (`page-rail.md`).
