# 连续协作与编辑验收 · 2026-09-20

实现并激活了“先讨论 → 生成 → 继续讨论 → 定向修改 → 手动细调 → 可编辑导出”的主路径。入口为 `http://127.0.0.1:55201/`。实际工作仓库为 `/Users/wu/Documents/DSH-output/openslides`，基线提交 `1a65abf`。本次保留本地源码改动，未提交或推送。

## 用户可见变化

- 首页可选“先聊思路”或直接生成；历史项目显示标题与页数，点击后继续原会话。
- 编辑器持续显示对话。自动判断讨论/修改，也可显式选择；讨论轮在宿主工具层只读，不触发文稿修改。
- 输入框下方可以切换已连接模型，失败后沿用同一会话继续，不丢失原需求。
- 定向修改显示目标页/对象，完成后恢复手动编辑并保留版本恢复入口。“所选标题、图片、图表”等常用说法支持对象范围。
- 对话与画布在桌面并排；窄屏可收起对话查看文稿；无选区时隐藏空属性栏。
- 修复旧模型故障阻止后续编辑、恢复版本丢失对话、后台渲染被持续连接拖到超时的问题。默认不再自动删除七天前的作品；显式配置保留天数仍生效。

## 真实产品操作

使用隔离产品 `.dsh/home`、内核 13081、侧车 55201；主 DSH 43127 未重启。没有修改用户原有文稿。模型为本地已连接的 `opcode/deepseek-v4.1-flash`。

1. `deck-74021fe2`：连续讨论两轮，沿用需求生成两页“城市步行”；两页均完成写入、渲染、检查与可编辑导出。
2. 同一文稿要求只改第二页标题。第一次实测发现旧故障误判导致回滚，修复后重新执行成功；随后手动双击修改标题、保存，再用撤销恢复。
3. 从首页重新打开项目（无 `session` / `live` URL 参数），单击标题并输入“把所选标题改成‘每天走一点，轻松多一点’”。界面显示具体目标文字，最终 YAML 仅 `p2-title.content.text` 变化，第一页 SHA-256 不变。
4. 最终运行版本中 `render_page` 与 `review_page` 均成功，页修订 4，排版通过；编辑完成后工具栏恢复。
5. 随后继续问先前约定的配色，回答“米白 #F7F4EC、深蓝 #14355C”，且文稿未变化。
6. `deck-cf3bfd57`：从“先聊思路”创建两页读书分享讨论，Muse 免费线路返回客户端限制后，在同一会话切到 DeepSeek，正确复述两页提纲，页面文件数仍为 0。
7. 真实点击导出菜单完成 PPTX 下载；最终标题修改后再通过同一产品导出接口核对：2 页、19 个原生文字节点、原生覆盖率 1、降级 0、67182 字节。

[桌面编辑器](assets/2026-09-20-collaboration/editor-877.png) · [窄屏对话](assets/2026-09-20-collaboration/editor-390.png) · [修改完成回执](assets/2026-09-20-collaboration/selected-edit-after.png) · [首页](assets/2026-09-20-collaboration/home-after.png)

## 验证范围

| 检查 | 结果 |
| --- | --- |
| DSH Host 测试 | 242 / 242 |
| 会话、生成状态、项目发现、保留策略及范围等定向测试 | 51 / 51；追加所选标题范围回归 4 / 4 |
| 真实 DOM 会话与恢复 | 5 / 5 |
| 恢复/批注与当时 DOM 回归批次 | 36 / 36（与上项有重叠，不累加） |
| 渲染与对比度 | 21 / 21 |
| 改动的 Host / presentation-run / agent-harness 构建 | 通过 |
| 1440 / 1024 / 877 / 390 px 布局 | 无横向溢出，输入框可见，手机可切回画布 |
| Oracle catalog | 119 个 row 文件、118 个目录项校验通过 |
| 实际 Host produce gates | `hashMatch: true`、`generateReady: true` |

浏览器交互使用 Codex 原生 Browser；自动化 DOM/渲染采用固定 Playwright 1.61.1 / Chromium 1228。证据和日志位于 `output/collaboration-acceptance-2026-09-20/`，包含最终 PPTX、页面图、范围差异、导出与布局报告。没有将私有配置或完整运行日志放入证据包。

## 已知边界

- 上游 `zen-free/muse-spark-1.3-contributor-free` 返回 403，声明免费层只能从 OpenCode 客户端调用；UI 现有清晰提示，可换模型继续。本次完整流程使用 DeepSeek。
- AMD 的原默认 DeepSeek-V4-Flash 在本次请求返回模型不支持，未擅改账号配置。
- 以上是本次主路径和相关回归的验证，不代表仓库全部 `qa:all` 通过。交接中记录的旧 Pi 接口及旧选择器 QA 脚本未纳入本次证明。
- 未验收复杂大型文稿、编辑中断时的跨刷新恢复、内网离线安装包；本次没有发布线上版本。

## 复跑布局检查

```sh
BASE=http://127.0.0.1:55201 PROJECT=output/dsh-slices/deck-74021fe2 node scripts/qa/continuous-collaboration-responsive.mjs
```

先等待文稿的讨论轮结束。其他行为测试见 `apps/native-web/src/assistant-conversation.test.mjs`、`generation-process-dom.test.mjs`、`work-agent-scope.test.mjs` 与 Host 会话测试。接口与持久化说明见 [连续协作契约](../architecture/continuous-collaboration.md)。
