# WebBridge oracle smoke — 2026-08-07 (updated)

**Session:** `native-oracle-smoke`（标签组「Native oracle 烟测」）  
**Tool:** Kimi WebBridge @ `127.0.0.1:10086`  

## Auth status

| Step | Result |
|------|--------|
| Anonymous open `/slides` | Create Hub OK; send → **login wall** |
| After user login (吴松斌 visible, no「登录」btn) | Create Hub OK |
| Send PPT generate (K3 进阶) | **BLOCKED**: 「和Kimi聊天的人太多啦，订阅会员可进入独立的优先队列」 |
| Switch model to「快速」then send | Left PPT hub → **normal chat** (not slide editor) |
| Open history「未命名会话」 | Normal chat only, no canvas |

**Conclusion:** Free logged-in account can browse Create Hub + style chips, but **cannot enter PPT editor / generate deck** under current load without membership (or free queue capacity). Editor dual-channel capture is **blocked** until membership **or** free queue succeeds **or** an existing editable PPT project URL is available.

## Screenshots

| File | Content |
|------|---------|
| `01`–`04` | Pre-login Create Hub + login wall |
| `05-logged-in-hub.png` | Logged-in Create Hub |
| `06-after-generate-click.png` | Pre-login send → login |
| `07-open-unnamed-session.png` | Chat history (not PPT editor) |
| `08-slides-logged.png` | Logged-in hub |
| `09-model-picker.png` | Model menu: 快速 / K3 / K3 集群 |
| `10-queue-again.png` | Queue / upgrade tip |
| `11-fast-model-send.png` | 快速 → chat, not slides |
| `12-ppt-k3-retry.png` / `12b-queue.png` | K3 PPT send → queue wall again |

## Create Hub controls catalogued (no editor)

- Topic textbox, style「自由风格」+「选择配色」
- Categories: 全部 / 自定义 / 战略咨询 / 金融投资 / 工作汇报 / 宣传推广 / 学术研究  
- Theme chips (30+)  
- Model picker: 快速 / K3 / K3 集群 + 思考强度 进阶 / 对话长度 标准  
- Send `.send-button-container`  
- Sidebar product chrome (out of editor 1:1 claim)

## APIs observed

- `POST …/kimi.gateway.slides.v1.SlidesService/ListStyles` (200)
- `POST …/kimi.gateway.chat.v1.ChatService/Chat` (connect+json) on generate path
- CDN: `kimi-img.moonshot.cn/pub/slides/…`

## Offline native path (no Kimi)

Same brief still works:

```bash
npm run native:generate -- "一页封面：产品路线图" -o ./output/webbridge-compare
# → deck.pptd + deck.pptx without login/subscription
```

## Paths to unlock full editor oracle

1. **Subscribe** Kimi membership (priority queue) — only if you want free iframe capture of full editor.  
2. **Retry free** off-peak — queue tip may be capacity, not hard paywall.  
3. **Open an existing PPT project** if account already has one (share URL with agent).  
4. **open-kimi-ppt skill** on dev machine for PPTD examples + optional serve (no product subscription).  
5. Continue native implement from fixtures + partial Create Hub oracle (current path).

## Product note

Open SlideStudio production **must not** depend on Kimi login or membership. This capture is **dev oracle only**.
