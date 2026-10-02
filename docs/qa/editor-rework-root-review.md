# 编辑器整体改造：root审查记录

## 首版视觉审查（源实例55482，独立测试稿）

原生IAB 1280×720；测试稿 `output/editor-rework/native-preview-project`。图片对象由root作为fixture加入第3页，不是用户文稿。

- 文字：直接字体/字号/B/I/U、颜色、两组文本对齐、列表、换行switch，结构比旧版明确。
- 多选：位置/排列集中、图层只一套、固定常用动作；无类型专属属性冒充混合通用属性。
- 保留前后证据：`output/editor-rework/before-more.png`、`draft-multiselect.png`。

## 已要求修正

1. 当前目标重复了固定属性头，移除多余一整段。
2. 字形/对齐/列表要有正确aria名称和pressed状态，不只背景变色。
3. Footer不得挡住可滚动属性尾部；各宽度可达最后一项。
4. 单选未成组及多选未成组不得给出可执行解组。
5. 图层短标签上移/下移会被误解成坐标移动，恢复完整“上移一层”等名称与图层标识。
6. 图片替换、裁切、填充是常用路径，应直接露出；遮罩/重建低频分开，不把两个旧菜单改名就算完成。
7. 清理“No border”等不一致入口术语。
8. 空选区不占满无用属性栏，但必须有明确状态与可理解入口。

以上是候选审查，不是部署验收。必须继续验证真实修改、Undo与重载、Agent交接、网络失败/恢复以及最终运行实例。

## 连续操作审查追加

- 图片直接替换、裁切、填充已原生查看，分组与入口符合目标；重建表单有明确能力说明和取消入口。
- 图片属性在1280×720的常用动作浮层落在正文中段，下方还有图层控件；要求修复真正的底边定位和正文滚动边界。
- 局部文字范围格式后单击缩略图丢点击：独立回归已证实修正，导航一次即可，undo分别撤回颜色和粗体，无多余setRichText历史。
- 图表新建后，将第一行数值3改7、Tab、立即关闭：原生重开及磁盘仍为3。Enter提交可保存7。确认关闭取消300ms待保存计时器；已交给实施者修复，并要求不靠测试延迟绕过。

## 候选复核通过

- 最新图片面板常用动作区域 bottom=720，与属性面板和视口底边720一致；原生截图 `output/editor-rework/source-image-inspector.png`。
- 图片隐藏后标题显示“已隐藏”，动作变成“显示”；原生点击显示可恢复，未编组单选不再出现无关解组按钮。
- 独立裁切回归已验证即时应用语义：退出/Escape保留已应用裁切并提示可撤销，一次undo恢复，redo/reload保留。没有虚构事务式取消。
- 原子表格后端独立验证39项、HTTP3项及全部36个插入尺寸通过。

## 13080 实际实例验收

2026-09-06 19:23，备份并同步14个生产文件，随后补齐1个Oracle索引；重启独立SlideStudio启动器与55200，13080/app与55200/api/health均返回200。

- 回滚备份：`/Users/wu/orca/projects/openkimi-slides/output/editor-canvas-backup-20260906-192259`、`editor-canvas-backup-20260906-192341`；各自manifest含文件SHA256。
- 人工测试稿：`output/editor-rework-live-20260906`，源自独立fixture，不修改用户勾股定理文稿。
- 原生6×6插入产生36格，菜单自动收起且aria-expanded=false；一次撤销0张表，重做36格。
- 图表最后一格2改17，Tab后立即关闭；刷新重开仍17。截图：`output/editor-rework/live-chart-persisted.png`。
- 第3页标题链接页内表单保存成功，DOM data-href为测试地址；换行切换后一次undo恢复，链接仍保留。固定动作底边与720px视口一致。截图：`output/editor-rework/live-text-inspector.png`。
- 整稿修改页内确认真实显示2页、amd / DeepSeek-V4-Flash、修改前版本；取消后保留输入且未发送，随后清空测试草稿。
- 真实元素批注验收使用既有虚构2页稿fd52437c；新批注7741931c绑定cover/title，提交当前模型，结果待核对。

### 实际实例发现的阻断项（继续修复）

- 元素批注首次确认发送被拒绝：`review scope pageRevision must match editorEdit.revision`，自动恢复且标题未改变。代码初查发现本地页hash与历史ledger不同会得到null revision；不能用跳过范围验证的方式修复。已让Luna定位人类/外部编辑后版本同步，修好后重试同一批注。
- 独立审阅发现图表input自动保存后blur/change再次标记dirty，可能产生无变化undo。已补“等待自动保存再离开输入”场景，修复后重新同步。

图表重复提交修复已通过：输入后等待450ms自动保存、失焦再等待450ms，恰好一次setChartData，一次undo还原完整基线；原对象切页/导出回归通过，最终恢复流程5/5。证据：`output/editor-rework/flow-final/report.md`。

版本问题根因确认是null revision，未放宽Host验证。失败尝试后逐页YAML语义比较，cover/rules均与尝试前完全相同。新批注同步、人类编辑后直接Agent工作区同步、旧批注/旧标签页拒绝的目标门禁正在收尾。

### 最终版本修复与真实批注通过

19:44再次备份同步7个文件，备份为`editor-canvas-backup-20260906-194420`，包括presentation-run的revision导出。最终20个不同生产文件的源码/运行目录/最新manifest哈希一致：`output/editor-rework/live-deployment-verified.json`。

- 最终Native Web全部72/72通过；版本相关27/27，旧批注409、新revision旧raster失效、整稿后页stale不部分登记均覆盖。
- 真实批注重试完成：amd / DeepSeek-V4-Flash将cover/title改为“星屿邮局：轻松协作”。逐元素和字段比对确认只有title.content.text改变，位置、字号、颜色及其他属性完全不变；rules整页不变。
- 原生刷新后仍显示新标题和“AI 已修改”，插入工具已解锁。证据：`output/editor-rework/live-agent-scope-result.json`、`live-agent-completed.png`。
- 直接Agent入口首轮也完成。进一步用真实键盘在字号字段输入36并Tab，磁盘确认fontSize=36，保存独立基线后再要求Agent只改标题文字；该轮结果待核对。

注：原生工具的fill方式在一个字号验证步骤未触发浏览器change，不能算人类改字号成功；已改为实际按键并核对磁盘再开始最终一轮，未用未保存输入充当证据。

最终直接Agent续改的磁盘核对已通过：标题成为“星屿邮局 · 共创指南”，人类刚保存的fontSize=36原样保留，只有title.content.text变化，其他属性与第二页不变。证据：`output/editor-rework/live-workspace-human-result.json`。

最终原生界面确认该轮显示“DSH Agent 已完成”，保留修改前V30；刷新后标题和36px字号仍在，插入工具已解锁。截图：`output/editor-rework/live-workspace-human-completed.png`。用户原8页文稿已刷新到新版并展开所选text-1属性栏，只改变UI选择/展开状态，没有编辑文稿内容。截图：`output/editor-rework/user-editor-updated.png`。

## 覆盖范围与保留边界

- Inspector完整单次19/19、0浏览器错误、55命令轨迹；1100/1375/1440/1920宽度均无横向溢出。根代理检查1375截图及实际IAB720高视口。
- 链接、四种剪贴板交叉操作、局部文字格式、换行事务、图片裁切退出/撤销、表格36规格、图表快速与延迟离开、锁定/隐藏、多选排列/编组、无效值、批注失败恢复、Agent范围与确认均有对应证据。
- 本轮不声称验证了系统中文IME候选窗、所有第三方模型或所有组合。旧canvas-controls/office验收脚本仍有待适配的旧菜单定位器；本轮覆盖来自新矩阵、已适配广泛工具栏与专项回归，并非把这些旧脚本算成通过。
- 测试在独立稿进行，未修改用户勾股定理8页文稿；没有commit/push，没有修改DSH.app。
