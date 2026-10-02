# dsh-openslides 云端交接交付报告

日期：2026-09-30 · 会话：https://app.devin.ai/sessions/22a7563804de43fb9ed8071f8504b5d5

## 一、本次改动清单（精确到文件）

### A. dsh-openslides — 会话隔离修复（私有源码，仅本地文件，未推远端）

`packages/dsh-slides-host/`：

| 文件 | 改动 |
|---|---|
| `src/agent-plane.ts` | 重写。放弃模块级 `standingMountFor`/`livePresetMounts`（双注册表副本陷阱：插件拿到的 registry 模块与 Host 内部的不是同一份，永远读不到 mount 状态）。改为通过 `agentPresets` 服务 `composedPreset(agentCtx)` 判定归属，回退链 `composedPreset → sessionProjections.stateOf("agentPreset") → session.header.agentPreset → meta.agentPreset`。导出 `wireSlidesAgentPlaneForAgent` / `reconcileSlidesAgentPlane`；`planeSlots` 为 scope 键控 WeakMap，同 deps 去重、可 unwire。 |
| `src/plugin.ts` | `agent/created` 监听按「预设归属」接线（不再全局污染）；新增 `agent-preset/selected` 重组合监听——预设切走即 `unwire`；启动时对 `ctx.agents.list()` 扫一遍处理已存在 agent。 |
| `src/produce-agent-setup.ts` | agent setup 内 `presets.mount(agentCtx,"slides")` 后无条件对本 agent 作用域接线（与 agent/created 监听经 dedupe 互不重复）。 |
| `src/tools.ts` | `sessionProduceToolAllowlist(deps, agentId)` 供 system-prompt 补丁按 agent 收敛工具白名单。 |
| `src/agent-plane.test.ts` | +2 回归测试：① 同代兄弟 agent（standard/Creator）不受 slides 平面污染；② recompose 切走预设后平面随 dispose 撤离（工具消失、bash 恢复、原生提问恢复）。 |
| `src/produce-agent-setup.test.ts` | 更新预期以覆盖无条件接线。 |

### B. dsh-creator-mode-plus — profile 直改绕过修复（公开仓库）

分支 `devin/profile-lifecycle-guard` → PR：https://github.com/aa2246740/dsh-creator-mode-plus/pull/8 · commit `c331d81`

| 文件 | 改动 |
|---|---|
| `src/profile-lifecycle.js`（新增 93 行） | `creatorProfileMutationReason`：文件工具（write/edit/delete/move/copy）、apply_patch 各目标、bash/terminal 令牌级扫描（引号/`>`/`VAR=`/分隔符），目标经 `canonicalTarget` 规范（符号链接、`..`、cwd 相对）后，落在 `<DSH_HOME>/profiles/**` 或 home 根下的受看护名（`cordis.patch.yml`、`agent.cordis.yml`、`.agent-presets*`）即拒绝，报 `CREATOR_LIFECYCLE_ONLY` 并指明十个固定工具。只读 shell 放行。 |
| `src/safety.js` | guard 内新增 profile 检查（在 destructive 检查之后、core 检查之前）。 |
| `src/core-boundary.js` | 导出 `under`、`readOnlyShellCommand`（原私有）。 |
| `dshx.yml` + `tests/package.spec.mjs` | `hotReload.artifacts` 声明加入新文件，契约数组同步。 |
| `tests/profile-lifecycle.spec.mjs`（新增 102 行） | 11 个单测：全路由拒绝 + 合法写入/read-only/dshx 工具放行 + `DSH_HOME`/`~/.dsh` 双根 + 符号链接 home。 |
| `tests/native/profile-lifecycle.spec.mjs`（新增 74 行） | 真 Cordis 上下文 + 真 tools.execute 端对端：write/edit/bash 三种路径全拦、合法写入放行。 |

## 二、测试证据（全部真实执行）

### 静态 / 单元 / 契约

| 命令 | 结果 |
|---|---|
| `packages/dsh-slides-host`: `npx tsc -p tsconfig.json` | 干净通过（0 错） |
| `node --test 'dist/**/*.test.js'` | **309/309 通过**（57 suites） |
| creator-mode-plus `npm run check`（语法 + npm test） | 265 通过 / 2 环境性失败¹ |
| `DSHX_HARNESS=<harness> npm run test:native` | **14/14 通过**（含新 native spec） |
| `npm run verify:dshx -- --harness <harness>` | PASS：freshInstall=installed, managedUpgrade=updated, shippedPresetUnchanged=true, compositionStampStable=true |
| `npm run verify:harness-install -- --harness <harness>` | `CREATOR_MODE_PLUS_HARNESS_INSTALL_COMPATIBILITY_PASS` |
| `npm pack --dry-run` | 44 文件，含 `src/profile-lifecycle.js`；tgz shasum `258d0b10ce37ae096e8a932771cef01aa37758a7` |

¹ `tests/authorization-feasibility.spec.mjs` + `tests/development-policy.spec.mjs` 需要本机 `DSHX_APPROVER_SOURCE`（私有 `dsh-approve-for-me` checkout，云端不存在）；已在干净基线上 stash 验证——失败与本改动无关。

### 隔离 RC2 Host 实测（DSH_HOME=/tmp/dsh-home-web-probe，`npx dsh web --patch` 注入插件 + 探针）

- slides agent：`composedPreset=slides`，工具集 `[ask_user_question, open_project, inspect_capabilities, …, export_deck]` 共 19 个；`bash` 被拒（"slides preset forbids bash; the write tools available this turn: write_page, write_todo"）；`open_project` 真实执行返回 `{"outcome":"created","projectRoot":"output/dsh-slices/deck-session-…"}`。
- normal agent：完整标准工具；`open_project` → `UNKNOWN_TOOL`；`bash` → `INVALID_ARGS`（到达工具本体 = 未被 slides guard 拦截）。
- `presets.list()`：`slides` 注册在册、unbroken；全程无 `[slides-host]` 告警。
- `/personal/slides/editor`（带签发的会话 cookie）：**302 → `http://127.0.0.1:56200/index.html?workspace=1&project=test`**；编辑器 sidecar 56200 `index.html` → 200。

## 三、构建产物 + 哈希（SHA-256）

`dsh-personal-slides/`（`tsc` + `tsdown@0.22.2`，`DSHX_HARNESS` 指向 pinned `639ed01` 的 Harness + `tools/dshx` devkit）：

| 产物 | SHA-256 |
|---|---|
| `lib/dsh-personal-slides.js`（Host ESM, 6.42 kB） | `89608e6ad00c1139c6ee255723d8a0b1ab42880cba00d16bab0b78e1e0f57894` |
| `lib/client.js`（lazy-CJS 客户端, 15.21 kB） | `4e753ed031b37f7c64fd40b6dc843ecdafc251cf842a14d627642203483d6ec0` |
| `lib/types/dsh-personal-slides.js` | `4af9b8fa8bb228d263f884bae6907b6b73c7c6029c212c9e020dc660b3fbad04` |

`packages/dsh-slides-host/dist/`：

| 产物 | SHA-256 |
|---|---|
| `agent-plane.js` | `2941ebb9c411cb18db9bd7bdb3da51a3aa1feb42842f58c13af82c2a86709d49` |
| `plugin.js` | `8a0cc3403e49d188479b01a9e26653ef2b401b167eda8bed4be6183bb05c7a07` |
| `produce-agent-setup.js` | `8ebfc75f4ad8113997c8b2e80cc6700ac725d774e8abbb6572bdc65d96bf8a1f` |

## 四、环境缺口（精确报告，非代码缺陷）

- **`personal` 客户端服务在本云不可用**：Personal 侧边栏外壳（OOPS 所在、提供 `personal` 服务的插件栈）既不在官方 RC2 分发里（`/tmp/rc2-host/node_modules` 全量扫描无 `personal` 服务），也不在交接 ZIP 里。隔离 Host 上 client 入口表现为 `pending (waiting for service: personal)`——这同时证明 lazy-CJS bundle 与 `inject` 声明被 loader 正确解析。「演示文稿」入口需要在装有 Personal 壳的本机才能渲染/验收；本云端无法证明侧边栏视觉呈现，也不能声称原挂起会话已恢复。
- 云端无真模型凭据：真实生成流（建稿→编辑→导出全链路）只到 `open_project` 执行层。

## 五、本机安全热更新 / 会话恢复方案（有界，不外扩）

前提：本机 DSHX 监督者就位（`dshx` CLI），Host 不重启、不手删 claim/lock/session 行。

1. **重新构建**（本机仓库根）：
   ```sh
   cd packages/dsh-slides-host && npx tsc -p tsconfig.json
   cd ../../dsh-personal-slides && DSHX_HARNESS=<本机harness> npm run build
   ```
   产物哈希应与上表一致（逐字节复现）。
2. **激活 dsh-slides-host**：`dshx activation-plan dsh-slides-host --change server`（模块代码变更 → server 分支）。由 DSHX 执行有界 hot_reload 事务并出 same-PID 替换 + dispose 证据；若模块 HMR 不可证，只走 `sync-artifact`（ARTIFACT_SYNCED / LIVE_ACTIVATION_UNPROVEN），不擅自重启 Host。
3. **激活 dsh-personal-slides**：`activation-plan --change client`（既有页面 entry 的 client.js 更新 → client HMR，不重启不重载页面）或 `new-client`（按 plan 输出为准）。新增 `cordis.patch.yml` 行属于 patch 分支（watched 配置重和解）。
4. **Creator Mode+ 升级**：`dshx sync-artifact <dsh-creator-mode-plus>` → `activation-plan --change server`（`src/profile-lifecycle.js` 已声明进 `hotReload.artifacts`，走同一有界事务）。
5. **验收**：普通会话新开提问 → 原生答案卡；slides 会话 → 全工具集；`session-8de3b342…` 旧会话：打开它，若 pending `ask_user_question` 行经原生提问服务重新派发则可答；若该行永久挂起，**不要手删会话锁**——保留作证据，用新会话继续即可。本次修复保证新会话不再复现。
6. **回滚**：DSHX `update rollback` / 把插件行从 watched patch 移除（patch 分支），全部经固定工具，不手改。

## 附：云端遗留

- 隔离 Host（3080/56200）仍在 `/tmp/rc2-host` 运行（DSH_HOME=/tmp/dsh-home-web-probe），可随时 kill 释放端口。
- `dsh-creator-mode-plus` 仓库已接受环境蓝图建议（npm install + pinned Harness + devkit），未来会话开箱即可跑 `test:native`。

## 六、verify-openslides 维护与复验（2026-09-30 第二轮）

### Skill 维护改动

- **新增 `scripts/rc2-isolation/`**：`run.mjs`（编排器：写 patch、起隔离 `dsh web --port 0`、收集日志、10 条断言自判）+ `probe.js`（Host 内探针：slides agent + normal agent 各建各测，`[probe]` 行输出）。一次命令复现此前的双向隔离实测，退出码即结论：`DSH_RC2_HOST=<rc2安装目录> node .agents/skills/verify-openslides/scripts/rc2-isolation/run.mjs`，日志落 `output/rc2-isolation/run-*.log`。
- **驱动修复（`drivers/review.mjs`）**：`versions` 特征此前 5/6 失败，根因是驱动 bug 而非产品——`#version-menu` 在「手动快照」后保持打开（产品设计如此），驱动再次盲点 `#btn-versions` 反而把它关上；`waitForSelector(visible)` 在异步 toggle 前的旧开状态窗口通过，随后行元素 0×0 不可见、click 超时。已改为幂等 `openVersionMenu()`（仅在 `el.hidden` 为真时才点按钮），SKILL.md 记录了这条弹层规则。产品代码未动。

### 复验结果

- `drive.mjs all`：**28/28 特征全绿、0 浏览器错误**（run `2026-09-30T12-18-49-555Z`，证据 `output/qa-verify-openslides/2026-09-30T12-18-49-555Z/`：report.md/json + 每特征 PNG + commands.json）。`versions` 12/12。
- `run.mjs`：**10/10 PASS**（log `output/rc2-isolation/run-muo2f5o6.log`）：slides agent `composedPreset=slides`、全工具集含 `open_project/ask_user_question/export_deck`、`open_project` 真执行（EEXIST 真实落盘反馈）、`bash` 按预设拒绝；normal agent `composedPreset=standard`、原生 roster 完整（含 bash）、`open_project` 报 `ToolNotFoundError`——双向隔离实测成立。
- 隔离 Host 实机演示（录屏）：编辑器 sidecar 56200 真加载 8 页 fixture deck；版本菜单 → 手动快照 V1 → 文本编辑 → 菜单显示「V2 当前稿 + V1 原始版本」→ 点 V1 进入只读预览（`只读 · V1 原始版本` 条）→ `回到最新` 恢复可编辑稿；Host 3080 页显示 `dsh-personal-slides: pending (waiting for service: personal)` 的精确环境缺口。

## 七、Personal 侧栏实机验收（2026-09-30 第三轮）

- `dsh-personal-entry@0.2.7`（用户公开仓库）对 pinned harness-src `639ed01` 执行 `npm run build` → `lib/index.js` + `lib/client.js`（47.19 kB）。
- 隔离 RC2 Host（`/tmp/rc2-host`，`@deepseek-ai/dsh@^0.2.0-rc.2`，独立 `/tmp/personal-run/home`）经 patch 挂载 `dsh-personal` + `dsh-personal-slides`：`dsh web --patch /tmp/personal-run/personal.patch.yml --no-open --port 0` → `http://127.0.0.1:58347`。
- Host 日志：`[dsh-personal] loaded` + `[my-plugins/dsh-personal-slides] loaded`，无报错。
- 实机截图/录屏：DSH 左栏出现「Personal」→ 点击进入后 Personal 侧栏列出「演示文稿」；主区渲染「演示文稿 · Open SlideStudio」完整页（输入框、MiniMax 中国/MiniMax-M3 选择、生成按钮、打开编辑器入口）；「打开编辑器」跳转 `127.0.0.1:56200` sidecar 正常加载编辑器。
- 缺口：OOPS 的 `ctx.personal` 功能包不在任何可访问仓库（`oops-dsh` 分叉内是另一套 `oops-personal` 架构，不消费 `ctx.personal`），故侧栏只见「演示文稿」一项；与 OOPS 并列的画面只能在本机装了 OOPS 后复核。

## 八、Personal 真实生成验收（智谱 ZAI glm-5.3，用户复验轮 4）

- 路径：DSH 侧栏 Personal → 「演示文稿」· Open SlideStudio 输入页（即用户指定的 OpenSlide 首页）→ 智谱 ZAI Coding Plan / glm-5.3 → thinking high → 生成。
- 凭据：ZHIPU_API_KEY，端点 `https://api.z.ai/api/coding/paas/v4`（用户 Key 唯一可用端点），经 `POST /slides/providers` 注册 BYOK `zai-coding`。
- 结果：会话 `0f5e96cb-b4a0-4449-b7aa-9595e094167e`，deck `output/dsh-slices/deck-0f5e96cb`，10 页 PPTD v2（cover→closing），全写页→渲染→审校→导出。
- 产物：`_agent/export/exp-77b396f1/_山野咖啡_开业活动方案.pptx`（61,827 B，10 个 slide XML 全为原生可编辑形状/文本/图表）；SHA-256 `5022c976ffdeca8e61fcb6003978fe325798630d33e39774c1e3eecef1982bf6`。
- 证据：`generation-input.v1.json` 记录 brief + provider zai-coding/model glm-5.3；录屏 rec-cf0d716f（输入→generating→回执→complete→编辑器打开新稿）。
- 修复的门槛：produce-gates 首跑失败（pack-color 自检空表）——`resolveSkillRoot` 从 cwd 找 `vendor/open-kimi-ppt` 失败；以官方公开环境变量 `SLIDESTUDIO_SKILL_ROOT` 指向仓库内 skill 根后全绿（未回退 Gemini）。
- 诚实缺口不变：OOPS 非 `ctx.personal` 功能，云端无可访问的 OOPS 功能包，并排需本机复核；走 Key 直连而非 z.ai OAuth grant。

## 九、智谱中国 GLM Coding Plan 真实生成复验（用户轮 5）

- 端点更正：改用 `https://open.bigmodel.cn/api/coding/paas/v4`（用户 zhipu key 属中国 Coding Plan；api/paas/v4 常规端点对该 key 返回 1113 余额不足）。BYOK `zhipu-cn-coding` 经 `POST /slides/providers` 注册，key 落 `credentials/zhipu-cn-coding.key`。
- 内核模型目录注意：provider 注册写 `settings.yaml` → 宿主启动时 settings 服务导入为 `settings.yaml.imported` 并入 llm-pi-ai 配置；**重启前若无 settings.yaml，目录不回填**（models:[]）。复跑需在注册后重启一次宿主，或保留 settings.yaml 让导入发生在下一次启动。
- 结果：会话 `ac2384e1-6657-4dc0-83bf-c5479ce3999c`，deck `output/dsh-slices/deck-ac2384e1`（10 页 会员日活动方案），导出 `_毛孩子回家日_社区宠物店会员日活动方案.pptx` 53,992 B（10 个原生 slide XML）；SHA-256 `188f006c8cb2fbe856bf29d90a972c09fcd1188538d693a7bec4527bc19ddb25`。`_agent/slice-session.v1.json` 记录 `provider.providerId=zhipu-cn-coding, modelId=glm-5.3, ready=true`。
- 全程录屏 rec-924fdb31（约 17 分钟真实生成），截图：composer complete / 编辑器封面 / 编辑器 p09 原生柱状图。
- 附带发现一个真实 UI 小瑕疵：composer 的封面预览 `<img>`（`/slides/raster/<sid>/cover`）全程裂图，rasters 磁盘齐全——疑似 raster 路由或前端未重取，待排查；导出文件名带前导下划线。

## 十、真首页（/app/hub.html）挂进 Personal + 真页面真实生成（2026-10-01）

- 用户指出旧 composer 是开发遗留假首页；真首页是产品 Hub（`.wordmark` Open SlideStudio + 输入卡片 + 框内模型下拉，`apps/native-web/public/hub.html|hub.js`，由编辑器 sidecar 提供）。
- **插件改动（dsh-personal-slides，用户自有插件，未动官方代码）**：
  1. `src/client/index.tsx`：功能页改为 iframe `src="/app/hub.html"`（同源，sidecar CSP `frame-ancestors 'self'` 允许）。
  2. `src/dsh-personal-slides.ts`：新增 `proxyToSidecar` + 在 personal 模式下注册 `/app`、`/media`、`/runtime` 前缀路由（官方 `dsh-slides-host` 在 personal:true 时明确不挂这三个产品壳路由——「belong to the standalone product shell」），把 sidecar 内容暴露为同源。
  - 关键语义（对齐 `product-proxy.ts editorPath`）：只有 `/app` 剥前缀；`/media`、`/runtime` 是 sidecar 真实路由必须原样转发。
  - `proxyToSidecar` 重写 `Host` 后还须把 `Origin` 归一化为 upstream.origin——sidecar `requestOriginAllowed` 要求 origin.host===host，否则 POST 403 `cross-site mutation rejected`。**官方 canonical `product-proxy.ts proxyToEditor` 有同样的潜在 Origin 缺陷（line ~93 只改 host 不改 origin），个人模式不走它所以没爆，但上游同样值得修。**
- 中途修的两个真 bug（testing agent 实机抓到）：① `/media`/`/runtime` 误剥前缀 → `chart-*.js` 返回 text/html → app.js 模块图死 → 编辑器永远停在「正在准备工作区」；② Origin 未归一化 → `POST /app/api/open` 403 → 「没能打开工作区」。两修后 `POST /app/api/open` 带浏览器 Origin 实测 200。
- **真实生成（经真首页）**：Personal → 演示文稿 → 真 hub 输入 brief「社区图书馆春季亲子阅读月活动方案（约9页）」→ 智谱中国 GLM Coding Plan / glm-5.3 → 发送 → performLaunch 真开会话 `710ac293-c8e1-483f-acfb-2c2469c87d31`，外联 open.bigmodel.cn 实测有 TLS 流量，~16.5 分钟 50 步（read_reference→write_page→review_pages→export）。
- 产物：`output/dsh-slices/deck-710ac293` = 9 `.page` + 9 rasters + `…/exp-5beec0d4…/春芽共读_亲子阅读月_社区图书馆春季亲子阅读月活动方案.pptx`（45,882 B OOXML，9 个 slide XML）；SHA-256 `96486b208dd36c03c95261b1d3f99acdd099369bb56f47454f334a31ec81de3a`。`slice-session.v1.json`：`providerId=zhipu-cn-coding, modelId=glm-5.3, ready=true`。
- **iframe 内编辑器亦验证**：继续协作 → 春芽共读，在 Personal iframe 里真渲染（封面/统计卡/时间线翻页均通过）。
- 录屏 rec-5ab0a1ac（真首页→生成→iframe 内编辑器），截图：hub+模型选择/继续协作/封面/时间线/表格/iframe 内封面+p3+p4。

## 十一、双入口模式：演示文稿可脱离 Personal Entry 独立挂载（2026-10-01）

- 需求：不装 dsh-personal 的用户也要能直接用演示文稿——在主导航（原来 Personal 那个位置）直接出现「演示文稿」顶层入口。
- 改动（只动 `dsh-personal-slides/src/client/index.tsx`）：
  - `inject` 从 `['personal']` 改为 `['slots']`——不再硬依赖 Personal 服务。
  - 启动即注册独立入口：`sidebar.panellist` 条目（id `slides`，order -9，图标为投影幕样式）+ `main` 面板（key `slides`，渲染同一真 hub iframe `/app/hub.html`）——复用 dsh-personal 挂「Personal」项的同一槽位机制。
  - `ctx.inject(['personal'], cb)` 等 Personal 服务：一旦到位，dispose 独立入口，改注册进 Personal 侧栏（原行为）；Personal 卸载时回退独立模式（带 dispose-期防御）。
- 验证（隔离 RC2 Host 实测）：
  - **双插件都装**：主导航只有 Personal + Plugins（无重复演示文稿）；Personal → 演示文稿 → 真 hub 正常。
  - **只装 dsh-personal-slides**：主导航直接出现「演示文稿」入口（在原来 Personal 的位置），点击整页渲染真 hub（大 logo + 输入卡 + 模型选择 + 继续协作列表）。
  - 两种模式下 `/app`、`/media`、`/runtime` 同源代理与 `/slides/*` API 都由 host 侧插件提供，与 personal 无关，生成链路不变。

## 十二、模型选择器数据源与 edge case（2026-10-01）

- 数据源 = 同一个 DSH 内核的 LLM 目录：`/slides/models` ← `ctx.llm.listProviders()/listModels()`（plugin.js listModelCatalog，每次请求刷新，`llm/adapters-updated` 事件即失效重建）。slides BYOK（`POST /slides/providers`）本质也是写入内核配置（settings.yaml → llm-pi-ai + slides-providers.local.json + credentials/*.key），两条配置路径最终都汇进同一内核 adapter 目录。
- 实测矩阵（隔离 RC2 Host，curl 直接打 API）：
  | 状态 | /slides/models | 选择器表现 | 发送键 |
  |---|---|---|---|
  | 全新 Home 零配置 | `[]` | 空列表 + 提示「还没有可用模型，去右上角『设置』接入」，chip 显示 AI Agent | 禁用（`send.disabled` 含 `!selectedModelKey()`） |
  | 只有未 ready 模板（pi-xai/oauth 未登录、minimax-cn 无 key） | rows 存在但 ready:false | 前端 `row.ready` 过滤，不出现 | 禁用 |
  | BYOK 注册后未重启 | `[]`（providers 端点已 ready:true 但 models:[]） | 空 | 禁用 |
  | 配置就绪（重启导入后） | provider + models | 「智谱中国 GLM Coding Plan / glm-5.3」，localStorage 记忆上次选择，触发 /slides/health 检查 | 可用 |
- **发现的真实缺口**：经 `/slides/providers` BYOK 注册的模型必须**重启 Host** 才进选择器——settings.yaml 只在启动时被 dsh-settings 导入内核（`.imported`）。走 DSH 自带设置界面配模型则内核即时更新（`llm/adapters-updated`），无需重启。`Antigravity` provider 被 routes 显式拒绝（isForbiddenGenerateRoute）。

## 十三、模型配置归 DSH 设置页（2026-10-01）

- 需求：插件形态下产品不该保留自己的模型配置页，用户应去 DSH 设置页接模型。顺带收益：DSH 设置写的模型内核即时生效，不再有「BYOK 注册后要重启」的坑。
- 改动：
  - `apps/native-web/public/hub.js`：齿轮 `btn-settings` 在 `/app/` 挂载且被 iframe 包裹时 `postMessage {type:'oss:open-dsh-settings'}` 给父页；600ms 无回执回退产品自带设置页（独立产品/页面直开时行为不变）。
  - `dsh-personal-slides/src/client/index.tsx`：SlidesPage 监听该消息 → `openDshSettings(ctx)`：探测 `[data-slot="sidebar.settings"]` 挂载锚点——在（独立模式/主面板）→ 就地派发 `settings.open` 合成键（从 `ctx.get('shortcuts').catalog` 读当前绑定，尊重用户改键、跨平台）；不在（Personal 页未挂载该槽位）→ `ctx.get('layout').selectPanel(null)` 切主面板 → 350ms 后若模态未开再派发一次。
- 实测踩掉的三个真坑（testing agent 逐轮实机抓到）：
  1. **Personal 页根本没有 `sidebar.settings` 挂载点**（Personal 用 `sidebar` 槽位 occupant 替换整个侧栏，且未渲染子槽位）——`settings.open` 执行了但模态无处可渲染，表现为死按钮；试图在 PersonalSidebar 里 `renderSlot('sidebar.settings')` 被框架堵死（occupant 未声明 children 拿不到 renderSlot；同名槽位不能重复声明）。dsh-personal-entry 的探路改动已撤回，仓库恢复原样。
  2. **`settings.open` 是开关切换**：在 Personal 页派发会把 shell store 的 open 置真（不可见泄漏），导航后模态自现、第二次派发又把它关掉 → 改为「先探测挂载点，未挂载不派发直接导航」。
  3. **ack 必须等模态真出现**（`[data-shortcut-modal]`）才回执，否则吞掉 hub 回退。
- 终验（录屏 rec-36fd42f8 + 截图 ss_209dfd21 等）：Personal → 演示文稿 → 齿轮 → ~0.5s 切主面板 → **真 DSH 设置面板弹出并保持**（General/Models/Built-in plugins/Agent presets）；物理 ⌘⌥, 在主面板正常开关；回 Personal → 演示文稿正常，模型选择仍是 glm-5.3。
- 已知取舍：关掉设置后落在 DSH 主面板而非演示文稿页（模态挂在标准 sidebar，属预期；用户点回 Personal 即可）。官方若能将 settings 模态改挂 `shell.overlay`（Personal 页有挂载点）可实现原地打开——上游建议，不属本次改动。
- `POST /slides/providers` BYOK 端点与产品自带设置页保留给独立产品使用；插件态下正常流程永远落到 DSH 设置。

### §十三补：「去 DSH 设置」完整 UX（2026-10-01 二改）

- 用户反馈第一版「有去无回」体验差。最终形态：**hub 齿轮 → hub 内确认框「前往 DSH 设置 / 模型接入等设置已由 DSH 统一管理。即将离开演示文稿打开 DSH 设置页，完成后会自动返回。」→ [取消] [前往设置]**；确认后切主面板开设置；**关掉设置自动返回演示文稿**（`layout.panelInfo.getSnapshot().activePanelId` 记录来源面板，`beginNavigation()` 的 AbortSignal 防抢——用户中途自己点导航就不拽回来）。
- 产品自带设置页的去留结论：模型/订阅登录/外观三块在插件态全部由 DSH 设置接管，产品页仅作「页面未挂进 DSH」的兜底（独立产品形态不变）。
- 消息监听从 SlidesPage 挪到 apply 作用域（`ctx.effect`）——selectPanel(null) 会卸载 Personal 主面板，组件级监听会随页面死掉，后续轮询必须在插件级。
- **onboarding 边界（testing agent 实测抓出）**：全新 Home（无官方 key）时 `settings.onboarding` 的「Add an API key」弹窗在每次主面板挂载时重弹，`settings.open` 的 resolve 见 `modal='other'` 直接拒绝；且该弹窗 `onClose=ignoreImplicitDismiss`——`closeTopModal` 调它的 close 是空操作，官方设计就关不掉。最终策略不是关它而是**让位**：`driveSettingsOpen` 轮询——其他 dialog 占层就等（它本身就是加 key 流程，正是用户意图）、层空再派发、派发被挡自动重派、settings 开了等关、关了自动返回、10 秒没开成兜底返回。实测效果反而更顺：新用户点齿轮 → 官方加 key 引导 → 填完 key → 设置自动接力打开 → 关闭 → 回到演示文稿。
- 终验（录屏 rec-r7-yield-sm）：三环境全过——Host C 全新 Home（onboarding 让位→接力→返回）、Host A Personal（确认→跳转→开→关→自动返回）、Host B 独立模式（确认→原地开→关→留原页）。
- 改动文件：`dsh-personal-slides/src/client/index.tsx`（重构）、`apps/native-web/public/hub.{js,html,css}`（goto 确认框）、lib/client.js 重建 6.61kB。

## 十四、产品更名 DSH SlideStudio + 中英双语（2026-10-01）

- 需求：产品统一叫 **DSH SlideStudio**；界面跟随 **DSH 自己的 Language 设置**（Settings → Language，中文/English）自动切换，不给用户第二个选择器。入口名 zh=「演示文稿」/ en=「Slides」。
- i18n 架构（`apps/native-web/public/i18n.js`，~1240 条英译字典，以中文原文为键）：
  - `t(text, params)`：en 模式查表、zh/缺词条原样返回中文——未译字符串永不破版；`{name}` 占位插值。
  - `applyI18n(root)`：`data-i18n` 译 textContent、`data-i18n-{title,placeholder,aria-label,value,alt}` 译属性、`data-i18n-agent-prompt` 译发给模型的预置提示；自动执行于 DOMContentLoaded，并设 `document.lang`+标题。
  - 语言解析三级：`?lang=` URL 参数（写进 localStorage `oss.lang`）→ localStorage → navigator.language；运行期经 `window 'message' {type:'oss:locale'}` 广播 + `onLangChange` 重绘。
- 覆盖面：app.js（769 处 t() 包裹 + 全部内嵌碎片，模型侧指令构建器刻意保留中文）、index.html（114 处 data-i18n/span 标记）、hub.html（83 处）、generation-process.js、reader-reasoning.js、theme.js、work-agent-scope.js（顺手修了一处预存乱码 `��选对象`→`所选对象`）及全部卫星模块。字典完整性脚本校验 0 缺失；`node --check` 全过。
- 插件侧（`dsh-personal-slides/src/client/index.tsx`）：`ctx.locale.getLocale().active` 读 DSH 语言 → `slideTitle()` 返回 演示文稿/Slides；locale subscribe 触发重注册 Personal 功能项 + `oss:locale` postMessage 广播到所有 /app/ iframe；hub/编辑器链接追加 `?lang=`；launch-flow hrefs 同步带参。
- 实测修复点：style chip 的 `getStyleDisplayName` 运行时直写 textContent 绕过字典 → 返回值套 t()；导出结果卡模板拆 t() 碎片（"{p0} 页 · {p1}" 等 5 条新词条），文件名改经 `escapeHtmlText`。
- 双语 e2e 全过（testing agent 实测，glm-5.3 真生成非样例）：
  - **中文**：DSH 中文 → 侧栏「演示文稿」→ hub 全中文（标题 DSH SlideStudio、「继续协作」、自由风格）→ 中文 brief → 真跑 14 分钟 42 步 → deck-8166b822（6 页 + 36.7KB OOXML PPTX，session 绑定 zhipu-cn-coding/glm-5.3）→ 中文编辑器渲染 → 导出下载成功。
  - **英文**：Language → English → 侧栏「Slides」→ hub 全英文 → 英文 brief → 真跑 9.5 分钟 29 步 → deck-2f738d6a（6 页 + 41.3KB PPTX）→ 全英编辑器（Insert/Text/Shape/Export/Show speaker notes）→ Export 下载成功。
  - 录屏：`rec-i18n-zh-e2e-edited.mp4` + `rec-i18n-en-e2e-edited.mp4`；导出卡英文态补验 `rec-r9-export-i18n-edited.mp4`（"6 pages · 40 KB"、"Bundled with Office / WPS…" 全英）。
- 两个预存产品 bug（非本次引入，记录待办）：① 导出完成后对话框偶发无法关闭（中文路径出现过一次：取消/Esc/点背景全无效约 1 分钟，刷新才解；英文路径 Cancel 一次成功）——疑似下载完成后的状态卡死，间歇性；② 中文导出文件名带前导下划线（`_街道养老….pptx`）——标题消毒把前导字符换成 `_`，纯外观。

## 十五、生产修复轮（2026-10-02）：两 bug 修复 + i18n 回归大扫除 + 28/28 全绿

- **Bug ① 导出对话框偶发关不掉**：加固 `downloadExport`——`exportDownloadBusy` 防重入互斥（下载进行中重复点「下载」不再叠加悬空状态）；Esc 处理器改为「只作用最上层 dialog」且兼容输入法组合键；`<form method="dialog">` 的取消按钮保持原生路径。间歇性根因未能独立复现，属加固修复。
- **Bug ② 中文文件名前导下划线**：标题消毒统一为「非法字符→`_` 后剥掉首尾 `_`，空了回退默认名」。6 处全部修复：`exporter-native/src`（export-pptd.ts、export-png.ts）+ 对应 `dist/*.js` 重建产物、`server.mjs`（PDF/PNG 两处）、`app.js` 前端 fallback。实测 `· 街道养老服务季度汇报 ·` → `街道养老服务季度汇报.pptx`。
- **e2e 复验（/tmp/personal-run/probe-two-bugs.mjs，6 断言全过）**：下载后 Esc 关、取消按钮关、二次下载后 Esc 关、点对话框边缘关；文件名无前导 `_` 且中文保留。
- **i18n 截断 bug 类（本轮最大发现，全部修复）**：早先的仓库级 i18n 转换在「最后一个 `{pN}` 占位符处截断模板」，丢尾文本/HTML，约 30+ 处。最严重后果：批注卡模板 `<button ... {p3}` 未闭合 → `querySelector` 拿 null → 打开批注附件直接崩（toast「操作失败」）→ comment-annotate/comment-send-agent 两特性红。修复方式：逐条还原原始完整字符串作 t() 键 + EN 字典补 31 条词条。
- **`t` 遮蔽 bug 类（2 处，均修复）**：
  - `for (const [lab, t] of [[t("柱状"),"bar"],…])`——循环变量 `t` 在自身 TDZ 内求值可迭代表达式里的 `t()` → `Cannot access 't' before initialization` → renderCtxBar 图表分支整体抛错 → 属性面板永不显示（chart-edit 特性红）。改 `[lab, type]`。
  - `const t = ev.target` 后 `t("保存文字失败…")` → `t is not a function`（文本/表格保存失败 toast 路径）。改 `target`。
  - 全文件级作用域扫描（含 `(t)=>`、`for (const t of`、`const t =`）确认无残余——brief-chip.js 与 `reason.tools` 两处命中为不同函数/分支作用域，安全。
- **驱动修复（非产品改动）**：`scripts/qa/editor-comment-batch.mjs` 补 `locale: "zh-CN"`（无头 Chromium 默认 en-US → 中文断言必挂；lib.mjs 早已钉，此脚本漏钉）→ 20/20。
- **终验**：`drive.mjs all` **28/28 特性全绿**（evidence `output/qa-verify-openslides/2026-10-02T06-02-50-030Z`）；英文 locale 探针复测图表属性面板同样正常（`inspectorType=chart`、无 error toast）。
- **真实生成终验（testing agent，隔离 Host 56337）**：新中文 brief「滨江社区夜市招商运营方案」→ glm-5.3 真跑 ~15 分钟 46 步 → deck-e93ebb55（6 页 + 50.8KB OOXML PPTX，session 绑定 zhipu-cn-coding/glm-5.3）。逐修复点实测全过：图表元素点开完整属性面板（TDZ 崩已消）、批注卡打开不崩、导出文件名干净无前导 `_`、导出后 Esc/取消均可关对话框；旧 deck 英文侧车回归同样正常。录屏 `rec-r10-final-e2e-edited.mp4`。
- **环境注意（非产品缺陷）**：新 DSH Home 的 BYOK 要走 DSH Settings → Models → 自定义模型 API 才会进内核目录；`POST /slides/providers` 只写文件不注册目录，选择器保持空——与该 API 配套的文档需写明「注册后需经 DSH 设置或重启生效」。

## 十六、模型配置统一归 DSH 设置页（2026-10-02，按用户决策收口）

- 决策：DSH 插件形态下产品不保留自己的模型配置页——用户统一去 DSH 官方设置页配模型（内核实时生效，无重启坑）；自带设置页仅留给独立产品形态。
- 改动（`apps/native-web/public/hub.{js,html,css}` + `i18n.js`）：`showSettings` 检测 `/app/` 挂载（DSH 模式）→ 隐藏「模型」「订阅登录」两个 nav+pane，默认选「外观」；nav 尾部显示提示「模型接入与登录由 DSH 设置统一管理。」（EN: "Model access and sign-in are managed in DSH Settings."）。即使 host 无应答走 fallback，DSH 模式下也只能看到外观页——BYOK 写入口在 DSH 模式彻底不可达。
- 服务端 `/slides/providers` 读写端点保留：GET 本来就合并内核目录（`slidesProviders(home)` + `loadSlidesModelCatalog`，DSH 设置配的模型立即可见）；POST/DELETE 是独立产品（无内核、文件即目录）唯一配置路径，DSH 模式下 UI 不再触达。
- 实测（probe-dsh-settings.mjs，10 断言全过）：standalone 下模型/订阅登录面板正常；`/app/` 挂载下两面板隐藏、外观页选中、提示显示且英文已译。hub-settings/hub-create/hub-launch/hub-projects 驱动回归全绿（95 checks）。
