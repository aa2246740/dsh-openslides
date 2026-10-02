# 编辑画布重构与验收 · 2026-09-06

## 用户要求

全面检查主按钮和二级菜单；解决表格/透明度混淆、批注重复；批注绑定具体元素并交给 Agent 修改。
设计和验收由 root 负责，用户授权的 Luna workers 分别负责控件清单、界面实现、批注数据契约。

## 已确认的原始问题

1. 插入表格和修改不透明度是不同命令，但不透明度用了类似表格的网格图标。图片与图标属性也复用该图标。
2. 选中对象上方及底部同时出现批注，均只切换模式，没有直接打开所选对象的反馈表单。
3. 1100px 宽视窗中，选中对象工具条和透明度弹层超出右边界。
4. 原批注只有客户端元素 ID，无持久页面版本/SHA，应用状态可由客户端自行写入。
5. 二级属性的字号、字距、高亮等只有数字/色块，缺少可见名称。

原生截图：`output/editor-canvas-audit/01-before-empty-selection.png`、`02-before-text-selection.png`、
`03-before-opacity-popover.png`、`04-before-comment-target.png`。完整源码盘点见
`docs/qa/editor-canvas-controls-inventory.md`；其中“现有证据”指此前测试，不能替代改版后的验收。

## 本轮验收记录

- 持久化事务范围保护：已通过 11 项定向测试，包含非目标元素、页面元数据、图层顺序、其他页面的写入前拒绝；拒绝后实际文件逐字不变；合法单选、多选、页面及整稿范围；当前 SHA 前提；文稿标题保持。
- presentation-run 回归：207/207 通过，日志 `output/editor-canvas-audit/presentation-run-tests.log`。
- 前端候选 63/63、批注接口 23/23、PPTD 63/63、Host 169/169 通过。
- 控件行为 1428 项、形状/图标/表格面板 339 项断言全部通过；覆盖全部 36 种表格尺寸。Office 完整流程 15 步、102 个控件，0 浏览器错误，生成 PPTX 和 PNG。详见 `output/qa-editor-canvas-controls/` 和 `output/qa-office-editor/report.json`。
- 原生浏览器已验证表格插入、属性修改、撤销重做、保存重载、备注持久化、真实全屏进入及退出。首次真实 Agent 修改因整页复制错误及超时失败，已自动恢复且页面逐字不变。新增 `edit_elements` 精确更新工具后，第二轮真实 AMD / DeepSeek-V4-Flash 已成功；实际调用该工具并 render_page，服务端记录 applied，原生界面显示 AI 已修改，重载后保持。对页面做完整结构比较，唯一变化是 el-03.content.text；其他字段逐一相同。证据：`second-real-comment-diff.json`、`second-real-comment-activity.json`、`08-real-comment-applied.png`。

## 实例与数据边界

源码：`/Users/wu/Documents/ChatGPT/openslides/latest`。
实际产品：`/Users/wu/orca/projects/openkimi-slides`，13080/55200，独立启动。
本轮侵入性控件测试使用临时项目；root 原生测试使用 55482 独立副本。
真实 Agent 验收使用此前专门创建的虚构单页测试项目 `92f628e5-efd3-4b6f-8648-4c9483445f87`。
用户已完成的 8 页勾股定理文稿保留。

## 部署验收发现

部署时遗漏 `generation-process.js` 导致模块 named export 不匹配，原生入口未加载。已补齐同步清单及模块，实际重新载入并完成上述真实 Agent 流程。最终截图发现元素批注标记默认位于文本框中心，视觉上远离文字；已改为绑定对象右上角，并让点击标记高亮完整绑定对象集合。目标缺失时明确失效，不重新绑定。最终同步后，原生浏览器已确认标记位于标题边缘、点击准确选中 el-03、已应用状态及文字保留；截图 `output/editor-canvas-audit/09-final-bound-element.png`。

## 后续边界检查

补测发现危险 URL 可持久化、单格合并产生无意义 span、重叠合并产生相交 span；已修复前后端校验；危险链接、单格及重叠合并均在写入前拒绝，验证页面 SHA 不变。完整包含旧合并区域则重建单一合并。拒绝时显示可读提示，保持当前选区及菜单。

## 可用性约束

- 插入工具固定在顶部；选中对象只更新右侧属性，不交换表格与透明度含义。
- 批注面板为唯一入口，元素批注保留对象 ID 与页面版本，卡片显示对象文字摘要。
- Agent 执行期间可停止，失败恢复后从服务端刷新状态；写入完成不等同于模型口头宣布成功。
- 元素范围只向模型发布 `edit_elements`，整页/整稿范围保留 `write_page`；二者共享 canonical 页面持久化。
- 当前未启用的动画创作不计为已实现按钮；原生 PowerPoint 打开和系统剪贴板权限拒绝不在已通过证据中。

枚举补测包含 27 字体、5 行距、177 形状和 289 调节点；调节点最终逐项核对 HTTP 请求参数、返回模型和测试项目 .page 文件，另有撤销/重做/重载检查。

最终部署：`output/editor-canvas-backup-20260906-150840`，8 个变化文件保存了回滚备份；独立服务 13080/55200 已重启。元素批注真实成功后写入锁已释放。canvas-session 36/36；补充边界 19/19，证据已复制到 `output/editor-canvas-audit/editor-canvas-boundaries-ledger.json`。

最终 Office 回归再次通过：15 步、102 个 exercisedControls、0 浏览器错误，`output/qa-office-editor/report.json`。图片替换取消等 remaining-boundaries 5/5。用户原有 8 页勾股定理项目已在原生浏览器重新载入，显示全部 8 页。
