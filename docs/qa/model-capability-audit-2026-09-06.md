# 模型能力卡修复 · 2026-09-06

用户指出选中 DeepSeek-V4-Flash-Vision-Exp 时卡片还显示 Flash，并将独立图片服务误读为模型原生生图能力。

## 已确认根因

- 模型 change 只更新显示名称，没有 refreshHealth。
- 多次 health 请求没有最新请求和当前选择检查，旧响应可能覆盖新选择。
- selectedReady 混入默认连接状态，可能把未就绪的选择显示为已接入。
- 联网/搜图/生图的独立工具配置被文案归给当前模型。
- 后端用 vision/grok 名字正则判断图片输入，漏掉配置明确支持图片的其他模型。
- 生图配置判断未复用真实图片调用器，遗漏显式禁用与 API Key 要求。
- 项目能力读取曾丢弃绑定的模型信息，与 Hub 的选择判断不一致。

## 前端验证

专项 7 项及 native-web 32 项测试通过；已部署到正式独立服务。
原生浏览器切换 Flash 与 Vision-Exp，卡片模型名和看页状态自动切换。页面显示独立“生图工具 · 已配置”，明确三类工具来自工具配置；视觉能力使用“配置支持”，不表示已经实际推理验证。

## 后端与真实服务验证

presentation-run 194/194、Host 首轮 122/122 测试通过，全原生构建成功。
正式服务 health 五模型对照通过：Flash=none；Vision-Exp、Qwen3.8-Flash-Next、kimi-k3=main-model；不存在的 unknown-vision-model=ready false 且 vision none。只代表配置和路由支持，不等同本轮逐模型真实视觉推理验证。

实时连续切换测试额外发现重复 resume 同一 live session 的错误。已加入 SDK 可变模型选择及失败回滚，Host 124/124 通过；工具层读取切换后模型的同步回归正在补齐。

生图工具的现有授权登录原先延迟到任务开始才初始化。现在统一在 Host 启动时准备，能力卡按照图片调用器实际配置判断，不归为文字模型自身能力。

证据目录：output/model-capability-audit/。

## 最终验收

- 最终 Host 125/125、presentation-run 194/194、native-web 32/32 测试通过，正式构建成功。
- 更新当前独立服务，启动时即绑定已授权的独立图片工具配置。
- 真实测试文稿连续切换 Vision-Exp → Qwen → Flash，三次 HTTP 200、Agent 均 idle；绑定的输入模式与真实 inspection 看页模式分别为 image/main-model、image/main-model、text/none。
- 无效型号切换被拒绝，原 Flash 绑定保持不变。
- 最终五模型 health 对照见 health-final.json；连续切换见 session-switch.json。
- 原生浏览器验证卡片跟随模型切换，模型与独立工具分开标注；没有发起额外生成请求。

页面所说“配置支持”来自本地模型输入元数据和渲染条件，本轮未逐模型发送图片验证供应商实际视觉推理质量，也未声称文字模型具备原生生图输出。
