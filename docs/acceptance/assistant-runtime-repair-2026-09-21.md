# 连续对话执行修复验收 · 2026-09-21

本轮修复的是上一轮真实验收暴露的执行失败，并继续处理测试中新发现的范围和内容保留问题。代码、独立 Slides Host 和浏览器已更新。真实模型验收使用已有的合成「城市观星入门」长会话，未向模型发送用户的原文稿。

## 修复结果

| 问题 | 修复 | 验证 |
| --- | --- | --- |
| 没有指定页码却扩大到整份文稿 | 默认绑定发送时的当前页；非当前页范围必须有最新请求中的明确范围证据，历史全稿任务不会自动继承 | 24/24 条真实模型范围判断；在第 2 页发无页码请求，两个模型均只修改第 2 页 |
| 模型把页码字符串 `02` 写成数字 `2`，反复参数错误 | 只在显示文字字段兼容有限数字；匹配刚读取的页面哈希时保留原字符串格式；实际数字数据和非法类型不放宽 | 真实 ToolRuntime 写入回归；陈旧哈希、错误类型和表格数字案例 |
| 重新读取页面让错误重试计数归零 | 读取成功不再清除另一写入工具的重复错误计数 | 连续错误中夹入读取的回归测试 |
| 长会话已有完整回复却被误判超限，随后回滚 | 以供应商成功 stop 为准，不用过时的本地容量估算否定成功；真实错误和零输出超限仍报错 | MiniMax-M2.7 长会话完成；MiniMax-M3 在约 31.3 万上下文计数下完成，保留原 usage |
| 生成中刷新导致事务丢失、版本链接消失 | 保存已接受请求及修改前版本的关联；刷新接续同一轮检查和收尾，跨标签避免重复提交；版本入口从持久化记录重建 | 真实模型生成中刷新、只接受一次请求、完成后释放编辑锁；点击修改前版本进入只读预览，再回到最新并继续输入 |
| 只改背景也意外改动标点和空格 | 新增背景专用修改工具，服务端读取并保留页面其余字段；不再让模型抄写整页 | 两个模型的 YAML 对比均仅有 `background.color` 改动，其他页面和文稿元数据文件哈希一致 |

## 真实闭环

会话：`8a06f686-44e6-4b32-b9f1-e59202c13e1c`。直接在原生 Codex 浏览器的编辑器输入，不跳过前端范围判断或执行保护。

- MiniMax-M2.7，第 19 轮：在第 2 页发送「把背景色改成 #162A46，文字和元素位置保持原样。」；调用 `read_page → edit_page_background`；正常结束，V23 标记 applied，锁释放；逐字段对比确认只改背景。
- MiniMax-M3，第 20 轮：在同一长会话发送「把背景色改成 #101F38，文字和元素位置保持原样。」；调用 `read_page → edit_page_background → render_page`；生成中刷新；只收到一次请求，V24 标记 applied，锁释放，排版检查通过；逐字段对比确认只改背景。
- 完成后点「查看修改前」，进入 V24 只读预览，再点「回到最新」；输入测试草稿成功，随后清空。原文稿刷新后 V19 的修改前入口也恢复。
- 用户原文稿的 deck.pptd、两份 page 和持久化对话均与激活前备份逐字节一致。主 DSH 43127 的进程保持运行。

MiniMax-M2.7 使用明确指定的 #162A46 并保留既有文字色，因此页脚与页码对比度为 4.26；Agent 如实提示，未擅改受保护文字属性。随后 #101F38 的 M3 场景所有排版检查通过。不能把前一个场景写成视觉全通过。

## 自动化与证据

- 相关协议、参数、范围、工具、完成状态回归：**58/58 通过**。
- 真实 MiniMax-M2.7 范围判断：**24/24 通过**；最终解析器对同一批输出回放 **24/24 通过**。
- 原生编辑器 DOM 验收：范围及刷新接续、输入框及新草稿、对话滚动三组通过。滚动用例一次等待超时，加入故障输出后原用例重跑通过；未将那次超时当作成功。
- 1440、877、390 宽度下无横向溢出；流式更新、完成后阅读、跟随底部三种滚动位移测量均为 0。DOM 测试使用固定 Playwright 1.61.1 / Chromium Headless Shell 1228。

证据目录：[assistant-runtime-repair-2026-09-21](../../output/assistant-runtime-repair-2026-09-21/)。

- [MiniMax-M2.7 页面差异与工具记录](../../output/assistant-runtime-repair-2026-09-21/long-minimax27-background-final.json)
- [MiniMax-M3 长会话、刷新接续和页面差异](../../output/assistant-runtime-repair-2026-09-21/long-minimax3-background-final.json)
- [原文稿保留证明](../../output/assistant-runtime-repair-2026-09-21/original-preservation.json)
- [回归测试日志](../../output/assistant-runtime-repair-2026-09-21/regression-final.log)
- [最终范围矩阵](../../output/assistant-runtime-repair-2026-09-21/scope-final-parser-replay.json)
- [输入框验收](../../output/assistant-runtime-repair-2026-09-21/composer-dom-proof.json)、[范围验收](../../output/assistant-runtime-repair-2026-09-21/scope-dom-proof.json)、[滚动测量](../../output/assistant-runtime-repair-2026-09-21/scroll-dom-proof.json)
- [实际编辑器完成画面](../../output/assistant-runtime-repair-2026-09-21/native-m3-final.png)、[修改前只读预览](../../output/assistant-runtime-repair-2026-09-21/native-m3-before-version.png)、[原文稿刷新后的界面](../../output/assistant-runtime-repair-2026-09-21/native-original-reloaded.png)

验收覆盖页面刷新后接续现有服务中的任务；没有把它表述为服务进程崩溃或浏览器离线超过编辑锁有效期后的恢复保证。本轮未重测全部导出格式，也未将这些针对性检查扩大为整个产品零缺陷的结论。
