# Agent 主创、人类纠错：原生操作验收

本轮目标：准确定位问题，完成轻量手工修改，或将明确范围交给 Agent；现有工具逐项可用，连续操作不丢内容。

## 已执行

- macOS Chrome 原生窗口：双击文本，全选替换为英文及数字，光标输入正常。Escape 撤回本次未提交编辑，原文本恢复。
- 原生系统“打开”选择器：插入图片 → 取消 → 返回画布，9 个页面文件 SHA 全部不变。证据 `output/editor-canvas-audit/native-picker-before.json`。
- 取消后再次通过系统选择器定位本轮自有 PNG 并“打开”，成功进入图片属性状态；没有使用浏览器 setFiles 代替该步骤。
- IAB 原生浏览器：新建测试页，输入“人工修改：收入 120 万元”，点击画布缩放按钮提交；磁盘 `10_blank.page` 保存中文及数字。
- 通过键盘只选中 `120`，打开字体二级菜单点 B，只有数字加粗；实际磁盘为 `<p>人工修改：收入 <span style="font-weight:700">120</span> 万元</p>`。

- 部署实例 13080 独立测试稿 `output/agent-first-audit/native-final-correction`：新建第9页，空白右键→设置背景色，属性栏出现并聚焦“页面背景色”；输入 `#eef2ff` 后磁盘一致，撤销并重载恢复 `#FFFFFF`。这是可见字段修改，不冒称操作了系统颜色选择器。
- 部署实例真实两页 Agent 稿：原生点击标题、Shift 点击副标题，输入框上方明确显示“第1页 · 已选2个对象”及两段文字摘要；截图 `output/agent-first-audit/native-multiselect-target.png`。

- 17:49最终静态部署后，13080原生 IAB：右键复制→⌘V、⌘C→右键粘贴、右键剪切→⌘V、外部文本→右键粘贴四条均通过；核对9页 `.page` 的对象 ID、数量、文本和位置。外部粘贴一步撤销/重做，并刷新保留；复制后刷新再粘贴显示明确失效提示，未插入标签文字。证据 `output/agent-first-audit/native-final-clipboard.json`。剪贴板已恢复。
- 固定插入入口在文字隐藏状态均有准确可访问名称：文本、形状、图片、表格、图表、更多。

- 17:52最后布局部署：1100×944实际AI320、缩略图136、stage596、canvas540、zoom56%，无横向溢出；先开AI再选对象自动收起属性，手动展开有效；AI开时右键背景仍聚焦可见字段。几何证据 `output/agent-first-audit/native-final-layout.json`。
- 最终回到用户8页勾股定理稿，仅选择两段标题，目标显示2个对象；未改稿。截图 `output/agent-first-audit/native-final-user-workspace.png`。

## 原生平台边界

- 原生 macOS 中文候选窗口尚未验证。Ctrl+Space 后逐键输入 zhong 仍是 ASCII，无候选窗；CUA 的 SystemUIServer 入口返回 Invalid app，不能伪造系统输入法测试。保留模拟 composition 状态回归的独立证据。
- CUA 不允许直接控制 Codex 应用，因此原生系统选择器使用独立 Chrome 窗口验证。测试窗口已关闭，用户原窗口保留。
- 图片替换的系统弹窗能打开，Escape 后窗口回到编辑器；此分支遇到原生 AX 菜单缓存，不把其状态读取当作完整替换取消持久化证明，另有 headless 边界回归。

本轮已完成以上原生检查。上述平台边界仍单列，不声称系统输入法或跨标签对象剪贴板已全面支持。
