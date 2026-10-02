# Agent 主创后的人类轻编辑验收矩阵

日期：2026-09-06
范围：只验证 Agent 已生成 PPTD 后，人类在 native editor 中做连续小修改的可用性。所有自动化使用 pinned Chromium、独立随机端口和 disposable project；不连接 13080/55200，不修改用户项目，不把合成 composition event 当作 macOS 输入法验收。

## 有界场景

| 场景 | 连续操作 | 必须验证的结果 | 证据边界 |
|---|---|---|---|
| 文字局部纠错 | 双击文字；选择中间一段；切换粗体和颜色；退出编辑；重载 | 只改变选区对应 runs；选区外文字和样式不变；完整文字不丢；`.page` 保留 rich text | 浏览器真实 Range 和工具栏事件；不代替鼠标精细拖选 |
| 中英文连续输入 | 双击文字；键盘输入英文；派发完整 compositionstart/update/input/compositionend；继续输入中文标点；退出编辑 | 事件顺序完整；混合文本只提交一次最终值；重载后字符顺序不变 | composition 为浏览器合成事件；macOS 拼音候选窗、组合键和真实 IME 必须另测 |
| 键盘微移、复制与跨页粘贴 | 选择对象；方向键 1px、Shift+方向键 10px；⌘D；undo；⌘C；切页；⌘V；Delete；undo/redo | bounds 精确变化；副本偏移且可撤销；跨页粘贴保留内容并生成新 id；删除与 undo/redo 闭环 | 使用真实 Playwright keyboard event；系统剪贴板不参与，验证产品内部 clipboard |
| 外部文字粘贴 | 先复制一个内部对象；把外部纯文本写入浏览器系统剪贴板；清空选区；⌘V | 外部文字应优先进入画布文字或当前文字编辑点；不能静默粘贴旧内部对象 | pinned Chromium clipboard 权限可证明浏览器剪贴板；macOS 跨应用复制仍需原生验收 |
| 右键/键盘剪贴板交叉 | 右键复制→⌘V；⌘C→右键粘贴；外部纯文本→右键粘贴；右键剪切→⌘V | 内部对象在两个入口之间保持对象身份；外部文字只创建文字；剪切先删除、再可粘贴恢复；权限拒绝时不发服务端命令、不改页并提示快捷键 | 检查同步 ClipboardEvent 与异步 Clipboard API 的互操作，不能只分别测试两个入口 |
| 对象剪贴板失效与竞态 | 复制对象后刷新再粘贴；右键复制的异步系统写入未完成时切换选区 | 失效 token 明确提示重新复制，不能把产品对象标签插成页面文字；选区变化时不发送 `copySelected` | 使用 pinned Chromium 的真实剪贴板和一个只延迟 `write` 完成时机的受控 stub；不改服务端 |
| 选区、AI 与属性栏响应式布局 | 1280/1440/1920 先选对象再开/关 AI；1280 先开 AI 再选对象；`workspace=1` 直接进入后选对象；1280 自动折叠后手动展开 | 1280/1440 自动临时折叠、1920 保持展开；选区和标题不丢；手动展开不被抢回；关 AI 恢复；不写自动偏好；画布/辅助栏/工具栏无横向溢出 | headless 几何断言覆盖 CSS 布局与状态；不代替原生窗口视觉验收 |
| locked/hidden 混合选择 | 锁定 A，再 Shift 选择 B；隐藏 A，再 Shift 选择 B；打开多选“更多” | selection 保留两 id；不可执行动作必须 disabled 或明确拒绝且不改页；显示/隐藏、解锁语义不能只取首项造成误导 | 这是产品状态矩阵；若 UI 可点但服务端拒绝，记录为缺陷，不把拒绝冒充禁用 |
| 对象右键动作 | 在独立 fixture 中逐项执行剪切、复制、粘贴、复制副本、四种层级、编组、解组、锁定/解锁、删除 | 每项发出唯一正确命令；模型变化符合动作；失败项不能静默；undo 能恢复破坏性动作 | “设置背景色”依赖系统颜色选择器，只检查入口可见，不冒充完成颜色选择 |
| 空白右键 | 先复制对象；切页；空白处右键粘贴；检查“设置背景色” | 粘贴创建新对象；两项名称和 control id 正确 | 系统颜色选择器不由 headless 操作 |
| 字体加载和 fallback | 等待 `document.fonts.ready`；逐项加载字体菜单 27 个 family；检查 FontFace 状态与实际元素 computed style；用不存在 family 对照浏览器 fallback | 本地字体响应成功且 FontFace loaded；已选字体真正用于元素；缺失字体仍可读、尺寸有限且 fallback 稳定 | 字形审美和 macOS 原生字体栅格另测；不存在字体通过测试命令注入，标注为 Agent/旧稿兼容场景 |
| 三种图标风格全集 | 打开图标库；实心/线框/品牌逐项切换；在“全部”分类检查全部可见 tile | 可见 tile 与 `fa-icons.json` 按 style 过滤后的前 96 项逐项一致；aria-label、前缀、glyph family/weight 正确；搜索清空可恢复全集 | UI 当前每种风格最多显示 96 项；这是产品可见全集，不声称遍历 catalog 中被 UI 截断的其余项 |

## 与既有套件的分工

- `editor-canvas-controls.mjs` 已证明 177 个形状、289 个调节点、字体预置的命令和持久化；本轮只补真实文字选区、输入和连续键盘旅程。
- `editor-canvas-palettes.mjs` 已逐项操作 96 个实心图标；本轮为避免只验证列表，重新对实心、线框、品牌三种风格各 96 个可见项逐个执行真实插入、核对请求与返回模型、检查画布 glyph family/weight，再逐个删除。
- `editor-office-acceptance.mjs` 已覆盖页面、导出、备注、播放和普通右键代表动作；本轮把对象右键每个可见动作拆为独立可复现断言。
- `editor-remaining-boundaries.mjs` 已覆盖连续 undo/redo、图片选择和即时提交边界；本轮不重复图片、表格或图表专项。

## 通过条件

每个场景必须保存：命令名与安全参数、修改前后模型摘要、必要的 scratch `.page` 结果、browser error、截图或列表摘要。任何按钮仅“能点击”不算通过；真实行为失败时保留失败证据并报告生产缺陷，不在 QA 脚本里绕开。

## 当前验收结果

自动化入口为 `scripts/qa/editor-correction-journeys.mjs`。它只启动仓库 server 的随机端口，并为每个场景复制 disposable project；`QA_ONLY` 可运行单个失败回归。当前聚焦证据如下：

最终组合回归为 `output/qa-editor-correction-journeys-final/report.json`：18/18 场景通过，687 次真实 `/api/command`，0 browser errors。除逐项图标循环外，每项均为一段连续的人类纠错旅程；图标循环包含 288 个可见图标的逐项验证。

按“不重复运行 288 个图标”的要求，最后三项关联补测单独运行并全部通过：`output/qa-editor-correction-clipboard-marker/report.json`、`output/qa-editor-correction-clipboard-race/report.json`、`output/qa-editor-correction-responsive/report.json`。因此当前脚本共有 21 个场景，证据为原 18/18 组合报告加最后 3/3 定向报告；没有把三个定向结果伪装成一次新的全量运行。

| 场景 | 结果 | 具体证据 |
|---|---|---|
| 局部富文本 | 通过 | `output/qa-editor-correction-journeys-focus/report.json`：浏览器 Range 只把所选 `XIAOMI` 写为 `color:#be123c;font-weight:700`，返回模型和 scratch `.page` 一致 |
| 中英混合输入 | 通过（合成事件） | `output/qa-editor-correction-composition/report.json`：事件顺序包含 compositionstart/update/input/end，最终 `Agent 中文 done` 重载后不变；不代表 macOS 候选窗 |
| 合成期间 Escape/229 | 通过（修复后回归） | `output/qa-editor-correction-ime/report.json`：Escape 后 live node 仍 `contenteditable`，草稿仍为“中文草稿”，compositionend 后持久化；系统 IME 仍未证实 |
| 键盘、内部复制与跨页粘贴 | 通过 | `output/qa-editor-correction-keyboard/report.json`：1px/10px 微移、⌘D、跨页内部 ⌘V、删除、undo/redo 均核对返回模型 |
| 外部纯文本粘贴 | 通过（修复后回归） | `output/qa-editor-correction-external-paste/report.json`：系统剪贴板明确为“外部纠错数值 2026：42.75%”，一次原子 `insert/text` 创建 `text-1`，旧内部 shape 增量为 0；0 browser errors。最终组合回归另证实 contenteditable 与 AI 输入框继续走浏览器原生文字粘贴，不会误创建画布对象。结论仅对应 latest 独立随机端口，live 仍需部署后复验 |
| 右键/键盘交叉剪贴板 | 通过（修复后回归） | `output/qa-editor-correction-clipboard-cross/report.json`：四条交叉路径 4/4；两条复制路径均落到 `copySelected→pasteClipboard`，外部文字落到 `insert/text`，右键剪切为 `copySelected→deleteSelected→pasteClipboard`。权限拒绝另由 `output/qa-editor-correction-clipboard-permission/report.json` 证明命令增量和元素增量都为 0，提示 `⌘C/⌘V` |
| 对象标记失效与复制竞态 | 通过 | `output/qa-editor-correction-clipboard-marker/report.json`：刷新后粘贴为 0 命令、0 元素变化、0 标签文字，并提示对象剪贴板已失效；`output/qa-editor-correction-clipboard-race/report.json`：异步写入期间换选区后 `copySelected` 增量为 0，提示所选对象已变化 |
| 三档桌面布局 | 通过 | `output/qa-editor-correction-responsive/report.json`：1280/1440 打开 AI 后属性栏临时收为 48px，画布区分别为 620/780px；1920 保持 294px 属性栏和 1014px 画布区；先开 AI、`workspace=1` 两种后选对象路径也触发；所有状态 document/toolbar 横向溢出均为 0 |
| locked 混选 | 通过（修复后回归） | `output/qa-editor-correction-locked/report.json`：四个层级动作、删除、对齐、分布全部 disabled，selection 保留两个 id |
| hidden 混选 | 通过 | `output/qa-editor-correction-hidden/report.json`：混选只有一个明确“显示”，执行后隐藏对象恢复 |
| 右键动作和视口 | 通过 | `output/qa-editor-correction-context-actions/report.json` 覆盖对象菜单每个可见动作；`output/qa-editor-correction-context-viewport/report.json` 证明长菜单保持在视口内；空白背景色只核对入口 |
| 字体加载与 fallback | 通过 | `output/qa-editor-correction-journeys/report.json`：27 个字体资源均 HTTP 200 且 `document.fonts` loaded；不存在 family 的画布 metrics 与 sans-serif 一致、像素与 MiSans 不同、文字仍可见并持久化 |
| 三种图标风格全集 | 通过 | `output/qa-editor-correction-icons/report.json`：fas/far/fab 各 96 个，合计 288 个可见项逐个插入并删除；576 条 insert/delete 命令，0 browser errors；品牌 glyph 使用 Brands/400 |

原生证据单列在 `docs/qa/agent-first-native-acceptance-2026-09-06.md`：系统图片选择器取消保持 9 页 SHA 不变，随后选择 PNG 成功；IAB 中只选数字 `120` 加粗并在 `.page` 保真。macOS 中文候选窗口仍未证实，不能由合成事件替代。
