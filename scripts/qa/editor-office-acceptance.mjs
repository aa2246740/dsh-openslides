#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { dragCropHandle, dragEl, dragHandle, insertViaCommand } from "./gestures.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.QA_PORT || 55432);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-office-editor-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-office-editor"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
const ONLY = String(process.env.QA_ONLY || "").trim();
fs.mkdirSync(OUT, { recursive: true });

const report = {
  schemaVersion: "open-slidestudio.office-editor-acceptance.v1",
  startedAt: new Date().toISOString(),
  base: BASE,
  source: path.relative(ROOT, SOURCE),
  steps: [],
  exercisedControls: [],
  observedControls: [],
  browserErrors: [],
  exports: [],
  limitations: [
    "Headless Chromium cannot prove native macOS fullscreen presentation; requestFullscreen wiring is tested with a browser stub.",
    "Google Slides export was removed from the product, not merely disabled; animation authoring is still wont-port.",
  ],
};
const exercised = new Set();
const observed = new Set();
const browserErrors = [];
let shotIndex = 0;

function mark(...ids) {
  for (const id of ids.flat()) exercised.add(id);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`editor server did not start\n${serverLog}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

async function observeControls() {
  const ids = await page.locator("[data-control]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-control")).filter(Boolean),
  );
  for (const id of ids) observed.add(id);
}

async function screenshot(step, health = "pass") {
  await observeControls();
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, "0")}-${step}.png`;
  const absolute = path.join(OUT, file);
  await page.screenshot({ path: absolute, fullPage: false });
  report.steps.push({ step: shotIndex, id: step, health, screenshot: absolute });
  return absolute;
}

async function apiModel() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error(`model ${response.status}`);
    return response.json();
  });
}

async function loadFlow(name, { blank = false } = {}) {
  const project = path.join(SCRATCH, name);
  fs.cpSync(SOURCE, project, { recursive: true });
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.evaluate(() => document.fonts?.ready);
  await observeControls();
  if (blank) {
    const before = Number((await apiModel()).model.pageCount);
    await page.locator("#rail .rail-add").click();
    await page.waitForFunction((count) => {
      const text = document.getElementById("page-count")?.textContent || "";
      return Number(text.split("/")[1]?.trim()) === count + 1;
    }, before);
    mark("chrome.pages.add");
  }
  return project;
}

async function reloadCurrentPage() {
  const pageCounter = await page.locator("#page-count").innerText();
  const currentIndex = Math.max(0, Number(pageCounter.split("/")[0]?.trim() || 1) - 1);
  const url = new URL(page.url());
  url.searchParams.set("page", String(currentIndex));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
}

// The coherent inspector moved several control groups out of ctx-bar popovers
// into the property panel and renamed a few triggers, so a title resolves to
// whatever surface actually owns it now.
const CONTEXT_TITLE_ALIASES = new Map([
  ["字体 / 字号", "字体"],
  ["图片", "Agent 重建图片"],
  ["裁切 / 遮罩", "遮罩形状"],
  ["对齐", "对象对齐"],
  ["分布", "水平分布"],
]);
const RETIRED_CONTEXT_GROUPS = new Set(["更多"]);

function contextButton(title) {
  const resolved = CONTEXT_TITLE_ALIASES.get(title) || title;
  return page.locator("#property-panel").getByRole("button", { name: resolved, exact: true }).first();
}

/** Open the collapsed property section that owns a labelled control group. */
async function openOwningSection(title) {
  const alias = CONTEXT_TITLE_ALIASES.get(title) || title;
  const section = page.locator('#property-panel details[data-inspector-section]')
    .filter({ hasText: new RegExp(alias) })
    .first();
  if (!(await section.count())) return false;
  if (!(await section.evaluate((node) => node.open))) {
    await section.locator("summary").first().click();
    await page.waitForTimeout(80);
  }
  return true;
}

/** Open the collapsed property section that owns the element matched by selector. */
async function openOwningSectionBySelector(selector) {
  const field = page.locator(selector).first();
  if (await field.isVisible().catch(() => false)) return;
  const section = page.locator('#property-panel details[data-inspector-section]')
    .filter({ has: page.locator(selector) })
    .first();
  if (!(await section.count())) return;
  if (!(await section.evaluate((node) => node.open))) {
    await section.locator("summary").first().click();
    await page.waitForTimeout(80);
  }
}

/** Make a property control reachable: open its section, then any closed popover. */
async function ensureVisible(selector) {
  await openOwningSectionBySelector(selector);
  let field = page.locator(selector).first();
  if (await field.isVisible().catch(() => false)) return field;
  const opened = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    const wrap = node?.closest(".ctx-popwrap");
    if (!wrap) return false;
    if (!wrap.classList.contains("open")) wrap.querySelector(":scope > button")?.click();
    return true;
  }, selector).catch(() => false);
  if (opened) await page.waitForTimeout(150);
  field = page.locator(selector).first();
  await field.waitFor({ state: "visible", timeout: 4000 });
  return field;
}

/** Select an option on a property field (section + popover made reachable first). */
async function selectPanelOption(selector, value) {
  const field = await ensureVisible(selector);
  await field.selectOption(value);
}

/** Click a property-panel control by data-control (optional exact label). */
async function clickPanelControl(control, label) {
  const base = `#property-panel [data-control="${control}"]`;
  await ensureVisible(base);
  let target = page.locator(base);
  if (label) target = target.filter({ hasText: new RegExp(`^${label}$`) });
  const first = target.first();
  await first.waitFor({ state: "visible", timeout: 4000 });
  await first.click();
}

async function openContext(title) {
  if (RETIRED_CONTEXT_GROUPS.has(title)) {
    // The 更多 menu is retired: its actions are direct panel controls now.
    await observeControls();
    return null;
  }
  const trigger = contextButton(title);
  if ((await trigger.count()) && (await trigger.isVisible().catch(() => false))) {
    const open = await trigger.evaluate((node) => node.parentElement?.classList.contains("open"));
    if (!open) await trigger.click();
    await page.waitForTimeout(120);
    await observeControls();
    return trigger;
  }
  // Not a popover trigger any more: make sure its panel section is expanded.
  await openOwningSection(title);
  await observeControls();
  return null;
}

async function closeContext(title) {
  if (RETIRED_CONTEXT_GROUPS.has(title)) return;
  const trigger = contextButton(title);
  if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false))) return;
  const open = await trigger.evaluate((node) => node.parentElement?.classList.contains("open"));
  if (open) await trigger.click();
  await page.waitForTimeout(100);
}

async function setColor(locator, value) {
  await locator.evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(180);
}

async function selectLast(type) {
  const locator = page.locator(`#slide .el.${type}`).last();
  await locator.click({ force: true });
  await page.waitForTimeout(120);
  return locator;
}

async function stableSelected(type) {
  const selected = page.locator(`#slide .el.${type}.selected`).first();
  await selected.waitFor({ state: "visible" });
  const id = await selected.getAttribute("data-id");
  assert.ok(id, `${type} must expose a stable element id`);
  return { id, locator: page.locator(`#slide .el.${type}[data-id="${id}"]`) };
}

async function setBoundsField(field, value) {
  await openContext("更多");
  const index = { X: 0, Y: 1, W: 2, H: 3 }[field];
  assert.notEqual(index, undefined, `unsupported bounds field ${field}`);
  const input = page.locator('#property-panel input[data-control="element.bounds.set"]').nth(index);
  await input.fill(String(value));
  await input.press("Tab");
  await page.waitForTimeout(180);
}

async function insertImage(file) {
  const before = await page.locator("#slide .el.image").count();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator('button[data-insert="image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.waitForFunction((count) => document.querySelectorAll("#slide .el.image").length > count, before);
  mark("insert.image");
  return selectLast("image");
}

async function flowChromePages() {
  await loadFlow("01-chrome-pages");
  const initial = (await apiModel()).model.pageCount;
  const firstZoom = await page.locator("#zoom-label").innerText();
  await page.locator("#btn-zoom-out").click();
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator("#zoom-label").innerText(), firstZoom, "zoom out must change percent");
  await page.locator("#btn-zoom-in").click();
  await page.locator("#zoom-label").click();
  mark("chrome.zoom.out", "chrome.zoom.in", "chrome.zoom.percent");

  await page.locator("#btn-rail").click();
  assert.equal(await page.locator("#rail").isVisible(), false, "rail toggle must close rail");
  await page.locator("#btn-rail").click();
  assert.equal(await page.locator("#rail").isVisible(), true, "rail toggle must reopen rail");
  mark("chrome.pages.rail.toggle");

  await page.locator("#rail .thumb").nth(1).click();
  await page.waitForFunction(() => document.getElementById("page-count")?.textContent?.startsWith("2 /"));
  mark("chrome.pages.navigate");
  await page.locator("#rail .rail-add").click();
  await page.waitForFunction((count) => Number((document.getElementById("page-count")?.textContent || "").split("/")[1]) === count + 1, initial);
  mark("chrome.pages.add");

  let active = page.locator("#rail .thumb.active");
  await active.click({ button: "right" });
  await page.locator("#ctx-menu button", { hasText: "复制" }).click();
  await page.waitForFunction((count) => Number((document.getElementById("page-count")?.textContent || "").split("/")[1]) === count + 2, initial);
  mark("chrome.pages.duplicate", "contextmenu.open");

  active = page.locator("#rail .thumb.active");
  await active.click({ button: "right" });
  const up = page.locator("#ctx-menu button", { hasText: "上移" });
  if (!(await up.isDisabled())) await up.click();
  mark("chrome.pages.reorder");

  active = page.locator("#rail .thumb.active");
  await active.click({ button: "right" });
  await page.locator("#ctx-menu button", { hasText: "删除" }).click();
  await page.waitForFunction((count) => Number((document.getElementById("page-count")?.textContent || "").split("/")[1]) === count + 1, initial);
  mark("chrome.pages.delete");

  await page.locator("#btn-undo").click();
  await page.waitForFunction((count) => Number((document.getElementById("page-count")?.textContent || "").split("/")[1]) === count + 2, initial);
  await page.locator("#btn-redo").click();
  await page.waitForFunction((count) => Number((document.getElementById("page-count")?.textContent || "").split("/")[1]) === count + 1, initial);
  mark("chrome.history.undo", "chrome.history.redo");

  await page.keyboard.press("?");
  assert.ok(await page.locator("#kbd-help").isVisible(), "keyboard help must be reachable with ?");
  mark("chrome.keyboard.help");
  await screenshot("chrome-pages-history");
  await page.keyboard.press("Escape");
  await page.locator("#kbd-help").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#kbd-help").isVisible(), false, "Escape must close keyboard help");
}

async function flowText() {
  await loadFlow("02-text", { blank: true });
  await page.locator('button[data-insert="text"]').click();
  mark("insert.text");
  const selectedText = page.locator("#slide .el.text.selected");
  await selectedText.waitFor({ state: "visible" });
  const textId = await selectedText.getAttribute("data-id");
  assert.ok(textId, "inserted text must expose a stable element id");
  const text = page.locator(`#slide .el.text[data-id="${textId}"]`);
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("季度重点\n第一项行动\n第二项行动");
  await page.locator("#slide").click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(350);
  mark("element.text.content.set");
  await text.click({ force: true });

  await openContext("字体 / 字号");
  const boldControls = { B: "element.text.toolbar.bold.toggle", I: "element.text.toolbar.italic.toggle", U: "element.text.toolbar.underline.toggle" };
  for (const label of ["B", "I", "U"]) {
    // B / I / U are panel toggles now (the #pop-type popover was retired).
    await clickPanelControl(boldControls[label]);
  }
  mark(
    "element.text.toolbar.bold.toggle",
    "element.text.toolbar.italic.toggle",
    "element.text.toolbar.underline.toggle",
  );
  const size = page.locator("#ctx-fontsize");
  await size.fill("30");
  await size.press("Tab");
  await openContext("字体 / 字号");
  const font = page.locator('#property-panel [data-control="element.text.toolbar.fontfamily.set"]').first();
  assert.ok(await font.count(), "font selector must remain available after changing size");
  await font.selectOption({ index: 0 });
  await openContext("字体 / 字号");
  await selectPanelOption('#pop-type-advanced-panel [data-control="element.text.toolbar.lineheight.set"]', "1.5");
  await openContext("字体 / 字号");
  const tracking = page.locator('#pop-type-advanced-panel [data-control="element.text.toolbar.letterspacing.set"]');
  await tracking.fill("1");
  await tracking.press("Tab");
  await openContext("字体 / 字号");
  await setColor(page.locator('#pop-type-advanced-panel input[type="color"][data-control="element.text.toolbar.highlight.set"]'), "#fff59d");
  mark(
    "element.text.toolbar.fontsize.set",
    "element.text.toolbar.fontfamily.set",
    "element.text.toolbar.lineheight.set",
    "element.text.toolbar.letterspacing.set",
    "element.text.toolbar.highlight.set",
  );

  await setColor(page.locator("#ctx-text-color"), "#123a63");
  mark("element.text.toolbar.color.set");
  await openContext("文本对齐");
  await page.locator("#pop-align-t button").filter({ hasText: /^中$/ }).first().click();
  mark("element.text.toolbar.align.set");
  // The list control is a 无/项目符号/编号 segment in the property panel now.
  await clickPanelControl("element.text.toolbar.list.set", "项目符号");
  await page.waitForTimeout(150);
  await clickPanelControl("element.text.toolbar.list.set", "编号");
  mark("element.text.toolbar.list.set");
  await clickPanelControl("element.text.toolbar.link.set");
  const linkDialog = page.locator("#text-link-dialog");
  await linkDialog.waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#text-link-input").evaluate((node) => document.activeElement === node),
    true,
    "link dialog must focus its visible input",
  );
  await page.locator("#text-link-input").fill("https://example.com/office");
  const linkCommand = page.waitForResponse(async (response) => {
    if (!isApiCommandUrl(response.url()) || response.request().method() !== "POST") return false;
    const body = response.request().postDataJSON();
    return body?.cmd === "setTextStyle" && body?.controlId === "element.text.toolbar.link.set";
  });
  await page.locator("#text-link-save").click();
  assert.equal((await linkCommand).status(), 200, "link dialog save must persist through setTextStyle");
  await linkDialog.waitFor({ state: "hidden" });
  assert.equal((await apiModel()).model.elements.find((element) => element.id === textId)?.href, "https://example.com/office");
  mark("element.text.toolbar.link.set");

  // 框内自动换行 is a panel toggle now (label differs from the control id).
  const wrapSelector = '#property-panel [data-control="element.text.toolbar.wrap.set"]';
  await ensureVisible(wrapSelector);
  assert.ok(await page.locator(wrapSelector).first().isVisible(), "wrap must be visible in the property panel");
  await clickPanelControl("element.text.toolbar.wrap.set");
  await page.waitForTimeout(220);
  assert.equal(await text.evaluate((node) => getComputedStyle(node).whiteSpace), "nowrap");
  await clickPanelControl("element.text.toolbar.wrap.set");
  await page.waitForTimeout(220);
  assert.notEqual(await text.evaluate((node) => getComputedStyle(node).whiteSpace), "nowrap");
  mark("element.text.toolbar.wrap.set");

  await text.click({ button: "right" });
  await page.locator("#ctx-menu").waitFor({ state: "visible" });
  assert.ok(await page.locator("#ctx-menu").isVisible(), "right click menu must open");
  mark("contextmenu.open");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  mark("selection.tab");
  await page.keyboard.press("Escape");
  mark("selection.clear");
  await page.waitForTimeout(180);
  await screenshot("text-formatting");

  await reloadCurrentPage();
  const persisted = page.locator("#slide .el.text", { hasText: "季度重点" });
  assert.ok(await persisted.isVisible(), "text content must persist after reload");
  assert.equal(await persisted.evaluate((node) => getComputedStyle(node).fontSize), "30px");
}

/** Select an element seeded through the command path (corner click, then Tab). */
async function selectSeededElement(id, pageIndex) {
  // The flow URL pins &page=0, so a reload after seeding lands on page 0 while the
  // seeded element may live on the page the flow had navigated to.
  if (typeof pageIndex === "number") {
    const rail = page.locator(`#rail .thumb[data-page-index="${pageIndex}"]`).first();
    if (await rail.count()) {
      await rail.click({ force: true });
      await page.waitForTimeout(250);
    }
  }
  const node = page.locator(`#slide .el[data-id="${id}"]`).first();
  const box = await node.boundingBox().catch(() => null);
  if (box) await page.mouse.click(box.x + 6, box.y + 6);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await page.locator("#slide .el.selected").first()
      .getAttribute("data-id").catch(() => null);
    if (current === id) return id;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
  }
  throw new Error(`could not select the seeded element ${id}`);
}

async function flowChart() {
  await loadFlow("03-chart", { blank: true });
  // Chart insertion has no editor affordance by design: seed through the command path.
  const seededChart = await insertViaCommand(page, "chart");
  mark("insert.chart");
  const chartId = (seededChart.model?.elements || []).find((el) => el.type === "chart")?.id;
  assert.ok(chartId, "inserted chart must expose a stable id");
  await selectSeededElement(chartId, seededChart.model?.pageIndex);
  const chart = page.locator(`#slide .el.chart[data-id="${chartId}"]`);
  await chart.waitFor({ state: "visible" });
  await contextButton("编辑数据").click();
  mark("element.chart.data.set");
  const overlay = page.locator("#chart-overlay");
  assert.ok(await overlay.isVisible(), "chart data overlay must open");

  // Dispatch the synthetic paste on a grid input: pasting on the overlay container
  // would also reach the window-level handler, which treats it as a canvas paste.
  const pasteInto = async (payload) => {
    await page.locator("#chart-grid td input").first().evaluate((node, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: data }));
    }, payload);
  };
  await pasteInto("类目\t收入\t成本\nQ1\t12\tbad\nQ2\t18\t9");
  assert.match(await page.locator("#chart-data-status").innerText(), /粘贴未应用/);
  await pasteInto("类目\t收入\t成本\nQ1\t12\t6\nQ2\t18\t9\nQ3\t24\t11");
  await page.waitForTimeout(450);
  assert.equal(await page.locator("#chart-grid tr").count(), 5, "paste must create header + 3 rows + add row");

  const value = page.locator("#chart-grid tr").nth(1).locator("td input").nth(1);
  await value.fill("bad");
  assert.equal(await value.getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#chart-data-status").innerText(), /请输入数字/);
  await value.fill("15");
  assert.notEqual(await value.getAttribute("aria-invalid"), "true");
  await value.press("Tab");
  await page.locator("#chart-grid tr.add-row .ctx-btn", { hasText: "+ 行" }).click();
  await page.locator("#chart-grid tr.add-row .ctx-btn", { hasText: "+ 列" }).click();
  await page.waitForTimeout(450);
  while (await page.locator('#chart-grid button[aria-label="删除列"]').count()) {
    await page.locator("#chart-grid th.s1 input").first().click();
    await page.locator('#chart-grid th.s1 button[aria-label="删除列"]').first().click();
    await page.waitForTimeout(120);
  }
  assert.equal(await page.locator("#chart-grid th.s1").count(), 1, "chart must retain exactly one data series at the column-delete boundary");
  assert.equal(await page.locator('#chart-grid button[aria-label="删除列"]').count(), 0, "the final chart series must not expose delete");
  // Delete every data row: focus the row (its delete button only renders while the
  // row is focused), then click it, waiting for the data-row count to drop. The
  // grid keeps a header row, so count only rows that carry editable cells.
  const dataRowCount = () => page.locator("#chart-grid tr:not(.add-row):has(td input)").count();
  for (let guard = 0; guard < 20; guard += 1) {
    const rowInput = page.locator("#chart-grid tr:not(.add-row) td input").first();
    if (!(await rowInput.count())) break;
    const before = await dataRowCount();
    await rowInput.click();
    const del = page.locator('#chart-grid tr:not(.add-row) button[aria-label="删除行"]').first();
    if (!(await del.count())) break;
    await del.click();
    await page.waitForFunction(
      (expected) => document.querySelectorAll("#chart-grid tr:not(.add-row) td input").length === 0
        || [...document.querySelectorAll("#chart-grid tr:not(.add-row)")].filter((tr) => tr.querySelector("td input")).length <= expected,
      Math.max(0, before - 1),
      { timeout: 4000 },
    ).catch(() => {});
    const after = await dataRowCount();
    if (process.env.QA_DEBUG === "1") console.log(`DEBUG chart-row-delete before=${before} after=${after}`);
    if (after >= before) break;
  }
  assert.equal(await page.locator('#chart-grid button[aria-label="删除行"]').count(), 0, "empty chart data must not expose a stale row delete button");
  if (process.env.QA_DEBUG === "1") {
    const zero = (await apiModel()).model.elements.find((element) => element.id === chartId);
    console.log(`DEBUG chart rows after deletes=${zero?.chartData?.rows?.length}`);
  }
  await page.locator("#chart-grid tr.add-row .ctx-btn", { hasText: "+ 行" }).click();
  await page.waitForTimeout(400);
  const boundaryChart = (await apiModel()).model.elements.find((element) => element.id === chartId);
  if (process.env.QA_DEBUG === "1") {
    console.log(`DEBUG chart rows after +行=${boundaryChart?.chartData?.rows?.length} dom=${await page.locator('#chart-grid tr:not(.add-row) td input').count()}`);
  }
  assert.equal(boundaryChart?.chartData?.cols?.length, 2, "chart column deletion must persist category + one series");
  assert.equal(boundaryChart?.chartData?.rows?.length, 1, "chart must recover from zero rows through +行");
  mark("element.chart.data.set");
  await screenshot("chart-data-edit");
  await page.locator("#chart-overlay-close").click();
  assert.equal(await overlay.isVisible(), false, "chart overlay close must restore canvas");

  for (const [label, selector] of [
    ["折线", "svg polyline"],
    ["面积", "svg polygon"],
    ["饼图", "svg path"],
    ["柱状", "svg rect"],
  ]) {
    await openContext("图表类型");
    await page.locator("#pop-chart-type .ctx-btn", { hasText: label }).click();
    await page.waitForTimeout(240);
    assert.ok(await chart.locator(selector).count(), `${label} must repaint`);
  }
  mark("element.chart.type.set");

  await openContext("系列色");
  await setColor(page.locator("#ctx-chart-color-0"), "#d0472a");
  mark("element.chart.series.color.set");
  await openContext("坐标轴");
  await page.locator("#ctx-chart-axis-x").fill("季度");
  await page.locator("#ctx-chart-axis-x").press("Tab");
  await openContext("标题");
  const title = page.locator("#pop-chart-title input");
  await title.fill("收入与成本趋势");
  await title.press("Tab");
  mark("element.chart.axis.set", "element.chart.title.set");
  await contextButton("数据标签").click();
  await contextButton("图例").click();
  await contextButton("图例").click();
  mark("element.chart.labels.set", "element.chart.legend.set");
  const visibleChartColors = await chart.locator("svg [fill]").evaluateAll((nodes) =>
    [...new Set(nodes.map((node) => node.getAttribute("fill")).filter((fill) => /^#[0-9a-f]{6}$/i.test(fill || "")))],
  );
  assert.ok(visibleChartColors.includes("#d0472a"), "edited series color must repaint");
  assert.ok(visibleChartColors.length >= 2, "editing one chart series must preserve distinct sibling series colors");
  await screenshot("chart-formatting");

  await reloadCurrentPage();
  const persisted = page.locator("#slide .el.chart").last();
  assert.ok(await persisted.locator("svg text", { hasText: "收入与成本趋势" }).count(), "chart title must persist after reload");
  assert.ok(await persisted.locator("svg text", { hasText: "季度" }).count(), "chart axis title must persist after reload");
}

async function flowShapeLineIcon() {
  await loadFlow("04-shape-line-icon", { blank: true });
  await page.locator('button[data-insert="shape"]').click();
  const shapeChoice = page.locator("#shape-grid .shape-cell").first();
  await shapeChoice.waitFor({ state: "visible" });
  await shapeChoice.click();
  mark("insert.shape");
  const shape = await stableSelected("shape");

  await openContext("调整 / 形状");
  await page.locator("#pop-adj select").selectOption("roundRect");
  await page.waitForTimeout(180);
  await openContext("调整 / 形状");
  const adjustment = page.locator('#pop-adj input[type="range"]').first();
  assert.ok(await adjustment.count(), "rounded rectangle must expose its adjustment handle");
  await adjustment.evaluate((input) => {
    input.value = "26000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  mark("element.shape.kind.set", "element.shape.adjust.set");

  await openContext("填充");
  const fillColors = page.locator('#pop-fill input[type="color"]');
  assert.ok((await fillColors.count()) >= 3, "shape fill must expose solid and two gradient color inputs");
  await fillColors.nth(1).evaluate((input) => { input.value = "#0f766e"; });
  await fillColors.nth(2).evaluate((input) => { input.value = "#14b8a6"; });
  await page.locator("#pop-fill .ctx-btn", { hasText: "渐变" }).click();
  mark("element.shape.fill.set");

  await openContext(/描边|No border/);
  await setColor(page.locator('#pop-border input[type="color"]'), "#134e4a");
  await openContext(/描边|No border/);
  const borderWidth = page.locator('#pop-border input[type="number"]');
  await borderWidth.fill("3");
  await borderWidth.press("Tab");
  mark("element.shape.border.set");

  await openContext("不透明度");
  await page.locator('#property-panel input[data-control="element.opacity.set"]').evaluate((input) => {
    input.value = "92";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  mark("element.opacity.set");

  for (const action of ["置于底层", "上移一层", "下移一层", "置于顶层"]) {
    await openContext("图层");
    await clickPanelControl(action.includes("底") || action.includes("下移") ? "element.arrange.backward" : "element.arrange.forward", action);
  }
  mark("element.arrange.forward", "element.arrange.backward");

  await openContext("更多");
  await clickPanelControl("element.shadow.set");
  await openContext("更多");
  await clickPanelControl("element.arrange.flip.set", "水平翻转");
  await openContext("更多");
  await clickPanelControl("element.arrange.flip.set", "垂直翻转");
  await openContext("更多");
  const rotation = page.locator('#property-panel input[data-control="element.rotate.set"]');
  await rotation.fill("8");
  await rotation.press("Tab");
  mark("element.shadow.set", "element.arrange.flip.set", "element.rotate.set");

  for (const [field, value] of [["X", 180], ["Y", 180], ["W", 330], ["H", 190]]) {
    await setBoundsField(field, value);
  }
  await shape.locator.click({ force: true });
  await dragEl(page, shape.id, 25, 12);
  await page.waitForTimeout(180);
  await shape.locator.click({ force: true });
  await dragHandle(page, shape.id, "se", 30, 20);
  mark("element.bounds.set");

  // Lock/unlock and hide/show are panel toggles; the label flips but the
  // data-control stays the same, so drive them by control id.
  for (const control of ["element.lock.toggle", "element.lock.toggle", "element.visibility.toggle", "element.visibility.toggle"]) {
    await clickPanelControl(control);
  }
  mark("element.lock.toggle", "element.visibility.toggle");

  const shapeCount = await page.locator("#slide .el.shape").count();
  await openContext("更多");
  await clickPanelControl("element.duplicate");
  await page.waitForFunction((count) => document.querySelectorAll("#slide .el.shape").length === count + 1, shapeCount);
  mark("element.duplicate");
  await openContext("更多");
  await clickPanelControl("element.delete");
  await page.waitForFunction((count) => document.querySelectorAll("#slide .el.shape").length === count, shapeCount);
  mark("element.delete");
  await shape.locator.click({ force: true });

  await page.locator('button[data-insert="shape"]').click();
  await page.locator('#lib-tabs [data-lib="line"]').click();
  await page.locator("#line-presets").getByRole("button", { name: "箭头", exact: true }).click();
  mark("insert.line");
  const line = await stableSelected("line");
  for (const [field, value] of [["X", 600], ["Y", 230], ["W", 380], ["H", 110]]) {
    await setBoundsField(field, value);
  }
  await openContext("线条");
  const lineLabel = page.locator('#pop-line input[data-control="element.line.label.set"]');
  await lineLabel.fill("传导路径");
  await lineLabel.press("Tab");
  await openContext("线条");
  await setColor(page.locator('#pop-line input[type="color"]'), "#b45309");
  await openContext("线条");
  const lineWidth = page.locator('#pop-line input[type="number"]');
  await lineWidth.fill("4");
  await lineWidth.press("Tab");
  await openContext("线条");
  const arrowSelects = page.locator("#pop-line select");
  await arrowSelects.nth(0).selectOption("oval");
  await openContext("线条");
  await page.locator("#pop-line select").nth(1).selectOption("arrow");
  await openContext("线条");
  await page.locator('#pop-line .ctx-btn[data-value="dash"]', { hasText: "虚线" }).click();
  await openContext("线条");
  await page.locator('#pop-line .ctx-btn[data-value="smooth"]', { hasText: "平滑" }).click();
  mark("element.line.label.set", "element.shape.border.set", "element.line.arrow.set", "element.line.curve.set");
  await line.locator.click({ force: true });
  const point = line.locator.locator("circle.bez").first();
  const pointBox = await point.boundingBox();
  assert.ok(pointBox, "selected line must expose editable points");
  await page.mouse.move(pointBox.x + pointBox.width / 2, pointBox.y + pointBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pointBox.x + pointBox.width / 2 + 18, pointBox.y + pointBox.height / 2 + 12, { steps: 8 });
  await page.mouse.up();
  mark("element.line.points.set");

  // Icon insertion has no editor affordance by design: seed through the command path.
  const seededIcon = await insertViaCommand(page, "icon");
  mark("insert.icon");
  const iconId = (seededIcon.model?.elements || []).find((el) => el.type === "icon")?.id;
  assert.ok(iconId, "command-seeded icon must exist in the returned model");
  await selectSeededElement(iconId, seededIcon.model?.pageIndex);
  const icon = await stableSelected("icon");
  for (const [field, value] of [["X", 1100], ["Y", 220], ["W", 130], ["H", 130]]) {
    await setBoundsField(field, value);
  }
  await openContext("图标");
  await setColor(page.locator('#pop-icon input[type="color"]'), "#7c3aed");
  await openContext("图标");
  const iconSelect = page.locator("#pop-icon select");
  if ((await iconSelect.locator("option").count()) > 1) await iconSelect.selectOption({ index: 1 });
  mark("element.icon.color.set", "element.icon.name.set");
  await screenshot("shape-line-icon-editing");

  await shape.locator.click({ force: true });
  await page.waitForFunction((id) => {
    const selected = [...document.querySelectorAll("#slide .el.selected")].map((node) => node.dataset.id);
    return selected.length === 1 && selected[0] === id;
  }, shape.id);
  await line.locator.click({ force: true, modifiers: ["Shift"] });
  await page.waitForFunction(({ shapeId, lineId }) => {
    const selected = new Set([...document.querySelectorAll("#slide .el.selected")].map((node) => node.dataset.id));
    return selected.size === 2 && selected.has(shapeId) && selected.has(lineId);
  }, { shapeId: shape.id, lineId: line.id });
  await icon.locator.click({ force: true, modifiers: ["Shift"] });
  await page.waitForTimeout(650);
  const selectedAfterShift = await page.locator("#slide .el.selected").evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
  assert.equal(selectedAfterShift.length, 3, `Shift multi-select must retain all items; selected=${selectedAfterShift.join(",")}`);
  await openContext("对齐");
  await page.locator("#pop-align .ctx-btn", { hasText: "垂直居中" }).click();
  await openContext("分布");
  await clickPanelControl("element.arrange.distribute.set", "水平分布");
  mark("element.arrange.align.set", "element.arrange.distribute.set");
  await contextButton("编组").click();
  mark("element.group.set");
  await openContext("更多");
  await clickPanelControl("element.ungroup.set");
  mark("element.ungroup.set");
  await screenshot("arrange-grouping");
}

async function flowImage() {
  await loadFlow("05-image", { blank: true });
  const image = await insertImage(path.join(SOURCE, "media/bg_data.png"));
  const imageId = await image.getAttribute("data-id");
  assert.ok(imageId, "image must expose a stable element id");
  const stable = page.locator(`#slide .el.image[data-id="${imageId}"]`);

  await openContext("裁切 / 遮罩");
  await page.locator("#pop-crop .ctx-btn", { hasText: "椭圆" }).click();
  mark("element.image.mask.set");
  await stable.click({ force: true });
  await page.locator("#crop-start").click();
  await dragCropHandle(page, imageId, "se", -35, -24);
  await page.locator("#crop-done").click();
  mark("element.image.crop.set");

  const fitModes = { 完整显示: "contain", 裁切铺满: "cover", 拉伸填满: "fill" };
  for (const label of ["完整显示", "裁切铺满", "拉伸填满", "裁切铺满"]) {
    // 填充方式 is a panel select now.
    await openContext("图片");
    await selectPanelOption('#property-panel select[data-control="element.image.fit.set"]', fitModes[label]);
  }
  mark("element.image.fit.set");

  const chooserPromise = page.waitForEvent("filechooser");
  await clickPanelControl("element.image.replace");
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(SOURCE, "media/bg_cabin.png"));
  await page.waitForTimeout(450);
  mark("element.image.replace");
  await screenshot("image-crop-mask-fit");

  await stable.click({ force: true });
  const beforeRebuild = (await apiModel()).model.elements.length;
  // 重建 uses the in-panel rebuild form now (#image-rebuild-prompt), not prompt().
  await openContext("图片");
  await page.locator("#image-rebuild-prompt").fill("发现问题, 分析原因, 落地行动");
  await page.locator('#image-rebuild-form button[type="submit"]').click();
  await page.waitForTimeout(800);
  const rebuilt = (await apiModel()).model.elements;
  assert.ok(rebuilt.length > beforeRebuild, "image rebuild must add editable text/shape/line nodes");
  assert.ok(rebuilt.some((el) => el.type === "text" && el.text === "结构重建"), "image rebuild must label the editable reconstruction");
  assert.ok(rebuilt.some((el) => el.type === "text" && el.text === "发现问题"), "image rebuild must preserve the supplied node labels");
  mark("element.image.rebuild");
  await screenshot("image-rebuild-editable");
}

async function flowTable() {
  await loadFlow("06-table", { blank: true });
  await page.locator('button[data-insert="table"]').click();
  const size = page.locator('#table-size-grid .table-size-cell[data-r="3"][data-c="4"]');
  await size.waitFor({ state: "visible" });
  await size.click();
  mark("insert.table");
  const table = await stableSelected("table");
  const cells = table.locator.locator("td");
  await cells.nth(0).dblclick();
  await page.keyboard.type("指标");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(350);
  await cells.nth(1).dblclick();
  await page.keyboard.type("Q1");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(350);
  const editedTable = (await apiModel()).model.elements.find((el) => el.id === table.id);
  assert.equal(editedTable?.tableRows?.[0]?.[0]?.text, "指标", "first table cell edit must persist before the next operation");
  assert.equal(editedTable?.tableRows?.[0]?.[1]?.text, "Q1", "second table cell edit must persist before the next operation");
  mark("element.table.cell.set");

  await cells.nth(4).click();
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "+行" }).click();
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "+列" }).click();
  mark("element.table.row.add", "element.table.col.add");
  await page.waitForTimeout(350);
  await closeContext("表格");
  await table.locator.locator("td").last().click({ force: true });
  await page.waitForTimeout(180);
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "-行" }).click();
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "-列" }).click();
  mark("element.table.row.delete", "element.table.col.delete");

  await openContext("表格");
  await setColor(page.locator("#ctx-table-fill"), "#dbeafe");
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "居中" }).click();
  mark("element.table.cell.fill.set", "element.table.cell.align.set");

  await closeContext("表格");
  const refreshedCells = table.locator.locator("td");
  await refreshedCells.nth(0).click();
  await refreshedCells.nth(1).click({ modifiers: ["Shift"] });
  await openContext("表格");
  await page.locator("#pop-table .ctx-btn", { hasText: "合并" }).click();
  mark("element.table.merge");
  await page.waitForTimeout(300);
  const mergedModel = (await apiModel()).model.elements.find((el) => el.id === table.id);
  assert.equal(mergedModel?.tableRows?.[0]?.[0]?.colSpan, 2, "table model must persist the merged range");
  assert.equal(await table.locator.locator("td").first().getAttribute("colspan"), "2", "merged cell must span two columns");
  await screenshot("table-editing");

  await reloadCurrentPage();
  const persisted = page.locator("#slide .el.table").last();
  assert.match(await persisted.innerText(), /指标/, "table text must persist after reload");
  assert.equal(await persisted.locator("td").first().getAttribute("colspan"), "2", "table merge must persist after reload");
}

async function flowSmartArt() {
  await loadFlow("07-smartart", { blank: true });
  // SmartArt insertion has no editor affordance by design: seed through the
  // command path (the 更多 menu and its palette are retired).
  const seededSmartArt = await insertViaCommand(page, "smartart");
  mark("insert.smartart");
  await page.waitForTimeout(200);
  // Trust the command response (the reload re-pins &page=0, so a fresh /api/model
  // read would describe page 0 instead of the page the SmartArt landed on).
  const seededOwnerId = (seededSmartArt.model?.elements || []).find((el) => el.smartArt)?.id;
  assert.ok(seededOwnerId, "seeded SmartArt must be in the returned model");
  await selectSeededElement(seededOwnerId, seededSmartArt.model?.pageIndex);
  let state = (await apiModel()).model;
  let owner = state.elements.find((el) => el.id === seededOwnerId);
  assert.ok(owner, "SmartArt insertion must create an editable owner node");
  let ownerEl = page.locator(`#slide .el[data-id="${owner.id}"]`);
  await ownerEl.click({ force: true });
  const before = state.elements.length;
  await contextButton("加节点").click();
  await page.waitForTimeout(250);
  state = (await apiModel()).model;
  assert.ok(state.elements.length > before, "SmartArt add-node must add editable nodes/connectors");
  mark("element.smartart.node.add");
  owner = state.elements.filter((el) => el.smartArt?.role === "node").at(-1);
  ownerEl = page.locator(`#slide .el[data-id="${owner.id}"]`);
  await ownerEl.click({ force: true });
  await contextButton("删节点").click();
  mark("element.smartart.node.delete");
  await page.waitForTimeout(250);
  state = (await apiModel()).model;
  owner = state.elements.find((el) => el.smartArt);
  ownerEl = page.locator(`#slide .el[data-id="${owner.id}"]`);
  await ownerEl.click({ force: true });
  for (const layout of ["循环", "层级", "流程"]) {
    await openContext("SmartArt 布局");
    await page.locator("#pop-sa-layout .ctx-btn", { hasText: layout }).click();
    await page.waitForTimeout(220);
    state = (await apiModel()).model;
    owner = state.elements.find((el) => el.smartArt);
    ownerEl = page.locator(`#slide .el[data-id="${owner.id}"]`);
    await ownerEl.click({ force: true });
  }
  mark("element.smartart.layout.set");
  await page.locator("#slide").click({ position: { x: 24, y: 24 } });
  await page.waitForTimeout(160);
  assert.equal(await page.locator("#slide .el.selected").count(), 0, "SmartArt output review must not include selection guides");
  const connectorEvidence = await page.locator("#slide .el.line").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-id"),
      rect: (() => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })(),
      style: {
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
      },
      path: node.querySelector("svg > path")?.getAttribute("d") || "",
      stroke: node.querySelector("svg > path")?.getAttribute("stroke") || "",
      computed: (() => {
        const css = getComputedStyle(node);
        return {
          display: css.display,
          visibility: css.visibility,
          opacity: css.opacity,
          overflow: css.overflow,
          lineHeight: css.lineHeight,
          zIndex: css.zIndex,
          svgDisplay: getComputedStyle(node.querySelector("svg")).display,
        };
      })(),
      html: node.innerHTML.slice(0, 500),
      midpointStack: (() => {
        const rect = node.getBoundingClientRect();
        return document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          .slice(0, 6)
          .map((item) => ({
            tag: item.tagName,
            cls: item.getAttribute("class"),
            id: item.getAttribute("data-id") || item.id,
          }));
      })(),
    })),
  );
  report.smartArtDomOrder = await page.locator("#slide > .el").evaluateAll((nodes) =>
    nodes.map((node) => ({ id: node.getAttribute("data-id"), cls: node.getAttribute("class") })),
  );
  if (!connectorEvidence.every((item) => item.path && item.stroke)) {
    console.error(JSON.stringify({ connectorEvidence }, null, 2));
  }
  assert.equal(connectorEvidence.length, 2, "three-node process SmartArt must render two connectors");
  assert.ok(connectorEvidence.every((item) => item.path && item.stroke), "SmartArt connectors must render visible SVG paths");
  report.smartArtConnectors = connectorEvidence;
  await screenshot("smartart-editing");

  for (const [layout, label] of [["cycle", "循环"], ["hierarchy", "层级"]]) {
    // Seed each layout through the command path (the 更多 palette is retired).
    await page.evaluate(async (wanted) => {
      const project = new URLSearchParams(location.search).get("project") || "";
      await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd: "insert", kind: "smartart", layout: wanted }),
      });
    }, layout);
    await page.waitForFunction(async (expected) => {
      const response = await fetch("/api/model");
      const data = await response.json();
      return (data.model ?? data).elements.filter((element) => element.smartArt?.layout === expected).length >= 3;
    }, layout);
    const direct = (await apiModel()).model.elements.filter((element) => element.smartArt?.layout === layout);
    assert.ok(direct.length >= 3, `${label} direct insertion must create editable SmartArt nodes/connectors with layout=${layout}`);
  }
  mark("insert.smartart");
}

async function flowThemeCollaborationHistory() {
  await loadFlow("08-theme-collaboration-history");

  // The 更多 → 主题色 panel (theme colour, page background and page gradient) is
  // retired by design: the shell must no longer expose any of those entries.
  assert.equal(await page.locator("#btn-more, #btn-theme").count(), 0, "theme menu must be gone from the shell");
  assert.equal(await page.locator('#ctx-bar input[data-control="theme.color.set"], #ctx-bar input[data-control="theme.background.set"]').count(), 0,
    "theme colour / background controls must be gone");
  mark("theme.retired");

  // The page-gradient controls (起始色 / 结束色 / 页渐变) were part of the same
  // retired theme panel, so nothing is exercised here any more.
  assert.equal(await page.locator('#ctx-bar input[aria-label="页面渐变起始色"]').count(), 0,
    "page gradient controls must be gone with the theme panel");

  // Keyboard help opens through its shortcut (Shift+/) and closes with Escape;
  // there is no shell button for it any more.
  await page.keyboard.press("Shift+/");
  await page.locator("#kbd-help").waitFor({ state: "visible" });
  assert.match(await page.locator("#kbd-help").innerText(), /⌘Z/);
  await page.keyboard.press("Escape");
  await page.locator("#kbd-help").waitFor({ state: "hidden" });
  mark("chrome.keyboard.help");
  await screenshot("theme-editing");

  await page.locator("#btn-notes-link").click();
  await page.locator("#notes-panel").waitFor({ state: "visible" });
  await page.locator("#notes-text").fill("讲解重点：先说结论，再解释数据口径，最后明确责任人与日期。");
  await page.waitForTimeout(500);
  const noted = await apiModel();
  assert.match(noted.model.notes || "", /先说结论/, "speaker notes must persist into the model");
  mark("chrome.notes.toggle", "notes.content.set");

  await page.locator("#btn-comments").click();
  await page.locator("#comment-panel").waitFor({ state: "visible" });
  const pinsBefore = await page.locator("#comment-layer .pin").count();
  await page.locator('[data-comment-scope="page"]').click();
  await page.locator("#comment-draft").fill("请核对这页数据口径，并在结论中写明负责人。");
  await page.locator("#comment-add").click();
  const commentCard = page.locator("#comment-list .comment-card").first();
  await commentCard.waitFor({ state: "visible" });
  // Count relatively: the project may already carry stored threads, so the new
  // comment must add exactly one pin and resolving it must remove exactly one.
  assert.equal(await page.locator("#comment-layer .pin").count(), pinsBefore + 1, "saved comment must leave a visible pin");
  mark("chrome.comment.pin");
  await screenshot("comment-and-notes");
  await commentCard.locator('[data-act="del"]').click();
  await page.waitForFunction((expected) => document.querySelectorAll("#comment-layer .pin").length === expected, pinsBefore, { timeout: 4000 });
  assert.equal(await page.locator("#comment-layer .pin").count(), pinsBefore, "resolved comment must leave the open-comment view");
  await page.locator("#comment-panel-close").click();

  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  mark("chrome.workspace.toggle");
  // This copied offline fixture has no DSH conversation. The real product must
  // fail honestly and recover input, never run the old scripted title rewrite.
  // Successful turn/scope contracts live in editor-agent-human-audit.mjs and
  // authentic provider generation remains a separate credentialed acceptance.
  const beforeAgent = await apiModel();
  const request = "把标题改为“办公场景验收”";
  await page.locator("#work-brief").fill(request);
  await page.locator("#work-form .composer-send").click();
  await page.locator("#work-thread .tool-row.is-expandable").last().waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#work-form").waitFor({ state: "visible" });
  const refined = await apiModel();
  assert.deepEqual(refined.model.elements, beforeAgent.model.elements, "missing-session failure must leave the document unchanged");
  assert.match(await page.locator("#work-thread").innerText(), /没有可继续对话/);
  assert.equal(await page.locator("#work-brief").inputValue(), request, "failed input must be recoverable");
  mark("chrome.workspace.refine");
  await screenshot("workspace-no-session-recovery");
  await page.locator("#chat-close").click();

  await page.locator("#btn-versions").click();
  await page.locator("#version-menu").waitFor({ state: "visible" });
  mark("chrome.history.versions.open");
  const [snapshotResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/versions" && response.request().method() === "POST"),
    page.locator("#version-save").click(),
  ]);
  const snapshot = await snapshotResponse.json();
  const snapshotId = String(snapshot.version?.id || "");
  assert.ok(snapshotId, "version snapshot response must identify the stored version");
  const snapshotPageCount = Number((await apiModel()).model.pageCount);
  mark("chrome.history.versions.snapshot");
  // Saving keeps the versions menu open. Close it explicitly so the later
  // button click deterministically opens the refreshed historical list.
  await page.locator("#btn-versions").click();
  await page.locator("#version-menu").waitFor({ state: "hidden" });
  // Make the live draft structurally and textually different so preview chrome,
  // rail thumbnails, and notes can all be checked against the stored version.
  await page.locator("#rail .rail-add").click();
  await page.waitForFunction((count) => document.querySelectorAll("#rail .thumb").length === count + 1, snapshotPageCount);
  await page.locator("#notes-text").fill("临时改动：还原后应恢复先前演讲者备注。");
  await page.waitForTimeout(500);
  await page.locator("#btn-versions").click();
  const preview = page.locator(`#versions-list .version-row[data-version-id="${snapshotId}"][data-control="chrome.history.versions.preview"]`);
  await preview.waitFor({ state: "visible" });
  await preview.click();
  await page.locator("#history-bar").waitFor({ state: "visible" });
  assert.ok(await page.locator("#history-readonly").isVisible(), "version preview must visibly enter read-only mode");
  assert.match(await page.locator("#notes-text").inputValue(), /先说结论/, "preview notes must come from the stored version");
  assert.doesNotMatch(await page.locator("#notes-text").inputValue(), /临时改动/, "preview must not leak live-draft notes");
  assert.equal(await page.locator("#notes-text").isEditable(), false, "preview notes must be read-only");
  assert.match(await page.locator("#notes-panel label").innerText(), /历史版本只读/, "preview notes must have a visible read-only label");
  assert.equal(await page.locator("#notes-text").evaluate((node) => getComputedStyle(node).resize), "none", "preview notes must not show an edit resize affordance");
  assert.equal(await page.locator("#btn-export").isDisabled(), true, "preview export must be visibly disabled");
  assert.equal(await page.locator("#btn-zoom-in").isDisabled(), true, "preview zoom must be visibly disabled");
  assert.equal(await page.locator("#rail .thumb").first().isEnabled(), true, "preview page navigation must remain available");
  assert.equal(await page.locator("#work-chat").isHidden(), true, "preview must close the Agent authoring panel");
  assert.match(await page.locator("#page-count").innerText(), new RegExp(`/ ${snapshotPageCount}$`), "preview page count must come from the stored version");
  assert.equal(await page.locator("#rail .thumb").count(), snapshotPageCount, "preview rail must use stored-version pages");
  await page.locator("#rail .thumb").nth(1).click();
  assert.match(await page.locator("#page-count").innerText(), new RegExp(`^2 / ${snapshotPageCount}$`), "preview navigation must update only the historical page");
  assert.equal(await page.locator("#notes-text").inputValue(), "", "preview page 2 must show its own stored notes");
  assert.equal(await page.locator("#notes-text").isEditable(), false, "preview page 2 notes must remain read-only");
  await page.locator("#rail .thumb").first().click();
  assert.match(await page.locator("#notes-text").inputValue(), /先说结论/, "returning to preview page 1 must restore its stored notes");
  mark("chrome.history.versions.preview");
  await screenshot("version-preview-readonly");
  await page.locator("#history-back").click();
  await page.locator("#history-bar").waitFor({ state: "hidden" });
  assert.match(await page.locator("#notes-text").inputValue(), /临时改动/, "returning to latest must restore live-draft notes");
  assert.equal(await page.locator("#notes-text").isEditable(), true, "latest draft notes must become editable again");
  assert.doesNotMatch(await page.locator("#notes-panel label").innerText(), /历史版本只读/, "latest notes must remove the preview-only label");
  assert.equal(await page.locator("#rail .thumb").count(), snapshotPageCount + 1, "latest draft rail must be restored");
  await page.locator("#rail .thumb").first().click();
  await page.waitForFunction(() => document.querySelector("#page-count")?.textContent?.trim().startsWith("1 /"));
  await page.locator("#btn-versions").click();
  const restorePreview = page.locator(`#versions-list .version-row[data-version-id="${snapshotId}"][data-control="chrome.history.versions.preview"]`);
  await restorePreview.waitFor({ state: "visible" });
  await restorePreview.click();
  await page.locator("#history-bar").waitFor({ state: "visible" });
  await page.locator("#history-restore").click();
  await page.locator("#history-bar").waitFor({ state: "hidden" });
  mark("chrome.history.versions.restore");
  const restored = await apiModel();
  assert.match(restored.model.notes || "", /先说结论/, "restoring a version must retain the saved speaker notes");
  report.versionHistory = {
    snapshotId,
    snapshotPageCount,
    previewNotes: "讲解重点：先说结论，再解释数据口径，最后明确责任人与日期。",
    previewPageNavigation: "page1 -> page2 -> page1",
    previewPageTwoNotes: "",
    latestDraftNotesAfterBack: "临时改动：还原后应恢复先前演讲者备注。",
    restoredNotes: restored.model.notes || "",
  };
}

async function flowPresentExportAndMore() {
  await loadFlow("09-present-export-more");

  assert.equal(await page.locator("#btn-share, #share-dialog").count(), 0, "intranet editor must not offer sharing");

  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  await page.locator("#chat-close").click();

  // The 更多 menu and its 公式 action are retired by design, so nothing is
  // exercised here any more; the shell must not expose them.
  assert.equal(await page.locator("#btn-more, #btn-formula").count(), 0, "formula entry must be gone from the shell");
  mark("insert.formula.retired");

  await page.locator("#btn-play").click();
  await page.locator("#present").waitFor({ state: "visible" });
  assert.ok(await page.locator("#present-slide .el").count(), "presentation mode must render the current slide");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.locator("#present").waitFor({ state: "hidden" });
  mark("chrome.present.play");

  await page.evaluate(() => {
    window.__fullscreenRequests = 0;
    document.documentElement.requestFullscreen = async () => { window.__fullscreenRequests += 1; };
  });
  await page.locator("#btn-fs").click();
  assert.equal(await page.evaluate(() => window.__fullscreenRequests), 1, "fullscreen button must call requestFullscreen");
  mark("chrome.present.fullscreen");

  await page.locator("#btn-export").click();
  await page.locator("#export-dialog").waitFor({ state: "visible" });
  mark("chrome.export.open");
  const pptxPath = path.join(OUT, "office-editor-export.pptx");
  await page.locator("#export-pptx").click();
  const [pptxDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.locator("#export-download").click(),
  ]);
  await pptxDownload.saveAs(pptxPath);
  assert.ok(fs.statSync(pptxPath).size > 10_000, "PPTX export must produce a non-trivial file");
  assert.equal(fs.readFileSync(pptxPath).subarray(0, 2).toString("ascii"), "PK", "PPTX export must be a ZIP package");
  mark("chrome.export.pptx");
  report.exports.push({ format: "pptx", path: pptxPath, bytes: fs.statSync(pptxPath).size });

  const pngPath = path.join(OUT, "office-editor-export.png");
  await page.locator("#export-png").click();
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.locator("#export-download").click(),
  ]);
  await pngDownload.saveAs(pngPath);
  assert.ok(fs.statSync(pngPath).size > 5_000, "PNG export must produce a non-trivial image");
  const pngBytes = fs.readFileSync(pngPath);
  assert.equal(pngBytes.subarray(1, 4).toString("ascii"), "PNG", "PNG export must have the PNG signature");
  assert.deepEqual([pngBytes.readUInt32BE(16), pngBytes.readUInt32BE(20)], [960, 540], "PNG export must use native slide dimensions");
  mark("chrome.export.image");
  report.exports.push({ format: "png", path: pngPath, bytes: fs.statSync(pngPath).size });
  await page.locator("#export-result").waitFor({ state: "visible" });
  await screenshot("export-result");
  await page.locator('#export-dialog button[value="cancel"]').click();
}

async function main() {
  await waitForServer();
  const flows = {
    chrome: flowChromePages,
    text: flowText,
    chart: flowChart,
    shapes: flowShapeLineIcon,
    image: flowImage,
    table: flowTable,
    smartart: flowSmartArt,
    theme: flowThemeCollaborationHistory,
    export: flowPresentExportAndMore,
  };
  if (ONLY) {
    const flow = flows[ONLY];
    assert.ok(flow, `unknown QA_ONLY=${ONLY}; expected ${Object.keys(flows).join("|")}`);
    await flow();
  } else {
    for (const flow of Object.values(flows)) await flow();
  }
  assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join(" | ")}`);
  report.finishedAt = new Date().toISOString();
  report.exercisedControls = [...exercised].sort();
  report.observedControls = [...observed].sort();
  report.browserErrors = browserErrors;
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    steps: report.steps.length,
    exercisedControls: report.exercisedControls.length,
    report: path.join(OUT, "report.json"),
  }));
}

try {
  await main();
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.exercisedControls = [...exercised].sort();
  report.observedControls = [...observed].sort();
  report.browserErrors = browserErrors;
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  server.kill("SIGKILL");
  if (!KEEP) fs.rmSync(SCRATCH, { recursive: true, force: true });
}
