# 对话持久化与阅读稳定性 · 2026-09-20

本次范围：刷新丢失“查看修改前”入口、结束时对话跳动、下一轮展开整段历史。已更新本机 55201 编辑器并在原生 Codex Browser 验证。

## 原因与改动

- 原有 workspaceEditReceipts 只存在标签页内存，刷新无法重建版本关系。现在既有版本清单保存请求标识与已完成的事务结果，activity 只负责投影关联。版本操作仍在对应回复下，未增加结果区域。
- 原有全局过程头每次重绘被移除、重插；忙闲状态展开/收起所有回合。现在按用户消息与原生 turn 分组，用户选择只影响那一轮。
- 原有滚动回调把布局收缩也当成读者滚动，且每次绘制都强制追尾。现在使用稳定消息锚点、偏移与程序滚动记录；过程收起不隐藏正在阅读的内容。状态与版本操作共用底部空间，回复不会因状态消失而位移。
- 本地发送回显和 Host 接收消息使用相同 clientRequestId 作为节点身份，重载不改变已接受消息的身份。

对照了本机原生 DSH ui-chat 的 ChatView.tsx 与 ChatNodeSeat.tsx：稳定消息节点、按 turn 的过程范围、读者拥有滚动位置。这里复用这些行为规则，继续读取原生 DSH journal；没有宣称直接嵌入 DSH React 界面或做到像素一致。

## 验收

| 检查 | 实测结果 |
| --- | --- |
| 原用户文稿 V18 | 刷新恢复同一回复下的入口，点击进入只读 V18，返回最新成功 |
| 真实 DeepSeek 第 13 轮 | 第 1 页主标题颜色改为 #BFE5FF，V9 关联持久保存 |
| 真实 DeepSeek 第 14 轮 | 连续将同一标题改为 #D2E8FF，V10 关联持久保存 |
| 两轮完成后刷新 | 回复 key、正文、版本 id 均与刷新前一致；入口均可打开并返回 |
| 实际文稿差异 | 只变第 1 页 elements.9.content.color；第 2 页、文稿元数据无变化 |
| 用户原稿 | deck.pptd 与全部页面 hash 与本轮开始备份一致 |
| 流式输出时上翻阅读 | 锚点位移 0px |
| 完成时阅读历史 | 锚点位移 0px |
| 跟随末尾时完成 | 已显示正文位移 0px |
| 历史展开与刷新 | 每轮独立；手动展开和阅读位置保留 |
| 1440 / 877 / 390 宽度 | 页面和对话均无横向溢出；reduced-motion 路径通过 |
| 相关回归 | 50 项对话、问题卡、范围保护、历史与 UI 测试全部通过；7 项版本存储测试全部通过 |

真实模型只使用独立合成项目 deck-8a06f686、opcode / deepseek-v4.1-flash。原用户会话仅做本地读取与历史预览，没有向模型发送用户原稿。

## 证据

均在 output/conversation-stability-acceptance-2026-09-20：

- tests-final.log、store-tests.log：57 项通过。
- scroll-dom-proof.json：消息节点、锚点位移和三种宽度测量。
- real-document-proof.json：两轮快照关联与逐属性差异、原稿 hash 不变、锁已释放。
- real-before-refresh.json / real-after-refresh.json、second-refresh-proof.json：真实回复的刷新前后身份与内容。
- v18-final.png、real-refreshed.png、real-second-complete.png：原生浏览器实图。
- stable-chat-1440.png / stable-chat-877.png / stable-chat-390.png：固定 Chromium 渲染。
- activation-readiness.json：确认 78 个有效绑定会话空闲、无写锁，原稿已备份；只更新编辑器，模型 Host 与主 DSH 保持运行。

首次回归发现版本入口早于事务收尾出现，已将发布移至校验及锁释放边界；首次版仍有 36px 状态行退出位移，修复后为 0px。第二次视觉复核未发现本范围内未解决的遮挡、跳动或溢出。

边界：本次刷新验收针对已完成回复及版本产物。执行中刷新后的编辑事务接管、服务端重启后的编辑事务恢复不属于本次已验证能力；不将它们表述为已完成。
