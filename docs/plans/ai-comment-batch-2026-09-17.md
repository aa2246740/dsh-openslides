# AI 批注批量修改（画布批注收件箱）— 契约

日期：2026-09-17
状态：已交付（切片 1–3 全部实现并验收）

## 目标形态（产品决策原文）

> 批注可以选中 dom，在画布里直接加入自己批注信息，然后可以多条批注一次提交给 AI，Agent 根据修改意见去改批注的内容；
> 也可以直接在左侧进行对话，要求 Agent 修改当前页面（默认），或者任何指令（自然、连续对话的能力）

拆成四条：

1. **元素级批注钉在画布上** —— 选中元素 → 就地写批注 → 画布有 pin
2. **多条批注一次提交** —— 勾选 N 条 → 一个 Agent 回合处理掉
3. **Agent 改的是批注指向的内容** —— 批注绑元素锚点 + 页面 revision
4. **左侧自然语言对话** —— 默认作用域当前页，可连续追问，也可给整份文稿级指令

## 冻结决策（本轮用户确认）

| 决策点 | 结论 |
| --- | --- |
| 批量范围 | **允许直接跨页批量**，Agent 自己按页归类 |
| 完成语义 | **回合成功 → 这批批注自动置「已解决」**（`aiStatus: "applied"`） |
| 失败/取消 | 全部保持**未解决**，释放锁，提供重试入口（`chrome.comments.retry`） |
| 跨页守卫 | 跨页批量沿用整份文稿级守卫：显式确认 provider + 受影响页 + 可回滚，不静默执行 |
| 陈旧批注 | 复用既有语义：`commentRevision` 不匹配 → 409 `REVIEW_COMMENT_CONFLICT`；元素锚点内容已变 → `assertReviewScopeCurrent` 拒绝 |

## 现状（实现前）

- 元素级批注 + 画布 pin：**已有**（`commentDraftScope = "elements" | "page"`，有选中自动元素级）
- 单条批注 → AI：**链路完整**（显式 provider 同意 → 保护版本 → 可停止/恢复 → 取消回滚）
- 批量提交：**缺**（每张卡片一个 `[data-act="ai"]`，一次一条）
- 逐项状态机 / 失败重试：**缺**（`chrome.comments.retry` 仍停在 `implemented`）
- 跨页选择：**缺**（面板按页 GET，无项目级收件箱）

两套存储：客户端 `localStorage["oss.comments:<项目>:<页>"]` 与服务端 `/api/reviews`（`_agent/review-threads.v1.json`）。
**SSOT 定为服务端 `/api/reviews`**；localStorage 退化为草稿/缓存。批量提交只认服务端 revision。

## API 增量（切片 1，已实现）

锁本身早就是**项目级**（TTL 15 分钟、`_agent/ai-review-lock.v1.json` 落盘守卫），所以跨页批量不需要新机制，只需把锁里「记录哪一页/哪条批注」从单值扩成列表。

```
POST /api/reviews/ai-lock/batch
  { project, items: [{ pagePath, commentId, commentRevision }] }   # 1..50 条，跨页允许
  200 { ok, token, expiresAt, items: [{ pagePath, commentId, pageRevision, pageSha256 }] }
  409 { code: "REVIEW_BATCH_CONFLICT", stale: [{ pagePath, commentId, reason }] }   # 全有或全无
  409 { code: "AI_REVIEW_LOCKED", lock }
  400 { error }                                                     # 空 items / 超过 50 条

POST /api/reviews/ai-lock/batch/apply   { project, token }   # 成功路径：全部 applied + 释放锁
POST /api/reviews/ai-lock/batch/cancel  { project, token }   # 失败/取消：清 running、保持未解决 + 释放锁
```

守卫文件 v1 兼容：单条锁的字段不变；批量锁额外写 `items[]`（旧读取方忽略未知键）。
单条契约（`/api/reviews/ai-lock` + `commentId`/`workspaceEdit`）**完全不动**。

全有或全无的实现顺序：先在**只读**校验里逐条比对 revision 与元素锚点 → 有任何一条陈旧立即 409 且**零变更** → 再为首条获取项目锁（复用既有 ledger 注册）→ 在锁内**复检全部条目**（缩小竞态窗口）→ 任一条变化则释放锁并返回 stale → 全部通过才把 N 条标记 `running` 并写入 `lock.items`。

## UI 增量（切片 2，未实现）

- 批注面板增加「全部页面」收件箱视图，按页分组列出未解决批注
- 每张卡片加勾选框 + 「全选本页 / 全选全部」+ 一次提交入口
- 提交前守卫面板：provider、受影响页清单、可回滚说明（复用 deck 级确认组件）
- 每项状态：待处理 / 处理中 / 已解决(`applied`) / 失败(可重试)
- 提交时把可选的一句自然语言说明与批注一起送进**同一条** turn 通道

### 新增控件与 oracle 行（dead-button ban）

| 控件 id | 说明 | 需要的 row |
| --- | --- | --- |
| `chrome.comments.select` | 勾选/全选批注 | `docs/editor-oracle/rows/chrome/comments/select/row.json` |
| `chrome.comments.batch.submit` | 批量提交给 Agent | `docs/editor-oracle/rows/chrome/comments/batch/submit/row.json` |
| `chrome.comments.retry` | 失败重试（已有 id，需提 status → verified） | `docs/editor-oracle/rows/chrome/comments/retry/row.json` |

控件 id 必须同时进 `apps/native-web/src/server.mjs` 的 `ORACLE_CONTROLS`，否则命令层拒绝。

## 测试口径

- `apps/native-web/src/review-threads.test.mjs`：跨页批量获取锁（两条记录、守卫文件含两项）、单条陈旧 → 整批拒绝且无任何 `running`、apply → 两条 `applied` 且释放、cancel → 保持未解决且释放
- 家族套件：`editor-ai-workspace-comment-agent.mjs`、`editor-agent-human-audit.mjs`（批注 → 同意 → 停止/恢复链路不得回归）
- 全量：`qa:all` + `qa:editor-toolbars`

## 切片（全部完成）

1. ✅ 服务端批量锁：`/api/reviews/ai-lock/batch`、`/batch/apply`、`/batch/cancel`（带 `error` 时置 failed 可重试）、`GET /api/reviews?all=1` 跨页收件箱；`apps/native-web/src/review-threads.test.mjs` 5 个用例
2. ✅ 收件箱 UI + 勾选 + 批量提交：每卡复选框 + 全选 + 「当前页 / 全部页面」视图 + 左侧输入框提示条「已选 N 条批注 · M 个页面」+ 提交前供应商同意块（含受影响的页数）；跨页提交经 `editorEdit.pages[]` + `reviewScope.items[]`
3. ✅ 逐条状态与重试：`running` / `applied` / `failed(+aiError)` 服务端权威回写，卡片与收件箱行都提供「重试」（`chrome.comments.retry`，已 verified）

## 交付验收

- `node scripts/qa/editor-comment-batch.mjs` → **15 步全绿**
  - 阶段 1（真服务器）：跨页批量取锁（守卫文件 3 条）、二次取锁被拒（`AI_REVIEW_LOCKED`）、apply 三条全部 applied 并释放、revision 过期整批拒绝且零变更
  - 阶段 2（UI，Host 会话打桩）：面板列出批注 → 全选 → 切「全部页面」跨页勾选 → 提示条 3 条 / 2 页 → 供应商同意 → **恰好一个**保护版本 → **一个** 回合携带 `pages[]=2`、`reviewScope.items[]=3` → apply 后全部 applied 且守卫文件 3 条
  - 阶段 3：故意回合失败 → 批注 `failed`（记录原因）且释放锁 → 卡片出现重试 → 重试派发新回合并 applied
- Host 侧：`editorReviewScopesFromEdit` 支持 `reviewScope.items[]`（与 `editorEdit.pages[]` 一一对应、逐页校验 revision/sha、拒重复页/重复批注），单条契约逐字节不变；`packages/dsh-slides-host` 238 个测试全过
- oracle：`chrome.comments.select`（EO-COMMENTS-002）与 `chrome.comments.retry`（EO-COMMENTS-001）均为 `verified`；`ORACLE_CONTROLS` 已含 `chrome.comments.select`，dead-button 门禁 `verify-native-editor` 120/0

### 打桩边界（诚实说明）

scratch fixture 没有 DSH 生成账本，服务器按设计返回 `pageRevision: null`，浏览器因此拒绝派发真实回合（单条路径同样如此）。所以阶段 2/3 只桩掉 Host 会话端点与「这两页的 revision/sha 数值」；真实零件的覆盖在阶段 1（真锁/真 apply/真陈旧拒绝）与各家族套件里。
