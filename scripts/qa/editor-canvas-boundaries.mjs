#!/usr/bin/env node
/**
 * Editor secondary-boundary acceptance.
 *
 * Drives the real native-web UI through the pinned Chromium runtime, observes
 * the HTTP command boundary, checks the returned render model, reads the PPTD
 * files from a disposable project, and reloads the editor for persistence.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadProject } from "../../packages/pptd-v2/dist/index.js";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { dragCropHandle } from "./gestures.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-canvas-boundaries-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(os.tmpdir(), "oss-canvas-boundaries-evidence"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
fs.mkdirSync(OUT, { recursive: true });

const ledger = {
  schemaVersion: "open-slidestudio.editor-canvas-boundaries.v1",
  startedAt: new Date().toISOString(),
  fixture: path.relative(ROOT, SOURCE),
  transport: "owned localhost native-web + pinned Chromium",
  rows: [],
  commands: [],
  browserErrors: [],
  expectedBrowserDiagnostics: [],
  limitations: [
    "The run uses disposable copies of the checked-in PPTD fixture and never opens a user project.",
    "Image crop is verified through actual pointer events, HTTP, PPTD files and reload; pixel-level crop appearance is outside this boundary test.",
  ],
};

function pass(id, assertion, evidence = {}) {
  ledger.rows.push({ id, status: "pass", assertion, ...evidence });
}

function fail(id, assertion, error, evidence = {}) {
  const detail = error instanceof Error ? error.message : String(error);
  ledger.rows.push({ id, status: "fail", assertion, error: detail, ...evidence });
}

async function check(id, assertion, fn) {
  try {
    const evidence = (await fn()) || {};
    pass(id, assertion, evidence);
    return true;
  } catch (error) {
    fail(id, assertion, error);
    return false;
  }
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`native-web did not start on ${PORT}\n${serverLog.slice(-2000)}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") ledger.browserErrors.push(message.text());
});
page.on("pageerror", (error) => ledger.browserErrors.push(String(error)));
page.on("request", (request) => {
  if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return;
  try {
    const body = JSON.parse(request.postData() || "{}");
    ledger.commands.push({ cmd: body.cmd, controlId: body.controlId, patch: body.patch });
  } catch {}
});

function copyProject(name) {
  const project = path.join(SCRATCH, name);
  fs.cpSync(SOURCE, project, { recursive: true });
  return project;
}

async function apiModel() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error(`GET /api/model ${response.status}`);
    return response.json();
  });
}

async function openProject(name) {
  const project = copyProject(name);
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  const before = (await apiModel()).model.pageCount;
  await captureCommand("addPage", () => page.locator("#rail .rail-add").click());
  await page.waitForFunction((count) => {
    const value = document.getElementById("page-count")?.textContent || "";
    return Number(value.split("/")[1]?.trim()) === count + 1;
  }, before);
  return { project, pageIndex: before };
}

async function reloadCurrent() {
  const count = await page.locator("#page-count").innerText();
  const index = Math.max(0, Number(count.split("/")[0]?.trim() || 1) - 1);
  const url = new URL(page.url());
  url.searchParams.set("page", String(index));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
}

async function captureCommand(expected, action, matches = () => true) {
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try {
      const body = JSON.parse(request.postData() || "{}");
      return body.cmd === expected && matches(body);
    } catch {
      return false;
    }
  });
  await action();
  const response = await responsePromise;
  const body = JSON.parse(response.request().postData() || "{}");
  const data = await response.json();
  return { status: response.status(), body, model: data.model, data };
}

async function postCommand(body) {
  const response = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

function modelElement(model, id) {
  return model.elements.find((element) => element.id === id);
}

function diskElement(project, id) {
  const loaded = loadProject(project);
  return loaded.pages.flatMap((entry) => entry.page.elements || []).find((element) => element.elementId === id);
}

function pageDigest(project, pageIndex) {
  const loaded = loadProject(project);
  const file = loaded.pages[pageIndex]?.path;
  assert.ok(file, `page ${pageIndex} must have a path`);
  const absolute = path.isAbsolute(file) ? file : path.join(project, file);
  return crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
}

async function selectedId(type) {
  const locator = page.locator(`#slide .el.${type}.selected`).first();
  await locator.waitFor({ state: "visible" });
  const id = await locator.getAttribute("data-id");
  assert.ok(id, `${type} selection must expose an id`);
  return id;
}

function toolbarButton(name) {
  // Text-style controls moved out of the retired ctx-bar popovers into the
  // coherent property panel, and stateBtn gives them a longer aria-label than
  // their visible text, so match on the visible label.
  return page.locator("#property-panel").locator("button").filter({ hasText: name }).first();
}

/** Links use the in-app dialog (#text-link-dialog) instead of window.prompt. */
async function fillTextLink(value, { save = true } = {}) {
  await page.locator("#text-link-dialog").waitFor({ state: "visible" });
  if (value !== undefined) await page.locator("#text-link-input").fill(value);
  await page.locator(save ? "#text-link-save" : "#text-link-cancel").click();
}

async function openPop(id, name) {
  const trigger = page.locator(`#${id} > button`).first();
  await trigger.waitFor({ state: "visible" });
  if (!(await page.locator(`#${id}`).evaluate((node) => node.classList.contains("open")))) await trigger.click();
  await page.locator(`#${id}-panel`).waitFor({ state: "visible" });
  assert.equal(await trigger.getAttribute("aria-label"), name);
}

async function changeColor(locator, color) {
  await locator.evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, color);
}

async function insertText() {
  const result = await captureCommand("insert", () => page.locator('#insert-toolbar [data-insert="text"]').click(), (body) => body.kind === "text");
  assert.equal(result.status, 200);
  const id = result.model.selection?.elementId;
  assert.ok(id);
  await page.keyboard.press("Escape");
  await page.locator(`#slide .el.text[data-id="${id}"]`).click({ force: true });
  return id;
}

async function insertTable(rows = 4, cols = 4) {
  await page.locator('#insert-toolbar [data-insert="table"]').click();
  await page.locator("#table-size-grid").waitFor({ state: "visible" });
  const result = await captureCommand(
    "insert",
    () => page.locator(`#table-size-grid [data-r="${rows}"][data-c="${cols}"]`).click(),
    (body) => body.kind === "table",
  );
  assert.equal(result.status, 200);
  const id = result.model.selection?.elementId;
  assert.ok(id);
  return id;
}

async function selectTableRange(id, r1, c1, r2, c2) {
  const table = page.locator(`#slide .el.table[data-id="${id}"] table`);
  await table.locator("tr").nth(r1).locator("td").nth(c1).click({ force: true });
  if (r1 !== r2 || c1 !== c2) {
    await table.locator("tr").nth(r2).locator("td").nth(c2).click({ force: true, modifiers: ["Shift"] });
  }
  await page.waitForTimeout(80);
}

async function mergeSelected(id) {
  await openPop("pop-table", "表格");
  return captureCommand("tableMerge", () => page.locator("#pop-table-panel .ctx-btn", { hasText: "合并" }).click());
}

async function insertImage(file) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator('#insert-toolbar [data-insert="image"]').click();
  const chooser = await chooserPromise;
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try { return JSON.parse(request.postData() || "{}").cmd === "insert"; } catch { return false; }
  });
  await chooser.setFiles(file);
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  return selectedId("image");
}

async function textBoundaries() {
  const { project } = await openProject("text");
  const id = await insertText();
  const listControl = "element.text.toolbar.list.set";

  await check("text.list.bullet-on", "项目符号开启后写入返回模型和 PPTD", async () => {
    const result = await captureCommand("setTextStyle", () => toolbarButton("项目符号").click(), (body) => body.controlId === listControl);
    assert.equal(result.body.patch.list, "bullet");
    assert.equal(modelElement(result.model, id)?.list, "bullet");
    assert.equal(diskElement(project, id)?.content?.list, "bullet");
    return { elementId: id, list: "bullet" };
  });

  await check("text.list.mutual-exclusive", "编号替换项目符号，两个模式不会同时存在", async () => {
    const result = await captureCommand("setTextStyle", () => toolbarButton("编号").click(), (body) => body.controlId === listControl);
    assert.equal(result.body.patch.list, "number");
    assert.equal(modelElement(result.model, id)?.list, "number");
    assert.equal(diskElement(project, id)?.content?.list, "number");
    assert.equal(await toolbarButton("项目符号").evaluate((node) => node.classList.contains("on")), false);
    assert.equal(await toolbarButton("编号").evaluate((node) => node.classList.contains("on")), true);
    return { list: "number" };
  });

  await check("text.list.number-off", "选择无列表会关闭列表并删除持久化字段", async () => {
    const result = await captureCommand("setTextStyle", () => toolbarButton("无").click(), (body) => body.controlId === listControl);
    assert.equal(result.body.patch.list, null);
    assert.equal(modelElement(result.model, id)?.list, undefined);
    assert.equal(diskElement(project, id)?.content?.list, undefined);
    return { list: null };
  });

  await check("text.list.bullet-off-reload", "项目符号独立关闭后，重载仍保持关闭", async () => {
    await captureCommand("setTextStyle", () => toolbarButton("项目符号").click(), (body) => body.patch?.list === "bullet");
    // The list control is a 无/项目符号/编号 segment now: 无 is what clears it.
    await captureCommand("setTextStyle", () => toolbarButton("无").click(), (body) => body.patch?.list === null);
    await reloadCurrent();
    const persisted = diskElement(project, id);
    const model = (await apiModel()).model;
    assert.equal(persisted?.content?.list, undefined);
    assert.equal(modelElement(model, id)?.list, undefined);
    assert.equal(await page.locator(`#slide .el.text[data-id="${id}"] ul, #slide .el.text[data-id="${id}"] ol`).count(), 0);
    return { reloaded: true };
  });

  await page.locator(`#slide .el.text[data-id="${id}"]`).click({ force: true });
  const hrefBeforeCancel = modelElement((await apiModel()).model, id)?.href;
  await check("text.link.cancel", "取消链接输入不会发命令或改变模型/磁盘", async () => {
    const beforeCount = ledger.commands.length;
    await toolbarButton("链接").click();
    await fillTextLink("https://example.test/ignored", { save: false });
    await page.waitForFunction(() => !document.getElementById("text-link-dialog")?.open);
    assert.equal(ledger.commands.length, beforeCount);
    assert.equal(modelElement((await apiModel()).model, id)?.href, hrefBeforeCancel);
    assert.equal(diskElement(project, id)?.content?.href, undefined);
    return { commandDelta: 0 };
  });

  await check("text.link.safe", "安全 HTTPS 链接写入返回模型和 PPTD", async () => {
    const result = await captureCommand(
      "setTextStyle",
      async () => {
        await toolbarButton("链接").click();
        await fillTextLink("https://example.test/guide");
      },
      (body) => body.controlId === "element.text.toolbar.link.set",
    );
    assert.equal(result.status, 200);
    assert.equal(modelElement(result.model, id)?.href, "https://example.test/guide");
    assert.equal(diskElement(project, id)?.content?.href, "https://example.test/guide");
    return { href: "https://example.test/guide" };
  });

  await check("text.link.clear", "移除链接会清除 href，且重载不恢复旧值", async () => {
    const result = await captureCommand(
      "setTextStyle",
      async () => {
        await toolbarButton("链接").click();
        // Clearing has a dedicated 移除链接 action in the dialog now.
        await page.locator("#text-link-dialog").waitFor({ state: "visible" });
        await page.locator("#text-link-remove").click();
      },
      (body) => body.controlId === "element.text.toolbar.link.set",
    );
    assert.equal(result.body.patch.href, null);
    assert.equal(modelElement(result.model, id)?.href, undefined);
    assert.equal(diskElement(project, id)?.content?.href, undefined);
    await reloadCurrent();
    assert.equal(modelElement((await apiModel()).model, id)?.href, undefined);
    return { cleared: true, reloaded: true };
  });

  await page.locator(`#slide .el.text[data-id="${id}"]`).click({ force: true });
  await check("text.link.dangerous-url", "危险 javascript: URL 必须在界面和后端拒绝且不得落盘", async () => {
    const before = pageDigest(project, (await apiModel()).model.pageIndex);
    const beforeCommands = ledger.commands.length;
    // A previous case can leave the dialog open; close it before reopening.
    if (await page.locator("#text-link-dialog").evaluate((node) => Boolean(node.open)).catch(() => false)) {
      await page.locator("#text-link-cancel").click();
      await page.waitForFunction(() => !document.getElementById("text-link-dialog")?.open);
    }
    await toolbarButton("链接").click();
    await page.locator("#text-link-dialog").waitFor({ state: "visible" });
    await page.locator("#text-link-input").fill("javascript:alert(1)");
    await page.locator("#text-link-save").click();
    await page.locator("#text-link-error").waitFor({ state: "visible", timeout: 4000 });
    assert.equal(ledger.commands.length, beforeCommands, "frontend must not send the dangerous URL");
    await page.locator("#text-link-cancel").click();
    assert.equal(modelElement((await apiModel()).model, id)?.href, undefined);
    assert.equal(diskElement(project, id)?.content?.href, undefined);
    assert.equal(pageDigest(project, (await apiModel()).model.pageIndex), before);

    const direct = await postCommand({
      cmd: "setTextStyle",
      controlId: "element.text.toolbar.link.set",
      patch: { href: "javascript:alert(1)" },
    });
    assert.equal(direct.status, 400);
    assert.match(String(direct.data?.error || ""), /unsafe text link protocol: javascript:/);
    assert.equal(modelElement(direct.data.model, id)?.href, undefined);
    assert.equal(diskElement(project, id)?.content?.href, undefined);
    assert.equal(pageDigest(project, direct.data.model.pageIndex), before, "backend rejection must not mutate the page file");
    return { frontendCommandDelta: 0, backendStatus: direct.status, error: direct.data.error };
  });
}

async function tableBoundaries() {
  const { project } = await openProject("table");

  const single = await insertTable();
  await selectTableRange(single, 1, 1, 1, 1);
  await check("table.merge.single", "单格合并在界面禁用，后端直接调用也拒绝且不写盘", async () => {
    const before = pageDigest(project, (await apiModel()).model.pageIndex);
    await openPop("pop-table", "表格");
    const merge = page.locator("#pop-table-panel .ctx-btn", { hasText: "合并" });
    assert.equal(await merge.isDisabled(), true);
    const direct = await postCommand({ cmd: "tableMerge", r1: 1, c1: 1, r2: 1, c2: 1 });
    assert.equal(direct.status, 400);
    assert.match(String(direct.data?.error || ""), /at least two cells/);
    const cell = modelElement(direct.data.model, single)?.tableRows?.[1]?.[1];
    const disk = diskElement(project, single)?.rows?.[1]?.[1];
    assert.equal(cell?.rowSpan, undefined);
    assert.equal(cell?.colSpan, undefined);
    assert.equal(disk?.rowSpan, undefined);
    assert.equal(disk?.colSpan, undefined);
    assert.equal(pageDigest(project, direct.data.model.pageIndex), before);
    return { uiDisabled: true, backendStatus: direct.status, error: direct.data.error };
  });

  const vertical = await insertTable();
  await selectTableRange(vertical, 0, 2, 2, 2);
  await check("table.merge.vertical", "纵向合并写入 rowSpan=3，并在重载后保留", async () => {
    const result = await mergeSelected(vertical);
    const cell = modelElement(result.model, vertical)?.tableRows?.[0]?.[2];
    assert.equal(cell?.rowSpan, 3);
    assert.equal(cell?.colSpan, 1);
    assert.equal(diskElement(project, vertical)?.rows?.[0]?.[2]?.rowSpan, 3);
    await reloadCurrent();
    assert.equal(modelElement((await apiModel()).model, vertical)?.tableRows?.[0]?.[2]?.rowSpan, 3);
    return { rowSpan: 3, colSpan: 1, reloaded: true };
  });

  const rectangle = await insertTable();
  await selectTableRange(rectangle, 1, 1, 2, 3);
  await check("table.merge.rectangle", "矩形合并写入 2×3 范围，并在重载后保留", async () => {
    const result = await mergeSelected(rectangle);
    const cell = modelElement(result.model, rectangle)?.tableRows?.[1]?.[1];
    assert.equal(cell?.rowSpan, 2);
    assert.equal(cell?.colSpan, 3);
    const disk = diskElement(project, rectangle)?.rows?.[1]?.[1];
    assert.equal(disk?.rowSpan, 2);
    assert.equal(disk?.colSpan, 3);
    await reloadCurrent();
    const dom = page.locator(`#slide .el.table[data-id="${rectangle}"] table tr`).nth(1).locator("td").nth(1);
    assert.equal(await dom.getAttribute("rowspan"), "2");
    assert.equal(await dom.getAttribute("colspan"), "3");
    return { rowSpan: 2, colSpan: 3, reloaded: true };
  });

  const overlap = await insertTable();
  await selectTableRange(overlap, 0, 0, 1, 1);
  await mergeSelected(overlap);
  await selectTableRange(overlap, 0, 1, 1, 2);
  await check("table.merge.overlap", "与已有合并区域相交的新合并必须拒绝或生成无重叠结构", async () => {
    const before = pageDigest(project, (await apiModel()).model.pageIndex);
    const result = await mergeSelected(overlap);
    const rows = modelElement(result.model, overlap)?.tableRows || [];
    const merged = [];
    rows.forEach((row, r) => row.forEach((cell, c) => {
      if ((cell.rowSpan || 1) > 1 || (cell.colSpan || 1) > 1) {
        merged.push({ r, c, r2: r + (cell.rowSpan || 1) - 1, c2: c + (cell.colSpan || 1) - 1 });
      }
    }));
    let overlapCount = 0;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i];
        const b = merged[j];
        if (Math.max(a.r, b.r) <= Math.min(a.r2, b.r2) && Math.max(a.c, b.c) <= Math.min(a.c2, b.c2)) overlapCount += 1;
      }
    }
    assert.ok(result.status >= 400 || overlapCount === 0, `status=${result.status}, merged=${JSON.stringify(merged)}`);
    if (result.status >= 400) {
      assert.equal(pageDigest(project, result.model?.pageIndex ?? (await apiModel()).model.pageIndex), before);
      const toast = page.locator("#app-toast");
      await toast.waitFor({ state: "visible" });
      assert.equal(
        (await toast.innerText()).trim(),
        "无法合并：所选范围与已有合并单元格部分重叠，请重新选择完整区域。",
      );
      assert.equal(await page.locator("#pop-table").evaluate((node) => node.classList.contains("open")), true);
      assert.equal(await page.locator(`#slide .el.table[data-id="${overlap}"] td.is-cell`).count(), 1);
      assert.equal(await page.locator(`#slide .el.table[data-id="${overlap}"] td.is-cell-range`).count(), 3);
    }
    return { httpStatus: result.status, mergedRegions: merged, visibleRecovery: true, selectionPreserved: true };
  });

  const fills = await insertTable();
  await selectTableRange(fills, 0, 0, 0, 0);
  await check("table.fill.first-cell", "单元格填色只写当前单元格", async () => {
    const neighborBefore = modelElement((await apiModel()).model, fills)?.tableRows?.[0]?.[1]?.fill;
    await openPop("pop-table", "表格");
    const result = await captureCommand("tableFill", () => changeColor(page.locator("#ctx-table-fill"), "#dbeafe"));
    const table = modelElement(result.model, fills);
    assert.equal(table?.tableRows?.[0]?.[0]?.fill?.toLowerCase(), "#dbeafe");
    assert.equal(table?.tableRows?.[0]?.[1]?.fill, neighborBefore);
    assert.equal(diskElement(project, fills)?.rows?.[0]?.[0]?.fill?.color?.toLowerCase(), "#dbeafe");
    return { cell: [0, 0], color: "#dbeafe" };
  });

  await selectTableRange(fills, 2, 3, 2, 3);
  await check("table.fill.switch-cell", "切换单元格会读取新单元格颜色，写入后保留前一格颜色", async () => {
    await openPop("pop-table", "表格");
    assert.notEqual((await page.locator("#ctx-table-fill").inputValue()).toLowerCase(), "#dbeafe");
    const result = await captureCommand("tableFill", () => changeColor(page.locator("#ctx-table-fill"), "#fecaca"));
    const table = modelElement(result.model, fills);
    assert.equal(table?.tableRows?.[0]?.[0]?.fill?.toLowerCase(), "#dbeafe");
    assert.equal(table?.tableRows?.[2]?.[3]?.fill?.toLowerCase(), "#fecaca");
    const disk = diskElement(project, fills);
    assert.equal(disk?.rows?.[0]?.[0]?.fill?.color?.toLowerCase(), "#dbeafe");
    assert.equal(disk?.rows?.[2]?.[3]?.fill?.color?.toLowerCase(), "#fecaca");
    await reloadCurrent();
    const reloaded = modelElement((await apiModel()).model, fills);
    assert.equal(reloaded?.tableRows?.[0]?.[0]?.fill?.toLowerCase(), "#dbeafe");
    assert.equal(reloaded?.tableRows?.[2]?.[3]?.fill?.toLowerCase(), "#fecaca");
    return { first: "#dbeafe", second: "#fecaca", reloaded: true };
  });
}

function cropIsZero(crop) {
  return ["left", "top", "right", "bottom"].every((key) => Number(crop?.[key] || 0) === 0);
}

async function imageBoundaries() {
  const { project } = await openProject("image");
  const id = await insertImage(path.join(SOURCE, "media/bg_data.png"));
  const node = page.locator(`#slide .el.image[data-id="${id}"]`);

  await check("image.crop.toolbar-complete", "顶部裁切按钮进入模式，拖动落盘，顶部完成退出且保留裁切", async () => {
    await page.locator("#crop-start").click();
    await node.waitFor({ state: "visible" });
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), true);
    const command = captureCommand("setImageCrop", () => dragCropHandle(page, id, "se", -42, -28));
    const result = await command;
    assert.ok(!cropIsZero(modelElement(result.model, id)?.crop));
    assert.ok(!cropIsZero(diskElement(project, id)?.crop));
    await page.locator("#crop-done").click();
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), false);
    assert.ok(!cropIsZero(modelElement((await apiModel()).model, id)?.crop));
    return { crop: diskElement(project, id)?.crop };
  });

  await check("image.crop.toolbar-reset", "裁切模式中的顶部重置清零模型和 PPTD，完成后保持清零", async () => {
    await page.locator("#crop-start").click();
    const result = await captureCommand("setImageCrop", () => page.locator("#crop-reset").click());
    assert.ok(cropIsZero(modelElement(result.model, id)?.crop));
    assert.ok(cropIsZero(diskElement(project, id)?.crop));
    await page.locator("#crop-done").click();
    return { crop: diskElement(project, id)?.crop };
  });

  await check("image.crop.menu-complete", "裁切模式可进入并完成，遮罩弹层只列形状", async () => {
    // The 遮罩形状 popover now only carries mask shapes; entering / leaving crop
    // mode happens through the property panel buttons (#crop-start / #crop-done).
    await openPop("pop-crop", "遮罩形状");
    const maskLabels = (await page.locator("#pop-crop-panel .ctx-btn").allTextContents()).map((t) => t.trim());
    assert.deepEqual(maskLabels, ["矩形", "椭圆", "圆角矩形", "菱形", "六边形"]);
    await page.keyboard.press("Escape");
    await page.locator("#crop-start").click();
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), true);
    const result = await captureCommand("setImageCrop", () => dragCropHandle(page, id, "nw", 32, 22));
    assert.ok(!cropIsZero(modelElement(result.model, id)?.crop));
    await page.locator("#crop-done").click();
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), false);
    assert.ok(!cropIsZero(diskElement(project, id)?.crop));
    return { crop: diskElement(project, id)?.crop, maskCount: maskLabels.length };
  });

  await check("image.crop.reset-reload", "裁切模式内重置清零，退出后重载仍为零", async () => {
    // 重置裁切 only exists while cropping now, and it lives in the coherent
    // property panel (#crop-reset) rather than inside the 遮罩形状 popover.
    await page.locator(`#slide .el.image[data-id="${id}"]`).click({ force: true });
    await page.locator("#crop-start").click();
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), true);
    const result = await captureCommand("setImageCrop", () => page.locator("#crop-reset").click());
    assert.ok(cropIsZero(modelElement(result.model, id)?.crop));
    assert.ok(cropIsZero(diskElement(project, id)?.crop));
    await page.locator("#crop-done").click();
    assert.equal(await node.evaluate((el) => el.classList.contains("is-cropping")), false);
    await reloadCurrent();
    assert.ok(cropIsZero(modelElement((await apiModel()).model, id)?.crop));
    assert.equal(await page.locator(`#slide .el.image[data-id="${id}"]`).evaluate((el) => el.classList.contains("is-cropping")), false);
    return { crop: diskElement(project, id)?.crop, reloaded: true };
  });
}

let fatalError = null;
try {
  await waitForServer();
  await textBoundaries();
  await tableBoundaries();
  await imageBoundaries();
  await check("runtime.browser-errors", "运行过程中没有浏览器控制台或页面异常", async () => {
    const expected = ledger.browserErrors.filter((message) =>
      /^Failed to load resource: the server responded with a status of 400 \(Bad Request\)$/.test(message));
    const unexpected = ledger.browserErrors.filter((message) => !expected.includes(message));
    ledger.expectedBrowserDiagnostics.push(...expected);
    assert.deepEqual(unexpected, []);
    return { unexpectedCount: 0, expectedRejectedRequestDiagnostics: expected.length };
  });
} catch (error) {
  fatalError = error;
  fail("runtime.fatal", "QA runner completes every boundary group", error);
  try {
    await page.screenshot({ path: path.join(OUT, "editor-canvas-boundaries-failure.png"), fullPage: false });
  } catch {}
} finally {
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = {
    passed: ledger.rows.filter((entry) => entry.status === "pass").length,
    failed: ledger.rows.filter((entry) => entry.status === "fail").length,
    fatal: Boolean(fatalError),
  };
  const file = path.join(OUT, "editor-canvas-boundaries-ledger.json");
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ ok: ledger.summary.failed === 0, port: PORT, file, summary: ledger.summary }));
  await browser.close();
  server.kill("SIGTERM");
  if (!KEEP) fs.rmSync(SCRATCH, { recursive: true, force: true });
}

if (ledger.summary.failed > 0) process.exitCode = 1;
