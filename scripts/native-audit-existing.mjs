#!/usr/bin/env node
/**
 * Re-audit an existing PPTD project after a renderer or review-gate upgrade.
 * Starts a fresh Pi context, so exact OpenKimi reads and image receipts cannot
 * be borrowed from an older model context.
 */
import fs from "node:fs";
import path from "node:path";
import {
  createPiBrain,
  inspectRunLedger,
  runGenerateAsync,
} from "../packages/agent-harness/dist/index.js";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const projectRoot = path.resolve(option("--project") || "");
if (!option("--project") || !fs.existsSync(projectRoot)) {
  console.error("usage: node scripts/native-audit-existing.mjs --project <dir> [--brief-file <file>] [--provider <id>] [--model <id>]");
  process.exit(2);
}

const runtimeFile = path.join(projectRoot, "_agent", "runtime.json");
const runtime = fs.existsSync(runtimeFile)
  ? JSON.parse(fs.readFileSync(runtimeFile, "utf8"))
  : {};
const briefFile = option("--brief-file");
const originalBrief = briefFile
  ? fs.readFileSync(path.resolve(briefFile), "utf8")
  : String(runtime.brief || fs.readFileSync(path.join(projectRoot, "_agent", "brief.txt"), "utf8"));
const prior = inspectRunLedger(projectRoot);
const pageIds = prior.pages.map((page) => page.pageId);
if (!pageIds.length) {
  console.error("existing project has no page revisions in the run ledger");
  process.exit(2);
}

const auditDirective = [
  "",
  "【当前成品的强制复审，不是从头生成】",
  "磁盘里已有完整 PPTD 页面。渲染器和结构门禁刚升级，旧截图与旧审查凭证已失效。",
  "先在这个全新 Pi 上下文中逐块读取所有 required OpenKimi 原文。不得借用旧摘要。",
  `现有页面 ID：${pageIds.join(", ")}`,
  "不要重做或套模板。对每个现有 pageId 调 render_page，实际查看返回的 PNG，再用对应 delivery token 调 review_page。",
  "重点检查 p01-cover 的茶杯图标、p10-cash 的真实正负瀑布和 p18-risks 的可能性×财务影响散点矩阵及标签避让。",
  "只有看到真实视觉问题时才 write_page 修改对应页；改后必须重新 render_page 和 review_page。未发现问题的页不要重写。",
  "最后调用 review_pages 执行当前结构门禁，再调用 compose_deck。任何门禁未过都不得声称完成。",
].join("\n");
const brief = `${originalBrief.trim()}\n${auditDirective}`;
const provider = option("--provider") || "xai-auth";
const model = option("--model") || "grok-4.5";
const editorBaseUrl =
  option("--editor-url") ||
  String(runtime.editorBaseUrl || process.env.SLIDESTUDIO_EDITOR_URL || "http://127.0.0.1:55200");

const brain = createPiBrain({
  designSystemId: String(runtime.designSystemId || "consulting/pine-green-strategy"),
  categoryId: String(runtime.categoryId || "management-report"),
  editorBaseUrl,
  provider,
  model,
  fallback: false,
  requireProductLogin: true,
  onRuntimeEvent(event) {
    process.stdout.write(`${JSON.stringify({ type: "runtime", event })}\n`);
  },
});

const result = await runGenerateAsync({
  projectRoot,
  brief,
  brain,
  exportPptx: false,
  onStep(step, index) {
    process.stdout.write(`${JSON.stringify({ type: "step", index, step })}\n`);
  },
});
const final = {
  type: "done",
  status: result.status,
  usedPi: brain.usedPi,
  provider,
  model: brain.model,
  sessionId: brain.sessionId,
  composeSource: result.composeSource,
  fallbackReason: result.fallbackReason,
  ledger: inspectRunLedger(projectRoot),
};
process.stdout.write(`${JSON.stringify(final)}\n`);
if (result.status !== "ready" || !final.ledger.composeReady || !final.ledger.composed) {
  process.exit(1);
}
