# 交互 QA 规章 — Interaction QA Charter

适用对象：所有在本仓库改动编辑器 / Hub 前端的 agent（含 Grok 子代理）。
目标：测出**真实用户交互**的问题（拖拉拽、点击换色、输入内容、做表格等日常 PPT 行为），不是只验证 API 通了。

## 一、总原则

1. **测用户做的事，不测代码暴露的接口。** 被测行为必须通过手势原语触发（见工具箱）；`command()` / fetch 只允许用于**准备现场**和**断言结果**，禁止用来替代被测手势。
2. **每个手势必须有真实事件流。** 拖拽 = pointerdown → ≥8 步 pointermove → pointerup（走 `page.mouse.move(x, y, { steps })`）。禁止 `element.click()` 式合成快捷路径测拖拽类行为。
3. **三层断言，缺一不可：**
   - DOM 即时态（选框出现、编辑态激活、弹层打开）
   - 模型态（`GET /api/model` 里的字段变了）
   - 持久化（`page.reload()` 后仍然成立）
4. **中途截图。** 拖拽中、弹层开着、编辑态激活时各留一张 `output/qa-*.png`，供人工目检。
5. **发现即记录。** 跑旅程时发现的任何 P0/P1（崩溃、数据丢失、能力不可用）必须当场修或在报告中列复现步骤，不允许静默跳过。

## 二、工具箱（`scripts/qa/gestures.mjs`）

所有交互测试必须 import 这份手势库，禁止各自手写事件序列。原语清单（实现见文件）：

| 原语 | 模拟的用户行为 |
|---|---|
| `openEditor(page, project)` | 打开编辑器并等 ready |
| `clickEl(page, id)` / `dblclickEl(page, id)` | 单击选中 / 双击进入编辑 |
| `dragEl(page, id, dx, dy)` | 按住元素拖动（含中间步进、slideScale 换算） |
| `dragHandle(page, id, dir, dx, dy)` | 拖八向缩放把手 / `rot` 旋转把手 |
| `dragCropHandle(page, id, dir, dx, dy)` | 裁切模式里拖裁切框把手 |
| `dragAdjHandle(page, id, index, dx, dy)` | 拖形状调整菱形点 |
| `setRange(page, selector, value)` | 拖/设 range：`input` 预览 + `change` 落盘 |
| `chooseImageFile(page, filePath)` | 插入图片：真实 filechooser + 选文件 |
| `marquee(page, x0, y0, x1, y1)` | 空白处拖橡皮筋框选 |
| `typeInto(page, text)` | 向当前编辑态逐键输入（`keyboard.type`，带 delay） |
| `shortcut(page, combo)` | 键盘快捷键（`Control+c` 等，Mac 用 Meta 由库内判断） |
| `pickColor(page, selector, hex)` | 换色：设 value + 依次派发 `input`、`change`（无头环境无法打开系统取色器，这是唯一允许的合成点，必须两个事件都发） |
| `pasteText(page, text)` | 剪贴板粘贴（ClipboardEvent 注入） |
| `openContextMenu(page, id)` | 右键元素 |
| `readModel(page)` | 取 `/api/model` JSON |
| `assertPersisted(page, fn)` | reload 后运行断言 |
| `cleanupFixtures()` | 首次调用精确快照当前 fixtures；后续恢复该快照，保留测试前已有的未提交修改 |

扩展规则：需要新原语时**加进这份库**并在表格补一行，不要在测试文件里私写。

## 三、必测手势矩阵

改动涉及某一面（surface）时，下列手势必须在旅程测试中出现过至少一次：

| Surface | 必测手势 |
|---|---|
| 文本 | 插入→直接输入；双击已有文本→改字→点外提交；Esc 取消；B/I/U/字号/颜色在编辑中生效 |
| 形状 | 插入；拖动（吸附线出现）；八向缩放；旋转把手；换形状；`pickColor` 换填充（input 预览 + change 落盘） |
| 表格 | 插入；点单元格（表不移动）；**按住单元格拖 >8px 搬整表**；双击编辑输入中文；增/删行列；合并；单元格填充色；hover 浅底 |
| 图表 | 插入；切 4 种类型；打开数据表；改表头；逐键输入数值（图实时动）；非法输入不砸数据；粘贴 TSV；删行删列 |
| 图片 | 插入；替换；裁剪把手拖动；fit 切换 |
| SmartArt | 插入；加/删节点；拖节点（连接线跟随）；选连接线设标签 |
| 线条 | 插入；拖端点；箭头/曲线样式 |
| 多选 | 橡皮筋框选；Shift+点；对齐/分布/编组/解组 |
| 剪贴板 | Cmd/Ctrl C/X/V/D；跨页粘贴 |
| 页面 | 缩略图点击；拖拽排序（插入线可见）；右键页菜单 |
| 评论 | 落 pin；输入；解决；pin 跟随元素移动 |
| 版本 | 快照；预览只读；恢复 |
| 播放/导出 | 放映进出（chrome 收敛）；导出 PPTX 出报告卡 |
| Hub | `/` 落地创建页；输入 brief；切换风格参考（不复制页面模板）；未登录准确停止并打开供应商登录；真实生成工具行流式；返回中断 |

## 四、旅程测试（`scripts/verify-user-journeys.mjs`）

以「一个用户从零做一份 PPT」为剧本串联上表手势，是**回归主门禁**：

> 打开项目 → 新建页 → 插入标题文本并输入 → 插入形状、拖到位、换色 → 插入表格填 2×3 数据 → 插入图表、改数据、切折线 → 框选两个元素对齐 → 复制粘贴 → 落评论并解决 → 存版本 → 播放进出 → 导出 PPTX 验证报告。

## 五、运行与放行

- 统一入口：`npm run qa:all`（= 全部本地安全的 `scripts/verify-*.mjs` + `oracle:validate`）。`verify-generate-flow` / `verify-generate-qa` 会调用真实供应商，明确排除并由 consent gate 单独运行。
- 服务器生命周期：复用属于当前 checkout 的 `BASE`；端口空闲时才启动，若端口属于另一 checkout 则直接失败并要求换端口。测试前后调用 `cleanupFixtures()` 恢复本次进程启动时的精确 fixture 快照，不执行 `git checkout`。
- 浏览器运行时：只能通过 `scripts/lib/pinned-playwright.mjs` 使用全局固定 Playwright `1.61.1` + Chromium Headless Shell rev `1228`；禁止系统 Chrome、手写 CDP 和项目内浏览器安装。
- 外部模型：任何可能把 brief、附件或 skill/tool 上下文发给供应商的脚本必须先经过 `external-model-consent.mjs`。只有用户已针对本次载荷明确授权时才可设置 `QA_ALLOW_EXTERNAL_MODEL=1`；`qa:all` 永远不隐式设置它。
- 真实性：录制脚本不得扫描历史 `output/`、复用旧项目、注入结果卡或篡改完成态。正常 Hub 只有 `data-authentic="1"` 且服务端 provenance 复核通过才算完成。
- 登录隔离：`record-pi-login.mjs` 默认在专用 `:55231` 起全新服务并绑定临时 `auth.json`；如果端口已有服务会直接拒绝，绝不借用当前产品服务测试登出/写 Key。
- **放行门槛：`qa:all` 全绿 + `test:native` 全绿 + `gate:native` 全绿，缺一不许提交声明"完成"。**
- 新交互功能没有配套手势旅程步骤 = 不许合并（等同 dead-button ban）。

## 六、脚本测不到的，走人工走查

无头手势覆盖不了的主观项（动效手感、hover 微交互、视觉层级、文案语感），先看固定 Chromium 的中途截图；确需登录态或交互式浏览器时再用应用内 Browser 走查。重点看迟滞、闪烁、错位、死区和语言混用；报告按 P0/P1/P2 分级。
