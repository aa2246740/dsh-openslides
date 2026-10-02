#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPlaybookBrain, runGenerateAsync } from "../../packages/agent-harness/dist/index.js";
import { loadProject } from "@open-slidestudio/pptd-v2";
import {
  classifyBriefKind,
  inferDeckIntent,
} from "../../packages/presentation-run/dist/domain/compose-ir.js";
import { createPageRasterPort } from "../../packages/presentation-run/dist/domain/page-raster.js";
import { kindThemePackIssue } from "../../packages/presentation-run/dist/domain/theme-pack.js";
import { directorBrief } from "../../packages/dsh-slides-host/dist/director-brief.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = path.join(ROOT, "fixtures", "briefs", "office-acceptance");
const OUT = path.resolve(
  process.env.QA_SCENARIO_OUT || path.join(ROOT, "output", "qa-office-scenarios", "latest"),
);

const SCENARIOS = [
  {
    id: "management-monthly",
    file: "management-monthly.md",
    kind: "retail-monthly",
    intent: "report",
    design: "work/warm-jade-annual-report",
    category: "management-report",
    minPages: 4,
    director: /Plan about 7 pages/,
  },
  {
    id: "teaching-courseware",
    file: "teaching-courseware.md",
    kind: "teaching",
    intent: "teach",
    design: "academic/paper-white-courseware",
    forbidden: "work/warm-jade-annual-report",
    category: "education-training",
    minPages: 6,
    director: /learning objective.*worked example.*guided practice/i,
  },
  {
    id: "knowledge-sharing",
    file: "knowledge-sharing.md",
    kind: "learn-share",
    intent: "teach",
    design: "consulting/pine-green-strategy",
    forbidden: "academic/paper-white-courseware",
    category: "education-training",
    minPages: 6,
    director: /purpose.*takeaway.*checklist.*apply at work/i,
  },
  {
    id: "performance-review",
    file: "performance-review.md",
    kind: "performance-review",
    intent: "report",
    design: "work/warm-jade-annual-report",
    forbidden: "academic/paper-white-courseware",
    category: "management-report",
    minPages: 4,
    director: /personal contribution.*team outcomes/i,
  },
  {
    id: "work-report",
    file: "work-report.md",
    kind: "work-report",
    intent: "report",
    design: "work/warm-jade-annual-report",
    forbidden: "academic/paper-white-courseware",
    category: "management-report",
    minPages: 4,
    director: /issue and risk.*owner and date/i,
  },
  {
    id: "project-proposal",
    file: "project-proposal.md",
    kind: "project-proposal",
    intent: "decide",
    design: "consulting/pine-green-strategy",
    forbidden: "academic/paper-white-courseware",
    category: "analysis-decision",
    minPages: 4,
    director: /options and recommendation.*risk and mitigation.*decision/i,
  },
  {
    id: "training-guide",
    file: "training-guide.md",
    kind: "training",
    intent: "teach",
    design: "academic/paper-white-courseware",
    forbidden: "work/warm-jade-annual-report",
    category: "education-training",
    minPages: 6,
    director: /procedure.*worked example.*common errors.*checklist/i,
  },
  {
    id: "academic-defense",
    file: "academic-defense.md",
    kind: "academic",
    intent: "academic",
    design: "academic/paper-white-courseware",
    forbidden: "work/warm-jade-annual-report",
    category: "academic-research",
    minPages: 4,
    director: /开题\/答辩\/论文/,
  },
];

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(base, child, log) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`native-web exited before health\n${log.value}`);
    }
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`native-web did not become healthy\n${log.value}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function makeContactSheet(files, target) {
  const systemFont = "/System/Library/Fonts/Helvetica.ttc";
  const result = spawnSync(
    "magick",
    [
      "montage",
      ...files,
      ...(fs.existsSync(systemFont) ? ["-font", systemFont] : []),
      "-pointsize", "14",
      "-tile", "3x",
      "-geometry", "480x270+18+26",
      "-background", "#E9EBEF",
      target,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`ImageMagick contact sheet failed: ${result.stderr || result.stdout}`);
  }
}

if (fs.existsSync(OUT)) {
  throw new Error(`QA_SCENARIO_OUT already exists; choose a new run directory: ${OUT}`);
}
fs.mkdirSync(OUT, { recursive: true });

const port = await reservePort();
const base = `http://127.0.0.1:${port}`;
const serverLog = { value: "" };
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLog.value += chunk; });
server.stderr.on("data", (chunk) => { serverLog.value += chunk; });

const report = {
  schemaVersion: "open-slidestudio.office-scenario-acceptance.v1",
  startedAt: new Date().toISOString(),
  generationMode: "deterministic-playbook-fixture",
  editorBase: base,
  scenarios: [],
};

let raster;
try {
  await waitForHealth(base, server, serverLog);
  raster = createPageRasterPort({ editorBaseUrl: base, nativeSlideSize: true });
  for (const scenario of SCENARIOS) {
    const briefPath = path.join(FIXTURES, scenario.file);
    const brief = fs.readFileSync(briefPath, "utf8");
    const kind = classifyBriefKind(brief);
    const intent = inferDeckIntent(brief, scenario.category);
    const directed = directorBrief(brief);
    assert.equal(kind, scenario.kind, `${scenario.id} brief kind`);
    assert.equal(intent, scenario.intent, `${scenario.id} deck intent`);
    assert.match(directed, scenario.director, `${scenario.id} director structure`);
    assert.match(directed, /Keep pages readable: title plus evidence on a high-contrast field/);
    assert.equal(
      kindThemePackIssue({ brief, adoptedSourceIds: [scenario.design] }),
      undefined,
      `${scenario.id} compatible theme`,
    );
    if (scenario.forbidden) {
      assert.ok(
        kindThemePackIssue({ brief, adoptedSourceIds: [scenario.forbidden] }),
        `${scenario.id} must reject ${scenario.forbidden}`,
      );
    }

    const projectRoot = path.join(OUT, scenario.id);
    const generated = await runGenerateAsync({
      projectRoot,
      brief,
      brain: createPlaybookBrain({
        designSystemId: scenario.design,
        categoryId: scenario.category,
      }),
      exportPptx: true,
    });
    assert.equal(generated.status, "ready", `${scenario.id}: ${generated.fallbackReason || "generation failed"}`);
    const project = loadProject(projectRoot);
    assert.ok(project.pages.length >= scenario.minPages, `${scenario.id} needs at least ${scenario.minPages} pages`);
    assert.ok(generated.pptxPath && fs.statSync(generated.pptxPath).size > 10_000, `${scenario.id} PPTX export`);

    const rasterDir = path.join(projectRoot, "_acceptance", "rasters");
    fs.mkdirSync(rasterDir, { recursive: true });
    const rasterFiles = [];
    const pages = [];
    for (let index = 0; index < project.pages.length; index += 1) {
      const rendered = await raster.render({ projectRoot, pageIndex: index });
      assert.equal(rendered.kind, "native-slide", `${scenario.id} page ${index + 1} raster`);
      assert.ok(rendered.bytes && rendered.bytes.length > 5_000, `${scenario.id} page ${index + 1} PNG`);
      assert.equal(rendered.width, 960, `${scenario.id} page ${index + 1} width`);
      assert.equal(rendered.height, 540, `${scenario.id} page ${index + 1} height`);
      assert.deepEqual(
        rendered.layout?.hardIssues ?? ["missing-layout"],
        [],
        `${scenario.id} page ${index + 1} clipping/contrast/collision/rule QA`,
      );
      const file = path.join(rasterDir, `${String(index + 1).padStart(2, "0")}.png`);
      fs.writeFileSync(file, rendered.bytes);
      rasterFiles.push(file);
      pages.push({
        index: index + 1,
        pageId: project.pages[index].page.id,
        path: project.pages[index].path,
        raster: file,
        bytes: rendered.bytes.length,
        sha256: sha256(rendered.bytes),
        warnings: rendered.layout?.warnings ?? [],
      });
    }
    const contactSheet = path.join(projectRoot, "_acceptance", "contact-sheet.png");
    makeContactSheet(rasterFiles, contactSheet);
    report.scenarios.push({
      id: scenario.id,
      brief: path.relative(ROOT, briefPath),
      kind,
      intent,
      design: scenario.design,
      category: scenario.category,
      pageCount: project.pages.length,
      pptx: generated.pptxPath,
      pptxBytes: fs.statSync(generated.pptxPath).size,
      contactSheet,
      pages,
    });
  }
  report.finishedAt = new Date().toISOString();
  report.ok = true;
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, scenarios: report.scenarios.length, out: OUT }, null, 2));
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.ok = false;
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await raster?.close?.().catch(() => undefined);
  server.kill("SIGKILL");
}
