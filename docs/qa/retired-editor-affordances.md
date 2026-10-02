# 已退役的编辑器手工入口（以及 QA 适配）

日期：2026-09-17。本文件记录一件事：**编辑器里一批手工编辑入口按产品意图退役了，测试跟着对齐现状**。

## 为什么退役

产品主要路径是「AI 生成 → 需要精修就导出 PPT 在 PowerPoint 里改」。因此编辑器不再承担重手工编辑，
底部「更多」菜单及其下属入口被移除（提交 `6aa1c77` "streamline agent-first corrections" 把旧
`.insert-pill` 换成 `#insert-toolbar`，同时去掉了图表按钮）。**生成能力不受影响**：agent 仍通过 host
工具（`write_page` / `edit_elements`）写 PPTD v2，`write-page.ts` 明确处理 `elementType === "chart"`，
生成门禁 `produceGates.ok=true`。

## 目前退役的具体入口

| 入口 | 现状 | 备注 |
| --- | --- | --- |
| 图表插入按钮 `insert.chart` | 无 UI 入口 | 命令层仍可用：`POST /api/command {cmd:"insert",kind:"chart"}` 实测 `ok=true`；图表的数据/类型/坐标轴/系列色编辑控件都还在 |
| 图标插入 `insert.icon` | 无 UI 入口 | 命令层可用（实测 `ok=true`） |
| SmartArt 插入 `insert.smartart` | 无 UI 入口 | 命令层可用；已生成 deck 里的 SmartArt 节点控件（`element.smartart.node.add`）仍有效 |
| 底部「更多」菜单 `#btn-more` | 已移除 | 含主题色 / 消息 / 公式入口 |
| 主题 `#btn-theme`、`theme.*` 控件 | 已移除 | `styles.css` 里还留着 `.theme-swatch` 死规则 |
| 消息 `#btn-messages` / `#messages-pop` | 已移除 | 现由 `#btn-comments`（批注）承担协作入口 |
| 公式 `#btn-formula` | 已移除 | |
| 编辑/批注模式胶囊 `#btn-mode-edit` / `#btn-mode-comment` | 已移除 | 批注改为面板驱动：范围选择 + `#comment-draft` + `#comment-add` |
| 旧插入条 class `.insert-pill` | 改名 `#insert-toolbar` | 插入条现只有 文本/形状/图片/表格（形状面板内有「线条」分类） |

`ORACLE_CONTROLS` 的处理口径（2026-09-17 复查后定稿）：

- **`insert.more` 已从允许列表移除**，oracle 行与目录条目改为 `wont-port`（它不是真实的 insert kind，命令层没有任何分支消费它）。
- **`insert.chart` / `insert.icon` / `insert.smartart` / `theme.color.set` / `theme.background.set` 保留在允许列表**，
  因为 `assertControl` 是硬门禁：删掉它们会让 `POST /api/command {cmd:"insert",kind:"chart|icon|smartart"}`
  与 `setBackground`/`setThemeColor` 直接抛错，而 QA 种子数据和多套件正依赖这条程序化路径。
  对应的 oracle 行已补 `description`，写明「手工入口退役、程序化命令保留」，避免三方口径不一致。
  若要彻底下线这些能力，后续需要把 QA 种子改为直接在 fixture 的 YAML 里注入元素。

Google 幻灯片导出：**已从产品彻底移除**（不是灰置）——`index.html` 的禁用行、`/api/export/formats`
的条目光删；`verify-native-editor` 的检查反转为 `export.google.removed`（防止再被加回来），
`docs/ACCEPTANCE.md`、`docs/ACCEPTANCE-CASES.md`、`editor-office-acceptance` 的说明同步更新，
oracle 目录里 `chrome.export.google` 条目与行目录此前已删除。

顺带修掉的产品死代码：`app.js` 的 `avoidInsertPill()` 原本还在查已改名的 `.insert-pill`，导致批注 pin
与插入条的重叠避让失效；已改为 `#insert-toolbar`。`styles.css` 里残留的 `.insert-pill`/`.theme-swatch`
死规则**尚未清理**（删任何一条组都要逐条确认没有混入活选择器，属纯清理项，未与功能改动同批进行）。

## QA 适配做了什么

共享工具：

- `scripts/lib/api-command-url.mjs`：命令判定改为 `new URL(url).pathname === "/api/command"`。
  编辑器现在把命令发到 `/api/command?project=…`，旧的 `url.endsWith("/api/command")` 会让每个控件
  都表现为「没有发出命令」。8 个脚本、24 处受影响。
- `scripts/qa/gestures.mjs` 新增 `insertViaCommand(page, kind)`：命令层插入 + 重载（API 写入不会被
  已打开的页面感知）。

按现状对齐的脚本（均已单独跑通）：

| 脚本 | 改动 |
| --- | --- |
| `scripts/verify-editor-ux.mjs` | `.insert-pill` → `#insert-toolbar` |
| `scripts/verify-chart-tool.mjs` | 图表改命令层插入；类型/配色/坐标轴/数据编辑断言全部保留 |
| `scripts/verify-1-1-browser.mjs` | 移除主题与 SmartArt 采集步骤；图表改命令层插入；保留键盘帮助/文本/形状/图表图例 |
| `scripts/verify-hover-chrome.mjs` | 移除「更多」菜单与消息/主题悬停；`#btn-kind`（标记里永久 hidden）不再参与；风格卡改为先打开 `#style-pop`；删除已消失的旧提示文案断言 |
| `scripts/verify-landing.mjs` | 移除模式胶囊与消息面板断言；协作入口改为 `#btn-comments`；hub 模型标签改为「非空即可」（旧断言要求出现固定供应商品牌词） |
| `scripts/verify-prd-gaps.mjs` | 导出需点 `#export-download` 才出现进度；批注改为面板驱动并断言绑定到选中元素；图表改命令层插入；并补上 `cleanupFixtures()`（此前会污染 fixture：新增版本、移动元素、插入图表） |
| `scripts/verify-user-journeys.mjs` | 图表改命令层插入；批注段改为面板驱动（范围默认「所选对象」，卡片文本在 textarea 内，改断言存储记录） |
| `scripts/qa/editor-toolbar-regression.mjs` | 图表插入改命令层，保留图表渲染与检查器断言（CI 门禁） |
| `scripts/qa/editor-toolbar-actions.mjs` | 图表同上；移除「更多」菜单/主题/公式/SmartArt 段；保留批注、AI 工作区、单一附件入口断言（CI 门禁） |
| `scripts/verify-attachments.mjs` | 2MB `.md` 与 `.pdf` 的断言改为产品的诚实文案（附件只解析到 `ATTACHMENT_TEXT_LIMIT = 48 000` 字符；非 UTF-8 文本拒收）；移除已隐藏的 `#btn-kind` 产出类型/版式菜单段 |

## 仍然待办

- `qa:all` 已全绿：24 个 `verify-*.mjs` 连续通过 + `oracle:validate` OK（`SLIDES_DSH_PORT=13081 npm run qa:all`）。
- 编辑器家族（不在任何门禁里）现状：
  - **已修好**：`editor-agent-scope-routing`、`editor-shell-human-audit`、`editor-ui-shell-content`、
    `editor-correction-journeys`（22/0）—— 退役入口断言改写、`更多`菜单清理、图标库用例退役、
    空白页菜单只剩粘贴、版本菜单不再自动关闭等。
  - **推进中**：`editor-canvas-boundaries` 从直接 fatal 到 15 过 / 4 失败；剩下 4 项都在图像裁切块内互相级联
    （顶部裁切按钮流 + 弹层完成/重置），需要按新的 `#crop-start`/`#crop-reset`/`#crop-done` 面板结构整体重排。
  - **未动**：`editor-canvas-controls`（整套建立在已退役的 ctx-bar 弹层模型上，`#pop-more`/`#pop-opacity`/
    `#pop-dist` 等）、`editor-office-acceptance`（10 个失效 id）、`editor-canvas-palettes`（超时未定位）、
    `editor-inspector-coherent-correction`（图标用例已改命令层，仍有一处超时）、
    `editor-agent-human-audit`（协议级：AI 审阅回合里 `#editor-generation-stop` 长期 hidden，
    需要按新的 review/ai-lock 流程核对 HTTP double）。
- 其它已修的适配器坑（值得记住的通用模式）：
  - 命令/接口 URL 现在都带 `?project=…`，凡是用 `url.endsWith(...)` 或 `**/api/xxx` glob 的地方都会失配
    （已修 `scripts/lib/api-command-url.mjs` 与三处 route：attachments、versions/restore）。
  - Playwright 的 `unroute(predicate, handler)` 按引用匹配，谓词必须存成变量复用，否则注入的失败会残留。
  - 通过接口写入的状态改动不会被已打开的页面感知，需要 reload（见 `insertViaCommand`）。
- `fixtures/okp-yu7-ppt/.versions/`、`fixtures/okp-yu7-ppt/_agent/` 是运行期产物且未被 git 忽略，
  建议加进 `.gitignore` 或让套件改用 scratch 拷贝（`verify-native-export-current.mjs` 要求该项目初始
  零快照，历次运行留下的 `.versions/` 会让它失败）。`verify-text-edit.mjs` 原先会污染 fixture，已补
  `cleanupFixtures()`。

## 生成面板头部：停止与折叠（2026-09-17）

| 入口 | 处理 | 原因 |
| --- | --- | --- |
| `#editor-generation-stop`（停止生成/停止修改） | 隐藏（CSS），功能移到左下输入框的方块 | 停止入口原来有两个（头部按钮 + 输入框方块），职责重叠；方块在两种回合里都能停 |
| `#editor-generation-toggle`（查看过程/收起） | 隐藏（CSS） | 过程流已是面板主体，折叠前后没有可见变化 |

保留 `#editor-generation-resume`（继续完成生成）：暂停后回到生成流程的唯一入口。

- 方块只在真正能停时携带 `data-control="chrome.workspace.stop"`（否则它只是发送键），oracle 行因此仍然可达且无需改动
- 审阅/批注回合里空输入框点方块 = 停止（与生成流程同一契约），过去这种情况只弹提示
- `scripts/qa/editor-agent-human-audit.mjs` 的 cancel 用例改为点方块并断言其 control id
- `scripts/qa/editor-ai-workspace-generation.mjs` 改为断言两者保持隐藏（该脚本依赖一个已不存在的录制切片 `output/dsh-slices/01-把-空中生命线…`，本就无法在本工作区运行）
