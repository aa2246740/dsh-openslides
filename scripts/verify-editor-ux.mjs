#!/usr/bin/env node
/**
 * Browser verification for native-web editor interaction mines.
 *   node scripts/verify-editor-ux.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { cleanupFixtures } from "./qa/gestures.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const URL = `${BASE}/index.html?project=fixtures/okp-yu7-ppt`;
const OUT_DIR = path.resolve("output");

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function shot(name) {
  return path.join(OUT_DIR, `verify-editor-ux-${name}.png`);
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

async function commitOutside(page) {
  await page.evaluate(() => {
    const slide = document.getElementById("slide");
    if (!slide) return;
    slide.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    slide.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => !document.querySelector("#slide .el.is-editing"),
    null,
    { timeout: 4000 },
  );
  await page.waitForTimeout(200);
}

async function apiJson(page, pathName, opts = {}) {
  return page.evaluate(
    async ({ pathName, opts }) => {
      const res = await fetch(pathName, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      return res.json();
    },
    { pathName, opts },
  );
}

async function command(page, body) {
  return apiJson(page, "/api/command", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function slidePoint(page, x, y) {
  return page.evaluate(
    ([sx, sy]) => {
      const slide = document.getElementById("slide");
      const t = slide.style.transform || "";
      const m = /scale\(([^)]+)\)/.exec(t);
      const scale = m ? Number(m[1]) : 1;
      const r = slide.getBoundingClientRect();
      return { x: r.left + sx * scale, y: r.top + sy * scale, scale };
    },
    [x, y],
  );
}

function selectionIds(sel) {
  if (!sel) return [];
  if (sel.kind === "element" && sel.elementId) return [sel.elementId];
  if (sel.kind === "multi") return sel.elementIds || [];
  return [];
}

fs.mkdirSync(OUT_DIR, { recursive: true });
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await waitReady(page);
  pass("editor loaded");

  // --- 1. insert text → auto edit → drag does not erase ---
  await page.locator('#insert-toolbar [data-control="insert.text"]').click();
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("#slide"));
    },
    null,
    { timeout: 4000 },
  );
  const editing = page.locator("#slide .el.is-editing").first();
  const editBox = await editing.boundingBox();
  if (!editBox) fail("editing text node has no box");
  await page.mouse.move(editBox.x + Math.min(24, editBox.width / 2), editBox.y + editBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(editBox.x + editBox.width + 80, editBox.y + editBox.height + 40, { steps: 10 });
  const midText = await page.evaluate(() => {
    const n = document.querySelector("#slide .el.is-editing");
    return (n?.innerText || "").replace(/\n$/, "");
  });
  if (!midText) fail("text was erased during drag attempt");
  pass(`drag attempt kept text (${JSON.stringify(midText.slice(0, 24))})`);
  await page.mouse.up();
  await page.waitForTimeout(250);
  await commitOutside(page);
  await page.screenshot({ path: shot("text-drag"), fullPage: false });
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  const persisted = await page.evaluate(() => {
    const slide = document.getElementById("slide");
    return Boolean(slide && slide.innerText.includes("双击编辑文本"));
  });
  if (!persisted) fail("inserted text did not persist after drag + reload");
  pass("insert text survived drag and reload");

  // --- 5. ctx-bar vs rotate handle (do this while the new text is on page 1) ---
  const inserted = page.locator("#slide .el.text", { hasText: "双击编辑文本" }).last();
  await inserted.click();
  await page.waitForSelector("#ctx-bar:not([hidden])", { timeout: 4000 });
  await page.waitForSelector("#slide .handle-rot", { timeout: 4000 });
  const overlap = await page.evaluate(() => {
    const bar = document.getElementById("ctx-bar");
    const rot = document.querySelector("#slide .handle-rot");
    if (!bar || !rot || bar.hidden) return { ok: false, reason: "missing" };
    const a = bar.getBoundingClientRect();
    const b = rot.getBoundingClientRect();
    const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      ok: !hit,
      bar: { x: a.x, y: a.y, w: a.width, h: a.height },
      rot: { x: b.x, y: b.y, w: b.width, h: b.height },
    };
  });
  await page.screenshot({ path: shot("ctx-bar"), fullPage: false });
  if (!overlap.ok) fail(`ctx-bar overlaps rotate handle: ${JSON.stringify(overlap)}`);
  pass("ctx-bar does not overlap .handle-rot");

  // --- 2. context menu Esc + outside click ---
  const slideBox = await page.locator("#slide").boundingBox();
  if (!slideBox) fail("slide has no box");
  await page.mouse.click(slideBox.x + 16, slideBox.y + 16, { button: "right" });
  await page.waitForFunction(() => !document.getElementById("ctx-menu")?.hidden, null, { timeout: 3000 });
  await page.screenshot({ path: shot("ctx-menu"), fullPage: false });
  pass("context menu opened");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("ctx-menu")?.hidden, null, { timeout: 3000 });
  pass("Escape closes context menu");
  await page.mouse.click(slideBox.x + 16, slideBox.y + 16, { button: "right" });
  await page.waitForFunction(() => !document.getElementById("ctx-menu")?.hidden, null, { timeout: 3000 });
  await page.mouse.click(800, 12, { button: "left" });
  await page.waitForFunction(() => document.getElementById("ctx-menu")?.hidden, null, { timeout: 3000 });
  pass("outside click closes context menu");

  // --- 6. zoom fit ---
  const fitBtn = page.locator("#zoom-label");
  if (!(await fitBtn.count())) fail("zoom percentage / fit control missing");
  const control = await fitBtn.getAttribute("data-control");
  if (control !== "chrome.zoom.percent") fail("zoom percentage missing data-control=chrome.zoom.percent");
  const readScale = () =>
    page.locator("#slide").evaluate((el) => {
      const m = /scale\(([^)]+)\)/.exec(el.style.transform || "");
      return m ? Number(m[1]) : 1;
    });
  const before = await readScale();
  await page.locator("#btn-zoom-in").click();
  await page.locator("#btn-zoom-in").click();
  await page.waitForTimeout(200);
  const zoomed = await readScale();
  if (!(zoomed > before + 0.02)) fail(`zoom in did not change transform: ${before} → ${zoomed}`);
  await fitBtn.click();
  await page.waitForTimeout(300);
  const fitted = await readScale();
  const zoomState = await apiJson(page, "/api/model");
  if (zoomState.model?.zoomPercent !== 100) {
    fail(`适应 did not reset zoomPercent to 100 (got ${zoomState.model?.zoomPercent})`);
  }
  if (!(fitted < zoomed - 0.02)) fail(`适应 did not reset scale toward fit: zoomed=${zoomed} fitted=${fitted}`);
  await page.screenshot({ path: shot("zoom"), fullPage: false });
  pass("zoom percentage resets transform to fit");

  // --- 3. marquee selects two shapes ---
  await command(page, { cmd: "addPage" });
  await command(page, { cmd: "insert", kind: "shape" });
  await command(page, { cmd: "setBounds", bounds: [80, 80, 140, 90] });
  await command(page, { cmd: "insert", kind: "shape" });
  await command(page, { cmd: "setBounds", bounds: [260, 110, 140, 90] });
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator(".rail .thumb").last().click({ force: true });
  await page.waitForSelector("#slide .el.shape", { timeout: 5000 });
  await page.waitForTimeout(200);
  const modelBefore = await apiJson(page, "/api/model");
  const shapeIds = (modelBefore.model?.elements || [])
    .filter((e) => e.type === "shape")
    .map((e) => e.id);
  if (shapeIds.length < 2) fail(`expected 2 shapes on blank page, got ${shapeIds.length}`);
  const from = await slidePoint(page, 20, 20);
  const to = await slidePoint(page, 420, 340);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.screenshot({ path: shot("marquee"), fullPage: false });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterSel = await apiJson(page, "/api/model");
  const ids = selectionIds(afterSel.model?.selection);
  if (ids.length !== 2) {
    fail(`marquee selection expected 2 ids, got ${JSON.stringify(afterSel.model?.selection)}`);
  }
  pass(`marquee selected 2 elements (${ids.join(", ")})`);

  // --- 4. guide-line appears mid-drag ---
  await page.evaluate(() => {
    const slide = document.getElementById("slide");
    slide?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    slide?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  const shape = page.locator("#slide .el.shape").first();
  await shape.click();
  const sb = await shape.boundingBox();
  if (!sb) fail("shape has no box for guide drag");
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 48, sb.y + sb.height / 2 + 24, { steps: 8 });
  await page.waitForSelector("#slide .guide-line", { timeout: 3000 });
  const guideCount = await page.locator("#slide .guide-line").count();
  if (!guideCount) fail("no .guide-line in DOM during drag");
  await page.screenshot({ path: shot("guides"), fullPage: false });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const afterGuides = await page.locator("#slide .guide-line").count();
  if (afterGuides) fail("guide lines stayed after pointerup");
  pass(`guide-line visible during drag (${guideCount}) and cleared on pointerup`);

  console.log(`shot  ${shot("*")}`);
  console.log("OK    verify-editor-ux");
} finally {
  await browser.close();
  cleanupFixtures();
}
