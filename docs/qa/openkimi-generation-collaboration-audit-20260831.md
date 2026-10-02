# OpenKimi Slides 生成历程与 AI 批注协作验收（2026-08-31）

## 结论

本轮只验收并修改活仓库 `/Users/wu/Documents/DSH/openkimi-slides`，旧仓 `open-slidestudio` 未触碰。当前产品服务为 `http://127.0.0.1:3080`，内核为 DSH；指定的 12 页经营检讨项目已重新打开并在 Codex 内置浏览器真实界面复验。

用户提出的六项问题已分别落到产品行为：

1. 标题工具栏只保留一个“文本对齐”入口；展开后明确分为“水平对齐”和“垂直对齐”，不再让两个相似图标靠猜。
2. “编号”改用项目自带 Font Awesome `list-ol` 标准字形，并保留可访问名称“编号”。
3. 产品统一使用“批注”一词；“协作与 AI”里分别是“查看批注”和“打开 AI 工作区”。批注持久化到项目 `_agent/review-threads.v1.json`，不是浏览器临时假状态。
4. 编辑器左侧提供四阶段生成展示：策划、写页、审阅、封板；同时显示 12 页状态与事件时间线。
5. 完成后不清空过程。本项目重启服务并完成一次真实 Agent 改稿后仍恢复 179 条持久化事件，四阶段均为完成。
6. `?live=1` 支持 AI 生成时页面逐步刷新到编辑器。当前刻意不允许“人和 AI 同时写同一份文稿”：生成或 AI 批注修改期间只允许导航/查看，写操作被保护；这比无冲突模型下的炫酷并发更可靠。

## 整稿 Agent 与右侧实时预览追加验收

用户说“全部 / 整份 / 所有页面”时，产品现在将请求解析为 `deck` 范围，而不是把当前选中页偷偷当成整稿：

1. 输入区即时显示 `目标：整份文稿 · 12 页`；发送前明确告知将把 12 页交给 `minimax-cn / MiniMax-M3`，并先保存版本。
2. 服务端一次性校验整组页面 revision/SHA，任一页过期则整组拒绝，不会出现只授权一半的状态。
3. Agent 每完成一页，右侧编辑画布自动刷新并跟随最新写入页，覆盖层显示“正在修改第 N 页 · 已更新 X/12 页”；左侧生成历程默认收起，不再抢占主任务空间。
4. 完成门槛是 12 个目标页全部产生新 revision、SHA 改变并有当前 raster `layout=pass`。模型若提前结束，客户端自动续跑缺页；持续有页面进展时刷新等待计时，只有 3 分钟无进展或 20 分钟硬上限才终止并回滚。
5. 真实请求“全部改成红白商务风，保留所有事实、数据和图表含义”最终覆盖 12/12 页。逐页 ledger 证明 12 个页面 revision 均前进、SHA 均变化、12 个 raster 均为 `pass` 且 `layoutIssues=[]`。
6. 修改前保存为 V17（标记 `Agent 修改前`），完成稿为 V18，V1 仍为不可覆盖的原始版本。验收遗留的未链接空白测试页已清理，`/api/health` 与编辑器均回到 12 页。

## AI 批注协作的安全链路

“交给 AI 修改”已经是可执行链路，但不是无保护地把一句话丢给模型：

1. 先保存批注并执行逐条 revision CAS；另一个窗口更新了同一条批注时返回 HTTP 409，本窗口载入服务端最新版。
2. 用户确认后，服务端获得项目级短期 AI review lock；其他浏览器标签的编辑命令返回 HTTP 423。
3. 创建“AI 修改前”版本快照。
4. DSH 代理必须先调用只读 `read_page`，取得当前页面完整 `id/pageType/elements/background/...` 与 `pageSha256`；`write_page` 必须回传该哈希，presentation-run 在项目写锁内执行 CAS，缺失或过期都会拒绝。
5. 完成后比较受保护页面的实际哈希；若批注绑定元素，还逐元素检查 changed ids、元素层级顺序和页面元数据；同时检查整稿标题、主题和页面顺序，防止“目标元素改对了、整份稿被顺手改坏”。
6. AI 锁绑定不可变项目根目录及其专属快照；另一个标签不能切换项目或用旧版本号恢复到别的项目。失败路径会真正 `cancel` Agent 并等待 `idle`，确认停稳后才恢复；恢复时按字节保留 AI 运行期间其他标签新增的最新批注。
7. AI review lock 使用 15 分钟可续租租约；客户端在模型运行、等待停止和回滚期间每 25 秒续租，verify、restore、release 前还会同步续租。停止、恢复、续租或批注状态回写任一步结果不确定时，产品不再乐观解锁：本标签继续禁用写入，并如实提示“服务端保护状态不确定”。只有验证通过或已确认停稳且恢复成功，才释放锁。

这解决了两类此前会“假成功”的问题：把其他窗口的人工修改覆盖掉，以及 AI 顺手改了批注目标之外的内容却仍显示完成。

## 真实界面验收步骤

1. **运行身份与健康：通过。** 最终构建后重启服务，`/slides/health` 返回 `ok=true`、`kernel=dsh`、`generateReady=true`、`produceGates.hashMatch=true`；提供方为 `minimax-cn / MiniMax-M3`。
2. **完成态生成历程：通过。** 重启后经实际 `3080/app/api` 产品路径重新打开指定项目；仍为 12 页、`phase=complete`、179 条事件。一次编辑器 Agent 改稿已持久化 `page.edit-authorized → page.revision-committed → page.raster-committed`，完成态可回放。
3. **画布可读性：通过。** 当前 V18 的 12 页均为白底、深红标题/图表和中性灰辅助文字；标题、判断与数据原文保持不变，用户指令没有进入幻灯片。封面、第 4 页双图表、第 10 页风险页和第 12 页末页均未出现穿字线或硬裁切。
4. **标题工具栏：通过。** AX 树暴露“文本对齐”“项目符号”“编号”；对齐菜单的完整项为水平：左/居中/右/两端，垂直：顶部/垂直居中/底部。
5. **生成过程展开/收起：通过。** 展开后标签变为“收起完整过程”，不会在打开状态仍写“查看”。
6. **AI review 锁探针：通过。** 最终重启后获取锁为 200；renew 返回新 `expiresAt` 且确实延长租约；模拟新增页面的编辑命令被 423 `AI_REVIEW_LOCKED` 阻止；verify 返回 `changed=false`、`scopeViolation=false`；锁已释放，项目未变。
7. **真实 Agent 整稿改稿：通过。** 在编辑器直接输入“全部改成红白商务风，保留所有事实、数据和图表含义”，真实接收方 `minimax-cn / MiniMax-M3` 分两轮覆盖 12 个授权页并逐页执行 `read_page → write_page → render_page`；右侧画布随页面 11、12、1…10 的实际写入实时跟随。
8. **原始版本恢复：通过。** V18 为当前稿，V17 标记“Agent 修改前”，V1 固定显示为“原始版本”；历史预览不会覆盖当前稿，所有恢复动作还会先保存“恢复前”版本。

## 视觉证据

- 最终重启后，“文本对齐”提示、标准编号图标与真实选区工具栏：`/private/tmp/openkimi-product-audit-20260831b/15-final-toolbar-after-restart.png`
- 最终重启后，12 页/174 条生成历程与“协作与 AI”分流：`/private/tmp/openkimi-product-audit-20260831b/14-final-after-restart.png`
- AI 批注真实提供方确认层：`/private/tmp/openkimi-product-audit-20260831b/08-ai-review-consent-clean.png`
- 协作与 AI 分流面板：`/private/tmp/openkimi-product-audit-20260831b/13-final-collaboration.jpeg`
- 修复后的实时编辑器全景：`/private/tmp/openkimi-product-audit-20260831b/09-final-live-editor.png`
- 真实 Agent 改成红白封面且生成历程为完成：`/private/tmp/openkimi-agent-gap-audit-20260831/13-final-agent-red-white-complete.png`
- V8 当前稿、V7 Agent 修改前、V1 原始版本的完整版本链：`/private/tmp/openkimi-agent-gap-audit-20260831/14-final-version-chain-complete.png`
- V1 深蓝原稿只读预览与“恢复 V1”入口：`/private/tmp/openkimi-agent-gap-audit-20260831/12-v1-original-preview-restorable.png`
- 整稿执行期间右侧已实时切到第 2 页：`/private/tmp/openkimi-agent-gap-audit-20260831/10-whole-deck-live-page-02.jpg`
- 整稿执行期间右侧已实时切到第 9 页：`/private/tmp/openkimi-agent-gap-audit-20260831/11-whole-deck-live-page-09.jpg`
- V18 整稿完成、左侧只保留紧凑结果卡、右侧显示实际成品：`/private/tmp/openkimi-agent-gap-audit-20260831/13-whole-deck-live-complete.jpg`
- V18 当前稿与 V17 `Agent 修改前` 的可恢复版本链：`/private/tmp/openkimi-agent-gap-audit-20260831/16-version-history-v17-before-agent.jpg`

## 自动验证

- `npm run build:native`：通过。
- `npm test`：13 个 workspace、714/714 通过；包含图表/导出、编辑器工具、版本、整稿原子授权、presentation-run 写锁 CAS、DSH `read_page` 哈希与真实 `operatorStop` 停稳。
- `node --test apps/native-web/src/review-threads.test.mjs`：12/12 通过，覆盖 V1 原始版本保护、真实 DSH Agent 路由、整稿意图识别、右侧实时页面刷新、外部提供方确认、紧凑生成历程、comment CAS、HTTP 409、跨标签 AI 锁、租约续租、不可变项目绑定、整稿范围检查与回滚保留最新批注。
- `npm run oracle:validate`：109 个 schema 行文件、108 个 catalog 行，全部通过。
- `node --check`：最终 `app.js`、`server.mjs`、review tests 通过。
- `git diff --check`：本轮关键文件通过。

## 办公场景覆盖

场景级结果沿用同一轮的真实验收产物 `output/qa-office-scenarios/2026-08-31-run10/`：经营月报、教学课件、知识分享、述职报告、工作汇报、项目提案、培训指南、学术答辩共 8 类，均完成页面光栅、硬裁切/低对比/碰撞/穿字线检查和 PPTX 导出。工具级人工验收详见 `docs/qa/openkimi-editor-human-audit-20260831.md`。

## 证据边界与后续方向

- 本轮使用用户正在查看的 Codex 内置浏览器，通过可访问 DOM 与真实点击/输入检查关键 UI；没有把未运行的脚本写成通过结果。
- 已触发一次真实 `minimax-cn / MiniMax-M3` 编辑器改稿并完成可见写入、版本保护、范围验证和渲染检查；这不是 mock 或规则式 Refine。AI 批注和直接对话共用同一套 revision 绑定授权、续租锁、写入 CAS、范围验证与失败回滚链路。
- “边生成边看”已经提供；“人和 AI 同时编辑”暂不开放。若要做真正的同页实时共编，下一阶段应采用元素级 patch + revision CAS/CRDT（或独立 AI 分支预览和人工合并），而不是继续放开 whole-page replacement。
