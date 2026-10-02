# 工具契约根因调查（进行中）

目标：先定位模型实际输入/输出与执行契约的偏差，再修复并通过真实完整演示文稿验收。不能将拆包成功、单页写入或测试全绿当成全稿完成。

## 已复现事实

1. b7c22a8e 初次80次工具失败，主要 INVALID_ARGS，含 arguments 信封。
2. 局部兼容后真实产出3页，但出现>=8层arguments及中间层混入pageType，随后连续3次SDK错误保护暂停。不是继续加拆包深度的依据。
3. 原失败payload主标题 content.style.fontSize=50/color=#5C4630，经当前 parseSkillPage 后 fontSize/color 都为undefined。模型字体意图被静默丢弃。
4. 原始参考 pptd.md TextContent 明确 style?:string、fontSize?:number 平铺；并未要求 style 对象。因此不能把第3项归因于参考文档教错。
5. 失败会话中 write_page 的 elements 参数只有 type:array，没有嵌套字段声明；写入后才执行较完整页面规则。模型请求缺乏机器可读元素契约，且解析容错掩盖错误。

## 本地证据与修复进展

- 官方 session journal 中125个 assistant tool call 与执行 call 的参数哈希逐项一致；不存在 surface replace。错误包裹获得成功业务结果后原样进入下一轮历史。它可能强化后续错误，但首次偏离仍需真实供应商对照才能区分 gateway 与模型。
- 使用真实 LlmRuntime/PiAiAdapter 和合成供应商 SSE 的离线测试，验证 flat、1层、8层参数逐字不变。供应商响应为模拟数据，不能当成真实模型测试结果。
- 新增共享 `packages/pptd-v2/src/write-page-schema.ts`，让模型工具声明与服务端结构校验引用同一份契约。覆盖7类原生元素，拒绝未知字段及错误 content.style 对象。
- `parseSkillPage` 对通过共享契约校验的页面走克隆保真路径，避免旧方言转换器丢弃合法原生字段；旧项目仍可走原转换路径。7类字段保真及旧方言回归5/5通过。
- 撤销执行时自动解包的修复正在接线；目标是错误形状不得获得成功执行结果，且不得篡改历史伪造模型输出。
- 分阶段无进展预算正在本地回归。它是防止持续空转的保护，不是生成质量或模型修复的替代验收。

## 验收边界

真实模型对照尚未执行：自动审批拒绝向 AMD 外发内部产品提示词及完整工具定义，正在等待用户针对该数据范围的明确授权；不能改调用方式绕过。已有3页的旧任务保持暂停。

本地领域回归140项通过，8项渲染测试初次受沙箱 Chromium 启动权限限制；随后固定版本 Chromium 的完整 page-raster 测试17/17通过。尚未执行真实整稿生成，目标未完成。

## 最终本地收口与独立实例同步

2026-09-06 12:17（本地时间）同步73个有变化的源文件/编译文件到 `/Users/wu/orca/projects/openkimi-slides`，逐文件校验SHA。回滚备份：`output/tool-contract-backup-20260906-121717`；源工作区部署清单：`output/tool-contract-repair/deployment.json`。只操作独立13080/55200实例，未操作DSH.app。

最终验证：native完整构建通过；Host154/154、PPTD60/60、presentation领域（不含浏览器）131/131、固定浏览器渲染17/17、bundle5/5、离线adapter5/5。完整页 `read_page → write_page` 基线往返保留背景、备注、动画与元素样式，SHA不变；错误content.style在SDK泛oneOf错误之前得到精确字段反馈。所有这些均为本地测试，没有真实供应商结果。

重启后独立launcher47349、editor47350、Host47360；`/slides/health`返回ok/generateReady，原生浏览器重新载入原b7项目，显示“已暂停，可继续编辑”和“已写入3页”。没有新模型turn，旧错误历史与三页产物保留。部署证明新本地代码已加载，不能代替下一轮真实request/header与供应商原始响应的确认。

尚待用户对外发产品提示词、工具定义、合成题目和必要脱敏失败片段到AMD/MiniMax的明确许可。获准后再做受控对照和完整生成验收；目标维持未完成。

## 待区分假设

- 工具声明到供应商请求之间发生变化：核对真实 wire body 与 session request/header。
- 制作prompt、示例、工具签名发生冲突：同模型 clean 与真实header对照。
- 失败历史造成自我强化：在前两者基础上加入短失败历史，不混淆变量。
- 个别provider/model工具协议质量差异：AMD Vision-Exp/Flash/Qwen、MiniMax与可用free模型同条件比较。

实验须保留实际route、工具schema、请求角色/哈希、原始返回参数、终止原因，凭据和授权header不落盘。超时、配额或token耗尽不能伪装成模型契约失败。
