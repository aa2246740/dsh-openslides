# Legacy (非 SSOT)

按 wayfinder **OOP-21 / OOP-27**：

| 包 / 路径 | 状态 |
|-----------|------|
| `@open-slidestudio/pptd` | **Legacy TS Deck IR**。禁止作为写路径真源。新功能只走 YAML PPTD v2。 |
| 旧 mock 仅存在于 TS 的 deck 工厂 | 逐步迁移为 `fixtures/` 下 PPTD 工程，或删除。 |
| 现有 `exporter-pptx`（仅 pptxgenjs、吃 TS Deck） | 保留至 `@open-slidestudio/exporter-native` 覆盖后归档。 |

**SSOT：** 磁盘上的 Kimi YAML PPTD v2（`.pptd` + `pages/*.page` + `media/`），由 `@open-slidestudio/pptd-v2` 读写。

**生产禁止：** Kimi iframe / `kimi.com` / `statics.moonshot.cn` 作为运行时。

**启动：** 验收请用根目录 `npm start`（DSH `slides` profile，`http://127.0.0.1:13080`）。编辑器 sidecar 在 `:55200`，经 `/app` 同源代理。不要占用 DSH.app 的 3080。`npm run native:dev` 只起 sidecar，不是产品入口。`npm run dev` / `dev:api` / `dev:web` / `:5173` 是本表里的旧栈。逐步操作见 `docs/ACCEPTANCE.md`。

**冻结包：** `@open-slidestudio/agent-harness` 仍在仓库里，供 Phase 0 冻结与 fixture 测试。生产 `slides` profile 和 `dsh-slides-host` 不再依赖它。
