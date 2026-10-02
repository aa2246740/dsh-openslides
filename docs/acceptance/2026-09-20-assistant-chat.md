# 2026-09-20 · 对话输入与回复可读性验收

本次针对模式选择、回复难读、重复完成提示和输入中断。代码已加载到独立产品：编辑器 55201、Host 13081；主 DSH 43127 未重启。用户的 `deck-74021fe2` 原文稿三份文件哈希与修改前一致。

## 问题与修复

| 问题 | 根因与处理 |
| --- | --- |
| 粗体内容缺字，普通回复前有多余圆点 | 原 CSS 把回复里所有 strong 隐藏了。现在只隐藏过程标题栏，正文粗体正常显示，普通回复没有过程圆点。 |
| 项目符号和滚动奇怪 | 外层事件列表的 ol 规则影响了 Markdown 有序列表。滚动规则收窄到外层 ID，正文列表使用正常语义样式。表格也按表格渲染。 |
| 过程叙述淹没最终回复 | 工具调用前的过程说明收进“思考与过程”，每轮最终回答保留在对话里，展开后仍可查看过程。 |
| 输入时出现旧的“已生成两页”提示 | 重绘读取旧完成状态后反复弹 toast。删除这个渲染副作用，完成信息保留在对话状态中。 |
| 输入中断或新草稿消失 | 聊天输入不再触发画布快捷键；保护 IME Enter；等待模型判断时保持可输入。接收回执只清除原草稿，保留之后输入的内容并保持焦点。 |
| Agent 已停下但仍显示生成中 | 根据 Host 实际 busy/idle 和最新回合结束事件恢复状态；未完成的生成允许继续，不误报成功。继续接口使用与状态接口相同的执行投影。 |
| 模式选择增加理解成本 | 首页和编辑器移除“自动/讨论/修改”。所选模型结合公开对话判断本轮意图，明确只读请求仍有服务端约束；写入继续使用既有范围锁和版本保护。 |
| 续聊“两页”仍被最少四页拦住 | 合稿读取已接受的生成对话中的最新总页数，支持中文短答；编辑、讨论中的页码不改变总页数。未指定时的默认质量要求保留。 |
| 多标签页下载到另一份文稿 | 二进制下载绕过普通 API 的项目参数注入。导出请求现在明确携带当前项目。 |

## 真实模型与原生浏览器验收

使用新建的合成会话 `8a06f686-44e6-4b32-b9f1-e59202c13e1c`，模型 `opcode / deepseek-v4.1-flash`。主题是城市观星，仅一般常识，不联网。交互由 Codex 原生 Browser 完成。

1. 先要求询问页数；模型询问后直接回答“两页”。模型自动进入生成并写出两页，无模式选择。
2. 此真实测试暴露了旧页数门槛和恢复接口状态不一致。修复、构建并激活后，从界面继续同一会话，完成定稿和导出。两处失败与后续恢复保留在测试会话中，未伪造成功记录。
3. 自然提问“能解释一下你给这份 PPT 选的配色吗？用两句中文回答。”模型自动讨论。输入回执后清空、焦点保留；收到正常段落回复，文稿总哈希和两页文件哈希不变。
4. 再说“把第2页的标题改成‘城市观星的五项准备’，其他内容不变。”模型自动进入指定页修改。画布切到第 2 页，真实文件差异只有 body-title 的一行 text；第 1 页和 deck.pptd 完全不变。
5. 修改时输入“修改过程中也能写下一条，先不发送。”完成后新草稿仍在，输入框 enabled，编辑器已解锁，版本为 V2。
6. 保持用户原文稿同时打开，从测试稿的导出菜单下载；文件名为“城市观星入门.pptx”。对同一项目导出结果解包验证：2 页、coverage 1、0 处降级，新标题存在于 slide2.xml。

![真实续聊及输入](assets/2026-09-20-assistant-chat/real-chat-final.png)

![指定页修改完成且保留新草稿](assets/2026-09-20-assistant-chat/scoped-edit-complete.png)

![同时打开两份文稿时导出当前项目](assets/2026-09-20-assistant-chat/correct-project-export.png)

## 可复核证据

证据目录：`output/assistant-chat-acceptance-2026-09-20/`。

- `real-generation-final.json`：真实运行 delivered、composed/exported、无 blockers；首份 PPTX 80,301 字节，2 页，原生文本节点 7 / 18，无降级。
- `real-intent-matrix.json`：真实模型对全稿换风格、指定第 2 页、所选对象、只读建议四种请求判断全部符合预期。该检查只判断意图，不执行修改。
- `real-readonly-proof.json`：自然提问被记录为 discuss，前后文稿哈希一致。
- `scoped-edit.diff` / `scoped-edit-proof.json`：唯一变化为第 2 页标题文字，其余字节不变。
- `edited-export-proof.json` / `城市观星入门-修改后.pptx`：修改后的实际导出，80,262 字节，SHA-256 `b333c3fb5d7361d52b866f267050e83a6f7c954a4137a6158336235009158d42`。
- `user-document-before.json` / `user-document-after.json`：原文稿三份文件逐字节稳定。
- `composer-dom-proof.json`：1440 / 877 / 390 宽度无页面或聊天横向溢出，粗体可见，列表样式正常，输入框位置可点击且不被正文覆盖，无页面 JS 错误。

原会话历史的模型测试被自动审批拒绝，原因是外发既有历史的授权不足；随后模型测试全部改用上述新建合成会话。用户原文稿仅做本地只读检查和界面加载。

## 自动回归

浏览器自动化使用全局固定 Playwright 1.61.1 / Chromium Headless Shell 1228；未使用系统 Chrome 或其他 Harness 的浏览器。

| 检查 | 结果 |
| --- | --- |
| Host：host、assistant-conversation、assistant-intent、routes-resume | 111 / 111 通过 |
| Core：compose-ir、conversation-requirements | 15 / 15 通过 |
| 聊天单元与 DOM：assistant-conversation、chat-markdown、assistant-composer-dom | 7 / 7 通过 |
| generation-process-dom | 5 / 5 通过 |
| comment-selection-dom | 1 / 1 通过，保留 Esc 退出批注 |
| export-project-dom | 1 / 1 通过，两标签页实际下载并解包 PPTX 验证内容 |

DOM 测试覆盖延迟意图判断、延迟接收回执、回复期间输入、失败保留草稿、Enter/Shift+Enter、IME isComposing/keyCode 229、刷新恢复历史和模型、工作区续生成实时更新页面。旧 CSS 对照会在粗体隐藏断言失败，当前 CSS 通过。

![窄屏排版，使用固定测试回复](assets/2026-09-20-assistant-chat/readable-390.png)

此轮未声称覆盖所有模型或整个仓库测试集；原生验收使用 DeepSeek，IME 是键盘事件回归，未做 macOS 输入法候选窗的端到端验收。
