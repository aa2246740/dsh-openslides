# Official iframe walk (no Kimi login)

**Host:** `http://127.0.0.1:55180/?project=yu7&view=official`  
**Child:** `https://www.kimi.com/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local`  
**Load:** parent Penpal `setPPTD` + `getImages` — **no account**.

Run: `npm run oracle:inventory`

## Idle chrome (shot `01-idle.png`)

Official neo-ppt after YU7 YAML is injected:

| Zone | Controls |
|------|----------|
| Title | `小米 YU7 · 豪华高性能纯电 SUV` + **V1** |
| Title right | **导出** · **分享** · play · fullscreen |
| Second bar left | grid (rail) · `1 / 8` · layout · undo · redo |
| Second bar right | `− 114% +` |
| Left rail | thumbs 01–08, selected blue; **+ 新建页面** |
| Insert pill | **编辑** (dark on) · **批注** · T · shape · image · table · sparkle · `···` |
| Under pill | drag handle |
| First-run | **批注模式** tip + **去试试** (because compare host now sends `annotation: true`) |

Also in official `body-text.txt`: **显示演讲者备注**.

### 批注 mode (`05-add-page.png` / `06-annot.png`)

Insert tools **hide**. Pill becomes: 编辑 · 批注 · `在页面上留下批注`.

### Text selected (`08-canvas-click.png`)

Dotted blue box, 8 handles, rotate handle. Ctx bar: comment · style `coverTitle` · `默认字体` · `86px` · color / highlight / B I U S · fx · align · list · opacity · layers.

导出 / 分享 exist but stay disabled in this sdkMode host (parent has no official export/share RPC yet). Native 导出 / 分享 stay local.

## Native alignment after the headed walk

- 形状 opens one library: tabs **形状 / 线条 / 图标**
- 表格 opens **选择规格** grid, then inserts
- 更多: **插入公式** / **查阅图表** / SmartArt
- 导出: **PPT / 图片** · **嵌入字体** · **下载**

## Native alignment this pass

- Mode label **批注** (was 评论)
- **编辑** selected = dark pill, white type
- **批注模式** tip on entering 批注
- Bottom **显示演讲者备注**
- Animation chrome is hidden (top clock, insert-bar clock, context-menu 淡入). Official idle bar has no clock; generate/edit does not need the timeline.

## Production

Do not ship this host. `kimiRuntime: false`.
