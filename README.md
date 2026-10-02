# Open SlideStudio

本地可部署的演示文稿工作室：一句话简报 → 可编辑幻灯片（YAML PPTD v2）→ 原生 PPTX。

产品名是 **Open SlideStudio**。交互对齐参考稿，但生产环境不加载任何 Kimi iframe / CDN，也不使用 KIMI 商标做品牌主张。

当前产品主路径是：创建页 → 供应商登录 → DSH Agent Run 真实生成 → 可编辑画布 → 原生 PPTX（内核见 `docs/adr/0009-dsh-is-the-single-agent-kernel.md`）。界面和微交互仍按冻结的 Kimi 参考基线逐项补齐；官方账号队列、套餐和 Google Slides 不属于本地产品。

## 安装到 DeepSeek Harness

当前正式版本：**0.2.0**。这是社区外部插件，使用 DSH 官方公开插件接口；产品名为 Open SlideStudio。

### 一条命令安装

已安装 DSH CLI 的用户，在 **Web profile** 执行：

```sh
dsh plugin --profile web add https://github.com/aa2246740/dsh-openslides/releases/download/v0.2.0/dsh-openslides-0.2.0.tgz
```

安装包已经编译，包含编辑器、导出器、字体、设计资源与生产依赖，不需要克隆本仓库或在安装时编译。

### 桌面端安装

打开 DSH 侧栏的 **插件 → 添加插件**，填入上面的 `.tgz` 下载地址，检查后安装并启用。

npm 发布名统一为 `dsh-openslides`。**npm 发布验证尚待完成**；完成后桌面安装框可直接填写 `dsh-openslides`，CLI 对应：

```sh
dsh plugin --profile web add dsh-openslides
```

Web 和 Desktop 使用各自的 profile；CLI 的 `--profile web` 不会安装到桌面。桌面安装和升级应走桌面插件管理器，并遵循其重启提示。

### 两种入口

- **直接安装**：官方侧栏出现「演示文稿」，无需 Personal。
- **已有 Personal**：同一插件出现在「个人 → 演示文稿」。推荐 Personal 0.2.8，空间切换保留工作树与 PPT 页面。[Personal 安装说明](https://github.com/aa2246740/dsh-personal-entry#安装与兼容)

模型选择器读取当前 Harness 的模型服务，配置模型、API 地址和凭证都在 Harness 设置中完成。无需再导入一份 Slides 模型目录。列表同步不等于每个供应商都已通过 PPT 生成测试。

### 环境与升级注意

- 已验证 DSH **0.2.0-rc.2**；Node.js 要求 `^22.19.0 || >=24.0.0`。
- 生成中的截图/排版检查需要 **Playwright 1.61.1 / Chromium Headless Shell 1228** 的固定运行时。插件不会自动下载浏览器。已有默认 `~/.codex/playwright-runtime/runtime.mjs` 时自动使用；其他部署须设置 `SLIDESTUDIO_PLAYWRIGHT_RUNTIME` 指向兼容的 `runtime.mjs`。因此「一条命令安装插件」不代表全新机器无需配置渲染环境。
- 旧版包名为 `dsh-personal-slides`。升级前在插件管理器中停用旧包，再启用 `dsh-openslides`，避免重复占用路由和侧栏；不要把两个包同时启用。
- 当前项目保存在运行目录的 `output/`。从旧源码安装或旧包迁移时，先保留该目录；新包不会自动搬迁历史项目，也不要删除旧目录。源码部署可继续沿用原运行目录。

打包方式对照官方 [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/user/develop/basic/publish.zh.md)：声明 `dsh.bundle.patch`，补丁按 npm 包名加载插件，发布预编译入口，复用宿主 peer 依赖。GitHub 源码根目录是 monorepo，**安装请使用发布包**。

生成、可编辑 PPTX、模型同步及截图证据见 [验收报告](docs/acceptance/2026-10-02/README.md)。当前正式发布不代表未测平台已通过；原生桌面的最终安装包复验仍有自动化阻塞。

## 从源码运行（开发者）

需要 Node.js 22.19+，以及至少一个可用的模型供应商账号或 API Key。

```bash
git clone https://github.com/aa2246740/dsh-openslides.git
cd dsh-openslides
npm install
npm start
```

浏览器打开 **http://127.0.0.1:13080/** ，根路径会转到创建页 **`/app/hub.html`**。

- 首页是 **创建 Hub**（一句话生成 + 供应商 BYOK/OAuth）
- 编辑器在 `/index.html?project=…`（从结果卡「编辑」进去）
- 逐步操作见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)

`npm start` = 编译原生包 + 启动 DSH slides Hub（端口 **13080**）和编辑器 sidecar（**55200**）。第一次会稍慢。

停掉用 `Ctrl+C`。改端口：`SLIDES_DSH_PORT=13081 npm start` 换 Hub/内核口，`SLIDES_EDITOR_PORT=55201` 换编辑器 sidecar（3080 是 DSH.app 的默认口，勿占）。全部可用环境变量见 `.env.example`。

### 登录模型供应商

正常创作走 DSH Provider Connection：供应商凭证进入隔离的 `DSH_HOME`（`<repo>/.dsh/home`，绝不共用 `~/.dsh`），经 `@deepseek-ai/dsh-llm-pi-ai` 适配器调用供应商 SDK。点击创建框右下角的供应商按钮：

1. 选择供应商（默认 MiniMax China；China key 缺失或 401/403 时可走 OpenRouter MiniMax 免费档）；
2. 粘贴 API Key，或完成该供应商支持的 OAuth；
3. 登录状态只显示供应商和认证类型，不回传密钥；
4. 可选填写具体模型名，否则用该供应商的默认模型。

开发时启动会从 `~/.dsh/settings.yaml` 导入 API-key 供应商（跳过 Antigravity），不会复制 OAuth grant 文件。shell 里也可以直接给 `MINIMAX_CN_API_KEY` / `OPENROUTER_API_KEY` 等环境变量，见 `.env.example`。

没有登录、供应商失败、工具链未跑全或真实性凭证不完整时，产品会暂停/失败并保留检查点，不会改用离线剧本或模板冒充成功。

## 验收时请走这条路

| 做 | 不要做 |
|---|---|
| `npm start` → `:13080`（编辑器 sidecar `:55200`） | `npm run dev` / `dev:api` / `dev:web` → `:5173`（旧栈，已归档） |
| Hub 登录供应商后生成新稿 | 把开发夹具、离线剧本或旧 TS IR 当成产品 |
| 导出 PPTX 后用 WPS / PowerPoint 打开改字、改表、改图 | 把整页截图当成功标准 |

磁盘真源是 YAML PPTD v2（`@open-slidestudio/pptd-v2`），不是幻灯片位图，也不是旧的 TypeScript Deck IR。说明见 `LEGACY.md`、`CONTEXT.md`。

## 原生包

| 包 | 作用 |
|---|---|
| `@open-slidestudio/pptd-v2` | YAML PPTD v2 读写 |
| `@open-slidestudio/project-store` | 工程版本 |
| `@open-slidestudio/exporter-native` | 离线混合 PPTX（对象可编辑） |
| `@open-slidestudio/canvas-session` | 编辑会话 + 死按钮门禁 |
| `@open-slidestudio/presentation-run` | Agent Run 领域工具、回执与门禁 |
| `@open-slidestudio/dsh-slides-host` | DSH `slides` profile 的非视觉 Host（工具、`/slides` 路由、sidecar 代理） |
| `@open-slidestudio/dsh-slides-client` / `dsh-slides-bundle` | 产品 root 插件 / profile 打包 |
| `@open-slidestudio/native-web` | 编辑器 sidecar（本机 HTTP，:55200） |
| `@open-slidestudio/agent-harness` | **冻结 fixture**（Phase 0 留存：`createPiBrain`、host painters、playbook），不是生产路径 |

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm start` | 同步 slides profile（按需编译原生包）并打开产品：DSH 内核 + Hub（:13080）+ 编辑器 sidecar（:55200） |
| `npm run native:dev` | 编译原生包后只起编辑器 sidecar（:55200）；不开 DSH 内核，不能生成，不是产品入口 |
| `npm run test:native` | 原生包单测 |
| `npm run gate:native` | 编译 + 单测 + oracle 校验 + smoke |
| `npm run qa:all` | 浏览器交互门禁（需本机已能起 55200） |
| `npm run pi:verify` | 只读核验冻结 fixture 用的 Pi 版本和 Node 版本（旧内核留存，非产品路径） |
| `npm run native:generate -- "一句话" -o ./output/demo` | 开发/夹具 CLI，不是正常产品验收入口 |

## 明确不做 / 尚未做完

- 官方生成排队、账号套餐、Google Slides（`wont-port`）
- 文档长文、4:3 画布（按钮上写了「即将支持」）
- 像素描摹的官方 SVG 皮、官方 iframe 双通道截图未齐
- 分享没有云端 ACL / 多人实时
- 声称 Phase G / 1:1 完成

## License

Apache-2.0
