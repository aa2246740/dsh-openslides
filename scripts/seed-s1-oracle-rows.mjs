#!/usr/bin/env node
/**
 * Seed S1 chrome + S4 insert-bar discovered/implemented rows from the
 * 2026-08-14 official iframe observe pass. Idempotent overwrite of row.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROWS = path.join(ROOT, "docs/editor-oracle/rows");
const NOW = "2026-08-14T12:00:00.000Z";

function writeRow(rel, data) {
  const dir = path.join(ROWS, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "row.json"), JSON.stringify(data, null, 2) + "\n");
}

function base(partial) {
  return {
    version: 1,
    preconditions: {
      fixtureId: "okp-yu7-ppt",
      pageIndex: 0,
      selection: { kind: "none" },
    },
    action: { type: "click", steps: ["Click the control in official neo-ppt iframe"] },
    evidence: {
      screenshots: { before: "shots/before.png", after: "shots/after.png" },
      pptd: { summary: "UI chrome; document change only if mustChangeDocument" },
    },
    oracle: {
      source: "kimi-iframe",
      capturedAt: NOW,
      agent: "oracle-compare-s1-discover",
      sessionId: "iframe-compare-2026-08-14",
    },
    updatedAt: NOW,
    ...partial,
  };
}

const implemented = [
  {
    rel: "chrome/history/undo",
    data: base({
      id: "chrome.history.undo",
      status: "implemented",
      surface: "chrome.global",
      title: "撤销",
      description: "Official second toolbar left of redo. Native undo stack.",
      kimiUi: { controlLabel: "撤销", location: "second toolbar", appearsWhen: "always; disabled when empty" },
      expectedNative: { mustChangeDocument: true, commandHint: "undo" },
      test: { id: "EO-CHROME-001", automated: true, selfTestChecklist: ["undo restores prior PPTD snapshot"] },
    }),
  },
  {
    rel: "chrome/history/redo",
    data: base({
      id: "chrome.history.redo",
      status: "implemented",
      surface: "chrome.global",
      title: "重做",
      kimiUi: { controlLabel: "重做", location: "second toolbar", appearsWhen: "after undo" },
      expectedNative: { mustChangeDocument: true, commandHint: "redo" },
      test: { id: "EO-CHROME-002", automated: true, selfTestChecklist: ["redo reapplies undone snapshot"] },
    }),
  },
  {
    rel: "chrome/zoom/in",
    data: base({
      id: "chrome.zoom.in",
      status: "implemented",
      surface: "chrome.global",
      title: "放大画布",
      kimiUi: { controlLabel: "+", location: "second toolbar right", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; zoomPercent only" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "zoomBy in" },
      test: { id: "EO-CHROME-003", automated: true, selfTestChecklist: ["zoomBy in raises zoomPercent by 10"] },
    }),
  },
  {
    rel: "chrome/zoom/out",
    data: base({
      id: "chrome.zoom.out",
      status: "implemented",
      surface: "chrome.global",
      title: "缩小画布",
      kimiUi: { controlLabel: "−", location: "second toolbar right", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; zoomPercent only" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "zoomBy out" },
      test: { id: "EO-CHROME-004", automated: true, selfTestChecklist: ["zoomBy out lowers zoomPercent by 10"] },
    }),
  },
  {
    rel: "chrome/pages/rail/toggle",
    data: base({
      id: "chrome.pages.rail.toggle",
      status: "implemented",
      surface: "chrome.pages",
      title: "打开/关闭页轨",
      kimiUi: { controlLabel: "页面网格", location: "second toolbar left", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; pageRailOpen only" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "setPageRailOpen" },
      test: { id: "EO-CHROME-005", automated: true, selfTestChecklist: ["toggle flips pageRailOpen"] },
    }),
  },
  {
    rel: "chrome/pages/add",
    data: base({
      id: "chrome.pages.add",
      status: "implemented",
      surface: "chrome.pages",
      title: "新建页面",
      kimiUi: { controlLabel: "新建页面", location: "page rail footer", appearsWhen: "page rail open" },
      expectedNative: { mustChangeDocument: true, commandHint: "addBlankPage" },
      test: { id: "EO-CHROME-006", automated: true, selfTestChecklist: ["addBlankPage appends empty page and persists"] },
    }),
  },
  {
    rel: "chrome/export/open",
    data: base({
      id: "chrome.export.open",
      status: "implemented",
      surface: "chrome.export",
      title: "导出入口",
      description: "S1: open/trigger export. Full S2 dialog still discovered separately.",
      kimiUi: { controlLabel: "导出", location: "top bar right", appearsWhen: "always" },
      expectedNative: { mustChangeDocument: false, commandHint: "exportProjectToPptx" },
      test: { id: "EO-CHROME-007", automated: true, selfTestChecklist: ["export endpoint returns pptx bytes"] },
    }),
  },
  {
    rel: "chrome/present/play",
    data: base({
      id: "chrome.present.play",
      status: "implemented",
      surface: "chrome.global",
      title: "播放 / 预览",
      kimiUi: { controlLabel: "播放", location: "top bar right", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; presenting flag" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "setPresenting" },
      test: { id: "EO-CHROME-008", automated: true, selfTestChecklist: ["setPresenting true sets model.presenting"] },
    }),
  },
  {
    rel: "chrome/present/fullscreen",
    data: base({
      id: "chrome.present.fullscreen",
      status: "implemented",
      surface: "chrome.global",
      title: "全屏",
      kimiUi: { controlLabel: "全屏", location: "top bar right", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; browser fullscreen" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "requestFullscreen" },
      test: { id: "EO-CHROME-009", automated: false, selfTestChecklist: ["fullscreen button requests document fullscreen"] },
    }),
  },
  {
    rel: "chrome/notes/toggle",
    data: base({
      id: "chrome.notes.toggle",
      status: "implemented",
      surface: "notes",
      title: "显示演讲者备注",
      kimiUi: { controlLabel: "显示演讲者备注", location: "below canvas", appearsWhen: "always" },
      evidence: {
        screenshots: { before: "shots/before.png", after: "shots/after.png" },
        pptd: { summary: "no document change; notesOpen only" },
      },
      expectedNative: { mustChangeDocument: false, commandHint: "setNotesOpen" },
      test: { id: "EO-CHROME-010", automated: true, selfTestChecklist: ["setNotesOpen flips notesOpen"] },
    }),
  },
];

const discovered = [
  {
    rel: "chrome/pages/delete",
    data: base({
      id: "chrome.pages.delete",
      status: "discovered",
      surface: "chrome.pages",
      title: "删除页面",
      kimiUi: { controlLabel: "删除页", location: "page rail context", appearsWhen: "page selected; not last page" },
      expectedNative: { mustChangeDocument: true, commandHint: "deletePage" },
      test: { id: "EO-PAGE-002" },
    }),
  },
  {
    rel: "chrome/pages/duplicate",
    data: base({
      id: "chrome.pages.duplicate",
      status: "discovered",
      surface: "chrome.pages",
      title: "复制页面",
      kimiUi: { controlLabel: "复制页", location: "page rail context", appearsWhen: "page selected" },
      expectedNative: { mustChangeDocument: true, commandHint: "duplicatePage" },
      test: { id: "EO-PAGE-003" },
    }),
  },
  {
    rel: "chrome/pages/reorder",
    data: base({
      id: "chrome.pages.reorder",
      status: "discovered",
      surface: "chrome.pages",
      title: "拖拽重排页面",
      action: { type: "drag", steps: ["Drag page thumb in official rail"] },
      expectedNative: { mustChangeDocument: true, commandHint: "reorderPages" },
      test: { id: "EO-PAGE-004" },
    }),
  },
  {
    rel: "chrome/zoom/percent",
    data: base({
      id: "chrome.zoom.percent",
      status: "discovered",
      surface: "chrome.global",
      title: "缩放百分比 / 适应",
      kimiUi: { controlLabel: "81%", location: "second toolbar right", appearsWhen: "always" },
      test: { id: "EO-CHROME-011" },
    }),
  },
  {
    rel: "insert/text",
    data: base({
      id: "insert.text",
      status: "discovered",
      surface: "insert",
      title: "插入文本",
      kimiUi: { controlLabel: "T", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-001" },
    }),
  },
  {
    rel: "insert/shape",
    data: base({
      id: "insert.shape",
      status: "discovered",
      surface: "insert",
      title: "插入形状",
      kimiUi: { controlLabel: "形状", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-002" },
    }),
  },
  {
    rel: "insert/image",
    data: base({
      id: "insert.image",
      status: "discovered",
      surface: "insert",
      title: "插入图片",
      kimiUi: { controlLabel: "图片", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-003" },
    }),
  },
  {
    rel: "insert/table",
    data: base({
      id: "insert.table",
      status: "discovered",
      surface: "insert",
      title: "插入表格",
      kimiUi: { controlLabel: "表格", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-004" },
    }),
  },
  {
    rel: "insert/chart",
    data: base({
      id: "insert.chart",
      status: "discovered",
      surface: "insert",
      title: "插入图表",
      kimiUi: { controlLabel: "图表", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-005" },
    }),
  },
  {
    rel: "insert/more",
    data: base({
      id: "insert.more",
      status: "discovered",
      surface: "insert",
      title: "插入更多",
      kimiUi: { controlLabel: "…", location: "bottom insert pill", appearsWhen: "always" },
      test: { id: "EO-INSERT-006" },
    }),
  },
];

for (const row of [...implemented, ...discovered]) writeRow(row.rel, row.data);

const indexPath = path.join(ROOT, "docs/editor-oracle/catalog/index.yaml");
const extra = [
  ...implemented.map((r) => r.data),
  ...discovered.map((r) => r.data),
];
let yaml = fs.readFileSync(indexPath, "utf8");
for (const row of extra) {
  if (yaml.includes(`id: ${row.id}\n`)) continue;
  yaml += `  - id: ${row.id}\n    path: rows/${row.rel}\n    status: ${row.status}\n    testId: ${row.test.id}\n    surface: ${row.surface}\n`;
}
fs.writeFileSync(indexPath, yaml);
console.log(`seeded ${extra.length} S1/S4 rows`);
