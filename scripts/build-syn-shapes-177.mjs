#!/usr/bin/env node
/**
 * Build fixtures/syn-shapes-177 — every official preset on a grid (20 / page).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const dest = path.join(ROOT, "fixtures/syn-shapes-177");
const pptd = await import(pathToFileURL(path.join(ROOT, "packages/pptd-v2/dist/index.js")).href);
const catalog = pptd.SHAPE_CATALOG;
if (catalog.length !== 177) {
  throw new Error(`expected 177 presets, got ${catalog.length}`);
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
const project = pptd.createEmptyProject(dest, { title: "OOXML 177 presets" });
project.presentation.size = [960, 540];
project.presentation.pages = [];
project.pages = [];

const COLS = 5;
const ROWS = 4;
const PER = COLS * ROWS;
const GAP = 12;
const LEFT = 24;
const TOP = 40;
const CW = (960 - LEFT * 2 - GAP * (COLS - 1)) / COLS;
const CH = (540 - TOP - 20 - GAP * (ROWS - 1)) / ROWS;
const colors = ["#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

const pages = [];
for (let i = 0; i < catalog.length; i += PER) {
  const slice = catalog.slice(i, i + PER);
  const n = Math.floor(i / PER) + 1;
  const rel = `pages/${String(n).padStart(2, "0")}.page`;
  const elements = [
    {
      elementId: `t${n}`,
      elementType: "text",
      bounds: [24, 10, 900, 24],
      content: {
        text: `OOXML ${i + 1}–${i + slice.length} / 177`,
        style: "$body",
      },
    },
  ];
  slice.forEach((s, j) => {
    const c = j % COLS;
    const r = Math.floor(j / COLS);
    elements.push({
      elementId: `sh-${s.name}`,
      elementType: "shape",
      shapeName: s.name,
      adjustments: s.defaults.length ? [...s.defaults] : undefined,
      bounds: [LEFT + c * (CW + GAP), TOP + r * (CH + GAP), CW, CH - 16],
      fill: { type: "solid", color: colors[j % colors.length] },
    });
    elements.push({
      elementId: `lb-${s.name}`,
      elementType: "text",
      bounds: [LEFT + c * (CW + GAP), TOP + r * (CH + GAP) + CH - 16, CW, 14],
      content: { text: s.name, style: "$body", fontSize: 10 },
    });
  });
  pages.push({
    path: rel,
    page: { pageType: "content", background: { type: "solid", color: "#FFFFFF" }, elements },
  });
}

project.presentation.pages = pages.map((p) => p.path);
project.pages = pages;
pptd.saveProject(project);

const manifestPath = path.join(ROOT, "docs/editor-oracle/fixtures/manifest.json");
const man = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!man.fixtures.some((f) => f.id === "syn-shapes-177")) {
  man.fixtures.push({
    id: "syn-shapes-177",
    kind: "synthetic",
    path: "fixtures/syn-shapes-177",
    title: "OOXML 177 presets",
    pages: pages.length,
    notes: "All official presetShapeDefinitions names, 20 per page",
  });
  fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2) + "\n");
}
console.log(`wrote ${dest} (${catalog.length} shapes, ${pages.length} pages)`);
