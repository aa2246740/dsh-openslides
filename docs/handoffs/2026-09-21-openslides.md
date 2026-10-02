# Open SlideStudio 接手文档 · 2026-09-21

核验时间：2026-09-21 10:21（Asia/Shanghai）。这是同一台 Mac 上的项目交接，包含当前未提交源码、本地运行环境和验收资料的定位；不是可以脱离本机运行的发布包。

本轮用户只要求交接。没有继续改业务代码、切换模型、重启服务或发起新的模型任务；只读复核了进程、健康接口、关键会话、原稿哈希及已有证据。

## 先读这五点

1. **实际仓库是 `/Users/wu/Documents/DSH-output/openslides`。** 当前任务的旧 cwd `/Users/wu/Documents/ChatGPT/openslides` 不是正在运行的源码；也不要去改它的 `latest`。
2. 当前分支 `nativeGen`，HEAD `1a65abfcdaff3467ee9ece0c0031200ec3843349`。交接文档落盘前有 **59 个已跟踪文件变更、93 个未跟踪文件**。这些工作尚未提交；保留整个工作树，不要 reset、clean 或用旧 checkout 覆盖。
3. 产品已经支持连续讨论、生成、批注修改、指定页编辑、原生问题卡和版本回看。下面的验收按场景列出，不代表整个产品已经没有问题。
4. 最新的 **Devin 本地代理已接入，原文稿已选中 `devin-local / devin/swe-2`**。真实聊天与流式工具参数测试通过；**尚未用 Devin 完整验证 PPT 生成 → 修改 → 导出**。第一次真实聊天出现过 60 秒上游超时，重试成功，未宣称解决其稳定性问题。
5. 主 DSH 在 **43127**，Slides 独立 Host 在 **13081**，编辑器在 **55201**。后续产品改动不要影响主 DSH；先确认当前进程身份和会话状态，再决定是否激活新代码。

本文件取代 `/var/folders/3s/358mwqw14630yh2f7d121v4h0000gn/T/openslides-handoff-2026-09-20.md` 中的运行状态。旧文件的“干净工作树”、旧模型优先级、`.dsh/home-editor-qa` 启动示例等已经过时。

实时证据：[运行快照](/Users/wu/Documents/DSH-output/openslides/docs/handoffs/2026-09-21-openslides-evidence/runtime-snapshot.json)、[写交接前的完整 Git 状态](/Users/wu/Documents/DSH-output/openslides/docs/handoffs/2026-09-21-openslides-evidence/git-status.txt)。快照不是源码备份；仅 clone 当前 HEAD 无法拿到这些未提交成果、本地会话或 output 证据。

## 用户要的产品，以及已经明确的交互决定

用户要一个能持续协作的 AI PPT 助手：聊需求、生成文稿、继续讨论、修改细节，在同一个会话内完成。模型可以复用本地 DSH、OpenCode DeepSeek、免费模型或 Devin。不要把生成器、编辑器和聊天做成几个断开的流程。

以下来自用户在本会话中的明确反馈，后续设计应延续：

- **左侧是唯一 Agent 对话与提交入口。** 回复、过程、错误、原生选择题、版本入口都归属对应回合，避免再加右侧 Agent 操作区、独立完成卡和确认弹窗。
- 批注在光标附近打开非模态浮卡。添加意见后作为聊天上下文，从左侧一次发送；不恢复“勾选批注 / 右侧交给 AI / 保存 / 解决”等重复流程。
- 保留拖框多选，作为自然手势。松手后显示实际命中的每个对象，编号和名单对应，可以点 × 或 Shift 点击增减，检查范围后再添加意见。删除最后一个对象不能悄悄扩大到整页。
- 批注模式与普通编辑选区分开，不能残留可拖动、缩放的编辑手柄。轮廓必须贴合实际绘制对象。
- 去掉“自动 / 讨论 / 修改”选择器，由模型判断意图。请求没有指定页码时默认当前页；“背景 / SVG / 换配色”不等于全部页面；明确“1、2 页”必须覆盖两页。
- 发送后原草稿和已提交批注立即离开输入区；用户可以继续写下一条。回执、失败、完成和重试都不能覆盖新草稿。
- 回复要正常显示 Markdown，过程可以展开，但不能淹没最终答复。刷新后版本入口不消失，完成时不把阅读位置推走。
- 必须实际跑通用户路径再说完成。发现问题应在授权范围内继续修复，不能只交一份问题清单。

项目自身约束见 [AGENTS.md](/Users/wu/Documents/DSH-output/openslides/AGENTS.md)：YAML PPTD v2 是文稿唯一事实来源，支持多模型和可编辑 PPTX；不要用整页图片替代文稿，也不要扩展 legacy 双模型路径。产品界面改动遵循仓库已有设计契约和 Oracle 记录。

## 当前运行现场

| 服务 | 本轮复核结果 | 用途 |
| --- | --- | --- |
| 编辑器 | `127.0.0.1:55201`，PID `29866` | `apps/native-web/src/server.mjs`，cwd 为实际仓库 |
| Slides Host | `127.0.0.1:13081`，PID `40037`，launcher `40014` | 本仓库 DSH `--profile slides` |
| 主 DSH | `127.0.0.1:43127`，PID `19850` | 用户独立工作环境，保留 |
| OpenCode gateway | `127.0.0.1:4488`，PID `88716` | 当前在线；旧文档中的离线结论已过时 |
| Devin CLIProxyAPI | `127.0.0.1:8317`，container runtime PID `16819` | Apple Container `cliproxyapi-devin` |

PID 是这次快照，后续不能拿它当固定配置或直接复制旧 kill 命令。编辑器和 Host 的 cwd 均已通过 lsof 复核。

当前隔离配置：

```text
DSH_HOME=/Users/wu/Documents/DSH-output/openslides/.dsh/home
SLIDES_DSH_PORT=13081
SLIDES_EDITOR_PORT=55201
SLIDESTUDIO_RETENTION_DAYS=0
```

`GET http://127.0.0.1:13081/slides/health` 本轮返回 `ok=true`、`generateReady=true`、produce gates 通过且 hashMatch=true，当前选择为 Devin。render/exportPptx 可用；research、imageSearch、imageGenerate 显示未配置，不能把这些能力当作已验收。

供应商目录中 MiMo、MiniMax、AMD、OpenCode gateway 的多个入口、Devin、Grok 标记 ready。ready 表示配置可用，不等于本轮逐个做了真实调用。不要输出 `.credentials.yaml` 或 settings 中的完整凭证。

### 用户原文稿：必须保留

- 标题：**协作验收：城市步行**。
- 项目：`/Users/wu/Documents/DSH-output/openslides/output/dsh-slices/deck-74021fe2`。
- 会话：`74021fe2-bdfa-4f9f-819c-d0549507698e`。
- [打开编辑器](http://127.0.0.1:55201/index.html?project=%2FUsers%2Fwu%2FDocuments%2FDSH-output%2Fopenslides%2Foutput%2Fdsh-slices%2Fdeck-74021fe2&workspace=1)。
- 两页：`1_cover`、`2_tips`。`.versions/manifest.json` 最后快照为 `v19`；最近界面中的 V20 是其后的当前文稿，不要误认成本次又改了一版。
- 当前模型 `devin-local / devin/swe-2`，agent idle，无待回答问题。接入时只切模型，没有把这份原稿发给 Devin 做测试。
- 原请求“用 SVG 设计点背景吧”曾错误覆盖两页；后续已修复范围默认值，**没有擅自撤销用户原稿已有的 SVG**。
- 本轮重新计算 deck、两份 page、持久用户对话的 SHA-256，与 Devin 接入验收记录完全一致。具体哈希在运行快照中。

### 两份合成验收项目

| 项目 | 会话 | 当前用途 |
| --- | --- | --- |
| `output/dsh-slices/deck-8a06f686`，城市观星入门 | `8a06f686-44e6-4b32-b9f1-e59202c13e1c` | 两页长会话，最近模型 MiniMax-M3。第 20 轮只改第 2 页背景为 `#101F38`；v24 为修改前快照，outcome=applied。保留了历史失败与恢复过程。 |
| `output/dsh-slices/deck-baba3a10`，Devin 接入验收 | `baba3a10-26c2-444f-aa37-5f7a5e6d062c` | 0 页，只测回复“Devin 已连接”。第 1 次超时，第 2 次成功；不是生成文稿验收。 |

三个会话本轮都是 idle。注意：`GET /slides/state/:id` 的 execution projection 仍可能带着历史 `failed`、`operator stopped the turn`、`structural_review_needed`；Devin QA 的 phase 也仍显示首轮超时。它们与最新聊天完成事实并非一回事。应结合本轮 journal、用户消息、assistantOutcome 和页面差异判断；不要仅看到旧 failed 就重启、回滚或续跑用户任务。这个状态投影差异值得后续单独整理。

## 已完成工作与验收位置

下面引用已有验收，不是在写交接时重新跑了一遍。较早文档中的 UI 中间方案，以最新 [连续协作契约](/Users/wu/Documents/DSH-output/openslides/docs/architecture/continuous-collaboration.md) 为准。

| 工作 | 已有证据 | 边界 |
| --- | --- | --- |
| 连续聊天 → 两页生成 → 只读追问 → 指定第 2 页标题修改 → PPTX 导出 | [对话验收](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-assistant-chat.md)：真实 DeepSeek + 原生浏览器；只改标题一行；另页与 deck 哈希不变；导出 2 页、coverage=1、degradations=0，新标题在 slide2.xml | 9 月 20 日证据，9 月 21 日未重测全部导出格式 |
| 批注浮卡、单一发送、批量范围校验、发送回执 | [批注上下文](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-comment-context.md)、[真实批量修改](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-comment-real-loop.md)、[发送状态](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-comment-send-state.md) | 批量执行按唯一页面聚合授权，但必须逐条意见验证目标变化 |
| 框选命中、逐对象确认/取消、响应式布局 | [选区验收](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-annotation-selection.md)：相交即命中；七种窗口尺寸及同页连续缩放；输入和目标持久化检查 | 移动宽度是 Chromium 模拟，未测真实 iOS 键盘及触控拖动 |
| 装饰线高亮与绘制层偏移 | [几何验收](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-shape-alignment.md)：修复内联 SVG 基线偏移；9 组绘制几何检查，最大偏差 0 | 改共享绘制层，没有改原稿坐标；同时修了播放缩放原点 |
| 左侧原生提问卡、自动意图、统一消息流、版本链接与滚动 | [原生提问](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-assistant-questions.md)、[对话稳定性](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/2026-09-20-conversation-stability.md) | 问题答案恢复同一等待工具，不能另起 Agent 回合；过程展开不是重复结果区 |
| 默认当前页、数值文本协议、重复错误保护、长上下文完成、刷新接续、背景专用工具 | [9 月 21 日执行修复](/Users/wu/Documents/DSH-output/openslides/docs/acceptance/assistant-runtime-repair-2026-09-21.md)：58/58 回归；24/24 真实范围判断及最终解析回放；M2.7/M3 原生 UI 长会话修改 | 下文有精确边界；不是完整仓库所有测试通过 |

### 9 月 21 日的关键执行修复

- 非当前页范围必须引用最新请求中的明确范围证据。复制整句“改背景”不能授权全稿，已完成的全稿任务范围不会自动继承。纯讨论仍受服务端只读约束。
- `write_page` 对原生文字槽位中的有限数字兼容；匹配刚读取的页面 hash 时保留 `"02"` 等格式。图表数字、几何、ID、非法 object/null/boolean 不放宽。
- 读取成功不会清除另一个写入工具的连续 INVALID_ARGS 计数，防止“失败 → read_page → 失败”无限绕过保护。
- 本地模型容量估算不能把供应商已成功 `stop` 的回复改判为超限。保留 usage；真实超限错误及零输出 length 仍报错。
- 已接受编辑请求、修改前快照和保护状态跨刷新保留；使用浏览器互斥锁由一个标签页收尾，不重新发起模型请求。
- 新增 `edit_page_background({pageId, expectedPageSha256, background})`。服务端合并背景，避免模型抄写整页时改动标点。只在有效 page/pages/deck 编辑授权下开放，讨论和纯元素批注不开放。

证据目录：[assistant-runtime-repair-2026-09-21](/Users/wu/Documents/DSH-output/openslides/output/assistant-runtime-repair-2026-09-21)。优先读：

- [M2.7 第 19 轮差异](/Users/wu/Documents/DSH-output/openslides/output/assistant-runtime-repair-2026-09-21/long-minimax27-background-final.json)：仅第 2 页 background.color 改为 `#162A46`，页外文件相同。固定原文字色导致页脚/页码对比度 4.26，Agent 如实提示；**不能写成视觉全通过**。
- [M3 第 20 轮差异及刷新接续](/Users/wu/Documents/DSH-output/openslides/output/assistant-runtime-repair-2026-09-21/long-minimax3-background-final.json)：仅 background.color 改为 `#101F38`；长上下文约 31.3 万计数；生成中刷新只接受一次请求，v24 applied、锁释放、排版通过。随后版本预览返回、继续输入均通过。
- [58 项回归日志](/Users/wu/Documents/DSH-output/openslides/output/assistant-runtime-repair-2026-09-21/regression-final.log)、[24 项最终范围解析回放](/Users/wu/Documents/DSH-output/openslides/output/assistant-runtime-repair-2026-09-21/scope-final-parser-replay.json)。
- 同目录 `scope-dom-proof.json`、`composer-dom-proof.json`、`scroll-dom-proof.json`：范围、刷新、输入和阅读锚点。1440/877/390 无横向溢出，三种滚动位移测量为 0；一次滚动等待超时后加诊断重跑通过，失败没有被改写成成功。
- 同目录 `activation-background-tool/activation-result.json`：构建产物与隔离 profile 的 tools hash 相同，编辑器和主 DSH 保留。不要重用临时激活脚本中的旧 PID。

第 18 轮曾出现模型声称只改背景、实际还改两个标点的问题；真正的“仅背景变化”证据是加入专用工具后的第 19/20 轮。

## Devin 接入详情

| 项目 | 当前值 |
| --- | --- |
| Provider / 显示名 | `devin-local` / `Devin 本地代理` |
| Model | `devin/swe-2` |
| Base URL / API | `http://127.0.0.1:8317/v1` / `openai-completions` |
| 配置来源 | 本地 `~/.dsh/settings.yaml`，由 Slides 启动导入隔离 `.dsh/home/settings.yaml` 和模型目录 |
| 凭证引用 | `DEVIN_LOCAL_API_KEY`，隔离 home 的 `.credentials.yaml` refs；不要寻找不存在的 `credentials/devin-local.key` |
| Proxy | Apple Container `cliproxyapi-devin`，镜像 `localhost/cliproxyapi-devin:7.3.10-arm64`，7.3.10 / commit `a5ab6952` |

接入时目录里已存在该模型，不需要再建一份 Provider 或重启 Host。Proxy 的 `/v1/models` 有其他 Devin 模型，但 Slides 本次只接入 SWE-2，没有把所有模型自动加入选择器。

Proxy 本地目录：

```text
/Users/wu/Documents/Codex/2026-09-21/w/work/CLIProxyAPI
/Users/wu/Documents/Codex/2026-09-21/w/outputs/cliproxyapi/
  start.command
  stop.command
  control.py
  README_CN.md
  Harness_SWE2_使用说明.md
  data/                 # 映射容器 /data，含 config.yaml、auths、logs；不要复制凭证进交接
```

[Devin 验收 JSON](/Users/wu/Documents/DSH-output/openslides/output/devin-model-acceptance-2026-09-21/proof.json)：合成流式工具调用 HTTP 200、参数完整，5.220 秒；原生产品内首轮上游 60 秒 deadline_exceeded，重试 5.759 秒收到“Devin 已连接”。同目录 `editor-selected.png`、`chat-pass.png` 是界面证据。只证明接入及一次成功重试，不证明长期稳定性、完整文稿能力或超时已修好。

## 架构与代码入口

完整约束：[docs/architecture/continuous-collaboration.md](/Users/wu/Documents/DSH-output/openslides/docs/architecture/continuous-collaboration.md)。先读这份，再动主文件。

| 位置（相对实际仓库） | 职责 |
| --- | --- |
| `apps/native-web/public/app.js` | 编辑器对话、批注、发送事务、模型选择、刷新恢复的主要编排 |
| 同目录 `assistant-conversation.js` / `assistant-questions.js` / `conversation-scroll.js` | 用户消息身份、原生问题卡、稳定阅读锚点 |
| 同目录 `generation-process.js` / `chat-markdown.js` / `work-agent-scope.js` / `comment-targets.js` | 过程投影、回复正文、范围映射、批注目标 |
| `apps/native-web/src/server.mjs` | 页面/批量编辑锁、差异验证、版本恢复、当前项目导出 |
| 同目录 `assistant-artifacts.mjs` / `comment-submissions.mjs` | 持久版本关联、批注提交回执 |
| `packages/dsh-slides-host/src/assistant-intent.ts` | 调用所选模型分类本轮意图与范围证据；不持有写入权限 |
| Host 同目录 `assistant-conversation.ts` / `assistant-questions.ts` / `routes.ts` / `plugin.ts` | 持久用户消息、原生问题生命周期、会话 API、工具注册 |
| Host 同目录 `tools.ts` / `edit-elements.ts` / `write-page-text.ts` / `tool-loop-guard.ts` | 页面/背景/对象工具，文字兼容及重复错误保护 |
| Host 同目录 `produce-request-header.ts` / `protocol.ts` / `session-transition.ts` | Agent 契约、请求校验、busy/并发保护 |
| Host 同目录 `local-models.ts` / `providers.ts` | 本地模型导入及供应商目录 |
| `packages/presentation-run/src/domain/review-write-scope.ts` | 多条意见按页聚合授权，逐条验证实际变化 |
| 同目录 `conversation-requirements.ts` / `compose-ir.ts` | 从已接受生成消息识别总页数，合稿校验 |
| `packages/dsh-slides-bundle/cordis.patch.yml` / `presets/slides/agent.cordis.yml` | 隔离 Slides profile 的插件/工具装配 |
| `vendor/dsh-llm-pi-ai/lib/index.js`、`lib/types/stream.d.ts`、`PIN.md` | 仓库持有的 adapter 补丁，package override 指向这里；不要去改主 DSH 的共享安装 |

持久化边界：

- `deck.pptd`、`pages/*.page` 是权威文稿；不建立第二套 IR。
- 模型消息和工具事实来自 DSH journal / public agent-trace。
- `_agent/assistant-conversation.v1.json` 记录已接受的用户消息及请求身份，不是另一套模型历史。
- `_agent/assistant-questions.v1.json` 只保存问题、答案与状态；Host 重启后没有存活工具的旧问题应显示中断，不能假装恢复了 Agent。
- `_agent/comment-submissions.v1.json` 保存 preparing/accepted/applied/failed/cancelled 及对应用户消息。
- `.versions/manifest.json` 是数组。`assistantRequestId` 关联修改前快照，`assistantOutcome` 独立记录校验结果；链接存在不等于修改成功。`generation-activity.assistantArtifacts` 是只读投影，禁止解析模型正文中的“V18”猜链接。
- `reviewScope.items` 是意见集合，`editorEdit.pages` 是唯一页面集合，数量不必相同。授权并集按页算，完成检查按意见算；不能仅凭 revision 增加就把所有意见标完成。
- CAS/pageSha256、页外文件哈希、文稿元数据、快照和回滚都保留；意图模型不能绕过它们。
- `workspace=0&render=1` 页面不连接持续事件流/轮询，否则 headless networkidle 无法完成。

原生 journal 在 `.dsh/home/sessions/--Users-wu-Documents-DSH-output-openslides--/<sessionId>/session.v3.jsonl.zstd`。读取串接 zstd frames 用 `zstd -dc`；曾遇到 Node 单次解压只读出首帧导致误判历史。按需要筛选回合/工具/错误，不要整份倾倒用户历史。

## 构建、激活与验证

先重新读取实际仓库的 AGENTS.md 和当前用户要求。下列命令仅说明入口，**现在服务已启动，不要直接再起第二套或先重启**。

```sh
cd /Users/wu/Documents/DSH-output/openslides
git status --short
curl -fsS http://127.0.0.1:13081/slides/health
```

静态 public JS/CSS 修改通常刷新产品页即可；native-web server 修改需只激活编辑器；Host/Core TypeScript 修改先构建有关 workspace，再同步隔离 profile。不要把源码改好等同于运行产物已更新。

```sh
# 只改 Host 时；涉及 Core 时先构建对应依赖
npm run build -w @open-slidestudio/dsh-slides-host

# 需要完整 native 依赖链时使用
npm run build:native
```

正常启动入口如下，仅在确认目标进程已经安全停止、端口空闲时执行：

```sh
DSH_HOME="$PWD/.dsh/home" \
SLIDES_DSH_PORT=13081 \
SLIDES_EDITOR_PORT=55201 \
SLIDESTUDIO_RETENTION_DAYS=0 \
node scripts/dsh-slides.mjs
```

启动器负责浏览器固定运行时检查、adapter pin、构建/profile 同步、本地 DSH 模型导入及编辑器连接。相关逻辑在 `scripts/lib/dsh-profile-sync.mjs`。上一轮 Host 激活已经验证源构建与 profile 的 tools 文件 SHA-256 同为 `58045d49722d954addeee6a8b4dae54ba850498fcb766a877ba90779600c41dc`。

任何再次激活前：确认准确 cwd、launcher/child、隔离 home；检查相关会话 idle、没有等待原生问题或活跃编辑事务，保留原稿和版本数据；只处理目标进程，再验健康、产物 hash 和主 DSH 状态。`/tmp/activate-slides-background-tool.mjs` 等临时脚本包含旧 PID，不能原样重跑。

本轮修复对应的针对性回归入口（需要最新 dist；交接阶段未重跑）：

```sh
node --test \
  packages/dsh-slides-host/dist/assistant-intent.test.js \
  packages/dsh-slides-host/dist/write-page-text.test.js \
  packages/dsh-slides-host/dist/write-page-schema.test.js \
  packages/dsh-slides-host/dist/tool-loop-guard.test.js \
  packages/dsh-slides-host/dist/edit-elements.test.js \
  packages/dsh-slides-host/dist/produce-request-header.test.js \
  packages/dsh-slides-host/dist/produce-agent-tools.test.js \
  apps/native-web/src/assistant-artifacts.test.mjs \
  scripts/qa/completed-reply-adapter.test.mjs \
  scripts/qa/model-tool-args-adapter.test.mjs

node --test --test-concurrency=1 \
  apps/native-web/src/assistant-edit-scope-dom.test.mjs \
  apps/native-web/src/assistant-composer-dom.test.mjs \
  apps/native-web/src/conversation-stability-dom.test.mjs
```

真实范围矩阵：`scripts/qa/assistant-scope-default-matrix.mjs`；先读脚本参数，以 `SLIDES_SCOPE_QA_OUTPUT` 指向新的证据目录。已有 DOM 脚本部分仍写入 9 月 20 日的固定 output 路径，复跑前留意证据覆盖。

交互浏览器仅用 **Codex 原生 CUA / in-app Browser**。自动化无头测试仅用 `~/.codex/playwright-runtime/runtime.mjs` 的固定 Playwright **1.61.1 / Chromium Headless Shell 1228**，仓库封装为 `scripts/lib/pinned-playwright.mjs`。不要使用 ego/Orca/CDP 代替原生交互，也不要安装另一版浏览器或用系统 Chrome headless。容器使用 Apple Container，不使用 Docker。

## 下一位 Agent 的优先事项

1. **接手先确认用户接下来要做什么，以及运行现场有无变化。** 用户本轮只要 handoff；不要因为这份待办就向原稿自动发送一批新任务。继续开发时保留上述交互决定，避免重新增加模式切换、第二提交入口或大面积重设计。
2. **下一项最具体的验收缺口是 Devin 完整文稿流程。** 在新的合成项目中跑讨论 → 两页生成 → 当前页无页码编辑 → 明确 1、2 页编辑 → 对象批注 → 可编辑 PPTX 导出，验证实际文件差异、页外哈希、版本关系、刷新后的输入/阅读状态。不要用用户原文稿做新供应商验收。
3. 如果 Devin 再出现 60 秒超时，结合新一轮 Host journal 与 `container logs -n 60 cliproxyapi-devin`、proxy `data/logs/main.log` 定位。一次重试成功不证明根因消除，不要盲目放大重试次数或修改全局代理。
4. 整理“最新回合完成 / 历史 execution failed / 文稿仍需 review”的状态投影。当前三个会话的快照已经保留差异；修复时不能把旧失败统一抹掉，也不能因历史 failed 阻止正常续聊。
5. 如果继续强化恢复能力，单独测试 Host 崩溃、浏览器离线超过锁租期和孤立原生问题。目前只证明服务存活时的页面刷新接续，没有证明崩溃恢复。
6. 发布前再做相应整体构建、回归和可编辑导出验收。旧 handoff 提到的 `/api/pi/auth` 410、旧选择器等 QA 兼容性问题没有在本轮重新判定；不能把 `qa:all`、全部模型、全部导出格式写成已通过。macOS 中文输入法候选窗、真实手机软键盘也不在现有证据覆盖内。

判断一次修复完成时，至少区分源码、构建/profile、当前服务加载和真实用户路径四层；对文稿修改还要有可审查的 PPTD 差异及未授权页面不变的证明。不要让下一次“已完成”只对应测试桩或一张成功 toast。

## 可直接交给下一位 Agent 的开场

> 请接手 `/Users/wu/Documents/DSH-output/openslides`，先读 `docs/handoffs/2026-09-21-openslides.md` 和 `AGENTS.md`，保留全部未提交改动、用户原文稿与主 DSH。延续左侧单一 Agent 对话、光标旁批注的交互。当前 Devin 已接入，但完整 PPT 生成/修改/可编辑导出尚未用它验收；先确认现场，再按我的新要求继续。发现问题请修复并实际跑通后再报告完成。
