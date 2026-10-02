#!/usr/bin/env node
/**
 * Multi-selection drag acceptance for the native editor canvas.
 *
 *   BASE=http://127.0.0.1:55201 node scripts/qa/editor-multi-select-drag.mjs
 *
 * Real pointer streams only (never synthetic el.click()/manual event objects).
 * Facts come from /api/model and from the live DOM mid-gesture, not pixels.
 *
 * Contract under test:
 *   1. Marquee selects both shapes.
 *   2. Dragging one selected shape moves the WHOLE selection by one delta.
 *   3. The gesture keeps the multi-selection; the pressed (topmost) element
 *      must not collapse the selection to itself.
 *   4. A plain click (no movement) on one of several selected elements MAY
 *      collapse to that element — standard editor behavior stays intact.
 *   5. Mid-gesture the DOM previews every selected element together.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55201";
const ROOT = process.cwd();
const SCRATCH_REL = "output/qa-multi-select-drag";
// A unique project directory per run: a long-lived editor keeps its own
// in-memory session per root, and re-seeding one root could look like a pass.
const RUN_ID = process.env.QA_RUN_ID || `${Date.now().toString(36)}-${process.pid}`;
const PROJECT_REL = `${SCRATCH_REL}/project-${RUN_ID}`;
const PROJECT_ABS = path.join(ROOT, PROJECT_REL);
const OUT_DIR = path.join(ROOT, SCRATCH_REL);
const OUT = path.join(OUT_DIR, "evidence.json");

const SHAPE_A = [80, 80, 200, 120];
const SHAPE_B = [160, 120, 200, 120];
const DRAG = { x: 60, y: 40 };

const log = [];
function note(step, detail) {
  log.push({ step, detail });
  console.log(`     ${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function seedProject() {
  const source = path.join(ROOT, "fixtures/syn-shapes");
  assert.ok(fs.existsSync(source), `missing fixture ${source}`);
  for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("project-") && entry.name !== path.basename(PROJECT_ABS)) {
      fs.rmSync(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
    }
  }
  fs.rmSync(PROJECT_ABS, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(PROJECT_ABS), { recursive: true });
  fs.cpSync(source, PROJECT_ABS, { recursive: true });
}

async function waitReady(page) {
  await page.waitForSelector("#slide .el", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById("doc-title")?.textContent || "";
      return t && t !== "未加载";
    },
    null,
    { timeout: 15000 },
  );
}

async function apiJson(page, pathName, opts = {}) {
  return page.evaluate(
    async ({ pathName, opts }) => {
      const res = await fetch(pathName, { headers: { "Content-Type": "application/json" }, ...opts });
      return res.json();
    },
    { pathName, opts },
  );
}

const command = async (page, body) => {
  const data = await apiJson(page, "/api/command", { method: "POST", body: JSON.stringify(body) });
  assert.ok(!data.error, `command ${body.cmd} failed: ${data.error}`);
  return data;
};

const model = async (page) => (await apiJson(page, "/api/model")).model;

function selectionIds(sel) {
  if (!sel) return [];
  if (sel.kind === "element" && sel.elementId) return [sel.elementId];
  if (sel.kind === "multi") return sel.elementIds || [];
  return [];
}

function boundsOf(m, id) {
  return m?.elements?.find((e) => e.id === id)?.bounds || null;
}

async function slidePoint(page, x, y) {
  return page.evaluate(
    ([sx, sy]) => {
      const slide = document.getElementById("slide");
      const m = /scale\(([^)]+)\)/.exec(slide.style.transform || "");
      const scale = m ? Number(m[1]) : 1;
      const r = slide.getBoundingClientRect();
      return { x: r.left + sx * scale, y: r.top + sy * scale, scale };
    },
    [x, y],
  );
}

async function readScale(page) {
  return page.locator("#slide").evaluate((el) => {
    const m = /scale\(([^)]+)\)/.exec(el.style.transform || "");
    return m ? Number(m[1]) : 1;
  });
}

/** Live DOM preview positions for every element node. */
async function domPreview(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#slide .el")].map((node) => ({
      id: node.dataset.id,
      left: Number.parseFloat(node.style.left) || 0,
      top: Number.parseFloat(node.style.top) || 0,
      selected: node.classList.contains("selected"),
    })),
  );
}

const report = { base: BASE, project: PROJECT_REL, drag: DRAG, checks: {}, log };

seedProject();
const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT_REL)}`, {
    waitUntil: "networkidle",
  });
  await waitReady(page);

  // A dedicated page keeps the fixture's own content untouched.
  await command(page, { cmd: "addPage" });
  // Inserts land on the session's current page, so pin that page explicitly
  // instead of trusting whichever index the last navigation left behind.
  await command(page, { cmd: "goToPage", index: 1 });
  for (const bounds of [SHAPE_A, SHAPE_B]) {
    await command(page, { cmd: "insert", kind: "shape" });
    await command(page, { cmd: "setBounds", bounds });
  }
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  // Rail open state is per project state, so open it through its own control
  // rather than assuming a previous session left it expanded.
  if (await page.locator("#rail").isHidden()) {
    await page.locator("#btn-rail").click();
    await page.locator("#rail").waitFor({ state: "visible" });
  }
  await page.locator(".rail .thumb").last().click({ force: true });
  await page.waitForSelector("#slide .el.shape", { timeout: 5000 });
  await page.waitForTimeout(250);

  const before = await model(page);
  const shapeIds = (before.elements || []).filter((e) => e.type === "shape").map((e) => e.id);
  assert.equal(shapeIds.length, 2, `expected exactly 2 shapes on the scratch page, got ${shapeIds.length}`);
  const [bottomId, topId] = shapeIds; // later insert paints above
  note("shapes", { bottomId, topId, bounds: shapeIds.map((id) => boundsOf(before, id)) });

  // 1. Marquee both shapes.
  const from = await slidePoint(page, 20, 20);
  const to = await slidePoint(page, 420, 300);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const selected = selectionIds((await model(page)).selection);
  assert.deepEqual(
    [...selected].sort(),
    [...shapeIds].sort(),
    `marquee must select both shapes, got ${JSON.stringify(selected)}`,
  );
  report.checks.marquee = selected.length;
  note("marquee", selected);

  // 2. Drag the TOPMOST selected shape; the whole selection must follow.
  const scale = await readScale(page);
  const target = page.locator(`#slide .el[data-id="${topId}"]`);
  const box = await target.boundingBox();
  assert.ok(box, "topmost shape has no box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + DRAG.x, startY + DRAG.y, { steps: 12 });
  const mid = await domPreview(page);
  await page.screenshot({ path: path.join(OUT_DIR, "mid-drag.png") });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const expected = [DRAG.x / scale, DRAG.y / scale];
  const after = await model(page);
  const afterIds = selectionIds(after.selection);
  const movedTop = boundsOf(after, topId);
  const movedBottom = boundsOf(after, bottomId);
  const delta = (id, at) => [
    Number(((at?.[0] ?? 0) - (boundsOf(before, id)?.[0] ?? 0)).toFixed(2)),
    Number(((at?.[1] ?? 0) - (boundsOf(before, id)?.[1] ?? 0)).toFixed(2)),
  ];
  const topDelta = delta(topId, movedTop);
  const bottomDelta = delta(bottomId, movedBottom);
  const near = (a, b) => Math.abs(a - b) < 1.5;
  const selectionKept = afterIds.length === 2;
  const bothMoved = near(topDelta[0], expected[0]) && near(topDelta[1], expected[1])
    && near(bottomDelta[0], expected[0]) && near(bottomDelta[1], expected[1]);
  const previewBoth = mid.filter((n) => shapeIds.includes(n.id) && n.left !== 0).length === 2
    && new Set(mid.filter((n) => shapeIds.includes(n.id)).map((n) => `${n.left},${n.top}`)).size === 2;

  report.checks.drag = { scale, expected, topDelta, bottomDelta, selectionAfterDrag: afterIds, mid, previewBoth };
  await page.screenshot({ path: path.join(OUT_DIR, "after-drag.png") });
  note("drag-delta", { expected, topDelta, bottomDelta });
  note("selection-after-drag", afterIds);

  // 3. A plain click on one of two selected elements collapses to it.
  const bottomNode = page.locator(`#slide .el[data-id="${bottomId}"]`);
  const bottomBox = await bottomNode.boundingBox();
  assert.ok(bottomBox, "bottom shape has no box");
  await bottomNode.click({ position: { x: 6, y: 6 } });
  await page.waitForTimeout(400);
  const clickIds = selectionIds((await model(page)).selection);
  report.checks.plainClick = clickIds;
  note("plain-click", clickIds);

  assert.ok(selectionKept, `multi-selection collapsed during drag: ${JSON.stringify(afterIds)}`);
  assert.ok(bothMoved, `group did not move by ${JSON.stringify(expected)}: top=${JSON.stringify(topDelta)} bottom=${JSON.stringify(bottomDelta)}`);
  assert.ok(previewBoth, "mid-drag DOM preview did not move every selected element");
  assert.deepEqual(clickIds, [bottomId], `plain click must keep single-select behavior, got ${JSON.stringify(clickIds)}`);
  assert.equal(pageErrors.length, 0, `pageerror: ${pageErrors.join(" | ")}`);

  report.accepted = true;
  console.log("OK    editor-multi-select-drag");
} catch (error) {
  report.accepted = false;
  report.failure = error.message;
  process.exitCode = 1;
  console.error(`FAIL  ${error.message}`);
} finally {
  report.pageErrors = pageErrors;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`evidence ${path.relative(ROOT, OUT)}`);
  await browser.close();
}
