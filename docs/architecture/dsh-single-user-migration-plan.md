# Open SlideStudio 单用户 DSH 改造总计划

> 状态：implementation-ready draft
>
> **落地注记（post-ADR-0009）：** 本计划的切换已完成——生产内核是 DSH `slides`
> profile，`/api/generate` 与 `/api/pi/*` 返回 410，`agent-harness` 仅作 Phase 0
> 冻结 fixture。文中以将来时描述的迁移步骤请当历史方案读；当前事实以
> `docs/adr/0008`/`0009` 与 `dsh-lock.md` 为准。
>
> 基线日期：2026-08-26
>
> 仓库落盘：2026-08-26。本文件是改造总计划的唯一仓库副本。此前压缩版 how-to 已删除。
>
> 目标范围：本地单用户、供应商登录、真实 Agent 生成、原生编辑与可编辑 PPTX
>
> 目标 Harness：DeepSeek Harness `dsh-v0.1.5-rc.2`，commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`

## 0. 决策快照

| 决策 | 结论 |
| --- | --- |
| 产品形态 | Open SlideStudio 继续是独立产品；不嵌 Kimi iframe，不展示 DSH 默认界面，不做 DSH 换皮。 |
| 用户范围 | 当前只做本地单用户；不在本轮设计租户、团队权限、远程用户沙箱。 |
| Agent Kernel | 生产运行时从 Pi 迁到 DSH；迁移完成后生产路径只保留一个 Agent Kernel。 |
| 主脑 | Agent 理解用户、选择能力与参考、研究、设计、修改；Host 不再根据关键词替 Agent 选类别或模板。 |
| Harness | DSH 提供 Agent loop、工具注册、会话事件、持久化、取消、恢复、审批、模型适配和插件组合。 |
| 产品 Host | Open SlideStudio 提供 UI、PPT 工具、项目存储、确定性校验、渲染、导出和供应商连接；可以阻断错误，不能代替 Agent 做语义决策。 |
| 文档真相 | YAML PPTD v2 继续是唯一幻灯片文档 SSOT；不引入第二套 deck IR。 |
| OpenKimi | 完整保留为只读能力与审美参考包；不压缩成几个 prompt，不成为运行时依赖，不调用 Kimi。 |
| 登录 | 只有模型供应商登录：BYOK 与 OAuth；没有 Open SlideStudio 用户账号。 |
| 失败策略 | 有界重试后暂停；允许换模型继续同一项目和会话；禁止偷偷套模板、Host 代写或伪造成功。 |
| 实施方式 | 冻结现状后走纵向切片；先证明真实模型 → DSH → 工具 → PPTD → 渲染 → UI → 恢复，再扩大迁移面。 |

一句话原则：**Host 可以阻止坏结果落盘，但不能替 Agent 决定这页讲什么、用什么视觉形式、选哪个设计系统。**

---

## 1. 为什么必须改，而不是继续修补现有调用链

当前问题不是 `academic/paper-white-courseware` 这个参考本身不好，而是参考选择权放错了位置。

已观察到的生产调用链是：

1. `apps/native-web/public/hub.js` 在 UI 层带入默认 design system。
2. `apps/native-web/src/server.mjs` 的 `/api/generate` 调用 `resolvePlaybookCategory()` 和 `resolveGenerateDesign()`。
3. `packages/agent-harness/src/compose-ir.ts` 用 brief 关键词分类；教学语义会被映射到 `academic/paper-white-courseware`。
4. `packages/agent-harness/src/pi-brain.ts` 把 Host 选出的类别和设计系统写进 Agent 运行上下文。
5. Agent 接收到的已不是完整能力空间，而是 Host 预先裁剪后的单一路径。

这造成四类结构性错误：

- **语义越权**：Host 用规则做了本应由 Agent 做的理解和设计判断。
- **能力失真**：OpenKimi 的完整来源、视觉参考和工作流被压成一个 preset id，Agent 不知道自己还有哪些选项。
- **假闭环**：页面能写出来，不代表 Agent 真的查了参考、看了图、渲染、复核并修改。
- **恢复脆弱**：模型失败后，运行状态、页面证据和 Host 私有状态并非统一可重放的会话事实。

因此不能只调分类器或新增更多模板。那会把错误的权力边界做得更复杂。

## 2. 第一性原理下的职责边界

### 2.1 四个角色

| 角色 | 应该拥有 | 明确不拥有 |
| --- | --- | --- |
| 用户 | 目标、受众、约束、显式风格偏好、数据与是否批准高成本动作 | 不需要理解内部模板目录或工具协议 |
| Agent | 语义理解、任务分解、能力选择、资料检索、参考选择、视觉策略、逐页设计、对审查结果的修改 | 文件越界、绕过校验、伪造工具结果、把失败标成成功 |
| DSH Harness | Agent loop、上下文、工具 schema、会话日志、模型流、取消/恢复、审批、插件生命周期 | PPT 语义分类、默认设计方案、业务内容兜底、产品视觉外壳 |
| Open SlideStudio Host/Domain | 产品 UI、项目边界、PPTD v2、工具实现、事实与几何校验、渲染、版本、导出、凭据安全 | 根据 brief 偷选模板、替 Agent 写页、失败时套样板补齐 |

### 2.2 Host 可以做的确定性判断

- 路径是否在当前项目内。
- 输入是否符合 tool schema。
- PPTD v2 是否有效。
- 页码、对象 id、版本和命令幂等键是否合法。
- 文字是否溢出、内容是否进入 footer 保留区、对象是否碰撞、最小间距是否不满足。
- 图表是否有可追溯的定量数据；事实是否引用了用户资料或研究证据。
- 当前页是否在最新版上完成了渲染与审查。
- 所有页面是否满足 compose/export 前置条件。

### 2.3 Host 不能做的语义判断

- “小学教育”就等于某一个设计系统。
- “经营月报”就必须加柱状图。
- 用户没选风格时偷偷补一个默认模板。
- Agent 没写完时由 Host 拼一套示例页。
- 模型失败时把旧模板复制到项目并报告生成完成。
- 为通过审查而静默删内容、换结论或改业务数据。

机械校验失败时，工具返回结构化错误和测量证据，由 Agent 决定重写、重排或换视觉形式。

---

## 3. 参考来源与冲突处理

### 3.1 来源优先级

| 级别 | 来源 | 管什么 | 不管什么 |
| --- | --- | --- | --- |
| L0 | 本轮用户决策 + [AGENTS.md](../../AGENTS.md) + [CONTEXT.md](../../CONTEXT.md) + [LEGACY.md](../../LEGACY.md) | 产品边界、PPTD v2 SSOT、无 Kimi runtime、单生产 Kernel | DSH 内部实现细节 |
| L1 | [ADR-0003](../adr/0003-agent-directed-generation-fails-closed.md)、[ADR-0006](../adr/0006-prove-authentic-generation-not-template-substitution.md)、[ADR-0007](../adr/0007-local-web-normal-creation-path-is-the-first-vertical-slice.md)、[ADR-0008](../adr/0008-openkimi-source-and-review-receipts.md) | Agent/Host 边界、真实生成、正常 Web 路径、OpenKimi 执行证据 | DSH 具体包组合 |
| L2 | [DSH `0.1.5-rc.2` 源码](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.2) 与 [架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/docs/architecture.md) | Harness 的 plugin、profile、bundle、session、tool、event、recovery 接缝 | Open SlideStudio 的产品设计和 PPT 业务规则 |
| L3 | [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform) 与 [本地一手源码研究](../research/agent-harness-architecture-primary-source-study.md) | 用另一个开放 Harness 交叉验证“产品 UI/业务工具归 Host，Agent loop 归 Harness” | 生产运行时选型；Codex 不是本项目运行依赖 |
| L4 | [OpenKimi 主技能](../../vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt/SKILL.md)、[源码清单](../../packages/agent-harness/reference/openkimi-source-manifest.v1.json)、[视觉清单](../../packages/agent-harness/reference/openkimi-visual-manifest.v1.json) | PPT 生成工作流、设计规则、参考内容、视觉示例、审美输入 | 产品 UI、会话 Runtime、Kimi 官方算力 |
| L5 | [Kimi Slides PRD](../../_reference/Kimi_Slides_PRD.md)、[逐帧分析](../../_reference/FRAME_BY_FRAME_ANALYSIS.md)、[编辑器 Oracle](../editor-oracle/README.md) | 产品交互、tooltip、小按钮、面板、生成与编辑体验的观察基线 | 生产依赖、闭源实现猜测 |
| L6 | [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) | DSH 供应商 OAuth 候选 Adapter | Open SlideStudio 用户系统、未经验证的 DSH 版本兼容性 |

### 3.2 已锁定的事实规模

- OpenKimi exact source manifest：76 个文件；保持逐文件 SHA/分块清单。
- OpenKimi visual manifest：44 个设计系统预览，其中 academic 6、consulting 6、extra 14、finance 6、promotion 6、work 6。
- Kimi editor live baseline：125 个可观察控件；迁移 DSH 不能降低这个 UI 验收基线。
- DSH：`dsh-v0.1.5-rc.2` / `fb2c4b9e...`；官方明确标为 developer preview，因此必须精确锁版并有升级合同测试。
- OAuth 插件：当前本地包版本为 `0.1.9`，本地工作树有未提交改动；不能把脏工作树当成可复现依赖。

### 3.3 规范冲突怎么处理

- [ADR-0004](../adr/0004-pi-is-the-single-agent-kernel.md) 的“一条生产 Agent 真相”原则继续有效，但 Pi 选型将由新的 DSH ADR 明确 supersede。
- `docs/specs/open-slidestudio-gate1-gate2.md` 中“系统自动选模板”和允许 mock/offline 假生成的旧条款，只保留为历史 UI/功能清单；不得再作为生产运行法则。
- OpenKimi 与 Kimi Oracle 都是参考，不得覆盖 PPTD v2 SSOT、无 iframe、无 Kimi runtime 等产品法则。

实施开始时先新增一份 ADR，正式记录以上优先级和被替代条款，避免后续 Agent 再读到互相矛盾的“规范”。

---

## 4. 目标架构

### 4.1 运行流

```text
Open SlideStudio UI
        │  用户目标、显式约束、供应商选择
        ▼
DSH Client Session Adapter ───── Provider Connection Adapter
        │  turn / stream / tool event / pause / resume
        ▼
DSH Agent Loop（唯一主脑）
        │  Agent 自主调用明确命名的 PPT 工具
        ▼
DSH Slides Tool Adapter
        │  把 ToolRunContext 映射为领域命令
        ▼
PresentationRun Module
        ├── OpenKimi exact source + visual references（只读）
        ├── PPTD v2 / project-store / versions
        ├── render / layout QA / visual review receipts
        └── native export
```

DSH 默认 UI 不在这条产品流里。产品 profile 保留 DSH 的 Host、传输、client runtime、session projection 和 renderer；移除/禁用官方 `ui-layout` 等视觉 rows，再由 Open SlideStudio client plugin 注册唯一的 `root`。

这不是 CSS 覆盖：DSH `ui-layout` 源码本身就是向内建单一 `root` 注册 `AppFrame`；产品 profile 不加载它，Open SlideStudio 才能合法拥有这个 root。验收时必须验证 root 只有一个注册者，不能让两个 root 依赖优先级互相遮盖。

### 4.2 三种状态真相，禁止重复

| 状态 | 唯一真相 | 允许保存 | 禁止保存 |
| --- | --- | --- | --- |
| 对话与执行 | DSH append-only session event log | user/assistant/tool/turn/error/cancel/resume 事件 | 另一份自制聊天日志或 Pi session |
| 幻灯片文档 | 项目目录中的 YAML PPTD v2 | 页面、元素、notes、document metadata | bitmap deck、旧 Deck IR、从日志重建文档 |
| 产品执行证据 | `_agent/run-ledger.v2.json`，后续可更名 Presentation Evidence Ledger | source receipt、artifact hash、page revision、gate 结果、session/run 关联 | 完整对话副本、PPTD 内容副本、隐藏的 Host 设计状态 |

UI 状态由 `DSH session projection + PresentationRun.inspect()` 联合投影，不建立第四套状态机。

### 4.3 目标模块

#### A. `packages/presentation-run`

运行时无关的深模块。它从当前 `packages/agent-harness` 中抽出并封装：

- exact OpenKimi source/visual pack；
- design contract 与执行 receipt；
- run/evidence ledger；
- PPTD page write、版本和幂等；
- page/deck raster；
- layout QA、report facts、generation provenance；
- compose、validate、native export 前置门。

外部 Interface 只暴露三个主要动作：

```ts
export interface PresentationRun {
  open(input: OpenRunInput): Promise<RunHandle>
  execute(command: PresentationCommand, context: CommandContext): Promise<CommandReceipt>
  inspect(runId: RunId): Promise<RunInspection>
}

export interface CommandContext {
  runId: RunId
  sessionId: string
  toolCallId: string
  projectRoot: string
  abortSignal: AbortSignal
}
```

`PresentationCommand` 是有类型的 discriminated union；DSH Agent 仍然看到 `list_references`、`read_reference`、`commit_design`、`write_page` 等清晰工具，而不是看到一个万能 `execute`。这个 Interface 只是把文件系统、manifest、PPTD、渲染和 receipt 的复杂度藏在模块内部。

#### B. `packages/dsh-slides-host`

薄 DSH Host Adapter：

- 在 `ctx.tools` 注册 Open SlideStudio 工具及 schema；
- 把 DSH session、tool call、abort、content block 映射到 `PresentationRun`；
- 注册产品 prompt section、能力清单和只读技能入口；
- 暴露项目、预览、编辑、版本、导出所需的同源 HTTP/API；
- 只做 Adapter，不包含模板选择、内容生成或视觉偏好规则。

#### C. `packages/dsh-slides-client`

Open SlideStudio 的 DSH client plugin：

- 注册唯一产品 `root`；
- 把当前 UI 抽成 `mountOpenSlideStudio(element, services)`，由 Adapter 注入 session、provider、project、editor 服务；
- 保留现有 DOM/CSS、Hub、生成工作区、编辑器和 Oracle 对齐结果，不改成 DSH 默认聊天页；
- 将 DSH 事件投影为面向 PPT 的时间线；
- 提供可展开的调试记录，但不声称能展示供应商未返回的私有 chain-of-thought。

#### D. `packages/dsh-slides-bundle`

产品 profile/bundle 的唯一组合入口：

- 精确锁定 DSH `0.1.5-rc.2`；
- 叠加 `dsh-base` 与 `dsh-web-app` 的非视觉 Host/浏览器能力；
- 通过 profile patch 移除官方产品 chrome 相关 rows；
- 加载 `dsh-slides-host`、`dsh-slides-client` 和已验证的 OAuth/BYOK Adapter；
- 所有配置都能通过 `dsh --profile slides --dump-config` 审计。

不 fork DSH 源码，不在 Open SlideStudio 里复制它的 Agent loop。

### 4.4 产品 profile

最终保留两个互不混跑的 profile：

- `slides`：唯一生产 profile，只展示 Open SlideStudio UI。
- `slides-diagnostics`：开发诊断 profile，可保留 DSH 官方诊断界面，用于升级和插件故障定位；不作为用户产品入口。

另有一个临时 `slides-candidate` 用于 DSH 升级验证。candidate 没通过合同测试，不能替换 `slides`。

### 4.5 Agent 怎样知道全部选项并作出选择

不把 76 个文件全文塞进 system prompt，也不让 Host 先选一个。采用“完整可发现、按需读取、执行有回执”：

1. DSH tool schema 向 Agent 暴露完整工具空间。
2. `inspect_capabilities` 返回本次真实可用的 vision、web、image search、image generation、render、export 能力及限制。
3. `list_references` 可枚举完整 76-file catalog 和 44 个视觉预览，支持 family/tag/filter，但默认不裁剪为单一路径。
4. Agent 根据用户输入自行 shortlist。
5. Agent 调 `read_reference` / `view_design_reference` 读取候选；多模态模型得到真实 image content block。
6. Agent 调 `commit_design` 写结构化设计决策：候选、采用来源、拒绝原因摘要、视觉语法、版式原则和用户显式约束。
7. `write_page` 之前的 Gate 只检查“是否存在真实 consult/adopt receipt”，不检查 Agent 是否选了 Host 预设的答案。
8. 结果渲染和审查不通过时，Agent可以重新选参考并更新 design contract。

无法保证任意模型每次都审美正确；能保证的是它看得到完整选择、选择过程可观察、结果必须经过真实反馈闭环，Host 不会暗中把错误固定下来。

### 4.6 OpenKimi 能力如何完整保留

OpenKimi 不压缩为一个 prompt 或一个模板 id：

- vendor 原文件保持只读、逐文件可寻址；
- 76-file source manifest 和 44-preview visual manifest 继续做 hash Gate；
- 来源状态分为 `available → consulted → adopted → executed`；
- `consulted` 必须来自真实工具调用；
- `adopted` 必须进入 design contract；
- `executed` 必须关联到具体 page revision、布局 token、媒体或审查 receipt；
- compose Gate 只接受当前页面 revision 的执行证据，旧页审查不能冒充新页审查。

当前 `playbook.ts`、`playbook-recipes.ts` 中有价值的规则先拆为 Agent 可读资源或领域校验，不直接删除。任何生产 export 的移除都要在 capability ledger 中找到 DSH-native 或 PresentationRun 的等价能力，并通过相同验收案例。

### 4.7 Taste 与排版闭环

高质量 PPT 需要两个不同的 Gate，不能只靠模板或只靠 LLM：

#### 机械布局 Gate

- 按实际字体和画布测量文本，而不是按字符数估算。
- 区分可出血背景与内容 safe area。
- footer、页码、logo 等保留区进入碰撞模型。
- 检查文字溢出、对象重叠、最小间距、边缘贴靠、图表/表格可读性。
- 不静默删除文字或缩到不可读；无法满足时返回带坐标和测量值的错误。

#### 多模态审美 Gate

- `render_page` 产生当前 revision 的真实页面图。
- 视觉能力可用时，`review_page` 检查层级、留白、密度、平衡、风格一致性和受众适配。
- Agent 读取审查结果并修改；Host 不替 Agent画新页。
- 全部页面通过当前 revision 的 page review 后，才允许 deck montage review 和 compose。

如果当前主模型没有 vision：

- 允许它读取文本设计规范完成 standard generation；
- 可配置另一个 vision reviewer 作为工具；
- 两者都没有时，产品必须标记“未做视觉审查”，不能宣称达到 Kimi 级视觉验收。

图表也不再由模板偏好强制添加。Agent 必须为每个 chart 提供 `claim + dataRef + whyChart`；无定量关系、数据不足或图形不支持结论时，确定性 Gate 拒绝它。Agent可改用示意图、几何图、时间线、图片或纯排版。

### 4.8 日志、思考与可观察性

产品时间线展示：

- 用户 brief 与显式约束；
- 使用的 provider/model 与切换点；
- Agent 对外给出的计划和阶段摘要；
- tool call、脱敏参数、结果、耗时、重试和错误；
- consulted/adopted/executed source receipts；
- 页面 revision、render/review/layout Gate；
- compose/export 结果和 artifact hash。

不会把未由模型 API 返回的隐藏 chain-of-thought 伪装成“思考过程”。调试抽屉展示的是可验证事件和结构化决策摘要。

### 4.9 模型失败后的恢复

1. 同供应商的网络错误、限流和临时 5xx 做有界重试，策略与次数写进事件。
2. 鉴权失效、额度耗尽、持续超时后将 turn 标记为 paused/failed；不触发模板 fallback。
3. 用户可重新登录、填入新 key 或选择另一模型。
4. 新模型继续同一 DSH session；上下文来自 session log，项目现状来自 PPTD v2，执行进度来自 Evidence Ledger。
5. 每个写操作使用 `sessionId + toolCallId + commandId` 幂等；重放不会重复新增页面或重复 compose。
6. 恢复时重新投影当前页面 revision 和未完成 Gate，不信任进程内缓存。
7. 若模型能力下降，例如新模型无 vision，UI 明确显示能力差异，并阻止伪造视觉审查 receipt。

供应商切换默认由用户确认；Host 不因错误自动把请求发给另一个付费或不同隐私边界的供应商。

### 4.10 BYOK 与 OAuth

产品只做 provider connection：

```ts
interface ProviderConnectionService {
  listProviders(): Promise<ProviderDescriptor[]>
  getConnectionState(providerId: string): Promise<ConnectionState>
  saveApiKey(providerId: string, apiKey: SecretInput): Promise<void>
  startOAuth(providerId: string): Promise<OAuthStartResult>
  logout(providerId: string): Promise<void>
}
```

- BYOK 由 DSH Host 的 credentials/provider Adapter 保存；secret 不进浏览器 localStorage、项目目录、session event 或 tool result。
- OAuth 优先复用 `dsh-oauth-login` 的同源路由：`/plugins/dsh-oauth-login/auth/status`、`/auth/login`、`/auth/logout`。
- 当前 OAuth 插件脏工作树不能直接依赖。先用发布版 `0.1.9` 做 rc.2 boot/real-call 验证；如果必须使用未发布改动，先在插件仓库独立完成测试、clean commit 和 release，再精确锁定。
- 产品 UI 自己实现供应商连接面板，不复用 DSH settings 视觉组件。

---

## 5. 现有代码迁移矩阵

| 当前内容 | 动作 | 目标 | 非丢失 Gate |
| --- | --- | --- | --- |
| `packages/pptd-v2` | 原样保留 | 文档 SSOT | schema/round-trip/fixture 全通过 |
| `packages/project-store` | 原样保留 | 项目、版本与持久化 | 重启后版本和页面一致 |
| `packages/exporter-native` | 原样保留并继续增强 | 可编辑 hybrid PPTX | 不是全页 raster；对象可编辑 |
| `packages/canvas-session` | 保留 | 编辑命令、undo/redo、dead-button gate | 现有命令测试与 Oracle 不回退 |
| `docs/editor-oracle`、`_reference` | 冻结为开发证据 | UI/交互验收 | 125 controls 与 tooltip 基线可重放 |
| `vendor/open-kimi-ppt` + 两个 manifest | 原样保留只读 | Agent reference workspace | 76/44 数量和 hash Gate |
| `run-ledger.ts`、`generation-provenance.ts` | 抽出、收窄 | `presentation-run` Evidence Ledger | 不复制 DSH 对话或 PPTD |
| `openkimi-source-pack.ts`、`openkimi-visual-pack.ts` | 抽出 | `presentation-run` reference catalog | 全量枚举、读取、视觉 content block 测试 |
| `design-contract.ts`、`deck-overview.ts`、`page-raster.ts`、`layout-qa.ts`、`report-facts.ts` | 抽出 | `presentation-run` 领域能力 | 原测试迁移且 DSH Adapter 合同测试通过 |
| `pi-hands.ts` | 拆分 | 领域命令进入 `presentation-run`；DSH 映射进入 `dsh-slides-host` | 每项能力有 ledger 映射和真实 tool call |
| `think`、`plan`、`write_todo` | 用 DSH 原生能力替换 | DSH agent/goal/todo | 不是删除；验证 Agent 仍有规划与进度事件 |
| `research`、`wait`、通用 fs | 优先用 DSH 原生 seams，保留产品限制 Adapter | DSH web/jobs/fs | 研究 receipt 与项目路径边界通过 |
| `pi-brain.ts`、`pi-rpc.ts`、Pi auth/OAuth/failure 路径 | 替换后退役 | DSH agent/session/provider + OAuth plugin | DSH real-provider vertical slice 通过后才移出生产 exports |
| `resolvePlaybookCategory()`、`resolveGenerateDesign()` | 从生产调用链删除 | Agent 自主选择 + `commit_design` | 无显式风格时，Host 请求中不得出现 category/design preset |
| `host-produce.ts`、host painter、课程/展品 dev brains | 隔离为 fixture，然后退役 | 测试/历史对照，不进产品 bundle | production dependency graph 和打包扫描均不可达 |
| `playbook.ts`、`playbook-recipes.ts` | 拆成可读参考或确定性校验 | Agent reference/领域 Gate | 逐条 capability ledger，不允许整文件无证明删除 |
| `apps/native-web/public/*` | 保留视觉，抽 mount Interface | `dsh-slides-client` 的产品 UI | Hub/workspace/editor 视觉和交互 Oracle 不回退 |
| `apps/native-web/src/server.mjs` | 拆路由 | 项目/编辑/导出进入 DSH Host plugin；generation/Pi routes 删除 | 最终单端口、无 `/api/pi/*`、无第二 Agent server |
| `packages/agent-harness` | 迁移期兼容壳，最终删除/改名 | DSH 是 Harness，仓内只留 PPT 领域与 Adapters | production lockfile 不再依赖 Pi agent 包 |

“替换”不是先删。每一行必须按 `existing capability → target owner → contract test → real acceptance` 完成后，旧路径才可退役。

---

## 6. 实施阶段与退出条件

不按“大重构全部写完再调试”推进。每一阶段都交付一条可运行纵向切片，并有独立回滚点。

### Phase 0 — 冻结现状、锁来源、消除规范冲突

工作：

1. 对当前整个工作树做完整副本，包含 `.git`、分支、stash、未跟踪文件、输出、vendor 和研究资料。
2. 记录当前 HEAD、branch、`git status`、关键目录 hash 和启动/测试命令；验证副本与原工作树一致。
3. 不擅自 stash、clean、覆盖或把用户现有脏改动混成一个无说明提交。
4. 创建迁移工作分支 `codex/dsh-single-user`。
5. 新增 ADR：DSH supersedes ADR-0004 的 Pi 选型；明确旧 spec 冲突条款失效。
6. 锁定 DSH tag/commit、OpenKimi manifests、Kimi Oracle baseline、OAuth 候选版本。
7. 保存 `dsh --profile web --dump-config` 输出，作为 rc.2 的 profile row 基线。

退出条件：

- 冻结副本可以独立启动当前版本。
- hash/status 清单可证明代码和资料未丢。
- 新 ADR 说清 Agent/Host/Harness 边界及唯一生产 Kernel。
- 迁移分支不包含无来源的自动格式化或批量删除。

回滚：回到冻结副本；不需要从迁移代码逆向恢复 Pi 版本。

### Phase 1 — 最高风险的真实纵向切片

目标不是先搬完工具，而是先证明 DSH 可以藏在 Open SlideStudio 产品壳下面真实工作。

最小切片：

1. 建立 `slides` profile/bundle，精确锁定 rc.2。
2. 只保留 DSH 非视觉 web kernel；产品 client plugin 注册唯一 root，先挂载现有 Hub/Workspace 最小视图。
3. 接入一个真实 provider（先用已授权 OAuth 或 BYOK），创建 DSH session。
4. 注册最小产品工具：`open_project`、`list_references`、`read_reference`、`commit_design`、`write_page`、`render_page`、`review_page`。
5. 用真实 Agent 从自然语言生成一张封面 PPTD v2，渲染后在产品 UI 中展示。
6. 杀进程、重启、恢复同一 session/project，再让 Agent 修改该页。
7. 全链记录 DSH events、tool receipts、PPTD version 和 current render。

退出条件：

- 浏览器只看到 Open SlideStudio，不出现 DSH chrome。
- 真实模型调用，且页面来自 Agent tool call；无 Pi、host painter、mock page 或模板 substitution。
- brief 没有显式设计选择时，Host payload 不含 category/design preset。
- 重启后可继续同一页，且不会重复创建页面。
- custom root boot 失败时明确报错，不是白屏。

回滚：停用 `slides` profile，当前冻结版本仍可独立运行；不在同一生产进程切换 Pi/DSH。

### Phase 2 — 抽出 PresentationRun 深模块并补全工具能力

工作：

1. 以现有 `pi-hands` 测试为 characterization tests，锁住当前领域行为。
2. 建 `packages/presentation-run`，逐能力迁移 reference、design、page、review、compose、export。
3. 建三动作 Interface：`open / execute / inspect`。
4. 所有写命令加入幂等键、version before/after 和 artifact receipt。
5. 通用 Agent 能力映射到 DSH 原生工具；产品特有能力继续作为清晰 DSH tools。
6. 完成 capability execution ledger，逐项标记 `preserved / dsh-native / adapted / dev-only`。

退出条件：

- `presentation-run` 不 import Pi 或 DSH。
- DSH Host Adapter 是薄映射，不含业务模板和语义分类。
- 现有能力没有“无映射删除”。
- 单元测试、DSH tool contract tests、取消与幂等测试通过。

回滚：DSH 最小切片继续指向兼容 Adapter；未完成的能力仍留在旧包，不能边搬边删。

### Phase 3 — Agent 自主选择、OpenKimi taste 与真实复核闭环

工作：

1. 让 Agent 可枚举 76-file/44-preview 全量参考。
2. 实现 capability inspection 与模型 vision 能力协商。
3. 强制 `consulted → adopted → executed` receipt 链，但不强制某个设计 id。
4. 将 OpenKimi 的工作流、设计规则、媒体策略拆入可读资源和工具，而不是摘要 prompt。
5. 完成机械 layout Gate：safe area、footer、真实文本测量、碰撞、间距、图表/表格可读性。
6. 完成 current-revision page render/review 与 deck montage review。
7. 增加 chart evidence contract，消除“因为模板喜欢图表就加图表”。

退出条件：

- “给小学生介绍勾股定理”不再被 Host 绑定到 `academic/paper-white-courseware`。
- Agent 的 shortlist、参考读取、design commit 和页面执行可在调试记录中核对。
- 无数据 chart 被拒绝；有数据 chart 可追溯到 claim/dataRef。
- 文字贴边、页脚碰撞、溢出不能通过 compose Gate。
- 视觉审查缺失时产品如实显示未审查，不伪造通过。

回滚：保留 DSH 纵向切片，关闭未完成的新 Gate；不能回退到 Host preset selector。

### Phase 4 — 完整产品 UI 接管 DSH session

工作：

1. 将现有 UI 抽为可挂载 Module，保持 DOM/CSS 和交互语义。
2. Hub 的创建动作改为创建 DSH session + PresentationRun。
3. 生成工作区接入流式事件、tool timeline、pause/retry/switch model/resume。
4. 编辑器继续直接操作 PPTD v2；Agent修改与用户编辑走同一 project version 机制。
5. 迁移 project/preview/editor/version/export routes 到 DSH Host plugin。
6. 删除产品对 `/api/generate`、`/api/generate-status`、`/api/pi/*` 的依赖。
7. 对 125 控件、hover tooltips、小按钮和主要面板跑 Oracle 回归。

退出条件：

- 一个本地端口、一个产品 UI、一个 DSH session runtime。
- Hub → 生成 → 预览 → 编辑 → 版本 → 导出正常闭环。
- 生成时刷新页面不丢 session/run 关联。
- DSH UI 插件故障不被静默吞掉；产品有明确 recovery screen。
- 125-control 基线和 dead-button Gate 不回退。

回滚：保留 Phase 3 headless/最小 UI profile；UI route 切换用迁移提交回退，不在成品里保留双 API。

### Phase 5 — Provider、恢复与故障注入

工作：

1. 接入 BYOK 与经过 rc.2 验证的 OAuth plugin。
2. 支持同一 session 下一 turn 换模型。
3. 对 timeout、quota、401、429、5xx、进程退出、浏览器刷新做故障注入。
4. 对重复 tool call、stale page revision、compose 中断做幂等和恢复测试。
5. UI 区分 `retrying / paused-auth / paused-quota / failed / resumable / complete`。
6. secrets 做日志、session、project 和前端存储扫描。

退出条件：

- OAuth 和 BYOK 各完成一次真实调用。
- 主模型中途失效后，可换另一个模型继续原项目；既有页面 hash 不变，未完成页继续生成。
- 失败状态不会出现“PPT 已完成”或下载按钮。
- 凭据不进入项目、日志、浏览器持久化或导出包。

回滚：provider Adapter 可单独回退版本；PresentationRun 和 UI 不依赖某一家 provider 的私有类型。

### Phase 6 — 完整真实生成与编辑/导出验收

工作：

1. 使用《澄光生活 2026年7月经营月报》长提示词做约 20 页真实生成。
2. 使用小学勾股定理题做“非必要图表”与教育视觉语义验收。
3. 再覆盖咨询、品牌/推广、自由风格和高密度数据各一个案例。
4. 检查 source/taste receipt、事实一致性、layout QA、page/deck visual review。
5. 在原生编辑器修改文本、形状、图表、表格、notes，再导出 PPTX。
6. 用 PowerPoint/LibreOffice 结构检查确认主要对象可编辑，禁止全页 raster 伪导出。

退出条件：

- 20 页运行没有 host painter、固定模板页或虚假 tool timeline。
- 内容、视觉、布局和导出 Gate 全部有对应证据。
- 用户编辑后重新打开、版本切换和导出结果一致。
- 运行时无 Kimi iframe/CDN/API 请求。

### Phase 7 — 生产切换与烂尾清理

工作：

1. 将 `slides` 设为唯一正常启动入口。
2. 从生产依赖和 exports 中移除 Pi brain/RPC/auth、Host semantic selector、host painters 和 mock generation。
3. 退役 `packages/agent-harness` 兼容壳；保留必要历史 fixture 和 capability mapping 文档。
4. 更新 `CONTEXT.md`、`LEGACY.md`、架构图、验收文档、启动脚本和交接。
5. 做 orphan route、dead export、重复状态机、过期文档和无主测试扫描。
6. 保留冻结版和明确的回退说明；不删除用户历史 outputs。

退出条件：

- production dependency graph 中没有 Pi agent runtime。
- 没有 `/api/pi/*`、`createPiBrain`、生产 `resolveGenerateDesign` 或 host-generated pages。
- `npm run build:native`、`npm run test:native` 与新增 DSH 合同/E2E/真实验收脚本全部通过。
- 文档只描述一个生产架构。
- 冻结版仍可恢复；迁移产物与历史输出没有混删。

---

## 7. 验收门

### Gate A — Harness 与产品壳

- 精确启动 DSH rc.2；dumped config 与 lock 一致。
- 生产 profile 只有 Open SlideStudio root。
- 页面无 DSH 默认 chrome、无 Kimi 品牌/runtime。
- DSH 升级只能通过 candidate profile 和合同测试进入生产。

### Gate B — Agent 主脑

- Host 不注入默认 category/design system。
- Agent 能列出完整能力和参考；显式用户选择优先。
- 选择、读取、采用和执行有结构化 receipt。
- Host 只做 deterministic validation，不生成语义 fallback。

### Gate C — 真实生成

- OAuth/BYOK 的真实模型 turn。
- DSH session 中存在真实 assistant/tool events。
- PPTD 页面与对应 tool receipt、revision 和 render hash 一致。
- 禁止 mock、旧 deck clone、host painter、固定页面配方进入普通路径。

### Gate D — Taste 与布局

- 76 source、44 visual preview 全量可发现。
- 当前 revision page review 与 deck review 不可伪造或复用旧结果。
- overflow、贴边、footer collision、过密间距不能 compose。
- chart 有 claim/data evidence；无数据不强塞图表。

### Gate E — 恢复

- provider timeout/quota/auth failure 均停在可解释状态。
- 重启 Host、刷新浏览器、切换模型后可恢复同一 session/project。
- 命令重放不重复写页、导入媒体或 compose。
- 能力变化被显示，不伪造 vision/search 可用性。

### Gate F — UI 与编辑

- Hub、生成工作区、时间线、编辑器、版本、导出完整。
- 125 controls 与 tooltip Oracle 回归。
- 无 dead button；每个可点击控件有行为、loading、error、success/reduced-motion 状态。

### Gate G — 文档与导出

- PPTD v2 唯一 SSOT；无 dual IR。
- native exporter 产出 hybrid editable PPTX。
- 用户编辑、Agent 编辑、版本恢复、导出使用同一文档版本。

### Gate H — 安全与边界

- secret 不进浏览器存储、项目、session log、tool output 或 PPTX。
- 工具不能越过 project root。
- 无 Kimi iframe/CDN/API；无未声明的跨供应商自动切换。

### Gate I — 产品激活等级

必须分别报告，不能混为“完成”：

1. **Package ready**：代码、profile、测试和本地 mock 合同通过。
2. **Real provider verified**：真实 OAuth/BYOK、真实工具流和恢复案例通过。
3. **Product activated**：正常 Web 路径、20 页真实 deck、编辑和可编辑导出全部通过。
4. **Legacy retired**：Pi/Host planner/假生成路径已从生产图中移除，且冻结版可回退。

---

## 8. 关键验收案例

| 案例 | 主要观察 | 明确失败条件 |
| --- | --- | --- |
| 小学生勾股定理 | Agent 是否理解受众、选择图形解释、少而准地用数据图 | Host 强制 `paper-white-courseware`；出现无意义柱状图；文字/页脚碰撞 |
| 澄光生活 20 页经营月报 | 事实、章节、数据图表、长 deck 一致性、恢复 | 套固定月报模板；虚构数据；只生成几页后复制；旧审查冒充新页 |
| 无显式风格的自由主题 | Agent 是否看到全量参考并自主 commit design | Host payload 带默认 preset；Agent没读参考却记为 consulted |
| 中途 OAuth 额度耗尽 | 暂停、重新授权或换模型、同项目继续 | 自动换供应商；重复页面；把失败标完成 |
| 文本过长与 footer 冲突 | 测量、拒绝、Agent重写/重排 | 静默裁字、缩到不可读、导出后才发现碰撞 |
| 编辑后再让 Agent 修改 | project version、stale receipt、冲突处理 | Agent覆盖用户新编辑；旧 render/review 继续有效 |

质量评估看最终 deck 和执行证据，不把“选中某个模板 id”当正确答案。

---

## 9. 主要风险与控制

| 风险 | 控制 |
| --- | --- |
| DSH 仍是 developer preview，升级可能破坏 API | 精确锁 commit；所有 DSH import 隔离在两个 Adapter；candidate profile + dump-config diff + 合同测试；一次只升级一个变量 |
| 自定义 client plugin 失败导致白屏 | 最早做 root vertical slice；生产 roster 最小化；启动错误页；独立 diagnostics profile；禁止两个 root 共存 |
| OAuth 插件本地状态不可复现 | 不依赖脏工作树；先验证 npm release；必要修改在插件仓库单独 clean release 后再 pin |
| 为迁移方便又造一套状态机 | 明确三种 SSOT；UI 只投影；禁止复制 DSH chat 和 PPTD |
| OpenKimi 能力搬迁时再次丢失 | 76/44 hash Gate + capability execution ledger + consulted/adopted/executed receipts；先映射验收再退役旧代码 |
| 文本模型无法完成视觉复核 | capability negotiation；可配 vision reviewer；未审查就明确降级，不报高质量通过 |
| UI 重写破坏已经复刻的交互 | 抽 mount Interface，不先重写视觉；125-control Oracle 和 tooltip 回归作为 Phase 4 Gate |
| 模型失败后 Host 用模板兜底 | fail closed；同 session 换 provider；幂等恢复；production bundle 扫描 host painter/mock 依赖 |
| 当前工作树有大量未提交成果 | Phase 0 完整副本和 hash；不 clean/stash/reset；迁移分支从冻结事实开始 |

---

## 10. 必须新增的可执行入口

实施中应增加并固定以下脚本；名字可以微调，职责不能合并成一个不可诊断的总脚本：

```text
npm run dsh:profile:dump       # 导出并核对生产 profile 的完整插件树
npm run dsh:smoke              # DSH boot + custom root + session + one tool
npm run test:presentation-run  # 纯领域命令、Gate、幂等、PPTD tests
npm run test:dsh-contract      # DSH Tool/Client/Provider Adapter 合同测试
npm run test:recovery          # kill/restart/provider-switch/stale revision
npm run test:oracle            # Hub/workspace/editor 控件与 tooltip 回归
npm run test:real-generation   # 经明确授权的真实 provider deck 验收
npm run verify:no-fake-path    # Pi/host painter/mock/template fallback 生产可达性扫描
npm run verify:no-kimi-runtime # iframe/CDN/API 运行时扫描
```

浏览器自动验收必须使用仓库 AGENTS.md 指定的 `~/.codex/playwright-runtime` 固定 Chromium；不得换系统 Chrome 或临时安装另一版 Playwright。

---

## 11. Definition of Done

这次改造只有同时满足下列条件才算完成：

- 正常入口是 Open SlideStudio UI，底层只有 DSH 一个生产 Agent Kernel。
- Agent 看得到完整能力空间，自己选择参考、工具和设计；Host 不做隐式 preset 分类。
- OpenKimi 76 个来源、44 个视觉参考及核心工作流没有被摘要替代或无证据删除。
- 页面是 Agent 通过真实工具写入 PPTD v2，再经真实 render/layout/visual review 迭代的结果。
- 无意义图表、文字贴边、footer 冲突和陈旧审查被 Gate 拦住。
- BYOK 与 OAuth 均可用；主模型坏掉后可换模型继续同一 session/project。
- Hub、生成工作区、125-control 编辑器、版本和 native editable export 不回退。
- 生产图中没有 Kimi iframe/CDN/API、Pi Agent runtime、Host painter、mock generation 或 dual IR。
- 冻结版可独立恢复，迁移没有丢当前代码、资料、vendor 或历史输出。
- 最终报告分别给出 package-ready、real-provider-verified、product-activated、legacy-retired 证据，不用一条“测试通过”代替全部结论。

---

## 12. 第一批实际开工范围

批准实施后，第一批只做 Phase 0 + Phase 1，不先大规模搬包：

1. 冻结并校验当前完整工作树。
2. 写 DSH superseding ADR 和 profile lock。
3. 建最小 `dsh-slides-bundle`、`dsh-slides-host`、`dsh-slides-client`。
4. 让现有 Open SlideStudio 最小界面占据 DSH 唯一 root。
5. 用真实 provider 生成、渲染、展示一张 PPTD v2 页面。
6. 杀进程并恢复后修改同一页。

只有这条最高风险链通过，才进入完整能力拆解。这样可以最早回答三个关键问题：DSH 是否能稳定承载我们的产品 UI、真实 Agent 是否能调用我们的 PPT 工具、会话和项目是否能在失败后正确恢复。
