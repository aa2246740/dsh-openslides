#!/usr/bin/env node
/**
 * Data-driven acceptance for every tile exposed by the bounded shape/icon
 * palettes. Uses a disposable project, a random localhost server and the
 * pinned Chromium runtime. Each tile click must persist its exact catalog id.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadProject } from "../../packages/pptd-v2/dist/index.js";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "oss-canvas-palettes-"));
const PROJECT = path.join(SCRATCH_ROOT, "project");
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-canvas-controls"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
fs.cpSync(SOURCE, PROJECT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const ledger = {
  schemaVersion: "open-slidestudio.editor-canvas-palettes.v1",
  startedAt: new Date().toISOString(),
  transport: "owned localhost native-web server",
  fixture: path.relative(ROOT, SOURCE),
  rows: [],
  browserErrors: [],
  limitations: [
    "Tile exhaustiveness is defined by the bounded UI surfaces: the first 177 all-shape entries and first 96 solid-icon entries rendered by the product.",
  ],
};

function row(id, assertion, evidence = {}) {
  ledger.rows.push({ id, status: "pass", assertion, ...evidence });
}

async function randomPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => listener.close(resolve));
  assert.ok(port > 0);
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let index = 0; index < 100; index += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`native-web did not start on ${PORT}\n${serverLog.slice(-2000)}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") ledger.browserErrors.push(message.text());
});
page.on("pageerror", (error) => ledger.browserErrors.push(String(error)));

async function captureCommand(expected, action, matches = () => true) {
  const requestPromise = page.waitForRequest((request) => {
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try {
      const body = JSON.parse(request.postData() || "{}");
      return body.cmd === expected && matches(body);
    } catch {
      return false;
    }
  });
  await action();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  const response = await request.response();
  assert.ok(response);
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.ok(data.model);
  return { body, model: data.model };
}

function selectedElement(model) {
  const id = model.selection?.kind === "element" ? model.selection.elementId : "";
  return model.elements.find((element) => element.id === id);
}

function persistedElement(elementId) {
  const project = loadProject(PROJECT);
  return project.pages.flatMap((entry) => entry.page.elements || [])
    .find((element) => element.elementId === elementId);
}

async function waitPersistedTable(elementId, rows, cols) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const element = persistedElement(elementId);
    if (element?.rows?.length === rows && element.rows.every((entry) => entry.length === cols)) return element;
    await sleep(20);
  }
  return persistedElement(elementId);
}

async function undoInserted(elementId) {
  const result = await captureCommand("undo", () => page.locator("#btn-undo").click());
  assert.ok(!result.model.elements.some((element) => element.id === elementId));
  assert.equal(persistedElement(elementId), undefined, `undo must remove persisted ${elementId}`);
}

async function openShapePalette(tab = "shape") {
  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  await page.locator("#shape-palette").waitFor({ state: "visible" });
  if (tab !== "shape") await page.locator(`#lib-tabs [data-lib="${tab}"]`).click();
  const surface = tab === "line" ? "#line-presets" : "#shape-grid";
  await page.locator(surface).waitFor({ state: "visible" });
}

async function exhaustiveTableSizes() {
  for (let rows = 1; rows <= 6; rows += 1) {
    for (let cols = 1; cols <= 6; cols += 1) {
      await page.locator('#insert-toolbar [data-insert="table"]').click();
      await page.locator("#table-size-grid").waitFor({ state: "visible" });
      const tile = page.locator(`#table-size-grid [data-r="${rows}"][data-c="${cols}"]`);
      assert.equal(await tile.getAttribute("data-control"), "insert.table");
      assert.equal(await tile.getAttribute("data-tip"), `${rows} × ${cols}`);
      await tile.hover();
      assert.equal((await page.locator("#table-size-label").innerText()).trim(), `${rows} × ${cols}`);
      const inserted = await captureCommand("insert", () => tile.click(), (body) => body.kind === "table");
      const elementId = selectedElement(inserted.model)?.id;
      assert.ok(elementId, `${rows}×${cols} must select the inserted table`);
      await page.waitForFunction(async ({ targetId, expectedRows, expectedCols }) => {
        const response = await fetch("/api/model");
        const data = await response.json();
        const element = (data.model ?? data).elements.find((item) => item.id === targetId);
        return element?.tableRows?.length === expectedRows
          && element.tableRows.every((row) => row.length === expectedCols);
      }, { targetId: elementId, expectedRows: rows, expectedCols: cols });
      const disk = await waitPersistedTable(elementId, rows, cols);
      assert.equal(disk?.elementType, "table");
      assert.equal(disk?.rows?.length, rows);
      assert.ok(disk.rows.every((entry) => entry.length === cols),
        `${rows}×${cols} persisted row widths=${disk.rows.map((entry) => entry.length).join(",")}`);
      row(`palette.table.${rows}x${cols}`, "table size tile displays, creates and persists its exact row/column dimensions", { rows, cols, elementId });
      const deleted = await captureCommand("deleteSelected", () => page.keyboard.press("Delete"));
      assert.ok(!deleted.model.elements.some((element) => element.id === elementId));
      assert.equal(persistedElement(elementId), undefined);
    }
  }
}

async function exhaustiveLinePresets() {
  for (const [label, expectedArrow] of [["直线", [null, null]], ["箭头", [null, "arrow"]], ["双箭头", ["arrow", "arrow"]]]) {
    await openShapePalette("line");
    const tile = page.locator("#line-presets button").filter({ hasText: new RegExp(`^${label}$`) });
    assert.equal(await tile.getAttribute("data-control"), "insert.line");
    const arrowResponse = page.waitForResponse((response) => {
      if (!isApiCommandUrl(response.url()) || response.request().method() !== "POST") return false;
      const body = JSON.parse(response.request().postData() || "{}");
      return body.cmd === "setLineArrow";
    });
    const inserted = await captureCommand("insert", () => tile.click(), (body) => body.kind === "line");
    const elementId = selectedElement(inserted.model)?.id;
    assert.ok(elementId, `${label} must select the inserted line`);
    const response = await arrowResponse;
    assert.equal(response.status(), 200);
    const requestBody = JSON.parse(response.request().postData() || "{}");
    assert.deepEqual(requestBody.arrow, expectedArrow);
    const final = await response.json();
    const element = final.model.elements.find((item) => item.id === elementId);
    assert.deepEqual(element?.lineArrow || [null, null], expectedArrow);
    assert.equal(persistedElement(elementId)?.elementType, "line");
    row(`palette.line.${label}`, "line preset emits insert followed by its exact arrow mapping and persists an editable line", { label, arrow: expectedArrow, elementId });
    const deleted = await captureCommand("deleteSelected", () => page.keyboard.press("Delete"));
    assert.ok(!deleted.model.elements.some((item) => item.id === elementId));
  }
}

async function shapeFilters(catalog) {
  await openShapePalette();
  const expectedAll = catalog.slice(0, 177).map((item) => item.title || item.name);
  const visibleAll = await page.locator("#shape-grid button").evaluateAll((nodes) => nodes.map((node) => node.querySelector("small")?.textContent || node.getAttribute("title") || ""));
  assert.deepEqual(visibleAll, expectedAll);
  assert.equal(Number(await page.locator("#shape-count").innerText()), catalog.length);
  row("palette.shape.all", "all-shapes view preserves catalog order and the documented 177-tile cap", { catalogCount: catalog.length, visibleCount: expectedAll.length });

  const categoryButtons = page.locator("#shape-cats button");
  const categoryCount = await categoryButtons.count();
  const remainingGroups = new Set(catalog.map((item) => item.group).filter(Boolean));
  for (let index = 1; index < categoryCount; index += 1) {
    const label = (await categoryButtons.nth(index).innerText()).trim();
    await categoryButtons.nth(index).click();
    assert.ok(await categoryButtons.nth(index).evaluate((node) => node.classList.contains("on")));
    const titles = await page.locator("#shape-grid button").evaluateAll((nodes) => nodes.map((node) => node.querySelector("small")?.textContent || ""));
    const matches = [...remainingGroups].filter((group) => {
      const expected = catalog.filter((item) => item.group === group).slice(0, 177).map((item) => item.title || item.name);
      return JSON.stringify(expected) === JSON.stringify(titles);
    });
    assert.equal(matches.length, 1, `shape category ${label} must map to exactly one catalog group`);
    remainingGroups.delete(matches[0]);
    row(`palette.shape.category.${index}`, "shape category filters to its exact catalog group", { label, group: matches[0], visibleCount: titles.length });
  }
  assert.equal(remainingGroups.size, 0, `all shape groups must have a category: ${[...remainingGroups].join(",")}`);
  await page.locator("#shape-cats button").first().click();

  const target = catalog.find((item) => item.name && item.title) || catalog[0];
  await page.locator("#shape-search").fill(target.name);
  const matches = await page.locator("#shape-grid button").evaluateAll((nodes) => nodes.map((node) => node.querySelector("small")?.textContent || ""));
  assert.ok(matches.includes(target.title || target.name));
  row("palette.shape.search", "shape search finds a known catalog id/title", { query: target.name, matches: matches.length });
  await page.locator("#shape-search").fill("qa-no-such-shape-7f31a0");
  assert.equal(await page.locator("#shape-grid button").count(), 0);
  assert.equal(Number(await page.locator("#shape-count").innerText()), 0);
  row("palette.shape.search.empty", "unknown shape search produces a truthful empty result");
  await page.locator("#shape-search").fill("");
  await page.locator("#shape-palette").evaluate((node) => { node.hidden = true; });
}

async function exhaustiveShapes(catalog) {
  const expected = catalog.slice(0, 177);
  for (let index = 0; index < expected.length; index += 1) {
    const item = expected[index];
    await openShapePalette();
    const tile = page.locator("#shape-grid button").nth(index);
    assert.equal(await tile.getAttribute("data-control"), "insert.shape");
    assert.equal((await tile.locator("small").innerText()).trim(), item.title || item.name);
    const result = await captureCommand("insert", () => tile.click(), (body) => body.kind === "shape" && body.shapeName === item.name);
    const element = selectedElement(result.model);
    assert.equal(element?.type, "shape");
    assert.equal(element?.shapeName, item.name);
    const disk = persistedElement(element.id);
    assert.equal(disk?.elementType, "shape");
    assert.equal(disk?.shapeName, item.name);
    row(`palette.shape.tile.${index}`, "shape tile sends and persists its exact catalog shapeName", { title: item.title || item.name, shapeName: item.name, elementId: element.id });
    await undoInserted(element.id);
  }
}

// Manual icon insertion (and therefore its palette: styles, categories, search,
// 96-tile bounded surface) is retired by design — icons arrive from the agent, and
// hand-editing belongs in PowerPoint. Shape / line / table palettes stay covered.

try {
  await waitForServer();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT)}&page=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  const added = await captureCommand("addPage", () => page.locator("#rail .rail-add").click());
  assert.ok(added.model.pageCount > 8);
  const catalogResponse = await page.evaluate(async () => (await fetch("/api/catalog/shapes")).json());
  const catalog = catalogResponse.shapes || [];
  assert.ok(catalog.length >= 177);

  await exhaustiveLinePresets();
  await exhaustiveTableSizes();
  await shapeFilters(catalog);
  await exhaustiveShapes(catalog);

  assert.deepEqual(ledger.browserErrors, []);
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = { passedRows: ledger.rows.length, failedRows: 0 };
  const file = path.join(OUT, "editor-canvas-palettes-ledger.json");
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, port: PORT, rows: ledger.rows.length, file }));
} catch (error) {
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = { passedRows: ledger.rows.length, failedRows: 1 };
  ledger.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  fs.writeFileSync(path.join(OUT, "editor-canvas-palettes-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  if (!KEEP) fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
}
