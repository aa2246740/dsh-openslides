# Kimi Slides — 完整 PRD、逐帧证据与高保真原型

本交付包基于 123.584 秒原视频的 3,703 帧分析，覆盖创建、参考文件、Agent 生成、编辑、图表/SmartArt、自然语言改稿、评论、版本、图片重建与 PowerPoint 导出。

| 路径 | 内容 |
|---|---|
| `Kimi_Slides_PRD.md` | 完整产品、设计、动效、架构与验收规格 |
| `Kimi_Slides_Complete_PRD.docx` | 排版后的 Word 版 PRD |
| `Kimi_Slides_Complete_PRD.pdf` | 视觉核验后的 PDF 版 |
| `FRAME_BY_FRAME_ANALYSIS.md` | 34 个关键状态的逐帧证据索引 |
| `prototype/` | 可运行的高保真 React 原型 |
| `prototype/design-qa.md` | 视觉对照与交互 QA 记录 |
| `analysis/source-truth/` | 34 张关键原片帧 |
| `analysis/contact-sheets/` | 每秒时间轴与关键帧联系表 |
| `source-video/` | 原视频 |
| `transcript/` | SRT/VTT/Whisper 时间戳与清洗稿 |

## 运行原型

```bash
cd prototype
npm install
npm run dev
```

开发端口为 `4173`。主流程：创建页 → 上传参考/选择模板 → Agent 生成 → Edit → 分栏编辑器 → 评论/版本/播放/分享/导出。

## 复刻实施顺序

1. 先读 PRD 第 0–7 章，确定范围、证据等级与设计系统。
2. 对照 `FRAME_BY_FRAME_ANALYSIS.md` 和 `analysis/source-truth/` 实现状态与动效。
3. 按第 8–11 章实现统一 PPTD 文档模型、Agent 命令和可编辑 PPTX 导出。
4. 按第 19–20 章做验收和跨格式测试。

打包日期：2026-08-04。
