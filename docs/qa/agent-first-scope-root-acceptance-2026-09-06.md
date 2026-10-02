# Agent 主创范围与插入精简：实际验收

## 实施合同

见 `docs/plans/agent-first-scope-and-insert-trim-2026-09-06.md`。移除手动图标、SmartArt、公式插入；已有对象继续可见、可纠错。直接对话无范围默认本页，显式选区、指定页集、整稿各有独立授权边界。

## 已完成检查

- 原生浏览器检查新工具栏与形状菜单：仅形状、线条两个插入类别；页面背景直达。
- 原生对话目标预览：第2和第4页映射精确两页，越界99页显示无法发送，整稿显示页数。
- 隔离范围矩阵 34/34：`output/editor-rework/scope-routing-final2/report.json`。
- native-web 73/73、PresentationRun 209/209、Host 169/169 为第一轮候选结果，不等同于真实模型验收完成。
- 20:42 同步23个文件至独立13080；备份 `editor-canvas-backup-20260906-204236`。实际 `/slides/health` generateReady、produceGates.ok、hashMatch 均为 true。

## 真实模型验收记录

使用独立虚构三页稿，session `afb6e3d6-ed00-45cb-b845-56518a42f96c`，AMD DeepSeek-V4-Flash。用户原有八页稿不作为修改试验对象。

首次生成夹具时，白色背景不在采用模板的色板内，被校验拒绝；改用模板原色后完成三页稿。这个现象促使本轮补上明确背景改色授权，并覆盖改色后继续普通编辑与 compose 的持久性。

第一轮真实本页改色：画布停在第一页且有标题选区；输入未指定页码的背景改色要求。目标显示“第1页·当前页”正确，模型也只读取并提议 p1。但 Host 在 PresentationRun 之前还有一层独立色板校验，未使用新的授权上下文，实际 write_page 返回 pack_color 拒绝。已停止重试，未接受修改。正在修复双层校验上下文不一致，并补真实 Host 入口测试。

Host 双层校验修复已补齐：Host 与 PresentationRun 共同调用 `backgroundColorWriteAuthority`；同页持久背景与锁内新改色分别处理。Host 新回归4/4、相关主题与布局70/70，独立QA重建复跑通过。20:55再次备份同步26个文件，备份 `editor-canvas-backup-20260906-205502`；实际门禁再次全绿。

范围与既有内容矩阵扩为38/38，`output/editor-rework/scope-routing-final8/report.json`。包含已有icon、SmartArt、公式文本的修改、一次撤销/重做、重载与属性面板复开。

原生页码99点击发送：显示范围错误，未启动Agent。停止失败测试后，三页与deck元数据与初始快照深比较完全一致。

另外修复直接编辑回合中旧phase=complete导致尚无结果的工具卡提前显示失败；投影17/17、DOM1/1通过。“插入”标签窄画布折行已修，overflow10/10通过。

## 最终真实验收通过

全部由原生浏览器在实际13080输入并发送给 AMD / DeepSeek-V4-Flash；每次均等待界面完成、解除编辑锁。逐页深比较验证deck元数据、页面顺序、非目标页及目标页无关属性保持不变。

| 真实操作 | 结果与证据 |
| --- | --- |
| 标题有残留选区，不写范围，背景换 #F2F6FF | 只改p1背景；`output/agent-scope-trim/default-page-result.json` |
| 画布仍在第1页，直接说第2页背景换 #FFF3E8 | 只改p2；完成后显示目标页；`explicit-page-result.json` |
| 第1、3页背景换 #E8F4EF | 精确p1、p3；p2完全不变；`subset-pages-result.json`；实际锁 `subset-lock.json` |
| 整个PPT背景统一 #FFFFFF | 确认弹窗显示全部3页、提供方与恢复点；三页只改背景；`whole-deck-result.json`、`deck-lock.json` |
| 上一步完成后，普通请求标题换“纸飞机协作室” | p1仅标题文字改变，背景保留；本次 backgroundColorOverride=false；`followup-title-result.json`、`title-lock.json` |

以上缩写文件均位于 `output/agent-scope-trim/`。刷新后原生画布仍显示修改后的标题及白色背景；截图 `final-editor.png`。五条流程全部完成，没有把“已经写入但尚未结束”作为最终验收。

用户原八页稿在确认批注/Agent输入为空且没有内容编辑器开启后刷新，新工具栏与默认本页规则已可见。本轮真实模型修改仅针对独立三页测试稿。

批注与显式选区：本轮隔离11项回归通过（`output/editor-rework/agent-human-scope-final3/report.json`）；此前独立真实模型元素批注和直接选区修改证据在 `output/editor-rework/live-agent-scope-result.json`、`live-workspace-human-result.json`。本轮没有将这两条旧真实验收冒称为新跑的模型调用。

部署最终增量26文件与SHA备份清单匹配；相关完整源文件、dist和独立Host profile同步，实际门禁通过。没有提交或推送仓库，没有安装到DSH.app。
