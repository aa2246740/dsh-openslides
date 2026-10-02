# Kimi Slides 复刻版完整产品需求文档（PRD）

**文档版本**：3.0（逐帧证据版）  
**发布日期**：2026-08-04  
**适用对象**：产品、设计、前端、后端、Agent/模型、PPTX 渲染、测试团队  
**原始证据**：`source-video/Kimi_Slides_Tutorial_1.mp4`，1280×720，123.584 秒，29.97 fps，共 3,703 帧  
**配套交付**：`prototype/` 高保真交互原型；`FRAME_BY_FRAME_ANALYSIS.md`；`analysis/source-truth/` 34 个关键状态；`transcript/` 字幕与口播稿

---

## 0. 文档原则与证据等级

本 PRD 的目标是复刻视频中真实出现的 Kimi Slides 产品体验，而不是重新想象一个“类似的 AI PPT 工具”。所有要求采用三档证据标签：

- **[V] 原片可证实**：界面、文本、控件或交互结果在视频中直接可见。
- **[I] 合理推断**：原片显示了结果，但未公开内部实现；本文给出最小可行实现解释。
- **[R] 复刻建议**：为做成可用产品而补足的工程、异常、可访问性或合规要求，不宣称原版已经实现。

若本 PRD 与原片视觉冲突，以 `analysis/source-truth/` 对应帧为视觉真相；若与原型行为冲突，以本 PRD 的验收标准为最终产品范围。

---

## 1. 产品定义

### 1.1 一句话

Kimi Slides 是一个把“输入需求与资料 → Agent 研究和规划 → 自动产出具有统一设计语言的演示文稿 → 对话式精修 → 原生对象编辑 → 版本追踪 → 可编辑 PPTX 导出”串成闭环的 AI 幻灯片工作台。

### 1.2 核心价值

1. **结构与研究同时完成**：[V] Agent 会读取需求文档、技能说明和参考资料，并展示 Think / Read / Write Todo / Execute Terminal / Edit 等工具步骤。
2. **视觉不是一次性图片**：[V] 图表数据、SmartArt 节点与连接线、文本和形状都能进入编辑态。
3. **自然语言与直接编辑并存**：[V] 用户可在左侧对话区要求改稿，也可在右侧画布直接编辑元素。
4. **结果可追溯**：[V] 存在 V1/V2/V3 版本列表、历史预览和恢复。
5. **交付可继续生产**：[V] 支持导出 PowerPoint，并在 PowerPoint 中验证文字、形状等对象可编辑。

### 1.3 非目标

- 不做视频分镜播放器或宣传页。
- 不把整页幻灯片仅作为一张不可编辑位图导出。
- 不要求首版覆盖 PowerPoint 全部动画、宏、OLE 或第三方字体特性。
- 不在未验证时宣称所有输入格式都能 100% 无损解析。

### 1.4 成功指标

| 层级 | 指标 | 首版目标 |
|---|---|---|
| 激活 | 创建页到开始生成转化率 | ≥ 60% |
| 交付 | 生成任务成功率 | ≥ 95%（排除用户文件损坏） |
| 时效 | 首个可预览结果 P50 / P95 | ≤ 90 秒 / ≤ 240 秒 |
| 可编辑性 | 导出后原生对象覆盖率 | 文本/形状/表格 ≥ 98%，图表 ≥ 95% |
| 一致性 | 视觉 QA 无 P0/P1 | 100% |
| 精修 | 至少一次对话或直接编辑的会话占比 | ≥ 35% |
| 可靠性 | 版本恢复成功率 | 100% |

---

## 2. 目标用户与任务

### 2.1 核心用户

- **咨询/研究人员**：把主题、资料和方法论转换为有逻辑、可引用、可修改的咨询型演示。
- **企业职能与管理者**：基于工作报告、财务资料或品牌模板快速产出内部汇报。
- **品牌与市场人员**：上传品牌指南和既有 PPTX，让生成结果遵循既定色彩、字体和版式。
- **重度 PPT 用户**：要求导出后仍能在 PowerPoint 里改字、改数据、移动元素，而不是得到图片。

### 2.2 关键 Jobs To Be Done

1. 当我只有主题和要求时，帮我完成研究、结构化故事线和视觉呈现。
2. 当我已有 PDF/Word/Excel/PPTX/图片等资料时，读取并整合，不让我手工复制。
3. 当结果局部不满意时，让我用一句话或直接操作改动指定页面/元素。
4. 当我要交付团队时，导出一个真正可继续编辑的 PPTX，并保留版本和来源信息。
5. 当我只有一张海报/信息图图片时，将其重建为可编辑元素，而非简单贴图。

---

## 3. 信息架构与全局状态机

```text
Create Hub
  ├─ Prompt / Template / Category / Model / Project
  ├─ Attach Reference Modal
  │    ├─ Uploading
  │    ├─ Parsing
  │    └─ Parsed / Error / Remove
  └─ Generate
       ↓
Agent Run
  ├─ Planning
  ├─ Reading / Researching
  ├─ Building / Editing
  ├─ Rendering / Validating
  ├─ Failed / Retry
  └─ Done → Result Card
       ↓
Kimi Work Workspace
  ├─ Left: Agent conversation + refinement composer
  └─ Right: Slide editor
       ├─ Thumbnails / canvas / bottom toolbar
       ├─ Direct element editing
       ├─ Chart data editor / SmartArt editor
       ├─ Comments
       ├─ Version history / restore
       ├─ Play / Share
       └─ Export → PPTX / PDF / PNG
```

全局任务状态：`draft → queued → planning → researching → composing → rendering → validating → ready`；异常分支为 `needs_input | failed | cancelled`。任何自动修改在写入文档模型前创建事务，成功后生成新版本，失败则回滚至上一个稳定快照。[R]

---

## 4. 端到端主流程

### 4.1 纯文本创建研究型 Deck

1. [V] 创建页默认选中 `Freestyle`，输入多行需求。
2. [V] 可选择 `Slides`、`Adaptive`、`K3 High` 和 Project。
3. [V] 点击黑色圆形上箭头开始生成。
4. [V] Agent 依次显示 Think、Read、Write Todo、Execute Terminal、Edit 等步骤。
5. [V] 完成后显示带缩略图的结果卡和 `Edit`。
6. [V] 进入编辑器，检查标题页、数据页、图表、时间线、SmartArt。
7. [V] 用户可在画布直接编辑，或在对话中继续改稿。
8. [V] 导出 PowerPoint，验证对象可编辑。

### 4.2 模板与品牌参考创建

1. [V] 在创建页浏览 `All / Consulting / Finance / Work Report / Promotion / Academic` 分类。
2. [V] 选择模板或上传 `KIMI Design.pptx`、`KIMI Brand Guidelines.pdf`。
3. [V] 上传卡显示文件名、格式、大小、解析进度与完成状态。
4. [V] Agent 读取参考资料，提取配色、排版、组件语言和封面风格。
5. [V] 结果在分栏 Kimi Work 中打开，右侧为编辑器，左侧保留工具日志和对话。
6. [V] 用户要求补全品牌点阵 K，Agent 生成 V3 并在画布展示。

### 4.3 局部自然语言精修

1. [V] 左侧输入修改指令，例如替换封面图形或调整布局。
2. [I] 系统解析作用域（当前页/选中元素/整套）和约束（保持品牌、保持数据、保持可编辑）。
3. [V] 显示 Think/工具步骤和结果说明。
4. [V] 右侧画布更新，并保存新版本。
5. [R] 若指令可能批量影响多页，提交前展示影响范围；若不可逆，要求确认。

### 4.4 评论驱动修改

1. [V] 点击底部 `Comment`。
2. [V] 在画布指定位置落下评论 pin，输入内容并提交。
3. [V] Agent/用户处理评论后，评论显示解决状态，画布同步变更。
4. [R] 评论保留作者、坐标、关联元素、创建/解决时间和对应版本。

### 4.5 历史版本恢复

1. [V] 点击顶部 `V3` 打开版本菜单。
2. [V] 查看 `V3 Latest / V2 / V1` 及编辑时间。
3. [V] 选择历史版本进入只读预览。
4. [V] 通过 Restore 恢复，或 Back to latest 返回最新版本。
5. [R] 恢复不覆盖历史链，而是基于历史快照创建新的最新版本。

### 4.6 图片重建为可编辑幻灯片

1. [V] 上传一张 `SMART CONNECTIONS` 纵向信息图。
2. [V] Agent 识别文本、图形、连接线、卡片和层级。
3. [V] 输出重建结果并在编辑器打开。
4. [V] 进入元素编辑态，单独选中/移动/修改元素。
5. [R] 对低置信度 OCR 或复杂图形标注复核提示，不静默臆测。

---

## 5. 页面与组件详细规格

### 5.1 Create Hub

**参考状态**：`01_prompt_blank_split.jpg`、`02_prompt_filled_split.jpg`、`15_create_hub_consulting.jpg`、`16_create_hub_finance.jpg`

#### 布局

- [V] 白色主表面，内容在约 760–820 px 宽的居中列中。
- [V] 顶部为黑色 KIMI wordmark；其上方有小型升级入口。
- [V] Prompt 卡是白色圆角矩形，约 16–20 px 圆角、1 px 浅灰边、柔和下投影。
- [V] 模板区为水平分类 Tab + 三列封面网格；选中模板蓝色描边并覆盖 `Selected`。

#### Prompt 卡

- 输入区支持多行、滚动和长文本；空态文案：`Turn your ideas into stunning slides in minutes`。
- 左侧显示当前风格缩略图/标签 `Freestyle`。
- 底部工具依次为附件、`Slides`、`Adaptive`；右侧为 `K3 High` 和圆形提交按钮。
- 提交按钮禁用：无有效文本且无附件；启用：至少一个输入源有效。[R]
- `Enter` 换行，`Cmd/Ctrl + Enter` 提交。[R]

#### 模板与分类

- Tab：All、Consulting、Finance、Work Report、Promotion、Academic。[V]
- 切换 Tab 只刷新网格，不清空 prompt/附件/模型选择。[R]
- 模板卡保持 16:9 左右的封面比例，使用真实预览图，不用渐变占位符。[V]
- 键盘焦点有 2 px 高对比 focus ring。[R]

### 5.2 Attach Reference Modal

**参考状态**：`17_upload_dropzone.jpg`、`18_reference_uploading.jpg`、`19_reference_parsed.jpg`

- [V] 居中模态框，背景遮罩；顶部关闭按钮。
- [V] 大型拖拽区，支持 PDF、DOC/DOCX、XLSX、PPT/PPTX、图片、CSV、纯文本。
- [V] 文件行包含图标、名称、类型/大小、状态、移除操作。
- 状态：`queued / uploading(percent) / parsing / parsed / unsupported / failed`。[R]
- 重复文件通过 hash 去重并提示；单文件大小、总大小和页数上限可配置。[R]
- 关闭模态框时，已完成上传保留；未完成上传二次确认。[R]

### 5.3 Agent Run

**参考状态**：`03_agent_thinking.jpg`、`04_agent_tools.jpg`、`05_agent_research_tools.jpg`、`29_image_rebuild_agent.jpg`

- 顶栏显示任务名、返回和更多操作。[V]
- 用户请求显示为浅灰圆角气泡；附件显示为紧凑 chip。[V]
- Agent 左侧显示 Kimi avatar；右侧工具卡按执行顺序逐行出现。[V]
- 工具行结构：图标、动作名、对象/文件名、展开箭头、运行指示。[V]
- 可见动作词：Think、Read、Write Todo、Execute Terminal、Edit slide。[V]
- [R] 每行可展开查看脱敏日志、输入输出摘要、耗时和失败原因；不展示密钥、系统提示词和隐私数据。
- 完成态显示总结、结果卡、Edit CTA，以及复制/反馈图标。[V]
- 失败态保持已完成步骤，定位失败工具，并提供 Retry / Edit request / Cancel。[R]

### 5.4 Kimi Work 分栏工作台

**参考状态**：`20_split_workspace_generating.jpg`、`21_split_workspace_result.jpg`、`23_chat_refinement_result.jpg`

- [V] 窗口式顶部 chrome：左上三色圆点、应用图标、任务标题，下方主体左右分栏。
- [V] 左侧约 40–46%，包含 Agent 日志、总结、结果卡和底部固定输入框。
- [V] 右侧约 54–60%，包含编辑器顶栏、缩略图开关/Undo/Redo、画布、底部浮动工具条。
- [R] 分栏可拖拽，最小宽度左 320 px、右 560 px；窄屏改为可切换的 Chat/Editor 两页。
- 左侧 composer：多行文本、附件按钮、模型选择、发送按钮和 AI 提示。[V]

### 5.5 Slide Editor

**参考状态**：`06_editor_story_overview.jpg` 至 `14_smartart_nodes_edit.jpg`、`31_rebuilt_editor.jpg`、`32_rebuilt_element_edit.jpg`

#### 顶栏

- 文档标题与展开/全屏图标。[V]
- 版本按钮（Vn）、Play、Share、Export、Messages、Close。[V]
- 第二行：缩略图开关、Undo、Redo；右侧缩放 - / 百分比 / +。[V]

#### 缩略图轨

- [V] 左侧垂直缩略图、页码、当前页选中态。
- [R] 支持滚动、拖拽排序、复制、删除、新增；拖拽时显示插入线。
- 生成仍在进行时，未完成页显示骨架/进度而不是空白。[R]

#### 画布

- [V] 灰白工作区居中放置 16:9 幻灯片，带轻阴影。
- [V] 切页时画布内容变更，顶栏和底栏保持稳定。
- [V] 元素选中显示边界框、锚点和上下文工具条。
- [R] 支持多选、对齐、分布、锁定、组合、图层、复制粘贴和方向键微移。
- [R] 缩放范围 25%–200%，默认 fit-to-viewport；缩放不改变文档坐标。

#### 底部浮动工具条

- [V] 居中悬浮白色胶囊，柔和阴影。
- [V] 入口包括 Edit、Comment、Text、Link/Shape、Image、Table、AI/Sparkles、More（不同状态图标组合略有变化）。
- [R] 工具条在播放/模态/历史只读态隐藏或禁用。

### 5.6 图表数据编辑

**参考状态**：`12_chart_selected_toolbar.jpg`、`13_chart_data_editor.jpg`

- 点击图表后显示上下文工具条：图表类型、数据、样式、颜色、更多。[V]
- 数据入口打开浮层表格，单元格可编辑，画布实时更新。[V]
- [R] 图表模型保留 series/category/value、格式、轴、图例、数据标签与来源。
- [R] 粘贴二维数据自动扩展范围；无效数字提示，不破坏上次有效值。
- 导出 PPTX 时优先生成 PowerPoint 原生 chart，而非栅格化。[R]

### 5.7 SmartArt 编辑

**参考状态**：`11_smartart_slide.jpg`、`14_smartart_nodes_edit.jpg`

- SmartArt 为结构化节点和连接关系。[V]
- 点击节点可编辑文本、样式和位置；连接线可选择和调整。[V]
- [R] 节点变更触发局部自动布局，同时允许用户固定位置。
- [R] 导出时优先映射为原生形状 + 连接线 + 组；若目标格式不支持，则保留分组对象而不是整页位图。

### 5.8 Comment

**参考状态**：`24_comment_pin_entry.jpg`、`25_comment_resolved.jpg`

- 评论模式下光标/提示改变，点击画布生成编号 pin。[V]
- 评论编辑框紧邻 pin，含提交和取消。[V]
- 评论可解决，解决后保留历史并降低视觉权重。[V]
- [R] pin 坐标使用 slide-local 坐标，随元素移动时若绑定元素则跟随。

### 5.9 Version History

**参考状态**：`26_version_dropdown.jpg`、`27_version_rollback.jpg`

- 顶部版本按钮展开浮层，列出 V3/V2/V1、Latest 标记、编辑者和相对时间。[V]
- 点击旧版本进入只读预览，并显示 Restore / Back to latest。[V]
- [R] 版本记录：触发者（用户/Agent）、请求摘要、改动 slide/element IDs、父版本、创建时间、渲染缩略图。
- [R] 自动保存采用防抖；对话式改稿和批量操作立即建立显式版本。

### 5.10 Play / Share / Export

- Play：进入无编辑 chrome 的全屏/舞台播放，支持左右键、Esc 退出。[V/R]
- Share：展示访问方式/链接/权限的模态入口；原片未展示具体权限细节。[V/I]
- Export：至少支持 PowerPoint；复刻原型同时提供 PDF、PNG。[V/R]
- PPTX 输出必须保留文本、形状、表格、图表、连接线的可编辑性；字体缺失时给出替换报告。[V/R]
- 导出期间显示进度，可取消；完成后给出文件名、页数、兼容性提示和下载入口。[R]

---

## 6. 视觉设计系统

### 6.1 设计基调

原片产品界面是高密度但克制的黑白工作台：白色表面、浅灰工作区、细边框、大留白、低饱和状态色、轻阴影、线性图标。品牌/幻灯片内容可使用强色，但产品 chrome 不抢内容。[V]

### 6.2 Design Tokens

| Token | 建议值 | 用途 |
|---|---:|---|
| `--bg` | `#F6F6F6` | 编辑器工作区 |
| `--surface` | `#FFFFFF` | 卡片/顶栏/模态 |
| `--ink` | `#111111` | 主文字/主按钮 |
| `--muted` | `#777777` | 次文字 |
| `--hairline` | `#E7E7E7` | 边框/分隔线 |
| `--hover` | `#F3F3F3` | hover 表面 |
| `--selected` | `#62A8E8` | 模板/缩略图选中描边 |
| `--success-bg` | `#EEF8F1` | 完成提示 |
| `--success` | `#2F7A45` | 成功文字/图标 |
| `--danger` | `#C64545` | 错误/删除 |
| `--radius-sm/md/lg` | `8 / 12 / 18 px` | 控件/卡片/大面板 |
| `--shadow-float` | `0 8px 30px rgba(0,0,0,.12)` | 浮动工具条/菜单 |
| `--shadow-card` | `0 10px 28px rgba(0,0,0,.08)` | Prompt/模态 |

### 6.3 字体

- [V/I] 拉丁 UI 接近 Inter / Helvetica Neue / Arial；中文使用系统无衬线。
- 正文 13–15 px，caption 10–12 px，按钮 12–14 px，标题 16–20 px。
- 字重以 400/500/600 为主；避免过多 700 造成视觉发黑。
- 数字和版本号使用 tabular numerals。[R]

### 6.4 栅格与间距

- 基础间距单位 4 px；常用 8/12/16/20/24/32。
- 顶栏高度约 44–48 px，二级工具栏约 42–44 px。
- 图标常用 14/16/18 px，点击热区最小 32×32 px；移动/触摸最小 44×44 px。[R]
- 内容边框统一 1 px；焦点态 2 px。

### 6.5 图标与资产

- 使用一致的 1.5–2 px stroke 线性图标库；禁止 emoji、文本符号、CSS 手绘或占位框代替真实可见图标。
- KIMI wordmark、模板封面、示例幻灯片使用原片提取或正式授权资产；保持正确裁切，不拉伸。
- 幻灯片内容图像在屏幕和导出中至少以目标显示尺寸 2× 准备，避免放大模糊。[R]

### 6.6 响应式

- ≥ 1100 px：左右分栏 + 完整编辑器。
- 768–1099 px：分栏比例压缩，缩略图默认收起。
- < 768 px：Chat/Editor 分段切换；创建页模板改为单列/横向滚动；高级直接编辑只读或引导到桌面。[R]

---

## 7. 动效与微交互规格

### 7.1 运动原则

动效只表达状态变化、层级和因果，不做装饰性长动画。主体以淡入、轻位移、缩放和列表 stagger 为主；曲线偏自然减速。[V]

### 7.2 动效清单

| ID | 场景 | 属性 | 时长 | 缓动 | 触发/结束 |
|---|---|---|---:|---|---|
| M01 | 页面/主视图进入 | opacity 0→1, y 8→0 | 260 ms | cubic-bezier(.2,.8,.2,1) | route/state 切换后 |
| M02 | Prompt 卡聚焦 | border/shadow | 160 ms | ease-out | focus in/out |
| M03 | 按钮按压 | scale 1→.97→1 | 120 ms | ease-out | pointer down/up |
| M04 | 模态打开 | backdrop fade；panel opacity+scale .98→1+y | 180/220 ms | cubic-bezier(.2,.8,.2,1) | 打开完成聚焦首控件 |
| M05 | 菜单打开 | opacity+scale .97→1+y -4→0 | 140 ms | ease-out | 锚点按钮点击 |
| M06 | Tab/模板选中 | underline/outline/color | 160 ms | ease-out | selection commit |
| M07 | 文件上传 | progress width | 连续 | linear | 0→100% |
| M08 | Agent 工具逐行出现 | opacity+y 6→0 | 220 ms/行 | ease-out | 行间 stagger 70 ms |
| M09 | Agent 运行点 | opacity/scale pulse | 900 ms loop | ease-in-out | 仅 running |
| M10 | 完成卡进入 | opacity+y 10→0 | 260 ms | ease-out | validation success |
| M11 | 左右分栏生成结果 | divider/opacity | 320 ms | ease-in-out | result ready |
| M12 | 幻灯片切换 | old opacity 1→0；new 0→1 | 180 ms | ease-in-out | slide ID change |
| M13 | 选框出现 | opacity 0→1 | 100 ms | linear | element select |
| M14 | 工具条上下文切换 | opacity+y 4 | 140 ms | ease-out | selection type change |
| M15 | 评论 pin 落点 | scale .7→1.08→1 | 240 ms | cubic-bezier(.2,.9,.2,1) | canvas click |
| M16 | 版本预览切换 | canvas crossfade | 180 ms | ease-in-out | version loaded |
| M17 | Restore 成功 | toast y 8→0, fade | 220 ms | ease-out | 2.4 s 后退出 |
| M18 | 导出中 | spinner rotate | 800 ms loop | linear | export pending |
| M19 | 播放模式 | chrome fade；slide scale fit | 260 ms | ease-in-out | enter/exit play |
| M20 | Toast | opacity+y 8 | 200/180 ms | ease-out/in | 自动或手动关闭 |

### 7.3 Reduce Motion

检测 `prefers-reduced-motion: reduce` 后：取消循环 pulse/旋转（spinner 可保留静态进度文本），所有位移/缩放改为 ≤100 ms opacity，幻灯片切换直接替换。[R]

---

## 8. 可编辑幻灯片文档模型

### 8.1 原则

内部必须存在结构化 Slide IR（下称 PPTD），画布、Agent、版本和导出都操作同一模型。预览截图只是缓存，不是事实源。[I/R]

```ts
type Deck = {
  id: string;
  title: string;
  aspectRatio: "16:9" | "4:3" | "portrait";
  theme: ThemeTokens;
  slides: Slide[];
  references: Reference[];
  citations: Citation[];
  versionId: string;
};

type Slide = {
  id: string;
  order: number;
  size: { width: number; height: number };
  background: Fill;
  elements: SlideElement[];
  notes?: string;
};

type SlideElement =
  | TextElement | ShapeElement | ImageElement | TableElement
  | ChartElement | GroupElement | ConnectorElement | SmartArtElement;

type BaseElement = {
  id: string; x: number; y: number; width: number; height: number;
  rotation: number; opacity: number; zIndex: number;
  locked?: boolean; name?: string; sourceRef?: string;
};
```

### 8.2 对象级要求

- 文本：保留字体、字号、字重、颜色、行距、字间距、段落、项目符号、自动适应。
- 形状：几何、填充、描边、圆角、阴影、渐变、透明度。
- 图片：源文件、裁切框、mask、滤镜、替代文本。
- 表格：行列、合并、宽高、边框、填充、文本样式。
- 图表：数据表、类型、series、轴、图例、标签、主题映射。
- SmartArt：节点、边、布局算法、用户固定位置和样式覆盖。
- 连接线：端点绑定 element/anchor，移动节点后保持连接。
- 组：局部坐标系、嵌套和锁定。

### 8.3 命令与撤销

所有用户/Agent 编辑转成可重放命令：`addElement / updateElement / deleteElement / reorderSlide / updateTheme / replaceAsset / updateChartData / updateSmartArt`。命令包含 before/after、actor、timestamp、requestId，支持 Undo/Redo、版本 diff 和审计。[R]

---

## 9. Agent Harness 与生成管线

### 9.1 逻辑架构

```text
Prompt + Attachments + Template
        ↓
Input Router / File Parsers
        ↓
Planner → Todo Graph → Research/Read tools
        ↓
Story Architect → Slide Outline + Evidence Map
        ↓
Design System Extractor / Template Mapper
        ↓
Slide Composer → PPTD commands
        ↓
Renderer → slide images / thumbnails
        ↓
Vision & Structural Validator ↔ Repair Loop
        ↓
Version Snapshot → Editor → Exporter
```

### 9.2 工具契约

| 工具 | 输入 | 输出 | 失败处理 |
|---|---|---|---|
| `think/plan` | brief、constraints | todo graph、assumptions | 暴露需要用户补充的问题 |
| `read_file` | file ref、range | 结构化文本/对象 | 格式不支持则降级 OCR/提示 |
| `research` | query、source policy | facts、citations、confidence | 标记缺失或冲突来源 |
| `extract_theme` | PPTX/PDF/images | tokens、layouts、assets | 输出覆盖率和不可识别项 |
| `compose_deck` | outline、evidence、theme | Deck PPTD | schema 校验失败自动修复 |
| `edit_slide` | target IDs、instruction | command batch | 冲突则回滚事务 |
| `render` | deck/version | slides、thumbs | 字体/资产缺失上报 |
| `vision_qa` | reference + render | findings、severity | P0/P1 自动进入 repair loop |
| `validate_editability` | PPTD/PPTX | object coverage report | 不达标阻断“完成” |
| `version_snapshot` | command batch | version metadata | 写入失败不更新 latest |
| `export_pptx` | version、options | file + compatibility report | 可重试、保留任务 |

### 9.3 生成策略

1. 先生成 story map：受众、目标、核心结论、证据、页数、章节。
2. 每页定义“结论句 + 证据 + 视觉语法 + 可编辑对象类型”。
3. 优先使用图表/表格/时间线/矩阵的结构化表达，避免把所有内容变成图片。
4. 应用主题后进行跨页一致性检查：标题位置、网格、字号层级、颜色、页码、图表语义色。
5. 渲染后运行视觉 QA 和结构 QA；最多 N 次修复，仍失败则以“需复核”交付，不伪装成功。

### 9.4 对话式编辑作用域

解析顺序：显式 slide/element 引用 → 当前选中元素 → 当前页 → 用户语言中的范围 → 全局。执行前生成 change plan；执行后总结改动、版本号和受影响页。[R]

---

## 10. 文件解析、引用与事实性

- 支持的 UI 列表以原片为准；实际解析能力按 MIME + 文件签名校验，不只依赖扩展名。[R]
- PPTX 解析：母版、主题、布局、文本、图片、形状、表格、图表关系、备注。
- PDF/图片：OCR + 布局识别 + 图形分割；输出置信度和无法结构化区域。
- Word：标题层级、段落、表格、图片、脚注/引用。
- Excel/CSV：sheet、range、表头、类型推断、图表候选。
- 研究事实保存 citation：标题、URL/文件位置、访问时间、摘录 hash、支持的 claim IDs。[R]
- 幻灯片可选择显示脚注/来源；导出时写入 notes 或附录来源页。[R]

---

## 11. PPTX 导出保真契约

### 11.1 必须原生可编辑

| 对象 | 导出映射 | 验收 |
|---|---|---|
| 文本 | PowerPoint text box | 双击可改字；段落/项目符号保留 |
| 形状 | AutoShape/freeform | 填充/描边/透明度可改 |
| 表格 | PowerPoint table | 单元格可编辑 |
| 图表 | 原生 chart + embedded workbook | Edit Data 可打开并改值 |
| SmartArt | 优先 shapes + connectors + group | 节点可拆分编辑，连接关系合理 |
| 图片 | image + crop | 可替换、裁切信息保留 |
| 连接线 | connector | 端点在移动节点后尽量保持 |

### 11.2 允许降级

复杂模糊、特殊 blend、无法映射的滤镜可以局部栅格化，但不得将整页统一栅格化。导出报告列出降级对象、所在页、原因和替代方案。[R]

### 11.3 验收

- 用 PowerPoint 打开无修复提示。
- 页数、尺寸、主题颜色和字体映射正确。
- 选取标题、正文、图表、SmartArt、图片分别进行编辑并保存。
- 与编辑器渲染做像素/结构对比；重大位移、裁切、溢出为失败。

---

## 12. 状态、空态和错误态

| 场景 | 必须表现 |
|---|---|
| 无 prompt/附件 | Generate 禁用，保留模板浏览 |
| 上传中 | 每文件进度，可取消 |
| 解析失败 | 文件级错误，不影响其他文件；可重试/移除 |
| Agent 长任务 | 当前步骤、已完成步骤、耗时、取消 |
| 需要信息 | 暂停并提出具体问题，不继续编造 |
| 部分生成失败 | 已完成页面可预览，失败页可重试 |
| 画布无选中 | 显示通用底栏；上下文工具隐藏 |
| 历史版本 | 明确只读，编辑操作禁用 |
| 导出失败 | 保留版本，提供原因和重试 |
| 离线/断连 | 本地操作队列化，恢复后同步或提示冲突 |

---

## 13. 可访问性

- 满足 WCAG 2.2 AA 的颜色对比、键盘路径、可见焦点和语义标签。[R]
- 所有 icon-only button 有可读名称；模态打开时 focus trap，Esc 关闭并返回触发点。
- 工具进度使用 `aria-live=polite`，避免每个动画帧播报。
- 幻灯片元素支持键盘选择、方向键移动、Shift 加速、Undo/Redo。
- 模板和幻灯片缩略图提供 alt/标题；图片元素支持替代文本编辑。
- 动效遵守 reduce-motion，颜色不是唯一状态信号。

---

## 14. 性能与可靠性

- 创建页 LCP ≤ 2.5 s（P75），交互响应 INP ≤ 200 ms。[R]
- 编辑器输入与拖拽保持 60 fps；复杂页最低 30 fps，主线程单任务 ≤ 50 ms。
- 缩略图和非当前页按需渲染；图片使用多级缓存和正确分辨率。
- 自动保存 P50 ≤ 1 s，版本快照 P95 ≤ 3 s。
- Agent 任务具备幂等 requestId、断点续跑、工具超时、重试和取消。
- 文档修改使用事务/乐观并发；冲突时展示 diff，不静默覆盖。

---

## 15. 安全、隐私与合规

- 上传文件静态扫描、类型校验、隔离解析；禁止执行文档宏和嵌入脚本。[R]
- 文件、生成内容、日志和导出按 workspace/tenant 隔离；最小权限访问。
- 工具日志脱敏，不展示 token、内部 prompt、签名 URL 和个人敏感信息。
- 提供数据保留期、删除、导出和训练使用选择；企业租户默认不用于训练。[R]
- 外部研究来源记录访问时间和许可；图片/模板资产保留版权与来源元数据。
- Share 权限最少包含 private / view / edit，并可撤销。[R]

---

## 16. 埋点与可观测性

事件命名采用 `object_action`：

- `create_viewed`, `prompt_submitted`, `template_selected`, `reference_uploaded`, `reference_parsed`
- `agent_started`, `agent_step_started`, `agent_step_completed`, `agent_failed`, `agent_completed`
- `deck_opened`, `slide_selected`, `element_selected`, `element_updated`, `chart_data_updated`
- `comment_created`, `comment_resolved`, `version_opened`, `version_restored`
- `refinement_submitted`, `refinement_completed`, `play_started`, `share_opened`
- `export_started`, `export_completed`, `export_failed`, `pptx_editability_reported`

所有事件带 `session_id/deck_id/version_id/slide_id`（适用时）、actor、duration、error_code；不记录完整 prompt/文件正文，除非用户明确同意。[R]

---

## 17. 权限与协作

首版角色：Owner、Editor、Viewer。[R]

- Owner：全部操作、分享、删除和恢复。
- Editor：编辑、评论、生成新版本、导出；不能转移所有权。
- Viewer：浏览、播放、评论（可配置）、下载（可配置）。
- 同步编辑可在 P1 实现；MVP 至少检测文档版本冲突，避免最后写入者静默覆盖。

---

## 18. 范围与路线图

### MVP（必须）

- Create Hub、模板分类、prompt、参考附件。
- Agent 工具时间线与结果卡。
- 分栏 Kimi Work 编辑器。
- 多页缩略图、切页、基础元素选择/编辑、图表数据表、SmartArt 节点。
- 自然语言局部改稿、评论 pin、V1/V2/V3、Restore。
- Play、Share 入口、PPTX/PDF/PNG 导出；PPTX 核心对象可编辑。
- 图片重建演示链路。

### P1

- 实时协作、权限与评论 @mention。
- 完整母版/主题编辑、更多图表与 SmartArt 布局。
- 引用管理和自动来源页。
- 版本 diff、分支和命名版本。
- 企业模板库、项目空间、批量生成。

### P2

- PowerPoint 动画映射、演讲者视图、自动讲稿。
- 插件/数据连接器、实时数据刷新。
- 多语言版式、无障碍自动检查、品牌合规评分。
- 代理式自主研究的审批节点与成本预算。

---

## 19. 详细验收标准

| ID | Given / When / Then |
|---|---|
| AC-01 | Given 创建页；When 输入 prompt；Then 提交按钮启用，内容不被模板切换清空。 |
| AC-02 | Given 附件模态；When 选择支持文件；Then 显示上传→解析→完成，文件 chip 回到 prompt 卡。 |
| AC-03 | Given 提交；When Agent 运行；Then 工具行按顺序出现，当前步骤有运行态，完成步骤保持可见。 |
| AC-04 | Given 生成成功；When 点击结果卡 Edit；Then 打开同一 deck 的分栏编辑器。 |
| AC-05 | Given 多页 deck；When 点击缩略图；Then 画布在 200 ms 左右 crossfade 到目标页，选中态同步。 |
| AC-06 | Given 图表；When 打开 Data 并改值；Then 图表实时更新，Undo 可恢复。 |
| AC-07 | Given SmartArt；When 改节点或移动节点；Then 文本/布局更新，连接线保持关系。 |
| AC-08 | Given 当前页；When 提交自然语言精修；Then 显示执行步骤，更新目标范围并创建新版本。 |
| AC-09 | Given Comment 模式；When 点击画布并提交；Then pin 和评论出现，可解决且保留历史。 |
| AC-10 | Given V3；When 选择 V2；Then 进入明显只读预览，可 Restore 或返回 latest。 |
| AC-11 | Given 图片重建；When 完成；Then 至少文字、主要形状和连接关系可单独选中。 |
| AC-12 | Given 导出 PPTX；When PowerPoint 打开；Then 文本/形状/表格可编辑，图表 Edit Data 可用。 |
| AC-13 | Given 失败工具；When Retry；Then 从安全检查点继续，不重复创建脏版本。 |
| AC-14 | Given reduce-motion；When 使用主流程；Then 无长位移/循环 pulse，功能不受影响。 |
| AC-15 | Given 仅键盘；When 从创建到导出；Then 所有核心操作可完成且 focus 可见。 |

---

## 20. QA 测试矩阵

### 功能

- 纯 prompt、仅附件、prompt+多附件、超长 prompt、不同模板/分类/模型。
- 上传取消、重复文件、不支持格式、加密 PDF、损坏 PPTX、超大 Excel。
- Agent 失败/重试/取消/刷新恢复；部分 slide 完成。
- 图表/SmartArt/评论/版本/导出完整回归。

### 视觉与动效

- 1280×720 与 1366×768 主视口；2× DPR；浏览器缩放 80/100/125%。
- 每个关键状态与 `analysis/source-truth/` 做同状态并排对比。
- 字体、间距、颜色、图像清晰度、文案五个面逐项检查。
- hover/focus/active/disabled/loading/error/success/reduced-motion。

### 导出

- PowerPoint Windows/macOS、Keynote/Google Slides 兼容性抽检。
- 字体存在/缺失、不同语言、复杂表格、大图、透明度、连接线。
- 结构对象数、可编辑覆盖率和渲染像素差。

---

## 21. 逐帧结论摘要

原片 123.584 秒共 3,703 帧；本包建立了每秒时间轴、场景切换帧和 34 个关键状态。主叙事分为：

1. 00–15 s：从 prompt 到 Agent 研究与生成。
2. 15–39 s：展示研究型 deck、图表、时间线、SmartArt 及其可编辑性。
3. 39–51 s：Create Hub 模板与分类。
4. 51–66 s：上传 PPTX/PDF 品牌参考，解析并生成。
5. 66–80 s：Kimi Work 分栏与自然语言局部改稿。
6. 80–92 s：评论、版本历史与回滚。
7. 92–112 s：图片/信息图重建为可编辑 slide。
8. 112–123.584 s：导出 PowerPoint 并验证可编辑对象。

完整时间码、帧文件、视觉/动效和需求映射见 `FRAME_BY_FRAME_ANALYSIS.md`。

---

## 22. 原型覆盖说明

配套 `prototype/` 已覆盖下列可点击状态：Create Hub、分类/模板、参考文件模态、KIMI 品牌参考、SMART CONNECTIONS 重建、Agent 渐进工具日志、结果卡、分栏工作台、多页/编辑模式、评论、版本菜单和历史返回、自然语言改稿、Play、Share、Export 以及 toast。

原型中的 PPTX/PDF/PNG 导出为交互模拟；生产实现必须满足第 11 章的可编辑性契约。原型使用原片提取的关键视觉资产，并通过 `prefers-reduced-motion` 降级动效。

---

## 23. 未决问题

1. 原版 `Adaptive` 的精确定义和可配置参数未在视频展开。[I]
2. `K3 High` 与 `K3 Max` 的能力、成本和限额未在视频说明。[I]
3. Share 权限、协同冲突策略、评论通知未展示。[I]
4. Export 具体格式列表只直接证实 PowerPoint；PDF/PNG 为复刻建议。[V/R]
5. 图表和 SmartArt 到 PPTX 的具体映射库、保真阈值未公开。[I]
6. 外部研究的来源政策、引用 UI 和企业数据保留策略未展示。[I]

这些问题不阻断交互复刻，但在生产立项前必须由产品/工程/法务共同确认。
