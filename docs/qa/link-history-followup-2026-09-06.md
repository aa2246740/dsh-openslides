# 链接与撤销图标：用户反馈补验

用户在1375×944的13080编辑器指出链接无响应、撤销/重做图标难辨。

## 已定位

- root在用户当前IAB页点击“链接”，没有出现输入界面；未修改用户页面。
- 旧实现 `promptTextLink` 使用 `window.prompt`，取消/不可用返回后直接退出，没有页内替代或错误反馈。
- 旧 `editor-office-acceptance.mjs` 用 `page.once("dialog", dialog.accept(...))`，证明了标准headless浏览器弹窗路径，未证明IAB中的实际入口可用。
- 旧撤销/重做SVG弧线超出可读图形范围，用户看到零散短弧；功能执行与图形辨识必须分开验收。

## 修复验收要求

- 页内链接编辑框：明确作用于整个文本框，保存/更改/移除/取消/打开当前链接。
- 非法scheme不写入，保留输入并显示明确错误。
- 链接按钮与CmdK共用，Enter保存、Escape取消，正确恢复焦点；富文本内容不丢失。
- undo/redo以清楚左右箭头显示，并核对链接属性实际撤销与恢复。
- 保存后读取.page并重载，实际IAB验收与源码回归分别记录。

## 最终验收

- 18:15同步三个静态文件，18:18补上Escape焦点恢复 app.js；最终3文件哈希一致，无需重启。
- root在13080原生IAB独立测试稿实测：按钮/快捷键打开、非法输入保留、Escape取消、Enter保存、磁盘href、撤销/重做/重载、修改、移除、已有链接显式anchor及新图标。
- 独立focused回归2/2 PASS，0 browser errors；跨span文字选区0..6在取消和保存后恢复，text/runs及磁盘rich text不丢。证据 `output/qa-editor-correction-link-ui/report.json`。
- native-web 68/68；旧Office链接测试改用实际DOM dialog，不再模拟原生prompt。
- root原生记录 `output/agent-first-audit/link-native-acceptance.json`。本轮测试写入独立native-final-correction稿；用户页18:08的并发变化保留，未回滚用户文稿。
