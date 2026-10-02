# nativeGen：把 openkimi skill 改造成原生产品说明书（一次改完）

日期：2026-09-18
分支：`nativeGen`

## 为什么要改

产品是"Agent 设计 PPT"，用户只关心输入 → 产出 → 导出。但模型必读的参考资料是**上游桌面工具版**的说明书，里面写着：

- 交付完**必须**提醒用户运行 `npx open-kimi-ppt-skill serve`
- 生成前先跑 `node --version` / `npm`，缺了就**让用户去装 Node.js**
- 想手动改就开 `http://127.0.0.1:55173/` 并"授权项目目录"
- 依赖 Node/python3/Chromium，还要访问 `www.kimi.com` + `statics.moonshot.cn`，PPTX 经 Kimi 公共编辑器 iframe 产出

这些既违反产品底线（内网离线、生产不引 Kimi iframe/CDN），也把内部实现暴露给了非技术用户——模型只是**照说明书执行**。

## 改了什么

### 1. skill 原生化（只动 4 个文件，其余 72 个逐字节未动）

| 文件 | 改动 |
| --- | --- |
| `SKILL.md` | frontmatter 去掉"本地生成/绝对路径"；Definition 去掉厂商名与浏览器端写出器；`step0` 的 Node/npm/python3/Chromium/kimi.com 前置检查换成"读 `inspect_capabilities` + 能力卡"；导出段改用 `export_deck` 与产品导出菜单；视觉复核改用 `render_page` + `review_page`/`review_pages`；结尾只留**一个**产品化下一步（导出菜单 / 留批注让 Agent 再改） |
| `scripts/export_pptx.py`、`export_images.py`、`export_host.html` | 删除（本地 Python 导出链 + iframe 宿主页；无产品代码调用，git 历史保留） |

清单 `packages/agent-harness/reference/openkimi-source-manifest.v1.json` 已重生成：**76 → 73 个文件，只有 `SKILL.md` 哈希变化**（其余全部逐字节一致，产出质量所依赖的设计系统/分类/PPTD 参考未被触碰）。新增 `scripts/build-openkimi-source-manifest.mjs`（含 `--check`）作为正式重生成入口。

### 2. 我们自己的真相源对齐

- `capability-card.ts`：把"禁止 iframe/脚本"的清单换成**正向说明**（编辑与导出内置于本产品，导出用 `export_deck`），保留一句硬护栏
- `director-brief.ts`：交付契约改为"用用户的语言、用产品措辞交付：讲什么/几页/风格/来源/未决项；右侧面板改对象、批注让 Agent 再改、导出菜单出文件；门禁挡住 ≠ 死路"；结尾不再出现路径/命令/域名

### 3. skill 改不到的产品行为

- **暂停/停止后三出口**：收尾未完成时明确写出"可以直接在编辑器里修改并导出，也可以继续完成生成，或在下方发新的修改要求"
- **图表可读性**：编辑器图表的墨色不再只看页面底色，而是看"图表实际压在什么之上"（页面底 → 背后最近的不透明面板）→ 深色面板上饼图/图表标签自动转浅色；白底页面保持原样
- **中性目录名**：新生成的工程目录改为 `output/dsh-slices/deck-<sessionId8>`，用户原话不再进文件路径与编辑器 URL（标题仍完整保存在 `.pptd` 元数据里）
- **文档更正**：`docs/architecture/independent-harness.md`、`docs/editor-oracle/runs/neodeck-local/REPORT.md` 标注本地 serve 为"上游桌面工作流，本产品不适用"

## 验收证据

| 项 | 结果 |
| --- | --- |
| 新增守卫测试 `openkimi-source-guard.test.ts` | 3/3 通过：扫描清单校验后的 chunk 文本，不得出现 `npx`/`npm`/`node --version`/`python3`/`127.0.0.1`/`localhost:`/`kimi.com`/`moonshot`/`iframe`/`Chromium`/绝对路径；且 3 个桌面脚本不在包内 |
| 初始提示词（模型收到的第一条消息） | 5061 字符，泄露命中 **0**；含交付契约与产品出口说明 |
| 图表墨色探针 | 深色面板 `#0059BA` → 标签 `#CBD5E1`（浅）；白底页面 → `#626970` 系（深，未变） |
| `qa:all` / 门禁 | OK |
| 7 个家族套件 | 全 OK |
| `agent-harness` | 335/335 |
| `dsh-slides-host` | 238/238（含中性目录名断言） |
| `native-web` | 134/135（仅剩既有的"流式选区"红项，与本改造无关） |

## 生效条件

- 前端改动（图表墨色、暂停横幅文案）：刷新编辑器页面即生效
- Host 侧改动（提示词、能力卡、中性目录名）：需要重启提供 13081 的 DSH 实例后，新生成的会话才用新代码

## 真实端到端验收（隔离实例，不碰你的 13081）

用独立 `DSH_HOME` + 独立端口 13099 起了一个实例跑真实模型生成（brief：「做一页封面：介绍小米 YU7 的外观亮点」）：

| 检查 | 结果 |
| --- | --- |
| 工程目录 | `output/dsh-slices/deck-d397737c` —— 中性命名，用户原话不进路径 |
| 生成页数 | 1 页（与"做一页封面"一致） |
| **模型最终答复** | **7 项泄露扫描全部未命中**（命令行、localhost/127.0.0.1、外部域名、绝对路径、工程相对路径、shell 代码块、桌面脚本/iframe/Chromium） |
| 产品化措辞 | 命中：自动提到"右侧属性面板 / 评论面板 / 导出菜单" |
| 门禁话术 | 主动说明"卡住的门不影响编辑与导出"——正是新的交付契约 |
| 导出 | PPTX HTTP 200，1 页 |

### E2E 抓到的两个真问题（已修）

1. **冻结校验**：`packages/presentation-run/src/catalog.ts` 的 `EXPECTED_SOURCE_FILES = 76` 让 host 直接报错（`OpenKimi source catalog expected 76, got 73`），新会话根本起不来 → 已改为 73 并注明"改动需有意为之"
2. **提示词里的陈旧数字**：4 处 brief 里写着 "from the 76/44 catalog"（改完后就成了错数字）→ 改成 "from the catalog"，并同步 2 个测试断言；`presentation-run` 246/246、`dsh-slides-host` 238/238

## 未做（需要单独决定）

- 你正在用的 **13081 实例**仍是旧代码：重启后新会话才会用新提示词/中性目录名（前端改动刷新即生效）
- provider 登录对小白仍是配置悬崖（当前环境是 env 预置，未暴露）

## 收尾修复（最后一条红项，实为真 bug）

之前记为"待你拍板"的 native-web 红项，经实验判定**不是无头环境问题**：

- 对照实验：无头 Chromium 里程序化设置的选区在 1.5 秒 + 重绘后**依然存在** → 排除环境
- DOM 变更日志显示：每次轮询，进程列表的行都被 **remove + add**（重排时 `insertBefore` 移动节点），而"移动 = 先摘再插"，节点一摘，锚在其中的选区就塌陷
- 同时发现「↓ 回到最新」按钮被一条 WIP 规则 `display:none !important` **永久藏死**（测试里点不到），而它是滚上去之后唯一回到实时流式的位置

修法：
1. `reconcileGenerationProcess` 在重排前 `captureSelectionInside`，重排后 `restoreSelectionInside`（`setBaseAndExtent` 还原方向）→ 重排不再吞掉用户的选中
2. 详情节点的 `hidden` 写入同样尊重"用户正在其中选中"
3. `#editor-generation-latest` 恢复可见（面板指示器与批注 composer 仍按 WIP 隐藏）

结果：`generation-process-dom` 3/3，`native-web` **135/135（零红）**。
