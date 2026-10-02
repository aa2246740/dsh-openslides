# Open SlideStudio 编辑器人工验收（2026-08-31）

## 验收对象

- 活仓库：`/Users/wu/Documents/DSH/openkimi-slides`
- 活服务：`http://127.0.0.1:3080`
- 正确健康检查：`/slides/health`
- 旧仓 `open-slidestudio` 未修改。

## 人工操作结论

1. **图表数据编辑器：通过。** 表格改为中性白/灰底，正文保持深色，仅用小色块表达系列颜色；聚焦单元格仍有明确蓝色边框，数据量较大时可横纵滚动。
2. **图表工具栏：通过。** 原先两个含义不明的纯图标改为可见的“数据标签”“图例”文字按钮；悬停提示表达当前动作（例如“显示图例”），并同步 `aria-pressed`。
3. **上下文“更多”：通过。** 人工展开并核对尺寸、图层、组合、锁定、隐藏、复制、删除；`Escape` 可关闭并恢复触发器状态。
4. **底部“更多”：通过。** 人工展开并核对主题、协作与 AI、批注、演讲者备注、朗读、插入图表、插入 SmartArt、演示设置；补齐菜单语义、键盘上下移动和 `Escape`。
5. **消息弹层焦点：代码修复并纳入回归断言。** 修复关闭弹层后焦点落到已隐藏菜单项的问题；现在回到可见的“更多”按钮。此项本轮完成代码、语法和回归断言检查，未单独以浏览器自动化执行该新增断言。

## 当前运行证据

- 图表工具栏可见标签：`/private/tmp/openkimi-human-audit-20260831/after-chart-toolbar-visible-labels.png`
- 中性图表数据编辑器：`/private/tmp/openkimi-human-audit-20260831/after-chart-data-neutral.png`
- 真实指针悬停提示：`/var/folders/3s/358mwqw14630yh2f7d121v4h0000gn/T/com.openai.sky.CUAService/Chrome Screenshot 2026-08-31 at 9.12.53 AM.jpeg`
- 上下文“更多”：`/private/tmp/openkimi-human-audit-20260831/isolated-context-more.png`
- 上下文菜单 Escape 关闭：`/private/tmp/openkimi-human-audit-20260831/isolated-context-more-escape.png`
- 底部“更多”：`/private/tmp/openkimi-human-audit-20260831/isolated-bottom-more.png`

## 自动检查

- `npm run build:native`：通过。
- `npm run test:native`：最终复跑通过，650/650。
- `node --test apps/native-web/src/review-threads.test.mjs`：11/11 通过，包含 V1 原始版本保护、真实 DSH Agent 路由、AI review 锁续租、过期 token 拒绝与 guard 写入故障一致性。
- `npm run oracle:validate`：通过，109 个 schema 行文件、108 个 catalog 行。
- `git diff --check`：通过。
- `node --check`：`app.js`、`tooltips.js`、`editor-toolbar-actions.mjs` 均通过。
- `/slides/health`：`ok=true`、`generateReady=true`、`produceGates.ok=true`、`hashMatch=true`。

## 办公场景验收

本机当日场景产物位于 `output/qa-office-scenarios/2026-08-31-run10/`。以下 8 类场景均完成生成、960×540 光栅检查、硬裁切/低对比/碰撞/穿字线检查和 PPTX 导出：

| 场景 | 页数 | 技术布局 | 导出 |
|---|---:|---|---|
| 经营月报 | 5 | 通过 | 通过 |
| 教学课件 | 6 | 通过 | 通过 |
| 知识分享 | 6 | 通过 | 通过 |
| 述职报告 | 4 | 通过 | 通过 |
| 工作汇报 | 4 | 通过 | 通过 |
| 项目提案 | 6 | 通过 | 通过 |
| 培训指南 | 6 | 通过 | 通过 |
| 学术答辩 | 4 | 通过 | 通过 |

报告：`output/qa-office-scenarios/2026-08-31-run10/report.json`。

## 尚未掩盖的风险

- 场景套件证明的是路由、布局、可读性和导出完整性，不等于内容策划质量已经优秀。人工查看联系表后，部分场景仍偏模板化、留白偏多，教学/知识分享/述职之间的内容语言差异不够强；这应作为后续生成质量改进项，不能冒充“全绿”。
- 本轮按用户要求用真实 GUI/Computer Use 验证关键交互；没有把未运行的 Playwright 编辑器动作脚本写成已通过结果。
