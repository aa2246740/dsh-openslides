# 编辑画布控件与命令盘点

日期：2026-09-06
范围：`apps/native-web/public/index.html`、`app.js`、`tooltips.js`，并与 `apps/native-web/src/server.mjs` 的 `ORACLE_CONTROLS`、`docs/editor-oracle/rows/**/row.json` 和现有 QA 脚本交叉核对。本文先做源码盘点，再由独立随机端口上的 disposable project 验证；没有操作当前 13080 实例，也没有把源码或 headless 结果等同于当前运行实例的原生视觉验收。

本轮自动化证据：`editor-canvas-controls.mjs` 通过 1,428 条属性/命令/持久化断言，其中 177 个形状的 289 个 adjustment handle 均实际改值一次并核对请求、返回模型和 scratch `.page` 文件；`editor-canvas-palettes.mjs` 通过 339 条数据驱动断言（36 个表格规格、177 个形状、96 个实心图标及搜索/分类）；`editor-office-acceptance.mjs` 完整流程通过 15 个步骤、102 个 control id；`editor-remaining-boundaries.mjs` 的 5 个持久化/导出/图片边界场景通过；`editor-ui-shell-chrome.mjs` 的真实 pinned Chromium 全屏与快捷键开关通过。上述套件均使用独立 disposable project，均为 0 browser error。

## 1. 状态和权限规则

- 正常编辑会话由服务端把 105 个 `ORACLE_CONTROLS` 放入 `model.allowedControlIds`。静态和动态控件只要有 `data-control`，都会在 `renderChrome()` 中按 `allowed(id)` 统一禁用；撤销、重做还分别受 `model.canUndo`、`model.canRedo` 限制。
- 历史版本预览只保留“打开历史版本、预览版本、还原版本”三个 control 可用；其余有 `data-control` 的控件统一禁用。`command()` 在 `previewVersion` 存在时也直接返回。
- AI 正在审阅或带 `live=1&session=...` 的生成仍在进行时，导航、页面栏、播放、选择、缩放可继续；其他命令由 `command()` 拦截并显示提示。按钮本身不一定呈禁用态，因此验收必须同时检查“视觉禁用”和“点击后是否执行”。
- 单选上下文栏每次刷新会先 `bar.innerHTML = ""`，再按元素类型重建，并尝试按旧 `id`、`data-control` 恢复展开菜单和焦点。现已用 24 次跨类型重建与真实指针“表格 → 图表 → 表格”验证身份；焦点同 control 多实例仍是需长期保留的边界。
- Oracle 行路径可由 control id 直接换算，例如 `element.table.cell.fill.set` 对应 `docs/editor-oracle/rows/element/table/cell/fill/set/row.json`。最新静态审计结果为 UI 95 个 control id、服务端白名单 105 个、死按钮 0 个；10 个仅通过键盘、画布或服务端触发。

## 2. 无选中时的主界面

| 区域 | 主项 / 二级项 | Oracle / 实际行为 | 可用与禁用 | 现有证据与缺口 |
|---|---|---|---|---|
| 标题栏 | 文档标题 | 链接回 `./` 创建页；无 control id | 始终是普通链接 | 缺少防误触、带 project 参数返回语义测试 |
| 标题栏 | 历史版本 / 保存当前为新版本 | `chrome.history.versions.open` / `.snapshot`；拉取版本、创建快照 | oracle 控制；历史预览仍允许打开菜单 | `editor-office-acceptance` 覆盖打开、快照、预览、返回、还原；缺空版本和请求失败菜单态 |
| 标题栏 | 导出 | `chrome.export.open`，打开导出弹窗 | oracle 控制 | 已覆盖打开、真实 PPTX/PNG 下载、失败重试；见下方二级项 |
| 标题栏 | 分享 / 复制 / 关闭 | 打开本地分享对话框；复制当前 `index.html?project=...` URL | `#btn-share` 无 control id，但历史预览显式禁用；复制无 oracle | `editor-ui-shell-chrome` 与 office 套件覆盖；缺剪贴板拒绝反馈 |
| 标题栏 | 播放 | `chrome.present.play` -> `present` | oracle 控制；生成期属于 liveSafe | office 套件覆盖进入、翻页、Esc 退出 |
| 标题栏 | 全屏 | `chrome.present.fullscreen` -> `requestFullscreen()` | oracle 控制 | `editor-ui-shell-chrome` 已在 pinned Chromium 真实进入/退出 fullscreen 并确认 chrome 状态保持；macOS 原生入口另由根任务验收通过 |
| 顶部栏 | 页面预览模式 | `#btn-rail-view` 在缩略图/列表间切换 | 无 control id；历史预览显式禁用 | `editor-ui-shell-chrome` 覆盖两次切换，并验证列表模式写入 localStorage、重载保持及切回缩略图 |
| 顶部栏 | 收起/展开页面栏 | `chrome.pages.rail.toggle` -> `pageRail` | oracle 控制 | office 与 shell chrome 覆盖 |
| 顶部栏 | 撤销 / 重做 | `chrome.history.undo` / `.redo` -> `undo` / `redo` | oracle + `canUndo/canRedo`；历史预览禁用 | office 覆盖普通命令；表格边界另有持久化测试；缺每类菜单命令逐一 undo/redo |
| 顶部栏 | 缩小 / 适应画布 / 放大 | `chrome.zoom.out` / `.percent` / `.in` -> `zoom` | oracle 控制，生成期可用 | office 覆盖三项；缺最小/最大边界和 tooltip 文案 |
| 页面栏 | 页面按钮 | `chrome.pages.navigate` -> `goToPage` | 正常可用；历史预览在只读快照内本地导航 | office 覆盖正常与历史版本页间导航 |
| 页面栏 | 拖动排序 | `chrome.pages.reorder` -> `reorderPage` | 首尾位置和历史预览限制 | office 覆盖一次拖动；缺跨长列表滚动排序 |
| 页面栏右键 | 上移、下移、复制、删除 | `.reorder` / `.duplicate` / `.delete` -> 对应页面命令 | 首页上移、末页下移、仅一页删除禁用；历史预览不开菜单 | office 覆盖复制、排序、删除；缺四项逐态 disabled 断言 |
| 页面栏 | 新建页面 | `chrome.pages.add` -> `addPage` | 历史预览禁用 | office 覆盖 |
| 全局侧栏 | 批注 | `#btn-comments` / `chrome.comment.pin`，打开目标和范围明确的批注侧栏 | oracle 控制；历史预览禁用 | 唯一入口、目标文案、保存/删除和关闭后属性面板恢复均覆盖 |
| 顶部插入 | 文本 | `insert.text` -> `insert {kind:text}` | oracle 控制 | office、toolbar 覆盖 |
| 顶部插入 | 形状 | `insert.shape` -> 打开形状库 | oracle 控制 | 177 个可见 tile 逐项验证命令、返回模型、磁盘 PPTD 与撤销 |
| 顶部插入 | 图片 | `insert.image` -> 文件选择 -> `insert {kind:image}` | oracle 控制 | 覆盖空选择、损坏文件、有效上传；超大文件仍待测 |
| 顶部插入 | 表格 | `insert.table` -> 6×6 规格选择器 | oracle 控制；每格同一 control | 36 个规格逐项验证 hover 标签、最终行列数和磁盘 PPTD；键盘可达性仍待原生验收 |
| 顶部插入 | 图表 | `insert.chart` -> `insert {kind:chart}` | oracle 控制 | office、toolbar 覆盖，并确认“更多”里没有第二个图表入口 |
| 标题栏 | AI | `chrome.workspace.toggle` -> 展开工作区 | oracle 控制 | office、toolbar 覆盖开关；见 AI 二级项 |
| 顶部插入 | 更多 | `insert.more`，打开菜单 | oracle 控制 | office 覆盖打开；缺 aria-expanded 全路径 |
| 底部 | 显示/隐藏演讲者备注 | `chrome.notes.toggle` -> `notes {open}` | oracle 控制；历史预览内容只读 | office、shell 覆盖开关和持久化；缺保存失败视觉态 |
| 画布右键（空白） | 粘贴 / 设置背景色 | `element.duplicate` -> `pasteClipboard`；`theme.background.set` -> `setBackground` | 各自 oracle 控制 | human audit 覆盖粘贴；背景色右键入口缺测试 |

## 3. 插入菜单的全部二级项

| 入口 | 二级项 | 实际命令 | 现有测试 |
|---|---|---|---|
| 形状库 | 形状 tab；搜索；全部与各 shape group；最多显示 177 个形状 | `insert {kind:"shape", shapeName}` | 搜索、所有分类、空结果和 177 个 tile 全部数据驱动覆盖 |
| 形状库 | 线条 tab：直线、箭头、双箭头 | 先 `insert {kind:"line"}`，再 `setLineArrow`，分别 `[null,null]`、`[null,"arrow"]`、`["arrow","arrow"]` | 三个 preset 均逐项核对命令序列与最终模型；第二个命令失败时的部分插入处理仍待测 |
| 形状库 | 图标 tab；实心、线框、品牌；全部、常用、箭头、文件、商务；搜索；最多 96 个结果 | 未选图标时 `insert {kind:"icon",iconName}`；已选图标时 `setIconName` | 三风格、五分类、搜索/空结果覆盖；当前实心 all surface 的 96 个 tile 逐项验证 exact `iconName` 和持久化 |
| 表格 | 1×1 至 6×6 | 先插入默认 2×2，再按目标规格删/补行列 | 36 个规格全部验证最终模型和磁盘行列数；串行中途失败回滚仍未覆盖 |
| 更多 | 主题色 / 页背景 | 清空选区并展示主题工具条 | office 覆盖主题色和纯色背景 | 见主题工具条 |
| 更多 | 插入公式 | 复用 `insert.text`，随后 `setText` 为 `𝑓(x) = ` | toolbar、office 覆盖；没有独立 oracle，权限和普通文本完全绑定 |
| 更多 | SmartArt：流程、循环、层级 | `insert.smartart` -> 插入 3 节点与连接线布局 | 三种布局均从菜单直接插入并核对至少 3 个可编辑节点/连接对象；已插入后的三种布局切换也覆盖 |

主题工具条仅在无选中且 `themeBarOpen` 时出现：最多 12 个主题色输入分别执行 `setThemeColor {key,color}`；页面纯色执行 `setBackground {color}`；两个渐变端点的任一个 `change` 都会立即提交完整线性渐变，另有“页渐变”按钮重复提交同一命令；“快捷键”打开本地帮助面板。当前 fixture 的 8 个主题 swatch、纯色、两个渐变端点和提交按钮均已真实执行并核对模型；快捷键按钮及 `?` 打开、Esc 关闭均已覆盖。12 色上限截断因 fixture 只有 8 色，仍未构造专项数据。

## 4. 选择状态总矩阵

“通用单选”指：对齐、不透明度、图层、更多。批注已移到全局侧栏；图表现在也具备对象对齐和不透明度。

| 选择状态 | 类型专用主项 | 通用主项 | 明确缺口 |
|---|---|---|---|
| 无选中 | 无；主题模式时为主题色/背景/快捷键 | 无上下文栏 | 应断言上下文栏隐藏，主题栏打开时不残留旧选择菜单 |
| 文本 | 字体/字号、文字颜色、文本对齐、项目符号、编号、链接、自动换行 | 对齐、不透明度、图层、更多 | 七种水平/垂直对齐及全部主命令已执行；编辑选区边界仍需专项 |
| 形状 | 调整/形状、填充、描边 | 对齐、不透明度、图层、更多 | 177 个 kind、289 个 adjustment、8 个主题 swatch、纯色/两个渐变端及提交、边框宽度/无边框均执行 |
| 图标 | 图标（颜色、名称） | 对齐、不透明度、图层、更多 | 上下文“图标”使用独立 `ICO.icon`；行为验收覆盖颜色、名称和跨类型菜单身份 |
| 图片 | 裁切（或完成/重置）、裁切/遮罩、图片 | 对齐、不透明度、图层、更多 | 五种遮罩、三种 fit 和替换/重建主路径已测；FileChooser 空选择已证明取消替换不改 `src`，原生 macOS 文件面板取消仍由原生验收承担 |
| 线条 | 线条 | 对齐、不透明度、图层、更多 | 三线型、起点与终点各五种箭头、三曲线、标签和控制点均覆盖 |
| 表格 | 表格 | 对齐、不透明度、图层、更多 | 内容、行列、填充、三种对齐、合并、按钮身份和最小删除 disabled 已覆盖 |
| 图表 | 编辑数据、图表类型、系列色、坐标轴、标题、数据标签、图例 | 对齐、不透明度、图层、更多 | 覆盖四类型、系列色、三轴、标题、标签、图例、对象对齐和 81% 不透明度；数据列删到仅一系列后按钮消失，数据行删到 0 后可再添加一行；pie 系列命名仍待测 |
| SmartArt 所属元素 | 加节点、删节点、SmartArt 布局，之后仍叠加其基础类型专用项 | 对齐、不透明度、图层、更多 | office 覆盖三项；缺 owner/node/connector 各自选中时菜单是否合理 |
| 多选（2 个或以上） | 对齐、分布、编组；立即 return，不出现各类型专用项 | 更多（简化版） | 3 对象的六对齐、两分布、组/解组已测；2 选分布与混合 locked/hidden 状态仍待测 |

## 5. 单选类型的每个二级项

### 5.1 文本

| 主项 | 二级项 / 值 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 字体 / 字号 | B、I、U | bold/italic/underline -> `setTextRangeStyle` 或 `setTextStyle` | office 覆盖三项 |
| 字体 / 字号 | 字号数字 | `element.text.toolbar.fontsize.set` -> `setTextStyle {fontSize}` | 覆盖 |
| 字体 / 字号 | 字体：中文 12、西文 11、中西文 4 个预置 | `.fontfamily.set` -> `setTextStyle {fontFamily}` | 27 个预置逐项执行并核对返回模型；字体文件加载和 fallback 视觉仍待原生/渲染专项 |
| 字体 / 字号 | 行距 1/1.2/1.5/1.8/2 | `.lineheight.set` -> `setTextStyle {lineHeight}` | 5 项逐一执行并核对返回模型 |
| 字体 / 字号 | 字距数字 | `.letterspacing.set` -> `setTextStyle {letterSpacing}` | 覆盖 |
| 字体 / 字号 | 高亮色 | `.highlight.set` -> `setTextStyle {backgroundColor}` | 覆盖 |
| 文字颜色 | color input | `.color.set` -> range style 或整体 style | 覆盖；缺编辑选区保持/失焦边界 |
| 文本对齐 | 左、居中、右、两端 | `.align.set` -> `setTextStyle {align:[horizontal,currentVertical]}` | 四项逐一执行并核对返回值 |
| 文本对齐 | 顶部、垂直居中、底部 | 同上，保留当前 horizontal | 三项逐一执行并核对返回值 |
| 项目符号 / 编号 | toggle bullet/number/null | `.list.set` -> `setTextStyle` | 两项均执行过；缺互斥与再次关闭持久化 |
| 链接 | `window.prompt` 输入 URL，空值清除 | `.link.set` -> `setTextStyle {href}` | office 覆盖添加；缺取消、清除、非法 URL |
| 自动换行 | toggle `wrap` | `.wrap.set` -> `setTextStyle` | toolbar 与 office 覆盖开关、tooltip |

### 5.2 形状、图标、线条

| 类型 / 主项 | 二级项 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 形状：调整 / 形状 | catalog 中全部 shapeName；存在 defaults 时每个 adjustment range | `.kind.set` -> `setShape`；`.adjust.set` -> `setAdjustments` | 177 个 shapeName 全部执行；289 个 handle 全部核对数量、范围、标签，并逐个实际改值，验证请求、返回模型和 scratch `.page` 文件对应索引 |
| 形状：填充 | 主题色 swatches、纯色、渐变起、渐变止、“渐变” | `.fill.set` -> `setFill {color}` 或 gradient fill | 当前 8 个主题 swatch、纯色、两个端点 `change` 和渐变按钮全部真实执行 |
| 形状：描边 | 无边框、描边色、宽度 | `.border.set` -> `setBorder` | 宽度和无边框逐项覆盖；颜色由 Office 流程覆盖 |
| 图标：图标 | 颜色、20 个 fallback 名称（有 catalog 时仍只列 fallback） | `.color.set` -> `setFill {icon:true}`；`.name.set` -> `setIconName` | 两项代表值覆盖；主按钮图标错误风险未测 |
| 线条：线条 | 标签、颜色、宽度、实线/虚线/点线 | label/border controls -> `setLineLabel` / `setBorder` | 三线型逐项执行；标签、色、宽由两套流程覆盖 |
| 线条：线条 | 起点与终点：无、三角、燕尾、菱、圆 | `.arrow.set` -> `setLineArrow {[start,end]}` | 起点与终点各五项逐一执行并核对返回模型 |
| 线条：线条 | 折角、圆角、平滑 | `.curve.set` -> `setLineCurve` | 三项逐一执行；控制点拖动另覆盖 `.points.set` |

### 5.3 图片

| 主项 | 二级项 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 直接按钮 | 裁切；裁切中变为完成、重置 | `.crop.set` -> 进入本地裁切态 / `setImageCrop` | office 覆盖裁切、拖 handle、完成；直接“重置”缺失 |
| 裁切 / 遮罩 | 裁切或完成、重置裁切 | `.crop.set` | 主路径覆盖；菜单内完成/重置缺逐项 |
| 裁切 / 遮罩 | 矩形、椭圆、圆角矩形、菱形、六边形 | `.mask.set` -> `setImageCropShape` | 五项逐一执行并核对返回模型 |
| 图片 | 替换 | `.replace` -> 文件选择 -> `setImageSrc` | 覆盖空选择取消时 `src` 不变、有效替换持久化；损坏文件插入会拒绝并给中文提示，替换损坏文件仍待专项 |
| 图片 | 重建 | `.rebuild` -> prompt -> `rebuildImage` | 覆盖无模型 fallback 的可编辑拆解；真实多模态分支不在画布控件测试范围 |
| 图片 | 裁切铺满、完整显示、拉伸填满 | `.fit.set` -> `setImageFit cover/contain/fill` | 三种均执行过 |

### 5.4 表格

| 二级项 | Oracle / 实际命令 | 可用边界 | 覆盖 |
|---|---|---|---|
| +行 / -行 | `element.table.row.add/delete` -> `tableRow {op,row}` | 一行时删除按钮 disabled，并有 title/aria-label 原因 | 增删和最小 disabled 覆盖 |
| +列 / -列 | `.col.add/delete` -> `tableCol {op,col}` | 一列时删除按钮 disabled，并有 title/aria-label 原因 | 增删和最小 disabled 覆盖 |
| 合并 | `.merge` -> `tableMerge {r1,c1,r2,c2}` | 单格时 disabled，并带 title/aria-label 原因；矩形范围交由底层验证 | 两格横向合并和单格 disabled 覆盖；纵向、矩形和已有 merge 冲突仍待测 |
| 单元格底色 | `.cell.fill.set` -> `tableFill {row,col,color}` | 当前 cell 坐标来自 `tableCell` | 覆盖成功；缺切换单元格后颜色值同步 |
| 左齐 / 居中 / 右齐 | `.cell.align.set` -> `setTableAlign {align:[left|center|right,"middle"]}` | 固定垂直居中，无垂直选项 | 三项逐一执行并核对返回模型 |

表格身份专项结论：当前源码在 `renderCtxBar()` 中创建 `#pop-table`，标题“表格”，图标 `ICO.table`，control 为 `element.table.row.add`；随后创建独立的 `#pop-opacity`，标题“不透明度”，图标 `ICO.opacity`，control 为 `element.opacity.set`。`editor-canvas-controls.mjs` 已执行 24 次 text/shape/image/table/chart 往返，并在 2 秒语义上限内执行非重叠对象的真实指针“表格 → 图表 → 表格”，同时核对 `.selected`、`#pop-table`、图表数据入口和不透明度，没有出现按钮身份串位。

### 5.5 图表

| 主项 | 二级项 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 编辑数据 | 可横向滚动表格、粘贴 Excel/表格、关闭 | `.data.set` -> `setChartData` | toolbar/office 覆盖打开、宽表滚动、非法数值、实时更新；列删除到仅一系列、行删除到零及再添加一行均覆盖；关闭按钮键盘焦点恢复仍待测 |
| 图表类型 | 柱状、折线、面积、饼图 | `.type.set` -> `setChartType bar/line/area/pie` | office 四种都切换；toolbar 覆盖 bar/line |
| 系列色 | 每个系列一个 color；饼图以每行第一列作系列名 | `.series.color.set` -> `setChartSeriesFill {index,color}` | 覆盖一个颜色；缺多系列、饼图、输入预览失败回滚 |
| 坐标轴 | X、Y、次 Y | `.axis.set` -> `setChartAxis {axis}` | X、Y、次 Y 均执行并核对返回模型 |
| 标题 | 文本输入 | `.title.set` -> `setChartTitle` | 覆盖 |
| 数据标签 | 显示/隐藏 toggle | `.labels.set` -> `setChartLabels` | 覆盖状态、aria-pressed、动作 tooltip |
| 图例 | 显示/隐藏 toggle | `.legend.set` -> `setChartLegend` | 覆盖关闭再打开、动作 tooltip |

### 5.6 多选

| 主项 | 二级项 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 对齐 | 左齐、水平居中、右齐、上齐、垂直居中、下齐 | `.align.set` -> `align {edge}` | 六项逐一执行并核对命令参数 |
| 分布 | 横向、纵向 | `.distribute.set` -> `distribute {axis:h|v}` | 两项逐一执行；2 个对象显示分布仍待产品语义确认 |
| 编组 | 无二级项 | `.group.set` -> `group` | 覆盖 |
| 更多 | 上移一层、下移一层、置顶、置底、编组、解组、锁定、隐藏、复制、删除 | 与通用命令一致 | 只从多选菜单执行了解组；其余多选语义缺失 |

## 6. 所有单选的通用菜单

所有可编辑单选对象（含图表）显示“对齐”和“不透明度”。单选“对齐”源码只在选中数至少 3 时追加分布，因此这里实际只有 6 个对齐项。

| 主项 | 二级项 | Oracle / 命令 | 覆盖 |
|---|---|---|---|
| 批注 | 全局唯一入口 `#btn-comments` | `chrome.comment.pin` -> 批注侧栏 | 选中表格时目标显示“范围：第 N 页 · 表格”；上下文栏不再重复入口 |
| 对齐 | 左、水平中、右、上、垂直中、下 | `.align.set` -> `align {edge}` | 单选/多选的六项均逐一执行；图表另实测左齐 |
| 不透明度 | 0–100 range | `.opacity.set` -> `setOpacity {opacity:0..1}` | shape 覆盖 92%；表格/图片/文本/线条/图标各类型显示与持久化未测 |
| 图层 | 上移一层、下移一层、置顶、置底 | `.arrange.forward/backward` -> `arrange` | shape 四项均执行；边界层级 disabled 不在前端表达 |
| 更多 | 阴影 | `.shadow.set` -> `setShadow`，有则清除，无则写默认阴影 | shape 覆盖开；缺再次关闭与不支持类型语义 |
| 更多 | 水平翻转、垂直翻转 | `.arrange.flip.set` -> `flip h/v` | shape 两项覆盖 |
| 更多 | 旋转角度 | `.rotate.set` -> `setRotation` | shape 覆盖 |
| 更多 | X、Y、W、H | `.bounds.set` -> `setBounds` | shape 四项覆盖；缺负值、零尺寸、画布外边界 |
| 更多 | 上移一层、下移一层、置顶、置底 | 同图层菜单 | shape 覆盖图层菜单，未从“更多”重复执行 |
| 更多 | 编组、解组 | `.group.set` / `.ungroup.set` | 多选主按钮编组、更多解组覆盖；单选组对象状态缺失 |
| 更多 | 锁定/解锁 | `.lock.toggle` -> `setLocked` | shape 开关两次覆盖 |
| 更多 | 隐藏/显示 | `.visibility.toggle` -> `setHidden {hidden:!el.hidden}` | Office 主流程按“隐藏 → 显示”可见状态各执行一次并通过 |
| 更多 | 复制 | `.duplicate` -> `duplicateSelected` | shape 覆盖 |
| 更多 | 删除 | `.delete` -> `deleteSelected` | shape 覆盖 |

画布对象右键菜单重复提供：剪切、复制、粘贴、复制副本；置顶、上移、下移、置底；编组、解组；锁定/解锁；删除。`editor-human-audit` 覆盖复制副本与剪贴板主路径，未逐项覆盖右键菜单、快捷键显示与 disabled 状态。

## 7. 批注、AI 和其他二级面板

### 批注唯一入口

- 当前只保留全局 `#btn-comments`，上下文栏不再创建第二个 `chrome.comment.pin`。
- 侧栏通过 `#comment-target` 显示当前页和对象类型，通过 `[data-comment-scope]` 明确范围。
- `editor-canvas-controls.mjs` 断言入口唯一、上下文无重复、表格目标文案正确、关闭后属性面板恢复；Office 主流程另验证新增一条批注只产生一个 pin，删除后 pin 归零。

### AI 工作区

| 项目 | 行为 | 现有证据 / 缺口 |
|---|---|---|
| AI 主按钮 / 关闭 | `chrome.workspace.toggle`，打开或隐藏 `#work-chat`，关闭后焦点回 AI 按钮 | toolbar、office 覆盖；缺 aria-expanded 和折叠后生成过程状态保持断言 |
| 生成历程 | “查看过程/收起过程”；阶段、当前行动、产出、页面状态 | generation DOM 测试覆盖 stable DOM、跟随与“回到最新”；需在重做后保留 |
| 完整行动记录 | details 展开/折叠；技术详情内部独立展开 | DOM 测试覆盖跨 poll 展开与用户滚动；主画布重做不得整块 replace 导致丢状态 |
| 回到最新 | 恢复自动跟随 | DOM 测试覆盖 |
| 三个快捷提示 | 把固定文本填入 composer，不立即发送 | 未见逐项测试 |
| 添加附件 | TXT/MD/CSV/TSV/JSON，多选 | attachment QA 覆盖基本选择；缺重复文件、移除、超限、失败重试完整矩阵 |
| 发送 | Enter 或按钮提交，Shift+Enter 换行 | workspace QA 有生成/审阅路径；缺空文本、重复提交、组合输入法 |

### 导出二级项

- PPT：`chrome.export.pptx`，可选“嵌入字体”，范围显示“全部页面 · 可编辑 PPTX”。
- 图片：`chrome.export.image`，范围显示当前页 PNG，隐藏嵌入字体选项。
- 下载：按所选格式请求导出；失败显示错误与“重试”。下载按钮本身无 control id，但格式按钮受 oracle 管理。
- Google Slides：明确是 disabled 展示行，不是按钮，tooltip 为“官方云账号能力，离线产品不提供”。
- 现有测试覆盖 PPTX、PNG 签名和尺寸、失败后重试；未覆盖嵌入字体开关对产物的实际影响、对话框关闭期间未完成请求、连续切换格式。

### 动画遗留代码

`app.js` 仍有 `renderTimeline()`、`setAnimations`、触发方式“单击时/同时/之后”、删除轨道、播放头和添加动画逻辑，但当前 `index.html` 没有 `#timeline`、`#btn-timeline`、`#btn-anim-pill`、`#tl-*` 节点；server 的 `ORACLE_CONTROLS` 也没有 `element.animation.set` 或 `.timeline.set`。office acceptance 明确把动画创作列为未启用能力。因此全面重做时不能把这些死代码误列为现有可用按钮；若恢复动画，需要重新做 oracle、DOM、命令和验收闭环。

## 8. Tooltip 行为和缺口

- `tooltips.js` 把所有非空 `title` 移到 `data-tip` 并删除原生 title；图标按钮如果只有 `aria-label`，也提升为 tooltip。
- hover 延迟 320ms，键盘 focus 立即显示；顶部插入栏和上下文栏按可用空间定位浮层；滚动时重定位，移出视口或 resize 时关闭。
- MutationObserver 处理动态上下文栏，因此重建后的按钮理论上会重新绑定；它只观察 `title`、`aria-label` 和新增节点。
- disabled 菜单项会立即显示 tooltip，但很多 disabled 元素没有解释“为什么禁用”，只重复控件名称。
- 图表“数据标签/图例”会把 `data-tip` 动态改成“显示/隐藏…”，已有 toolbar 测试覆盖。
- 表格专项已覆盖 `#pop-table` / `#pop-opacity` 唯一 id、control、可见标签和多轮重建身份；SVG glyph 的像素级辨识仍由原生截图验收承担。
- 文字按钮、有可见标签的 menu item 如果没有 title/aria-label，不生成 tooltip。这是当前策略，不应在重做时误判为 tooltip 丢失。
- 现有测试主要覆盖自动换行、文本对齐、图表 toggle 和一般 hover；缺键盘 focus、屏幕边缘放置、动态新增、disabled 原因、滚动/resize 清理的系统测试。

## 9. 重做后的最低完整验收矩阵

每一格都至少检查：可见主项顺序、每个二级项、`id`、`data-control`、`data-tip`、禁用态、点击产生的唯一命令、持久化后模型、undo/redo、切换选择后无旧菜单残留。

| 场景 | 必测序列 |
|---|---|
| 无选中 | 页面栏、顶栏、顶部插入、更多、主题、空白右键、备注、标题栏 AI 开合；确认上下文栏隐藏 |
| 文本 | 文字所有二级项；文本 → 表格 → 文本来回切换；编辑选区时颜色/B/I/U 不丢 range |
| 形状 | 调整、填充全部入口、描边全部入口、通用菜单、右键菜单 |
| 图片 | 裁切状态切换、五种遮罩、替换取消/成功、三种 fit、重建取消/成功、通用菜单 |
| 表格 | 1×1/6×6 插入；单格与多格；行列最小边界；合并边界；三种对齐；填色；通用不透明度；表格 ↔ 形状 ↔ 表格连续切换 |
| 图表 | 四类型、每个系列色、三轴、标题、labels/legend 双向、数据输入错误、对象对齐、不透明度 |
| 图标/线条 | 图标三风格和分类；线条三 preset、三线型、五种起/终箭头、三曲线、控制点 |
| 多选 | 2 个与 3 个对象分别测试六对齐、两分布、组/解组、锁/隐/复制/删、undo/redo |
| 历史预览 | 上述各区域所有写操作禁用或命令无效果，只有版本三项可用 |
| 生成/审阅锁 | liveSafe 命令可用，所有写命令不执行且提示一致；视觉状态不能假装可编辑 |

优先新增的回归用例：

1. `table-context-control-identity`：已由 `editor-canvas-controls.mjs` 覆盖唯一 id/control/可见标签、24 次跨类型重建和真实指针“表格 → 图表 → 表格”；仍需原生截图辨识 glyph。
2. `comment-entry-dedup`：已覆盖全局唯一入口、上下文无重复和一次保存/删除；仍可补多选目标文案。
3. `context-control-state-matrix`：已按文本/形状/图片/表格/图表/多选执行主项与二级命令；图表现在必须具有对象对齐和不透明度。
4. `context-menu-command-identity`：监听 `/api/command`，每个二级按钮必须只发送表中对应的一条命令；线条 preset 和表格规格允许明确的命令序列。
5. `context-rerender-state`：菜单打开、输入聚焦时触发 model refresh，验证只恢复同一 `id` 的菜单，不把焦点恢复到同 control 的另一个按钮。
6. `disabled-matrix`：空白会话、单页、首尾页、无 undo/redo、历史预览、生成锁逐项核对视觉 disabled 与服务端拒绝一致。

## 10. 源码盘点中确认的高风险点

1. **表格与透明度已建立独立身份回归。** `#pop-table` 使用 `ICO.table`，`#pop-opacity` 使用 `ICO.opacity`；跨类型与真实指针回归均通过。
2. **批注已收敛为全局唯一入口。** 侧栏目标文案承担当前页/对象上下文，不在属性栏重复按钮。
3. **图标和图片已使用类型专用 glyph。** `#pop-icon` 使用 `ICO.icon`，`#pop-image` 使用 `ICO.image`，与 `ICO.opacity` 分离。
4. **动态栏整块重建。** 虽然保存了展开/焦点状态，但按 control 恢复焦点时同 control 可能有多个按钮；缺唯一身份约束。
5. **部分主按钮绕过 oracle。** 分享、页面预览模式、编辑模式、历史“回到最新”、导出下载/重试没有 `data-control`，其禁用由分散代码承担，无法被 dead-button audit 全面约束。
6. **视觉禁用和命令拦截不是同一层。** 生成锁期间很多写按钮仍看起来可点，只在 `command()` 中拒绝；全面重做应统一可感知状态。
7. **类型能力仍有有意差异。** 图表现已具备通用对象对齐/不透明度；表格单元格对齐只提供水平三种且强制垂直居中；多选两个对象也显示分布。后两项需继续按产品语义验收。
