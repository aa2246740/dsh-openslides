# b7 工具契约根因审计

日期：2026-09-06
范围：只读检查真实 b7 会话的 DSH `request/header`、工具调用历史、OpenSlides 注册入口、DSH 工具呈现与 pi-ai 的 OpenAI Chat Completions 转换。未发起模型请求，未修改或停止 live 任务。会话内容、用户消息、系统提示全文和认证信息均未输出。

## 结论

OpenSlides 的工具 schema 没有把业务参数声明成 `arguments:any`。真实会话使用纯 native function tools，没有 Code Mode SDK、`run_code`、native/code 双重呈现或重复工具名。DSH 与 pi-ai 的出站转换也没有添加业务层 `arguments` 包裹：它发送标准 OpenAI 结构 `tools[].function.parameters = 原始 JSON Schema`。

现有离线证据把首次错误定位在“标准请求离开 pi-ai”之后、“解析后的 tool call 进入 durable surface”之前的 AMD provider 侧边界。这个定位来自 adapter 代码、运行时文件 identity 和持久事件的组合证据；旧会话没有保存原始 HTTP/SSE 帧，因此不能冒称直接抓到了 provider 原始返回，也无法区分 gateway 模板、tool parser 或底层模型生成。

具备递归放大所需条件的本地反馈链已经证实。产品兼容层会在执行前临时解开最多四层单键 `arguments`，但不会修改已持久化的 assistant tool call。二至四层的错误形状获得了正常业务结果，甚至 `outcome=written`；下一步请求又通过 DSH durable surface 和 pi-ai history converter 原样回放这些调用。当前会话没有 surface replace/compaction，错误示例持续累积，观测到的深度随后从 2–4 层增长到 5、6、7、10、12 层。这是正反馈解释的有力证据，但缺少无兼容层或已规范化历史的对照，不能把深度增长表述为已严格证明的单一因果结果。

因此，不应把继续扩大解包深度当作根因修复：它会允许更多错误形状执行，却不纠正 durable history。系统提示增加“不要包 arguments”也不能清除已经进入历史的错误示例。

## 真实 request/header

通过正式 `@deepseek-ai/dsh-session-persistence-jsonl` 的 `readStoredRevision()`、`readRaw()` 和 `@deepseek-ai/dsh-session` 的 `decodeStorageRecord()` 读取 `.dsh/home/sessions`，只输出结构、计数和 SHA-256。

| 项目 | initial，seq 9 | resume，seq 44569 |
| --- | --- | --- |
| provider / model | `amd` / `DeepSeek-V4-Flash-Vision-Exp` | 相同 |
| header SHA-256 | `5d00b5ee85cc63b66d825d2af81b7167860925c522fa807b992add496c69ebea` | `67be5884c2d022b80adf0f886a94a9e66e402b6aeb32b459043d08050e48344b` |
| system 字节 / SHA-256 | 1783 / `ddb7af3a836dc1a540a90209331622fd07b74e7ba812f9e933243acdf671a3ee` | 1884 / `69821630c38dcdbb0e50175212ee3a3efebfae82fee73f4422921983edc0a0f5` |
| tools SHA-256 | `6f2840afd49565870a1fe486649c6283656e495234fd1c976d507e7415cf7d5d` | 相同 |
| 工具数量 | 18 | 18 |
| `run_code` | 无 | 无 |
| Code SDK 标记 | 无 `ToolArgsMap`、无 `declare const tools` | 同左 |
| 重复工具名 | 0 | 0 |

initial system 中 `arguments` 一词出现 0 次。resume system 新增了唯一一次相关说明：`Pass every tool's declared fields directly at the top level; never wrap them in an arguments object.`。18 个工具 description 中 `arguments` 一词也出现 0 次。说明该词不是首次错误的提示来源；resume 的负向说明也没有抵消历史示例。

真实 `write_page.parameters` 在两份 header 中逐字节相同，SHA-256 为 `317dd95dbe7a19ac302b69c335fbed2195126ea815971a6fb08c6925a3bde55d`：

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" },
    "pageType": { "type": "string" },
    "elements": { "type": "array" },
    "expectedPageSha256": { "type": "string" }
  }
}
```

不存在 `arguments` property，也不存在 `arguments:any`。

## 从注册到 provider wire

1. OpenSlides 的 `writePageTool()` 直接向 `defineTool()` 声明上述四个顶层字段；`registerSliceTools()` 将定义交给 DSH ToolRuntime。见 `packages/dsh-slides-host/src/tools.ts:237-259`、`:708-723`。
2. slides preset 只挂载 persona；当前 profile 没有 `dsh-agent-tool-presentation` 行。DSH ToolRuntime 默认 `mode: native`，native 分支直接返回可见工具 schemas。见 `node_modules/@deepseek-ai/dsh-tools/lib/index.js:2553-2561`、`:2713-2729`。真实 header 与此一致。
3. agent loop 用 assembly 的 `system` 和 `tools` 构造 `canonicalHeader()`，随后把同一份 header 放进冻结的 LLM request。见 `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:693-760`。
4. `dsh-llm-pi-ai` 仅把每个工具映射为 `{name, description, parameters}`。见 `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1123-1137`。
5. 当前 AMD 配置使用 `api: openai-completions`。pi-ai 把工具转为标准定义 `{type:'function', function:{name,description,parameters:tool.parameters,strict:false}}`。见 `node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:512-559`、`:1025-1055`。
6. 本地 OpenAI SDK 类型同样把定义参数放在 `FunctionDefinition.parameters`，而响应工具调用使用 `function.arguments: string`。见 `node_modules/openai/resources/shared.d.ts:84-112`、`node_modules/openai/resources/chat/completions/completions.d.ts:916-946`。这里的 `function.arguments` 是 wire 协议字段；其 JSON 内容应直接符合 `parameters`，不应再出现业务对象 `{arguments:{...}}`。
7. pi-ai 入站只拼接 provider 的 `delta.tool_calls[].function.arguments` 字符串并解析 JSON，没有主动增加对象层。见 `node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:379-395`。DSH adapter 再把解析后的对象序列化为 durable tool-call block。见 `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1414-1423`。

以上五个运行时文件在 `latest` 与 live 运行目录中的 SHA-256 完全相同，排除了用错本地安装副本：

| 文件 | SHA-256 |
| --- | --- |
| `@deepseek-ai/dsh-llm-pi-ai/lib/index.js` | `e183a9cdde703b47485410bd68d247c8becdb277c390f0f91c6dd28718d350e2` |
| `@earendil-works/pi-ai/dist/api/openai-completions.js` | `0d50250fe2931e66e2078279a397814202e1ecddee58faf4b8bc04c278da177a` |
| `@deepseek-ai/dsh-tools/lib/index.js` | `47de95d14493dbd22d1a3ade14890fc99d7232db4e363f2190c9063b030dd029` |
| `@deepseek-ai/dsh-agent-loop/lib/index.js` | `1ca83637892559e88c43b815e8d5d7b065951751e73eee7a7bef99d65a71ad6c` |
| `@deepseek-ai/dsh-session/lib/index.js` | `dc14c845b915a9faaeb867499966e7b1991af3b6285f314bf353417e939d9c36` |

## 会话证据与递归放大

当前 journal 有 86,859 个事件、125 个 tool call。80 个结果是 `ToolArgsError / INVALID_ARGS`：`commit_design` 4 次、`generate_image` 6 次、`read_reference` 10 次、`write_todo` 34 次、`write_page` 26 次。

早期 `inspect_capabilities`、`list_references`、`view_design_reference` 和部分 `read_reference` 调用都是合法顶层对象。seq 2389 的 `open_project` 才首次出现一层 `{arguments:{...}}`；后续仍间歇出现合法顶层 `generate_image`、`read_reference` 和 `commit_design`。同一 adapter 对同一会话并非确定性加层，进一步排除了本地转换器固定包裹。

50 次 `write_page` 全部至少带一层错误包裹：

| 深度 | 次数 |
| ---: | ---: |
| 1 | 12 |
| 2 | 13 |
| 3 | 14 |
| 4 | 6 |
| 5 | 1 |
| 6 | 1 |
| 7 | 1 |
| 10 | 1 |
| 12 | 1 |

resume 前最多三层。resume 后，即使 system 已明确禁止包裹，分布仍变为：二层 6 次、三层 12 次、四层 6 次，随后分别出现 5、6、7、10、12 层。seq 86154 的第 4 层还同时出现 sibling `pageType`，说明它已不是可以无限递归解包的稳定方言。

产品兼容层位于 `packages/dsh-slides-host/src/tools.ts:75-108`。它只把局部变量 `args` 解包后传给原始 `execute()`，没有改写 durable assistant message 或 `exec.arguments`。证据如下：

- 125 个 `assistant/message` tool-call arguments 与随后 125 个 `tool/call` arguments 全部逐项 SHA-256 相同。
- DSH `Session.deriveMessages()` 会从 durable surface 直接返回 assistant message 和 tool result；见 `node_modules/@deepseek-ai/dsh-session/lib/index.js:266-285`、`:1526-1557`。
- pi-ai 回放时对历史 tool call 执行 `arguments: JSON.stringify(tc.arguments)`；见 `node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:886-908`。
- journal 的 surfaceOp 只有 `append` 242 次，`replace` 0 次，没有清除错误 tool-call 历史。
- 解包兼容上线后，深度 2、3、4 的错误形状获得业务 rejected 或 written 结果；其中 5 次 `write_page` 结果包含 `outcome=written`。模型因此看到“错误包裹 + 正常成功结果”的持久示范。

这条链与“四层兼容短暂恢复写页，随后出现更深包裹并再次被 INVALID_ARGS guard 暂停”的时间序列一致，构成目前最有力的解释；它仍需规范化历史或关闭兼容层的对照实验来确认因果强度。

## 根因边界

已排除：

- OpenSlides 工具 schema 把参数声明为 `arguments:any`。
- persona、Skill 或工具 description 教模型使用 `{arguments:{...}}`。
- native function tools 与 Code Mode SDK 同时呈现。
- 同名工具重复声明。
- DSH canonical header、dsh-llm-pi-ai 或 pi-ai 出站转换主动增加业务包裹。
- pi-ai 入站解析器在 provider 返回值之外再包一层。

已证实：

- AMD 路由收到的 contract 是标准 native function definition。
- durable assistant tool call 在进入 surface 时已经包含多余 `arguments` 对象；结合入站 adapter 不加层且运行时文件 identity 一致，可把问题定位到 provider 侧返回边界，但旧记录没有原始 SSE 可直接复核。
- 本地兼容执行与 durable replay 不一致，使错误形状得到成功结果并原样进入后续上下文。
- 没有 compaction/replace 的长会话持续累积这些示例；恢复后的成功执行与递归深度进一步上升在时间上同时出现，尚未通过对照证明单一因果关系。

尚未证实：

- 首次包裹由 AMD gateway 的 chat template、tool parser 还是底层 `DeepSeek-V4-Flash-Vision-Exp` 生成。journal 不保存原始 HTTP/SSE 帧，现有证据只能把边界定位到 AMD provider 一侧。
- AMD endpoint 是否完整支持 OpenAI `strict:true`。当前 pi-ai wire 是 `strict:false`；这允许 schema 偏离，但不是额外包裹的定义来源。

## 面向根因的验证顺序

1. 在 pi-ai `onPayload` 和 provider SSE 边界做一次只读、脱敏 recorder：只记录 tool definition/schema 哈希、工具名、`function.arguments` 的键形状和深度。禁止记录 Authorization、用户文本、完整系统提示和业务字段值。这样可以把首次错误精确分到 gateway 请求前或响应后。
2. 用全新短会话分别跑 AMD、MiniMax、Qwen/free 的同一最小工具 schema。旧 b7 已被 80 个 INVALID_ARGS 和大量错误 tool-call 示例污染，不适合作为模型间基线。
3. 修复应让兼容规范化发生在 durable assistant tool call 进入 session surface 之前，保证回放和执行看到同一顶层业务对象。若保留兼容，业务执行成功也不能把未规范化形状作为成功示例回放。
4. 已污染的 b7 需要在受控迁移或新会话中验证。仅改 persona、扩大解包深度或恢复同一历史都不能消除正反馈。
5. `strict:true` 只能作为该 provider 明确支持后的独立实验；它不能替代持久历史与执行参数一致性修复。

## 审计边界

本报告的“request/header”指 DSH 的逻辑会话事件，不是 HTTP header。审计没有读取或输出 API key、Authorization、cookie、OAuth 文件内容或用户消息。未调用 AMD、MiniMax、Qwen 或其他外部模型；没有重启、暂停、恢复、取消或部署任何服务。
