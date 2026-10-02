# Kimi Slides 原片逐帧分析与需求映射

## 分析方法

- 原视频：1280×720，123.584 秒，29.97 fps，共 3,703 帧。
- 证据采样：逐秒 124 帧；场景检测 72 帧；人工复核 34 个关键产品状态。
- 时间轴联系表：`analysis/contact-sheets/timeline_01.jpg` 至 `timeline_08.jpg`。
- 关键状态帧：`analysis/source-truth/01_*.jpg` 至 `34_*.jpg`。
- 置信度：高＝控件/结果直接可见；中＝结果可见但中间操作被剪辑；低＝只凭口播或局部画面推断。

## 34 个关键状态

| # | 约时间码 | 证据帧 | 可见内容与设计细节 | 动效/状态变化 | 产品要求 | 置信度 |
|---:|---:|---|---|---|---|---|
| 01 | 00:01 | `01_prompt_blank_split.jpg` | 左侧 Kimi Work，右侧创建区；白底、KIMI 标识、空 prompt 卡 | 场景淡入 | 创建页空态、输入焦点、提交禁用 | 高 |
| 02 | 00:03 | `02_prompt_filled_split.jpg` | Prompt 已填入核聚变研究需求，附件/Slides/Adaptive/K3 High 可见 | 文本完成后提交按钮启用 | 长文本、多行滚动、模型/模式保持 | 高 |
| 03 | 00:06 | `03_agent_thinking.jpg` | 用户气泡下出现 Agent avatar 与 Think | 行淡入、运行点 pulse | Agent 透明步骤、running 状态 | 高 |
| 04 | 00:09 | `04_agent_tools.jpg` | Read requirements.md、SKILL.md、Write Todo、Terminal、Edit 等工具行 | 逐行 stagger | 工具名、对象、状态、展开箭头 | 高 |
| 05 | 00:12 | `05_agent_research_tools.jpg` | 研究/读文件/执行工具链继续扩展 | 当前行变化，已完成行保留 | 长任务可观察、步骤不可闪退 | 高 |
| 06 | 00:16 | `06_editor_story_overview.jpg` | 编辑器打开，左缩略图、中画布、顶栏、底部工具条 | 结果到编辑器 crossfade | 多页 deck 与编辑 chrome | 高 |
| 07 | 00:19 | `07_editor_title_slide.jpg` | 核聚变标题页，深色咨询型视觉 | 切页淡入 | 当前页/缩略图选中同步 | 高 |
| 08 | 00:22 | `08_editor_data_slide.jpg` | 数据型页面，图表和结构化信息区 | 画布内容切换 | 数据可视化页、非位图语义 | 高 |
| 09 | 00:25 | `09_polished_charts.jpg` | 多图表组合、统一配色与栅格 | 无大幅动画，仅切页 | 图表一致性、紧凑咨询布局 | 高 |
| 10 | 00:28 | `10_timeline_slide.jpg` | 横向时间线/阶段结构 | 切页 crossfade | 时间线作为结构化元素 | 高 |
| 11 | 00:31 | `11_smartart_slide.jpg` | SmartArt/矩阵型页面 | 切页 | SmartArt 节点/连接关系 | 高 |
| 12 | 00:34 | `12_chart_selected_toolbar.jpg` | 图表被选中，出现边界框与上下文工具条 | 工具条淡入上移 | 选中态、图表属性入口 | 高 |
| 13 | 00:36 | `13_chart_data_editor.jpg` | 数据表浮层覆盖画布局部，可修改 series/value | 浮层 scale+fade | 原生数据编辑与实时更新 | 高 |
| 14 | 00:38 | `14_smartart_nodes_edit.jpg` | SmartArt 节点与连接线进入编辑态 | 选框即时出现 | 节点/连接线独立选择和调整 | 高 |
| 15 | 00:41 | `15_create_hub_consulting.jpg` | Create Hub，All/Consulting 等 Tab，三列模板网格 | 页面/网格淡入 | 模板发现与选择 | 高 |
| 16 | 00:45 | `16_create_hub_finance.jpg` | Finance 分类模板替换 | Tab underline/网格内容替换 | 分类切换不清空其他输入 | 高 |
| 17 | 00:52 | `17_upload_dropzone.jpg` | 居中上传模态，支持文件格式说明 | 遮罩 fade、panel scale+fade | 拖拽/选择文件、Esc/关闭 | 高 |
| 18 | 00:56 | `18_reference_uploading.jpg` | KIMI Design.pptx、Brand Guidelines.pdf 上传中 | 进度条连续变化 | 文件级上传进度与取消 | 高 |
| 19 | 01:00 | `19_reference_parsed.jpg` | 两份参考文件已解析并回到创建输入上下文 | 完成态勾选/状态替换 | 解析成功、保留附件 | 高 |
| 20 | 01:05 | `20_split_workspace_generating.jpg` | Kimi Work 左 Agent、右编辑器骨架/生成中 | 分栏展开、步骤持续出现 | 生成时可并行预览编辑器区域 | 高 |
| 21 | 01:09 | `21_split_workspace_result.jpg` | 品牌 deck 结果，左侧总结/结果卡，右侧封面 | 结果卡/slide fade-in | Agent 结果与文档同屏 | 高 |
| 22 | 01:13 | `22_chat_refinement_prompt.jpg` | 左侧输入局部修改指令，指定封面点阵 K | 输入/发送状态 | 自然语言局部编辑作用域 | 高 |
| 23 | 01:18 | `23_chat_refinement_result.jpg` | V3 封面完成：黑色文字区 + 蓝底完整点阵 K；左侧解释改动 | 完成提示/画布 crossfade | 新版本、改动说明、品牌一致性 | 高 |
| 24 | 01:21 | `24_comment_pin_entry.jpg` | Comment 模式在 slide 上落 pin 并输入要求 | pin scale 弹入，评论框 fade | 坐标化评论、提交/取消 | 高 |
| 25 | 01:24 | `25_comment_resolved.jpg` | 评论处理后页面更新，评论解决 | toast/状态颜色变化 | 评论解决并保留历史 | 高 |
| 26 | 01:27 | `26_version_dropdown.jpg` | V3 Latest / V2 / V1 版本下拉、编辑时间 | 锚点菜单 scale+fade | 版本列表与元数据 | 高 |
| 27 | 01:30 | `27_version_rollback.jpg` | 历史版本预览/回滚提示 | 画布 crossfade、提示进入 | Restore 与 Back to latest | 高 |
| 28 | 01:34 | `28_image_rebuild_prompt.jpg` | 上传 SMART CONNECTIONS 纵向图片并要求重建 | 文件进入输入上下文 | 图片→slide 新任务 | 高 |
| 29 | 01:39 | `29_image_rebuild_agent.jpg` | Agent 识别/编辑/验证信息图 | 工具行 stagger | OCR、布局识别、结构重建、QA | 高 |
| 30 | 01:44 | `30_image_rebuild_result.jpg` | 重建完成结果卡 | completion fade+y | 结果预览和 Edit | 高 |
| 31 | 01:48 | `31_rebuilt_editor.jpg` | 纵向 SMART CONNECTIONS 页面在编辑器打开 | 画布 fit-to-viewport | 纵向画布、保持比例 | 高 |
| 32 | 01:52 | `32_rebuilt_element_edit.jpg` | 信息图中的独立元素被选中/编辑 | 选框与上下文工具条 | OCR 文本/形状/连接线独立编辑 | 高 |
| 33 | 01:56 | `33_export_button.jpg` | 顶部 Export 操作可见/触发 | 按钮 active、菜单/模态进入 | 导出入口与进度 | 高 |
| 34 | 02:01 | `34_powerpoint_editable.jpg` | PowerPoint 中打开导出文件并直接选择对象 | 应用切换 | PPTX 原生可编辑性最终证明 | 高 |

## 连续时间段的动效观察

### 00:00–00:15：创建到 Agent

- 主要运动是视图淡入和 Agent 工具行自上而下出现。
- 当前工具有轻量运行指示；完成行保持原位置，避免列表跳动。
- 用户气泡、附件 chip 和工具卡采用同一 12–16 px 圆角语言。

### 00:15–00:39：编辑器与直接编辑

- 切换幻灯片不移动 chrome，只替换画布内容；体感约 150–220 ms。
- 元素选择框近乎即时，随后上下文工具条淡入。
- 数据编辑浮层从锚点附近出现，不全屏打断。

### 00:39–01:05：模板与参考文件

- 分类 Tab 变化轻，重点是模板封面内容替换。
- 上传模态使用背景遮罩、面板缩放和淡入；上传条为连续线性进度。
- 解析完成通过文件行状态变化表达，不跳转新页。

### 01:05–01:33：分栏改稿、评论、版本

- 左右分栏保持稳定，Agent 过程与右侧文档同步。
- 自然语言改稿完成时，结果说明、版本号和画布共同变化。
- 评论 pin 使用短促 scale 弹入；版本菜单是锚点式短动效；历史 slide 用 crossfade。

### 01:33–02:03：图片重建与导出

- 图片重建复用同一 Agent 工具时间线，说明产品是通用任务框架而非独立页面。
- 纵向画布通过 fit-to-viewport 缩放，编辑 chrome 不变。
- 最终切换 PowerPoint，直接选择对象证明“editable”是核心承诺。

## 证据限制

- 原片包含镜头缩放、窗口外背景、字幕和鼠标光标；比较 UI 时需裁除这些非产品像素。
- 视频剪辑隐藏了部分等待时间，不能据此推断真实生成时长。
- 分享权限、导出格式全列表、错误态、协作冲突和数据策略未在原片出现，PRD 中对应内容标为 [I]/[R]。
- 34 帧用于关键状态真相，所有帧级过渡仍可回看 124 张逐秒采样和 72 张场景帧。
