# 新版编辑器：真人操作审计与统一修复

基线：GitHub `aa2246740/openkimi-slides` 的 `a2ef06ddbc6791e866083058269f080071be1b3b`。修复工作目录：`/Users/wu/Documents/ChatGPT/openslides/latest`。全部改动留在本地，未提交、未推送。

## 已统一处理的问题

| 问题 | 处理后的行为 | 验证方式 |
|---|---|---|
| 刚输入表格、文字或备注就切页，内容丢失或串页 | 统一等待保存；备注绑定输入时所在页；失败保留输入并阻止后续跳转，可重试 | 连续操作与故障注入；真实浏览器切页、重开 |
| 新建末页后撤销，当前页越界导致模型报错 | 文稿、当前页和有效选区一起恢复 | 模型测试与浏览器回归 |
| 写盘失败后，内存会话却提前改变 | 保存成功才替换当前会话；失败保留原状态 | 真实不可写文件测试与重试 |
| 线框图标筛选结果为空 | 按实际支持的图标样式过滤和插入 | 图标筛选、搜索与插入 |
| 切换导出格式立即下载；图片仍显示 PPT 字体选项 | 格式按钮只选择，下载按钮才执行；明确当前页 PNG / 整份 PPTX | 请求计数、实际下载、原生浏览器复核 |
| 批注、图表、附件入口重复，遗留隐藏工具维护混乱 | 保留明确入口；删除旧消息弹层、旧图表对话框及未开放动画控件 | 静态清单、工具栏回归 |
| Agent 无可用会话时输入框消失，无法继续 | 明确报错、恢复输入与焦点、解除锁定，并提供重试 | 真实本地服务；原生浏览器复核 |
| Agent 附件入口不能形成完整上下文流程 | 独立文本附件上传、移除、刷新恢复、提交锁定、失败保留；Host 将附件内容送入 followup | 本地上传/删除、Host 合约测试；成功流程使用明确标注的 HTTP 替身 |
| 打开 Agent 后工具栏中文折行，窄屏画布及控件受挤压 | 桌面保持单行工具栏；窄屏 Agent 抽屉、横向可滚动插入栏 | 1440、1024、768、390 px 截图与溢出检查 |
| 历史预览先显示提示条、画布随后才进入只读；备注混用当前稿；还原失败缺少恢复反馈 | 只读画布、备注、缩略图与版本信息一致；支持旧稿只读翻页，回最新稿恢复原页；还原期间防重复提交，失败保留预览并允许重试 | 按保存响应版本 ID 验证预览/翻页/返回/还原；注入还原失败后重试 |
| 损坏或伪装成 PNG 的文件被静默插入 | 上传前实际解码，失败提示并保持文稿不变；正常图片仍可插入和替换 | 损坏图、有效图、替换、空选择回归 |
| 备注面板展开后没有关闭入口 | 标题旁提供明确关闭按钮，关闭前保存，重开保留内容；工具栏在备注区上方，不遮挡输入 | 原生浏览器发现；关闭/保存/重开专项回归 |
| 分享失败没有反馈，剪贴板能力不明确 | 分享显示成功/失败；快捷键说明标注编辑会话内剪贴板 | 代码核查与同会话复制粘贴回归 |

## 覆盖口径

逐项清单见 [操作台账](editor-human-audit-2026-09-05-worker.md)，Agent 证据见 [Agent 专项报告](editor-agent-audit-2026-09-05.md)，追加边界见 [最终报告](evidence/editor-remaining-boundaries-2026-09-05-final/report.json)。

- 编辑器共有 **102 个独立操作 ID**，服务端另外两个 ID 属于 Create Hub。
- 当前静态壳有 **62 个交互节点**：54 个按钮、5 个输入框、2 个文本区和 1 个 summary。另有按文稿与选区动态生成的按钮。
- 动态控件单列：36 种表格尺寸、15 个形状分类及 177 个形状选项、3 种线条预设、图标样式与分类、图表数据和样式、版本行、批注、附件等。
- 操作 ID 覆盖表示该语义路径被执行，不代表每个颜色、图标、组合输入与设备情况都穷举通过。未验证项在下文明确保留。

## 最终验证

整合报告位于 [最终证据目录](evidence/editor-integrated-2026-09-05-final/office-report.json)；其中 `shell-report.json` 包含最终备注布局修复。

- 原生包测试 **767/767**，native-web **23/23**，构建与 Oracle 校验通过。
- 真人连续编辑专项 **10/10**；独立保存故障专项 **3/3**。
- Agent 专项 **9/9**，各用例明确区分真实本地服务与 HTTP 替身。
- 工具栏视觉与功能回归均通过。
- 完整办公流程 **15/15 步、102/102 个操作 ID**，浏览器错误为 0。
- 壳层、版本与导出专项 **10/10**，包括版本还原失败后的重试。
- 补充边界 **5/5**：页面三连撤销重做、表格焦点内快照、图表最后单元格关闭重开及导出、文本立即导出、坏图拒绝/正常图插入替换。

导出的真实 PPTX 已检查 ZIP 内容：8 页、139 个文本 run、1 个原生图表部件；PNG 文件签名与下载范围通过。尚未在 PowerPoint/WPS 中打开并逐项编辑验收，不能据此声称 Office 客户端完全兼容。

## 可复查的界面证据

![图片导出只选择当前页，下载由单独按钮执行](evidence/editor-human-audit-2026-09-05-parent/05-export-refactored.png)

![历史预览的备注与快照一致，并明确只读](evidence/editor-version-2026-09-05-final/version-preview-readonly.png)

![Agent 无会话报错后恢复输入和重试](evidence/editor-human-audit-2026-09-05-parent/08-agent-recovered.png)

![真实上传的 Agent 文本附件](evidence/editor-human-audit-2026-09-05-parent/09-agent-attachment.png)

## 仍需真实环境验收

1. 当前测试副本未绑定真实 DSH Agent 会话。模型实际修改当前页/选区/整份文稿、模型运行中切页、真实取消恢复及服务重启续接尚未通过验收。需要 provider-ready Host 与绑定会话的项目，只有凭据还不够。
2. Agent 附件目前明确支持 TXT、Markdown、CSV、TSV、JSON；不支持把图片或 Office 文件直接当模型附件。
3. 元素剪贴板限当前编辑会话；跨应用、跨标签页、重启后的粘贴不是现有能力。
4. 中文真实输入法组合态、触屏手势、操作系统级全屏及每种格式选项的全部组合未穷举。自动化填入中文不冒充输入法验收。

## 重跑

先 `npm ci --ignore-scripts --no-audit --no-fund` 和 `npm run build:native`，测试浏览器使用全局固定运行时 `/Users/wu/.codex/playwright-runtime/runtime.mjs`，不得安装项目内浏览器。

```sh
npm run test:native
npm test -w @open-slidestudio/native-web
npm run oracle:validate
npm run qa:editor-human
npm run qa:office-editor
npm run qa:editor-toolbars
node scripts/qa/editor-transaction-faults.mjs
# qa:editor-human 已含 editor-remaining-boundaries.mjs
```

浏览器脚本使用项目副本及各自测试端口，报告保存在 `output/`；本轮关键证据另存于 `docs/qa/evidence/`。本地可见验收实例运行于 `http://127.0.0.1:55480/`。

最终原生浏览器复核：输入当前稿备注后预览 V1，旧稿第 1/2 页备注为空且 readonly；回到最新恢复第 1 页和原备注。证据为 `evidence/editor-human-audit-2026-09-05-parent/10-history-readonly.png`。
