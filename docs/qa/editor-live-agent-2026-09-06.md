# 独立编辑器真实 Agent 验收 · 2026-09-06

用户已确认本项目独立启动，不接入 DSH.app。正式运行目录为 `/Users/wu/orca/projects/openkimi-slides`，入口为 `http://127.0.0.1:13080/app/hub.html`。使用项目现有 AMD / DeepSeek-V4-Flash 配置，本次没有读取或复制 App 登录令牌。

## 已通过

在 Codex 原生浏览器打开真实生成项目，通过编辑器输入框要求只把主标题改成“独立编辑器验收通过”，其他内容不变。

- 真实模型调用 read_page、write_page、render_page，revision 从 4 到 5，布局检查通过，最终 agentStatus=idle。
- 编辑器显示“DSH Agent 已完成”，恢复输入框和编辑工具，版本更新为 V2。
- 对比 `.versions/v1/pages/page1.page` 与当前页面，唯一差异为主标题的 text 字段；其余内容和排版未改动。
- 点击“查看 V1”显示旧标题且明确只读；点击“回到最新”恢复新标题。
- 以上流程也证明此前独立服务重启后，原生成会话仍能继续进行定向修改。

证据：`output/dsh-app-deploy/live-targeted-edit.json`、`live-title.diff`、`live-title-success.png`。测试会话为 `92f628e5-efd3-4b6f-8648-4c9483445f87`。

## 限定

这验证了当前页标题修改与版本查看，并不代表全部真实模型操作通过。此前整页生成曾反复调整布局，最终由操作者停止；其完整自动完成仍不能标为通过。选区、整稿及真实取消恢复仍需分别验收。原审计报告中自动化及故障测试结论保持各自范围。

## 本轮追加修复

首页选择项目原来只扫描 output 第一层，漏掉 output/dsh-slices 下的真实生成项目。已补齐固定一层扫描，保留样例与旧输出项目，跳过符号链接。native-web 25/25 测试通过；部署后原生浏览器列表显示 11 项，测试生成项目已可直接选择。独立编辑器 55200 已重启，AI Host 13080 保持运行。
