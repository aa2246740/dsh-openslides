#!/usr/bin/env node
/** Offline vertical smoke: generate + export without network. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGenerate } from "../packages/agent-harness/dist/index.js";
import { exportProjectToPptx, validateExportReport } from "../packages/exporter-native/dist/index.js";
import { openSession, selectElement, setSelectedText, persist } from "../packages/canvas-session/dist/index.js";
import { loadProject } from "../packages/pptd-v2/dist/index.js";

function assertExport(result, { minSlideCount = 1, label }) {
  const validation = validateExportReport(result.report, { minSlideCount });
  if (!validation.ok) {
    console.error(`${label} export report invalid: ${validation.reason}`, result.report);
    process.exit(1);
  }
  if (result.data[0] !== 0x50 || result.data[1] !== 0x4b) {
    console.error(`${label}: not a zip pptx`);
    process.exit(1);
  }
  if (typeof result.report.nativeCoverage !== "number" || result.report.nativeCoverage <= 0) {
    console.error(`${label}: nativeCoverage missing or zero`, result.report.nativeCoverage);
    process.exit(1);
  }
  return validation.report;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-smoke-"));
const gen = runGenerate({
  projectRoot: dir,
  brief: "烟测：离线生成与导出",
});
if (gen.status !== "ready") {
  console.error("generate failed", gen);
  process.exit(1);
}

const session = openSession(dir, {
  allowedControlIds: ["element.text.content.set"],
});
selectElement(session, "title");
setSelectedText(session, "element.text.content.set", "烟测标题");
persist(session);

const project = loadProject(dir);
const exp = await exportProjectToPptx(project);
assertExport(exp, { minSlideCount: project.pages.length, label: "smoke" });
// Also smoke real open-kimi recovered fixture (offline)
const yu7 = path.resolve("fixtures/okp-yu7-ppt");
const yu7Project = loadProject(yu7);
const yu7Exp = await exportProjectToPptx(yu7Project);
assertExport(yu7Exp, { minSlideCount: 6, label: "yu7" });

console.log(
  JSON.stringify({
    ok: true,
    pages: project.pages.length,
    pptxBytes: exp.report.bytes,
    exportOk: exp.report.ok,
    coverage: exp.report.nativeCoverage,
    yu7: {
      pages: yu7Project.pages.length,
      pptxBytes: yu7Exp.report.bytes,
      exportOk: yu7Exp.report.ok,
      coverage: yu7Exp.report.nativeCoverage,
      degradations: yu7Exp.report.degradations.length,
    },
  }),
);
