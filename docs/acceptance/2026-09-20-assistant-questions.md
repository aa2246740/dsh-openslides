# 左侧对话与原生问题卡验收

2026-09-20。修复目标：明确请求直接执行；需要用户选择时，用 DSH 原生提问机制在左侧原对话中显示问题卡，回答后继续同一回合。

## 最终交互

- 点击发送后，原请求立即进入对话，输入框清空本次草稿；可以继续写下一条。接收、完成和失败均不会清掉后来输入的内容。
- 删除整份文稿确认弹窗及画布上的重复 Agent 进度条。提问、选项、进度、结果和重试集中在左侧既有对话。
- 原生 ask_user_question 支持单选、多选、自定义回答、取消。明确要求修改时不再次确认；“先选方案，选完直接改”在同一编辑回合完成。
- 状态查询短暂断线会有界重连；回退文稿保留问题答案。未选中的表格不再显示默认单元格蓝框。

## 真实模型闭环

使用本地已配置的 OpenCode / deepseek-v4.1-flash，测试会话为 8a06f686-44e6-4b32-b9f1-e59202c13e1c，文稿是合成的《城市观星入门》。没有把用户的城市步行文稿送给模型。

### 选择后继续修改

发送原句：“把整份两页文稿换成暗色背景、亮色文字，保留内容和布局。先让我从深蓝、深紫里重新选一次，选完直接完成两页修改。”

模型在第 11 回合调用真实 ask_user_question，前端在左侧渲染原生请求。选择深紫后，答案返回等待中的工具；同一回合继续读取、修改、渲染两页，最终 idle 并释放写入锁。两页背景均为 #1B1230，变化全部属于配色，文字、坐标、字号和元素顺序均未改变。等待答案阶段文件未变；在输入框另写的“新的草稿仍然可以继续输入。”在接收答案和完成后保持原样。

### 明确请求直接执行

发送原句：“把整份文稿的背景都改成深蓝 #0E1B33，其余内容保持不变。”

第 12 回合直接执行，没有新增问题、没有确认弹窗。最终两页文件都只有 background.color 从 #1B1230 变成 #0E1B33；其余字段逐值相同，deck.pptd 完全相同。模型完成两页渲染，回合 idle，写入锁已释放。

用户原始文稿两页的 SHA-256 与激活前备份一致。

## 已发现并修复的失败

第一轮真实测试把“选完直接改”误分为讨论，输出正文选项。修正意图判断和逐轮交互提示后，模型主动调用原生提问工具，答案返回后继续修改。

随后一次旧前端的状态查询 502 触发了错误回滚，旧编辑服务还丢掉了刚回答的问题。现在只读状态查询有 30 秒重连窗口，不重发执行请求；回退保留提问文件。失败注入测试确认 502 不取消回合，真实文件回退测试确认答案保留。更新服务后重新跑通上述两条真实路径。

## 自动与界面检查

- Host 构建通过。
- 75 项相关检查全部通过：原生 DSH 服务与 waterfall、答案验证、幂等、取消/停止、保存失败、历史上下文、输入发送、编辑范围、问题卡、生成过程和批注回归。
- 删除画布状态浮条后，37 项相关检查再次通过。
- 新增的 502 断线专项和快照回退保留答案专项各通过 1 项。
- 问题卡在 1440、877、390 像素宽度无横向溢出；可选、自定义、重试、取消，控制台无脚本异常。
- 原生浏览器验证表格初始无蓝框，选中有蓝框，取消后可见蓝框为 0。

刷新恢复测试覆盖等待回答的只读对话；正在修改页面时刷新后的事务接管不属于本次完成的验收。未进行全产品功能重新验收。

## 激活

实际代码位于 /Users/wu/Documents/DSH-output/openslides。编辑服务 55201 和独立 Slides Host 13081 已加载新代码。更新前核对 78 个有效会话均空闲、无待答问题、无修改锁，并备份原稿与已知草稿；主 DSH 43127 未重启。内置浏览器原文稿在确认没有未发送输入后刷新。其他浏览器的旧标签页仍需要自行刷新，未代替用户提交其中的草稿。

## 证据

- [真实问题卡](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-question-final.png)
- [选择后完成与保留新草稿](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-choice-complete.png)
- [最终单一对话与两页结果](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-direct-complete.png)
- [选择回合文件差异](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-choice-proof.json)
- [直接修改文件差异](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-direct-proof.json)
- [输入与完成状态](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/real-choice-ui.json)
- [响应式和问题操作](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/question-dom-proof.json)
- [75 项测试结果](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/tests-final.log)
- [断线重连测试](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/reconnect-final.log)
- [回退保留答案测试](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/question-rollback-final.log)
- [表格选区状态](/Users/wu/Documents/DSH-output/openslides/output/assistant-questions-acceptance-2026-09-20/table-selection-proof.json)
