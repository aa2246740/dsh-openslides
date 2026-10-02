# Settings

`#btn-settings` swaps `#home-screen` for `#settings-screen`. The nav shows three panes chosen by
`[data-settings-pane]`: 模型 (`#pane-models`), 订阅登录 (`#pane-oauth`), 外观 (`#pane-appearance`).
工具 (`#pane-tools`) stays in the DOM but its nav button is `hidden`: custom image tools are marked
"以后开发" by `.settings-later` at the bottom of the models pane. Driver id `hub-settings`
(`drivers/hub.mjs`). The Hub picker is a floating listbox `#pi-model` whose option buttons carry
`data-model-key="providerId/modelId"`; login belongs to Settings. Driver id `hub-create`.

## What the driver proves (providers and tool settings stubbed in the page, no real kernel or key)

- Each tab shows exactly one pane; back returns to the Hub.
- 模型: rows with a ready dot; + 添加提供方 lists unused presets; adding one opens its key field; 保存 posts
  the key to that provider only; the key is not in the page text or any input afterwards; a custom
  provider form (`#custom-*`) adds a row tagged 自定义; 删除 removes a user-added provider
  (`DELETE /slides/providers/:id`) but only the stored key of a built-in one (`…/key`).
- 订阅登录: 未登录 → 账号登录 → a code challenge input → 继续 → 已登录.
- 工具: the nav is asserted hidden. The driver opens the retained pane programmatically only
  to verify its existing endpoint contract: save PUTs both endpoints, clears the key field and
  says 已保存; clearing a URL switches that service off. This is not a public navigation path.
- 外观: two radios (暖调, 水墨 · OOPS). Choosing one sets `html[data-theme]` and `localStorage["oss.theme"]`
  (`warm` removes both); a reload applies it before first paint (`theme-boot.js`); the editor opens in
  the same theme.

## Gotchas

- Keys used are fake (`sk-verify-NOT-A-REAL-KEY-0000`); assert only that they are absent.
- The OAuth pane's real login opens a browser window and polls; the driver only covers the code
  challenge path.
- Theme is per browser (`localStorage`), so each scratch browser context starts in 暖调.
