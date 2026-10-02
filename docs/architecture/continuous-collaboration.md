# 连续 PPT 协作契约

一份文稿绑定一个 DSH 会话。用户先说“两页步行分享，先聊提纲”，助手只回答；再说“开始生成”才写页；生成后问“标题是否太长”仍讨论；明确说“把所选标题改成……”时进入现有版本保护与范围校验流程。

## 请求与权限

- `POST /slides/sessions` 接受可选 `conversationMode: "discuss"`，其余创建行为沿用原协议。
- `POST /slides/sessions/:id/turn` 接受 `conversationMode: "discuss" | "generate"`、可选纯用户文本 `userText`、当前页上下文 `context`、已有 `modelSelection` / 附件协议。
- `discuss` 不可与 `editorEdit`、`resumeGeneration`、`steer` 混用。讨论只允许 inspect_capabilities、list_references、read_reference、read_page 和 ask_user_question；隐藏工具执行也受同一只读检查。
- 已有页面的修改继续提交经过授权的 `editorEdit`。页面/对象锁、快照、expectedPageSha256、范围差异与回滚为最终保护，前端意图识别不代替权限检查。
- 会话转移受既有 `withSessionTransition` 与 busy 检查保护；修改模型仍在同一会话内执行。

## 持久化与恢复

`_agent/assistant-conversation.v1.json` 存储版本 1、当前 mode 及按时间排序的用户消息 `{id, at, text, mode}`。写入使用临时文件和 rename；用户文本复用 publicAssistantDetail 脱敏。模型响应继续以 DSH journal / agent-trace 为事实来源，不建立第二份模型上下文。

`readGenerationActivity` 返回 conversation，前端将用户消息与已有事件按时间合并。打开历史项目时从项目绑定得到 sessionId，无须 URL 含 session/live。讨论与修改的完成状态以当前 agentStatus 和本轮结束事件判定，避免旧故障覆盖新结果。

恢复文稿版本时保留最新对话、会话绑定、故障/等待和追踪状态，恢复文稿及其校验记录。故障带 recovering 标记时不再作为当前失败；内存里的旧故障不得覆盖此标记。

## 渲染与界面

正常协作工作区连接事件流。后台页面渲染使用 `workspace=0&render=1`，不打开持续事件流或轮询，保证 networkidle 和截图能够结束。

界面不再提供模式选择。`POST /slides/assistant-intent` 由当前所选模型读取最近 12 条公开对话和当前文稿状态，返回 discuss / edit / generate 与目标范围；不提供工具，不写文稿。明确只读请求直接采用 discuss。创建入口用 `conversationMode: auto` 执行同一判断。模型错误保留原消息并提供重试，不能静默降级成写入；发送时既有 editorEdit 权限仍独立验证。模型结合原话只解析一次语义范围，客户端把结构化结果映射到实际页面和选区；不得再用正则猜页码覆盖模型结果。 每条新请求未指定范围时默认当前页；背景、SVG、风格或配色等修改内容不隐含全稿范围，已完成任务的范围不自动延续。只有明确承接待执行方案的回复才可沿用其范围。分类器的非 current 输出必须包含来自本轮原话的 scopeEvidence.quote；continuation 还须引用实际历史中的方案范围。服务端核对证据来自输入，否则拒绝执行。证据还必须明确指向页面范围或所选对象；仅复制“改背景色”等无范围的整句不能授权全稿，此时按当前页处理；此证据字段为分类器内部协议，对外仍返回原有 intent/scope/pages。分类器读取所选模型的原生能力，仅在该模型声明 low 推理档时使用该档，并为推理保留 2048 token 上限；没有该档的模型不发送未知推理选项。明确页码集合即使覆盖全文也保持 pages，不额外转换成 deck；后端继续核对集合、修订、hash 与页外修改。模型选择器仅展示已连接供应商的目录，失败后保留输入和会话。产品首页展示最近项目标题/页数，默认长期保留作品；清理必须显式配置或由用户操作。

验收与边界见 [2026-09-20 协作验收](../acceptance/2026-09-20-collaboration.md)。 未指定范围的真实两轮编辑与模型回归见 [默认当前页验收](../acceptance/2026-09-20-default-edit-scope.md)。

## 批注即对话上下文

点击对象、Shift 多选或直接拖框确定范围，在光标附近填写意见；点击空白页可标记整页。浮卡只显示当前目标、输入和添加操作，已有意见为更新/移除。添加后收起，保持批注模式以便连续标记。没有范围选择器、全部批注列表、勾选或解决入口。

每条待发送意见自动出现在 composer 上方，预览展示编号、页码与文字；点击回到原处修改，叉号移除并提供撤销。项目加载时读取所有页，排除 resolved 或 aiStatus=applied 的记录；逐条 revision 缓存阻止旧异步响应恢复已移除意见。意见更新必须携带完整记录，保留锚点、创建时间和状态，因为现有 review PATCH 是记录替换协议。

左侧 composer 是唯一模型执行入口。发送前保存批注的最新编辑草稿，沿用所选模型与补充说明，取得一个批量范围锁、创建一个修改前快照，再发起一个带 editorEdit 的回合。userText 只记录用户意见，不展示内部指令。成功后收起本批意见，失败保留意见与补充要求，从同一个按钮重试。后台保留原审阅记录与安全校验。

浮卡是画布布局之外的非模态 dialog，仅有新建与编辑两个视图。光标按幻灯片归一化坐标保存，编号按批注 ID 定位；滚动、缩放和窗口变化时重新定位并在边缘换边。外部点击或关闭仅收起浮卡，Esc 退出批注并恢复工具栏焦点。Oracle：chrome.comments.list 管理意见预览定位，chrome.comments.select 管理移除/撤销，chrome.comment.pin 管理编号浮卡。

验收见 [批注上下文](../acceptance/2026-09-20-comment-context.md)。此契约覆盖此前的列表/附选/解决流程。


## 多批注的执行和完成校验（2026-09-20）

`reviewScope.items` 是批注集合，`editorEdit.pages` 是唯一页面集合，两者按 pageId 对应，不要求等长。单条批注的对象集合不复制成整页 union；执行时由 presentation-run 的 `reviewWriteTargets` / `reviewWriteTargetForPage` 按页聚合授权，Host 的 edit_elements、工具开放列表和落盘保护使用同一解释。

批量锁 items 保存各意见的不可变 pageBody 基线，同时记录完整文稿的页面哈希与文稿设置。每个被手动编辑的页面先记录当前修订。batch/apply 在项目写锁内验证每条意见至少有目标变化，所有页内变化均在本页授权集合内，未授权页面及文稿设置不变；任一失败返回 409 并保留锁供停止/恢复，只有全部通过才将批注标为 applied。不可用“某页 revision 增加”代替每条意见完成。

[真实模型验收与已发现的失败路径](../acceptance/2026-09-20-comment-real-loop.md)。

## 批注发送回执

批注批量锁创建 _agent/comment-submissions.v1.json 中的 preparing 记录，保存原意见、页面与补充文字。Host 在 /turn 接收时写入用户消息的 reviewSubmissionId，并把这条已落盘消息返回客户端。只有这条消息能证明已接收，锁本身不是发送成功。

客户端在接收回执时清除相应草稿，以消息 id 去重，在落后的轮询结果里保持回执。输入框如果已经发生变化，不得清除。Native 完成接口核对真实范围差异后写入 applied；失败/停止写入对应结果。版本恢复保留此记录与用户对话。前端将结果投影到原消息下，失败重试沿用原指令；从不消费用户新草稿。旧失败的历史结果保留，新的已接收重试接管可操作入口。


## 对话输入与正文（2026-09-20）

正文 Markdown 不继承过程行的隐藏标题与外层滚动样式。普通回复没有过程圆点；列表只来自文本的列表语义。聊天输入的快捷键和中文 IME 不冒泡到画布。发送准备不禁用文本框，回执只消费原草稿，用户的新草稿不会被旧请求清除。完成状态留在对话里，不再由重复重绘弹出旧完成 toast。


## 续聊页数与真实执行状态

Core 的 `conversationPageCount` 从已接受的 generate 消息读取最近明确总页数，覆盖最初 brief 的数量和默认页数。讨论、指定页编辑和“再加两页”不会被误认成新总数。该值只补充既有合稿质量校验，不能绕过视觉检查与 compose seal。

空闲时，只有没有工具调用的回复回合才作为普通 discussion；带工具而尚未完成交付的回合显示 paused 并恢复可继续操作。GET state 与继续接口使用同一 Host 执行投影，仍受会话锁、busy、expectedAttemptId 保护。

二进制导出必须显式携带当前项目，不依赖服务端最近访问项目。真实模型、文件差异和双标签页下载证据见 [对话验收](../acceptance/2026-09-20-assistant-chat.md)。


## 单一对话流与页面范围（2026-09-20）

直接编辑不再向 work-thread 追加另一套用户气泡、工具完成卡与结果卡。Host 的 userMessage 回执进入既有对话流并消费原草稿；既有进度行位于同一个滚动列表，停止仍在输入框。快照与已接收请求关联后，在该回合显示“查看修改前”；该入口只表示可查看修改前的快照，不代表修改已通过校验；错误与重试也归属该回合。新输入不受接收、完成、失败和重试覆盖。版本预览返回时恢复原对话及焦点；刷新后由持久版本与请求标识重建同一条回复下的入口，版本菜单继续提供全部历史。


## 原生提问与发送状态（2026-09-20）

发送按钮立即把本次文本移入同一对话列表并清空本次草稿。clientRequestId 将本地待发送行与 Host 的持久用户消息关联；重复或落后的轮询不能重复显示消息。发送失败留在原消息处，新输入不受清空、接收、失败或完成影响。明确全稿修改直接进入原有快照、页面锁和差异验证流程，不再增加产品确认弹窗。

Slides bundle 加载 DSH 原生 ask_user_question 工具，Host 在原生 user-questions/request waterfall 中仅接管本产品绑定的会话。工具等待用户回答，产品将同一个请求显示为左侧既有对话列表中的表单；提供单选、多选、自定义回答与取消。答案通过 /slides/sessions/:sessionId/questions/:questionId 返回原生等待中的工具，不开启新 Agent 回合。正文不会另起确认弹窗或右侧操作区。

“先选方案，选完直接修改”属于有待补充信息的编辑任务。模型用问题卡取得回答后，在当前授权范围内继续执行；等待回答时不写页面、不消耗前端任务超时预算，范围锁继续续期。纯讨论仍然只读。下次意图判断包含已回答的问题和选择，避免遗忘用户刚刚作出的选择。

_agent/assistant-questions.v1.json 只保存问题、状态、答案与时间，不存 live Agent 或 AbortSignal。页面重载可恢复仍在等待的请求；Host 重启后的孤立请求显示已中断。相同答案可幂等重试，保存失败不返回成功且保持工具等待；取消和停止不推断用户同意。版本回退保留提问记录。

验收见 [左侧对话与原生问题卡](../acceptance/2026-09-20-assistant-questions.md)。


## 对话身份、版本产物与阅读位置（2026-09-20）

原生 DSH 的 journal 继续拥有模型消息；assistant-conversation.v1.json 拥有已接收的用户消息。用户消息的渲染 key 优先使用 clientRequestId，使本地回显→Host 接收→刷新后记录保持同一个节点身份。界面不解析模型正文中的 V18 等字样来创建版本操作。

版本产物保存在既有 .versions/manifest.json：快照建立时记录 assistantRequestId；范围校验及事务收尾时，由 native-web 在释放对应锁前写入 assistantOutcome。generation-activity.assistantArtifacts 是这些事实与用户消息的只读关联投影，“查看修改前”从请求接收起即可稳定显示；assistantOutcome 单独记录校验后的结果，不把链接存在等同于成功。它不是第三套聊天存储。旧版本没有请求标识时，仅由快照保存的完整对话前缀、匹配 authorizationId 的原生 page.edit-authorized 事实，以及期间没有其他快照三者共同恢复；不确定的旧记录继续通过版本菜单访问。回滚不删除版本关系。

过程展开按用户消息/原生 turn 分组，头部与消息共享稳定 keyed reconciliation；不再每次轮询移除并重插全局头部。手动展开选择和阅读锚点是按项目保存的 sessionStorage UI 状态，与业务记录分离。conversation-scroll 记录可见消息 key、像素偏移和最后一次程序写入的 scrollTop，只把偏离写入位置且不是浏览器收缩截断的滚动作为读者输入。流式追加、完成折叠和宽度变化均保持锚点；位于末尾时跟随新内容。回复下的状态/版本动作共用安静的底部空间，完成不会通过移除状态行移动正文。

验收包括真实 DeepSeek 连续修改、刷新后的同一消息/同一快照、版本预览返回、用户原稿内容不变，以及固定 Chromium 中的上翻、折叠、完成、重载、缩放与 reduced-motion。进行中的直接编辑另有跨刷新验收：同源浏览器持久化原请求标识、快照、保护令牌和页面基线，刷新后通过浏览器互斥锁接回同一事务，继续等待、验证、回滚或释放，不重新发送 Agent 请求。多标签页只能有一个收尾执行者；新回复仍进入同一左侧对话流。

### 模型协议恢复（2026-09-21）

供应商已经正常 `stop` 的回复不能仅因 usage 超出本地模型目录容量而被改写成错误，否则已完成的文稿会被误回滚。保留原始 usage；真正的上下文错误，以及输入耗尽窗口且零输出的 length 仍会报错。

`write_page` 在 canonical 校验前仅兼容有限数字出现在原生文本槽位的情况。具有匹配 read_page hash 时，按 elementId 保留当前数字文本的表示，例如 2 对应既有 `"02"`；显式字符串始终原样使用。无匹配基线只使用数字本身的字符串，不恢复旧内容。图表数值、几何、标识符均不转换，object/null/boolean 等错误仍拒绝。反复读取页面不清空同工具的参数错误计数。

只修改页面背景时，Agent 使用 `edit_page_background({pageId, expectedPageSha256, background})`。工具只在当前页/指定页/全文的活跃编辑授权下暴露，不出现在讨论、普通生成或纯元素批注范围中。Host 从权威页面合并背景，复用既有 canonical 写入、页外保护和渲染路径；所有元素及其文本、顺序、样式、备注、动画都由磁盘保留，不经模型转写。陈旧 hash、越页和多余字段均拒绝。
