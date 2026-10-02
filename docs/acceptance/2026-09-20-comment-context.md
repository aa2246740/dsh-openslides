# 批注即对话上下文

> 后续真实模型验收发现并修复了同页多批注校验、执行范围与误报完成问题。以下是当时的 UI/替身测试记录；实际模型闭环以 [真实执行验收](2026-09-20-comment-real-loop.md) 为准。

按用户最新反馈，移除浮卡中的勾选、全部批注、保存/解决和范围选择器。交互为：点对象或拖框 → 写意见 → 添加 → 连续标记 → 左侧统一发送。浮卡中已有意见只提供更新/移除；左侧直接显示每条待发送意见，可以定位和移除，移除可撤销。

对照 [Codex Browser 官方批注流程](https://learn.chatgpt.com/docs/browser#comment-on-the-page)：开启标注、点选/拖框、记录意见、通过聊天发送。本机原生工具禁止读取 Codex 自身，故本次证明行为对齐，不声称逐像素复刻。

## 验证

- `comment-selection-dom.test.mjs`：真实点击、Shift 多选、12 步拖框、Cmd/Ctrl+Enter、更新、移除、撤销、刷新恢复、退出模式。断言无残留编辑选框，无勾选/范围选择器；更新保留目标、锚点与创建时间，PPTD 文件逐字节不变。
- `comment-targets.test.mjs` 与 `work-agent-scope.test.mjs`：8 项范围测试通过，连同上面的 DOM 流程共 9 项。
- `editor-comment-batch.mjs`：15 步通过。真实 review 服务，模型 turn 使用 stub；3 条/2 页自动恢复，跨页定位和编号对应，未点更新的最新文字随发送保存；一条模型请求、一个快照，包含所选模型和补充要求；成功收起、刷新不回流；失败保留并从 composer 重试。
- `editor-ai-workspace-comment-agent.mjs`：8 项通过。独立临时服务/项目验证保存、刷新、无 AI 会话时诚实拒绝，文稿和标题无伪修改。
- 固定 Playwright 1.61.1 / Chromium Headless Shell 1228，1440、877、375 宽：浮卡边缘换边、保持在屏幕内、不覆盖点击点，浮卡不占画布布局宽度。375 宽时会覆盖部分画布，可关闭后继续。
- 原生浏览器复核 55201 当前城市步行项目：原有“用红色的字”自动显示在对话中，点击定位正确；画布点击可立即写意见。没有发送、修改或移除用户原意见。

本轮仅静态前端和验收材料变更，刷新已生效，无需重启编辑器、产品内核或主 DSH。当前模型菜单继续沿用本地 DSH 提供的模型。

![当前项目批注](assets/2026-09-20-comment-context/live-note.png)

![跨页批注待发送](assets/2026-09-20-comment-context/batch-ready.png)

![375 像素边缘浮卡](assets/2026-09-20-comment-context/draft-375.png)
