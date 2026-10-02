# 批注统一从对话发送

用户指出右侧批注和左侧对话都能交给 AI，造成重复。现按“批注附到对话、一次发送”执行：右侧只负责添加、编辑、勾选和解决；添加后自动附到左侧，已有批注支持跨页勾选；左侧可补充要求、选择模型并一次发送。移除右侧 AI 提交、执行重试/停止与二次确认卡片。

选中批注的编辑草稿会保留，发送前保存最新文字。批量回合共用原有范围锁、版本快照与失败恢复；失败保留附件，成功清空已发送附件。

## 验收

- `node --test apps/native-web/src/comment-selection-dom.test.mjs apps/native-web/src/comment-targets.test.mjs apps/native-web/src/review-threads.test.mjs`：38 项通过。包括进入批注清空编辑选区、添加自动附选、切换选择保留草稿、批量锁与范围保护。
- `node scripts/qa/editor-comment-batch.mjs`：15 步通过。使用实际批注服务与隔离文稿，模型调用由 stub 代替。3 条批注/2 页一次点击只提交一个回合和一个快照；请求携带所选模型、最新批注、补充说明；成功清空附件；注入回合失败后保留附件，仍由左侧发送重试。没有将此测试作为模型改稿质量的证据。
- `BASE=http://127.0.0.1:55201 node scripts/qa/editor-ai-workspace-comment-agent.mjs`：临时文稿的批注保存、落盘和刷新恢复通过；没有 AI 会话时明确报错，文稿文件和模型标题未改。
- 原生浏览器在用户当前城市步行项目复核：右侧没有 AI 执行按钮，左侧显示“已附 1 条批注 · 1 个页面”和“发送 1 条批注”。现有“用红色的字”保留，未执行该修改。
- 1440 × 900 渲染中，批注列表、附件提示和唯一发送入口可见，右侧添加按钮使用次要样式。877 像素宽的真实窗口沿用已有抽屉布局，画布会被右侧面板部分遮挡；本轮未改窄屏布局。

![跨页批注待发送](assets/2026-09-20-collaboration/comments-single-send-batch.png)

![当前项目原生浏览器](assets/2026-09-20-collaboration/comments-single-send-live.png)

静态源码由 55201 直接提供，当前页已刷新。没有重启主 DSH 或隔离内核。读取错误重试的旧 Oracle 证据实际指向 AI 回合失败测试，已更正归属并降为 implemented，避免混报验收。
