# Open SlideStudio

本地可部署的演示文稿工作室：一句话简报 → 可编辑幻灯片（YAML PPTD v2）→ 原生 PPTX。

产品名是 **Open SlideStudio**。交互对齐参考稿，但生产环境不加载任何 Kimi iframe / CDN，也不使用 KIMI 商标做品牌主张。

当前产品主路径是：创建页 → 供应商登录 → DSH Agent Run 真实生成 → 可编辑画布 → 原生 PPTX（内核见 `docs/adr/0009-dsh-is-the-single-agent-kernel.md`）。界面和微交互仍按冻结的 Kimi 参考基线逐项补齐；官方账号队列、套餐和 Google Slides 不属于本地产品。

## 自己部署验收

需要 Node.js 22.19+，以及至少一个可用的模型供应商账号或 API Key。

```bash
git clone <本仓库>
cd open-slidestudio
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
