# b7 生成停滞与页面质量契约调查

本报告只分析 session `b7c22a8e-d286-4cec-849a-9dd63be69adf` 的官方只读 journal、实际 request/header、当前源码契约与已落盘页面。调查未 prepare、repair、append、resume 或取消会话，也未改动 live 服务。

## 结论

本次问题有两条相互放大的链路。

第一条是工具参数链路。初始 turn 有 92 次工具调用，其中 75 次为 SDK `INVALID_ARGS`；恢复后的 turn 有 33 次调用，其中 29 次是 `write_page`。参数兼容层让一部分调用进入业务校验，但模型继续增加 `arguments` 信封层数，最终出现 5、6、8 层嵌套，并由连续三次参数错误保护暂停。

第二条是页面质量链路。恢复 turn 的 29 次 `write_page` 含 111 个文字元素，其中 110 个把 `content.style` 写成对象，109 个把 `fontSize` 放进该对象，0 个使用规范的 `content.fontSize`；110 个把 `fontFamily` 放进该对象，0 个使用规范的 `content.fontFamily`。解析器把对象型 `content.style` 当作无效命名样式，随后静默丢弃其中的字号、字体和颜色。3 个已落盘页面的 7 个文字元素因此全部没有 `fontSize`、`fontFamily`、命名 `style` 或 `layoutRole`。这解释了封面标题小、留白大的现象，也说明 `layoutStatus=pass` 只证明当前溢出检查通过，不等于视觉意图保真。

这不是 vendor 参考与本地 PPTD 的两套规范互相冲突。两者都规定 `TextContent.style?: string` 用来引用主题样式，`fontSize`、`fontFamily`、`color` 等字段直接放在 `TextContent`。富文本 `<p><span style="...">` 只存在于 `content.text` 字符串内部。

## 真实请求为什么会生成错误形状

官方 journal 中只有两个 request/header：初始 seq 9 和恢复 seq 44569。两次 header 都没有 `content.style` 对象示例，也没有另一份错误的字体示例。恢复 header 新增了“不要套 `arguments`”的文字，但两次发送给模型的 `write_page` schema 都只有：

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "pageType": { "type": "string" },
    "elements": { "type": "array" },
    "expectedPageSha256": { "type": "string" }
  },
  "required": ["id"]
}
```

`elements` 没有 `items`，所以模型看不到元素分支、文字内容字段、`style` 的字符串类型、精确 bounds 约束和 `layoutRole` 所在层级。system/persona 只说 `elementType`、`bounds` 和 `content.text`，也没有列出直接字体字段。现有事实只支持“机器契约缺失，模型按常见 style-object 先验自行补形状；恢复历史又持续强化它自己此前的错误调用”，不支持“某个 header 示例教错了模型”。

源码同样证明静默丢失：

- `vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt/reference/pptd.md` 的 TextContent 将 `style` 定义为主题引用字符串，并把 `fontSize` 等字段平铺在 content。
- `packages/pptd-v2/src/types.ts` 与之相同，且把 `layoutRole` 放在 ElementBase。
- `packages/presentation-run/src/domain/skill-pages.ts` 的 `parseTextContent` 读取 `content.fontSize`、元素顶层 `fontSize` 或元素顶层 `style.fontSize`，不读取 `content.style.fontSize`；`parseElement` 只从元素顶层读取 `layoutRole`。
- `packages/dsh-slides-host/src/tools.ts` 的 `write_page` 仅声明 `elements: {type:"array"}`。

## 实际进展与循环形态

只读 journal 共 86,859 个事件，最后事件为 `turn/end`，没有开放 turn。两轮合计 125 次工具调用。

恢复 turn 持续约 78.9 分钟。29 次 `write_page` 中有 19 次业务拒绝、5 次写入、5 次 `INVALID_ARGS`。持久化进展只有 5 个 page revision：

| 时间（恢复后） | 页面 | revision | layout |
| --- | --- | ---: | --- |
| 2.04 分钟 | `cover_tep` | 1 | pass |
| 38.99 分钟 | `route_tep` | 1 | pass |
| 39.48 分钟 | `concept_tep` | 1 | pass |
| 60.16 分钟 | `concept_tep` | 2 | fail |
| 62.54 分钟 | `concept_tep` | 3 | pass |

业务拒绝包括 overflow 11 次、overlap 2 次，以及 footer zone、缺 bounds、zero area、非法颜色、空结束页等各 1 次。最后一个 revision 后又连续进行了 9 次 `write_page`，先是 6 次 overflow，再是 3 次 `INVALID_ARGS`，没有任何页面 revision 进展。

当前产物只有 `cover_tep`、`route_tep`、`concept_tep` 三页；计划为 8 页，尚缺 5 页，结构评审、视觉评审和 compose 均未完成。ledger 只有 5 条 `page.revision-committed`、6 条 `page.raster-committed`，因此 render 次数或工具调用次数不能代替页面进展。

## 统一的生成入口契约

建议建立一个生成专用的 `WritePageArgs` schema 模块，由 `write_page` 的模型声明和服务端入参校验共同引用。磁盘读取继续使用现有宽容 parser，避免破坏旧文件；新生成入口在进入 parser 前严格拒绝未知或形状错误的字段，不再静默修正样式。

顶层要求 `id` 与非空 `elements`；`pageType`、`expectedPageSha256` 可选。每个元素都要求 `elementId`、`elementType` 和 `bounds`。`bounds` 必须是恰好四个有限数字，宽高为正。元素用 `oneOf` 分成七类：

| 分支 | 必填业务字段 | 应明确约束的主要字段 |
| --- | --- | --- |
| text | `content.text` | `content.style` 仅 string；`fontSize/fontFamily/color/bold/italic/underline/backgroundColor/lineHeight/letterSpacing/align/wrap/list/href` 直接位于 content；`layoutRole` 位于元素 |
| shape | `shapeName` | `fill`；只有在 parser/持久化已保真后才公开 `border/adjustments` |
| image | `src` | 只有在 parser/持久化已保真后才公开 `fit/crop/cropShape` |
| table | `columnWidths/rows` | cell 的 `text/bold/color/fill/align/rowSpan/colSpan`；只公开实际可保真的字段 |
| chart | `data.cols/data.rows/series` | series 的 `type/name/encode/fill/axis`，以及 `colors/title/legend/labels/axis` |
| icon | `iconName` | `fill` |
| line | `viewBox/points` | 只有在 parser/持久化已保真后才公开 `border/curve/arrow/connects/label` |

DSH 当前的 schema 子集支持 `oneOf/items/properties/required/additionalProperties/enum/const`，足以把七个元素分支及 `content.style: string` 送给模型，并在 SDK body 执行前做同一份结构校验。它不支持 `minItems/maxItems`，所以 `bounds` 恰好四项、`elements` 非空、有限数、正宽高、表格行列一致等条件必须由该 schema 模块旁的语义校验器完成。两者要作为一个入口契约测试，不能声称 JSON Schema 单独覆盖了这些约束。

### 覆盖边界

严格入口应先覆盖当前生成链路真正能够无损解析和持久化的字段。现有 `PptdElement` TypeScript 类型比 `parseElement` 的保真能力更宽：例如 base 的 flip/locked/group/shadow/smartArt、shape 的 border/adjustments、image 的 fit/crop、table 的 rowHeights 和部分 cell 字段、line 的 border/arrow/connects 等，当前 parser 会丢弃其中一些。若直接把整个类型机械翻译成模型 schema，只会把本次静默丢字段问题扩展到更多元素。

因此实施顺序应为：先列出 parser 的“接受并保真”矩阵；生成 schema 只公开这部分；需要的新 PPTD 字段先补齐 parser/序列化/渲染一致性测试，再进入生成 schema。旧磁盘 parser 的宽容别名和历史兼容分支保留，但不出现在模型契约里。

### 下游风险

1. `oneOf` 会重复公共元素字段，增大 request/header，并可能暴露 provider 对复杂 function schema 的兼容差异。应在 AMD Flash、Vision、Qwen 和其它启用模型上检查实际 request/header 与一次合法/非法调用，不能只测试本地 schema 对象。
2. 严格 `additionalProperties:false` 会让旧模型习惯的别名立即报 `INVALID_ARGS`。这是生成入口的预期行为，但需要短小、唯一的合法示例与错误恢复提示，否则会把静默质量损失变成高频重试。
3. DSH `defineTool` 的参数根对象默认开放；嵌套对象可关闭额外字段。根级未知字段若也必须拒绝，需要在同源语义校验层明确处理，或评估使用受支持的原始 object schema 注册方式，不能假设 DSL 已关闭根字段。
4. `oneOf` 是 exact-one。公共字段必须重复到每个分支，并用 `elementType.const` 区分，否则分支会重叠而拒绝合法元素。
5. compose 或其它旁路若仍能把宽松 elements 直接交给 parser，会绕开严格入口。需盘点所有 agent 生成入口，但不要把编辑器读取、旧文件加载一并收紧。
6. schema 只能保证形状，无法保证字号与 bounds 在视觉上合理。写入前还要做“意图保真回执”：请求中声明的样式字段必须出现在规范化页面中；任何被丢弃字段应拒绝写入并指出路径。

模型说明只保留一份最小示例，明确：工具字段在顶层；文字 `content.fontSize`、`content.fontFamily`、`content.color` 平铺；`content.style` 只接受类似 `$title` 的字符串；富文本行内样式只写在 `content.text` 的 `<span style>`；`layoutRole` 放在元素层。不要新增对对象型 `content.style` 的兼容解包，因为那会继续掩盖契约偏差。

## 基于持久化进展的有界循环

循环预算应由 durable facts 驱动。建议进展 token 由以下事实组成：todo 中已完成的唯一 pageId 集合、每页当前 revision 与 layout/review 结果、结构/视觉 review 事实、compose 事实。只有新增计划页 revision、使失败 revision 变为通过、完成一个新的 review 阶段或 compose 才重置预算。相同 SHA 的 render、普通工具成功、重复读取参考资料都不算页面进展。

建议起始阈值：

- 同一工具连续 3 次 SDK `INVALID_ARGS`：保持现有暂停。
- 同一页面、同一业务拒绝类别连续 2 次：要求依据具体错误更正；第三次前暂停。
- 任意类别累计 5 次 `write_page` 没有 durable progress，或 10 分钟没有新增 revision，以先到者暂停。b7 会在最后 9 次空转的第 5 次被停止。
- 单页最多 3 个 revision 仍未取得 layout/review pass 时暂停。b7 的 `concept_tep` 恰好在 revision 3 修复成功，可作为边界样本。
- 页面 layout pass 后必须推进到下一个 todo 或 review；除非 review 明确点名该页，否则不要继续重写。
- 相同页面 SHA 最多重复 render 2 次；render 是诊断证据，不重置页面进展预算。
- compose 只有在 blocker 集合发生变化后才允许重试；相同 blocker 集合连续两次即暂停。

暂停记录应包含工具、pageId、错误类别、距上次 durable progress 的调用数与时间、最后成功 revision、建议的下一步。新用户 turn 可以重置计数，但应注入一段短恢复说明；旧 history 不删除，恢复说明必须明确下一缺页、不要重写已经通过的三页、顶层参数与直接文字样式字段。

## 专项实验

所有实验使用隔离项目副本或合成 session，不触碰当前会话。

1. **header 契约**：抓取实际 request/header，断言 `elements.items.oneOf` 存在、text 分支的 `content.style` 为 string、字体字段直接位于 content，且非法样式对象在 tool body 前得到 `INVALID_ARGS`。
2. **保真回归**：用 b7 的对象型 `content.style` 形状调用严格入口，期待 `invalid_text_style_shape` 且 revision 不变；再用规范化 fixture 写入，重载后字号、字体、颜色和元素级 layoutRole 全部相同。
3. **真实渲染**：渲染规范 cover fixture，检查标题实际字号为 50，并做截图比较；不能以 `layoutStatus=pass` 代替这项检查。
4. **循环重放**：重放 b7 恢复 turn 的 29 个 outcome，只保留类别和进展事实。预期概念页 revision 2 到 3 的有效修复被允许，最后空转在第 5 次而非第 9 次暂停。
5. **旧历史恢复**：给模型保留历史嵌套调用，再提供新 schema 与唯一合法示例。下一调用必须为顶层参数和直接文字样式；当前生成入口不再解包 `arguments`，任何 provider 信封都会明确 `INVALID_ARGS`，不能写成兼容转发成功。
6. **隔离端到端**：从 b7 的三页快照恢复，限定先写下一缺页。目标是在 2 次 `write_page` 或 5 分钟内新增一个计划页 revision，不改写三个已通过页面，随后 review/compose blocker 集合单调减少。

## 已实现的离线根因修复

`packages/pptd-v2/src/write-page-schema.ts` 现为生成页面唯一结构契约，覆盖 text、shape、image、table、chart、icon、line 七类本地原生元素。Host 将同一份 schema 发送给模型并在项目访问前校验；额外语义检查承担 DSH schema 子集无法表达的非空数组、精确 tuple 长度、正宽高、唯一元素 id、表格/图表行列一致性。参数根、元素分支和文字 content 均拒绝未知字段。

页面根契约同时覆盖 `background`、`notes` 和 `animations`；Animation 与本地类型一致，包含 `elementId/effect/trigger/direction/durationMs/delayMs`。梯度非空检查覆盖页面背景、shape/icon fill、table cell fill、chart background 和 chart series fill。动画和连接的悬空引用校验仍是待校准的语义项，当前不阻止既有页面原样回写。

canonical 页面绕过历史方言 normalizer，直接克隆进入 `parseSkillPage` 的保真路径；旧磁盘和专项 legacy parser 仍使用原来的宽容转换。计划工具现在只向模型声明 canonical `[{pageId,title,layoutFamily}]`，adopted source 是 string 数组；`review_page` 明确 `verdict=pass|revise` 和 string issues。模型 persona 的直接字段规则位于 `packages/dsh-slides-bundle/presets/slides/agent.cordis.yml`。

离线回归已经通过：PPTD schema 6 项、canonical/legacy parser 5 项、Host schema 与真实持久化 5 项、bundle 5 项。真实持久化用 Cordis ToolRuntime 调用 Host `write_page`，由真实 PresentationRun 写入临时项目，再由 `loadProject` 核对 `fontSize=50`、字体族、元素级 layoutRole、shape border 与 line arrow/connects，全部保留；read_page baseline 带 SHA 的原样页面回写还覆盖 background、notes 和 animations。最终 Host 全测由根任务独立运行，154/154 通过，日志为 `/tmp/openslides-contract-host-tests.log`。当前 live request/header 尚未重启部署，因此旧 header 事实与新静态编译 schema 必须分开记录，不能把离线结果写成 live 已生效。
