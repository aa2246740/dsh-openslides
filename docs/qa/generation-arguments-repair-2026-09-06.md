# 生成参数故障修复

真实任务 b7c22a8e 在 write_page 等调用中多次把业务参数套进 arguments，累计 80 次工具失败，页面目录为空。最后检查时 13080/55200 均未监听，日志未包含明确的进程退出原因，不能把服务停止归因于某个未证实的故障。

修复边界：仅独立 OpenSlides 的产品工具注册入口兼容最多四层单字段 arguments 包裹；原 schema、必填校验、权限与调用记录保留。成功定义仍以真实页面写入为准。重复 SDK INVALID_ARGS 三次触发停止并记录明确原因，业务校验失败不混同处理。

验收计划：真实 SDK ToolRuntime 回归；本次失败 payload 在项目副本原样重放；恢复独立服务、继续原会话并确认页面产生。下文补充实际结果，未完成的验证不作完成声明。

## 已完成验收

- Host 135/135、bundle 5/5；真实 ToolRuntime 验证两个产品工具注册路径、单层/双层包裹、严格拒绝边界。
- 重复 SDK INVALID_ARGS 第三次触发暂停，成功/业务返回/新轮次重置；错误字段与原会话官方 journal 实际形状一致。
- scripts/qa/replay-write-page-arguments.mjs 原样重放本次完整4199字符、11元素的失败参数：参数校验通过，文字重叠按原门槛拒绝且未落盘。只修两个 bounds 后真实 outcome=written，11元素可重新载入；再提交缺 id 参数仍 INVALID_ARGS，页面 SHA 保持不变。
- 已部署当前独立项目，启动 Host PID22561；health HTTP200 generateReady=true。通过原session turn接口继续生成，HTTP200 busy。最初恢复后的write_page已从参数错误推进到具体排版检查，仍在等待真实页面落盘。

## 原项目实际结果

原session恢复后，cover_tep 成功返回 outcome=written、revision=1、layoutStatus=pass、layoutIssues=[]，页面 SHA256 为 9769137daf47dbeb25678cd57d22c4e2060249275e86dcc9670e765fba268da2。原生浏览器已显示封面及“已写入1页”。参数重复失败阻塞解除；其余页面仍在生成并处理排版反馈，尚未宣称全稿完成或视觉质量验收通过。
