#!/usr/bin/env node
/**
 * Remaining human-boundary regression for the native editor. Every project is
 * a scratch copy; production sources and fixtures are never mutated.
 *
 *   QA_PORT=55489 QA_OUT=/tmp/oss-editor-remaining-boundaries \
 *     node scripts/qa/editor-remaining-boundaries.mjs
 *
 * Playwright keyboard events prove editor event ordering. They do not prove
 * macOS IME composition or hardware keyboard behavior.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { clickUi, pickTableSize, waitEditorReady } from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
async function randomPort() {
  const holder = net.createServer();
  await new Promise((resolve, reject) => {
    holder.once("error", reject);
    holder.listen(0, "127.0.0.1", resolve);
  });
  const address = holder.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => holder.close(resolve));
  assert.ok(port > 0, "random QA port must be assigned");
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-remaining-boundaries-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(os.tmpdir(), "oss-editor-remaining-boundaries-report"));
const ONLY = String(process.env.QA_ONLY || "").trim().toLowerCase();
fs.mkdirSync(OUT, { recursive: true });

const report = {
  port: PORT,
  cases: [],
  browserErrors: [],
  coverageLimits: [
    "Playwright keyboard events do not prove macOS IME composition or physical-keyboard behavior.",
    "Headless Playwright cannot prove cancellation inside the native macOS file-picker UI; an empty FileChooser selection is recorded separately.",
  ],
};
let serverLog = "";
let browser;
let page;
let shot = 0;

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`native editor did not start on ${BASE}\n${serverLog}`);
}

async function capture(name) {
  shot += 1;
  const file = path.join(OUT, `${String(shot).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function apiModel() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `model HTTP ${response.status}`);
    return body.model ?? body;
  });
}

async function pollModel(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() <= deadline) {
    last = await apiModel();
    if (predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label}; last=${JSON.stringify(last)}`);
}

async function openCase(name, pageIndex = 0) {
  const project = path.join(SCRATCH, name);
  fs.cpSync(SOURCE, project, { recursive: true });
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=${pageIndex}`, {
    waitUntil: "networkidle",
  });
  await waitEditorReady(page);
  return project;
}

async function runCase(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY)) return;
  const startedAt = Date.now();
  try {
    const evidence = await fn();
    report.cases.push({ name, ok: true, durationMs: Date.now() - startedAt, evidence });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const screenshot = await capture(name.replace(/[^a-z0-9]+/gi, "-")).catch(() => null);
    const failure = error instanceof Error ? error.stack || error.message : String(error);
    report.cases.push({ name, ok: false, durationMs: Date.now() - startedAt, failure, screenshot });
    console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function rightClickThumb(locator) {
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("page thumbnail has no visible bounds");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await page.locator("#ctx-menu:not([hidden])").waitFor({ state: "visible" });
}

function pageSignature(model) {
  return JSON.stringify(model.pagePaths);
}

async function downloadPptx(name, dialogAlreadyOpen = false) {
  if (!dialogAlreadyOpen) {
    await clickUi(page, "#btn-export");
    await page.locator("#export-dialog[open]").waitFor({ state: "visible" });
  }
  await clickUi(page, "#export-pptx");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    clickUi(page, "#export-download"),
  ]);
  const file = path.join(OUT, `${name}.pptx`);
  await download.saveAs(file);
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 5_000, `PPTX export is unexpectedly small: ${bytes.length}`);
  assert.equal(bytes.subarray(0, 2).toString("ascii"), "PK", "PPTX must be a ZIP package");
  await page.locator('#export-dialog button[value="cancel"]').click();
  return { file, bytes: bytes.length, suggestedFilename: download.suggestedFilename() };
}

async function insertChart() {
  await clickUi(page, 'button[data-insert="chart"]');
  const chart = page.locator("#slide .el.chart.selected").first();
  await chart.waitFor({ state: "visible" });
  const id = await chart.getAttribute("data-id");
  assert.ok(id, "inserted chart must expose a stable id");
  return { id, chart };
}

try {
  await waitHealth();
  browser = await launchPinnedChromium({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => report.browserErrors.push(String(error)));

  await runCase("page reorder duplicate delete supports three consecutive undo and redo", async () => {
    await openCase("page-history");
    const initial = await apiModel();
    assert.ok(initial.pageCount >= 2, "fixture must have at least two pages");
    const s0 = pageSignature(initial);

    await rightClickThumb(page.locator("#rail .thumb").first());
    await page.locator("#ctx-menu button", { hasText: /^下移$/ }).click();
    const reordered = await pollModel((model) => pageSignature(model) !== s0, "page reorder did not settle");
    const s1 = pageSignature(reordered);

    await rightClickThumb(page.locator("#rail .thumb.active"));
    await page.locator("#ctx-menu button", { hasText: /^复制$/ }).click();
    const duplicated = await pollModel(
      (model) => model.pageCount === initial.pageCount + 1,
      "page duplicate did not settle",
    );
    const s2 = pageSignature(duplicated);

    await rightClickThumb(page.locator("#rail .thumb.active"));
    await page.locator("#ctx-menu button", { hasText: /^删除$/ }).click();
    const deleted = await pollModel(
      (model) => model.pageCount === initial.pageCount && pageSignature(model) === s1,
      "page delete did not restore the reordered sequence",
    );
    const s3 = pageSignature(deleted);

    for (const expected of [s2, s1, s0]) {
      await clickUi(page, "#btn-undo");
      await pollModel((model) => pageSignature(model) === expected, "consecutive undo reached the wrong page order");
    }
    for (const expected of [s1, s2, s3]) {
      await clickUi(page, "#btn-redo");
      const current = await pollModel(
        (model) => pageSignature(model) === expected,
        "consecutive redo reached the wrong page order",
      );
      assert.ok(current.pageIndex >= 0 && current.pageIndex < current.pageCount, "redo left pageIndex out of range");
    }
    const screenshot = await capture("page-history-final");
    return {
      initialCount: initial.pageCount,
      finalCount: (await apiModel()).pageCount,
      signatures: { initial: s0, reordered: s1, duplicated: s2, deleted: s3 },
      screenshot,
    };
  });

  await runCase("focused table edit is included in the version returned by snapshot response id", async () => {
    await openCase("table-version");
    await clickUi(page, 'button[data-insert="table"]');
    await pickTableSize(page, 2, 2);
    const table = page.locator("#slide .el.table.selected").first();
    await table.waitFor({ state: "visible" });
    const tableId = await table.getAttribute("data-id");
    assert.ok(tableId, "inserted table must expose a stable id");
    const cell = table.locator("td").first();
    await cell.dblclick();
    await page.keyboard.type("BOUNDARY_TABLE_SNAPSHOT");
    assert.equal(await cell.innerText(), "BOUNDARY_TABLE_SNAPSHOT");

    await clickUi(page, "#btn-versions");
    await page.locator("#version-menu:not([hidden])").waitFor({ state: "visible" });
    const [response] = await Promise.all([
      page.waitForResponse((entry) =>
        new URL(entry.url()).pathname === "/api/versions" && entry.request().method() === "POST"),
      clickUi(page, "#version-save"),
    ]);
    assert.equal(response.status(), 200);
    const stored = await response.json();
    const versionId = String(stored.version?.id || "");
    assert.ok(versionId, "snapshot response must return the saved version id");
    const preview = await page.evaluate(async (id) => {
      const response = await fetch(`/api/versions/${encodeURIComponent(id)}`);
      return { status: response.status, body: await response.json() };
    }, versionId);
    assert.equal(preview.status, 200);
    const savedTable = preview.body.model?.elements?.find((element) => element.id === tableId);
    assert.equal(savedTable?.tableRows?.[0]?.[0]?.text, "BOUNDARY_TABLE_SNAPSHOT");
    const screenshot = await capture("table-version-snapshot");
    return { versionId, tableId, savedValue: savedTable.tableRows[0][0].text, screenshot };
  });

  await runCase("chart last cell flushes on immediate close and page switch with undo", async () => {
    await openCase("chart-close-export");
    const { id } = await insertChart();
    const initial = await apiModel();
    const baselineData = structuredClone(initial.elements.find((element) => element.id === id)?.chartData);
    await page.locator("#ctx-bar").getByRole("button", { name: "编辑数据", exact: true }).click();
    await page.locator("#chart-overlay:not([hidden])").waitFor({ state: "visible" });
    const lastCell = page.locator("#chart-grid tr:not(.add-row) td input").last();
    const before = await lastCell.inputValue();
    const value = before === "7" ? "8" : "7";
    await lastCell.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.type(value);
    await page.keyboard.press("Tab");
    await clickUi(page, "#chart-overlay-close");
    assert.equal(await page.locator("#chart-overlay").isVisible(), false);

    await page.locator("#ctx-bar").getByRole("button", { name: "编辑数据", exact: true }).click();
    await page.locator("#chart-overlay:not([hidden])").waitFor({ state: "visible" });
    const reopenedValue = await page.locator("#chart-grid tr:not(.add-row) td input").last().inputValue();
    const screenshot = await capture("chart-last-cell-reopened");
    await clickUi(page, "#chart-overlay-close");
    let current = await apiModel();
    let chart = current.elements.find((element) => element.id === id);
    const modelValue = chart?.chartData?.rows?.at(-1)?.at(-1);

    await clickUi(page, "#btn-undo");
    await pollModel((model) => JSON.stringify(model.elements.find((element) => element.id === id)?.chartData) === JSON.stringify(baselineData),
      "one undo did not restore the pre-edit chart data");
    await clickUi(page, "#btn-redo");
    await pollModel((model) => String(model.elements.find((element) => element.id === id)?.chartData?.rows?.at(-1)?.at(-1)) === value,
      "redo did not restore the immediately closed chart edit");

    await page.locator("#ctx-bar").getByRole("button", { name: "编辑数据", exact: true }).click();
    await page.locator("#chart-overlay:not([hidden])").waitFor({ state: "visible" });
    const switchValue = value === "9" ? "10" : "9";
    const switchCell = page.locator("#chart-grid tr:not(.add-row) td input").last();
    await switchCell.fill(switchValue);
    await switchCell.press("Tab");
    await page.locator("#rail .thumb").nth(1).click();
    await pollModel((model) => model.pageIndex === 1, "immediate page switch did not complete");
    await page.locator("#rail .thumb").first().click();
    current = await pollModel((model) => model.pageIndex === 0, "could not return to the edited chart page");
    chart = current.elements.find((element) => element.id === id);
    assert.equal(String(chart?.chartData?.rows?.at(-1)?.at(-1)), switchValue,
      "page-switch flush must stay bound to the original chart object");
    await clickUi(page, "#btn-undo");
    await pollModel((model) => String(model.elements.find((element) => element.id === id)?.chartData?.rows?.at(-1)?.at(-1)) === value,
      "one undo after page-switch flush must restore the previous chart value");
    await clickUi(page, "#btn-redo");
    await pollModel((model) => String(model.elements.find((element) => element.id === id)?.chartData?.rows?.at(-1)?.at(-1)) === switchValue,
      "redo must restore the page-switch-flushed chart value");

    await page.locator(`#slide .el.chart[data-id="${id}"]`).click({ force: true });
    await page.locator("#ctx-bar").getByRole("button", { name: "编辑数据", exact: true }).click();
    await page.locator("#chart-overlay:not([hidden])").waitFor({ state: "visible" });
    const invalidCell = page.locator("#chart-grid tr:not(.add-row) td input").last();
    await invalidCell.fill("not-a-number");
    await invalidCell.press("Tab");
    await clickUi(page, "#chart-overlay-close");
    await page.waitForFunction(() => /不是有效数字|请输入数字/.test(document.getElementById("chart-data-status")?.textContent || ""));
    assert.equal(await page.locator("#chart-overlay").isVisible(), true, "invalid chart draft must keep the overlay open");
    assert.equal(await invalidCell.inputValue(), "not-a-number", "invalid chart draft must remain visible for correction");
    assert.equal(await invalidCell.getAttribute("aria-invalid"), "true");
    await invalidCell.fill(switchValue);
    await invalidCell.press("Tab");
    await clickUi(page, "#chart-overlay-close");
    await page.locator("#chart-overlay").waitFor({ state: "hidden" });
    const exported = await downloadPptx("chart-immediate-close-export");

    assert.equal(reopenedValue, value, "last chart cell reverted when the overlay closed immediately");
    assert.equal(String(modelValue), value, "last chart cell was absent from the persisted model used for export");
    return { chartId: id, before, typed: value, reopenedValue, modelValue, switchValue, baselineData, exported, screenshot };
  });

  await runCase("focused text edit is committed before export", async () => {
    await openCase("text-export");
    const text = page.locator("#slide .el.text").first();
    const id = await text.getAttribute("data-id");
    assert.ok(id, "text element must expose a stable id");
    const value = "BOUNDARY_TEXT_EXPORT";
    await text.dblclick();
    await page.keyboard.press("Meta+A");
    await page.keyboard.type(value);
    await clickUi(page, "#btn-export");
    await page.locator("#export-dialog[open]").waitFor({ state: "visible" });
    const current = await apiModel();
    assert.equal(current.elements.find((element) => element.id === id)?.text, value);
    const screenshot = await capture("text-edit-export-ready");
    const exported = await downloadPptx("text-edit-export", true);
    return { textId: id, persistedText: value, exported, screenshot };
  });

  await runCase("empty or corrupt image selection leaves the document unchanged while valid insert and replace work", async () => {
    await openCase("image-boundaries");
    const before = (await apiModel()).elements.filter((element) => element.type === "image").length;

    const [emptyChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      clickUi(page, 'button[data-insert="image"]'),
    ]);
    await emptyChooser.setFiles([]);
    await page.waitForTimeout(250);
    const afterEmpty = (await apiModel()).elements.filter((element) => element.type === "image").length;
    assert.equal(afterEmpty, before, "empty file selection must not insert an image");

    const corrupt = path.join(SCRATCH, "corrupt-image.png");
    fs.writeFileSync(corrupt, "this is not a PNG image", "utf8");
    const [corruptChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      clickUi(page, 'button[data-insert="image"]'),
    ]);
    await corruptChooser.setFiles(corrupt);
    await page.waitForFunction(
      (count) => {
        const toast = document.getElementById("app-toast");
        return document.querySelectorAll("#slide .el.image").length !== count || Boolean(toast && !toast.hidden);
      },
      before,
      { timeout: 5_000 },
    );
    const afterCorrupt = (await apiModel()).elements.filter((element) => element.type === "image").length;
    const corruptNotice = await page.locator("#app-toast").innerText().catch(() => "");
    assert.equal(afterCorrupt, before, "corrupt PNG must be rejected without adding an image element");
    assert.match(corruptNotice, /图片|PNG|文件|格式|损坏|读取/i, "corrupt PNG rejection must be visible to the user");

    const [insertChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      clickUi(page, 'button[data-insert="image"]'),
    ]);
    await insertChooser.setFiles(path.join(SOURCE, "media/bg_data.png"));
    const inserted = await pollModel(
      (model) => model.elements.filter((element) => element.type === "image").length === before + 1,
      "valid PNG did not insert",
    );
    const validImage = inserted.elements.filter((element) => element.type === "image").at(-1);
    assert.ok(validImage?.id, "valid image insertion must expose an element id");
    const originalSrc = validImage.src;
    await page.locator(`#slide .el.image[data-id="${validImage.id}"]`).click({ force: true });
    await page.locator("#ctx-bar").getByRole("button", { name: "图片", exact: true }).click();
    const [cancelReplacementChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('#pop-image .ctx-btn[data-control="element.image.replace"]').filter({ hasText: /^替换$/ }).click(),
    ]);
    await cancelReplacementChooser.setFiles([]);
    await page.waitForTimeout(250);
    const afterReplacementCancel = await apiModel();
    assert.equal(afterReplacementCancel.elements.find((element) => element.id === validImage.id)?.src, originalSrc,
      "cancelling image replacement must preserve the original image source");

    await page.locator(`#slide .el.image[data-id="${validImage.id}"]`).click({ force: true });
    const imagePop = page.locator("#pop-image");
    if (!(await imagePop.evaluate((node) => node.classList.contains("open")))) {
      await imagePop.locator(":scope > button").click();
    }
    const [replacementChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('#pop-image .ctx-btn[data-control="element.image.replace"]').filter({ hasText: /^替换$/ }).click(),
    ]);
    await replacementChooser.setFiles(path.join(SOURCE, "media/bg_cover.jpg"));
    const replaced = await pollModel(
      (model) => model.elements.find((element) => element.id === validImage.id)?.src !== originalSrc,
      "valid image replacement did not persist",
    );
    const replacementSrc = replaced.elements.find((element) => element.id === validImage.id)?.src;
    const screenshot = await capture("image-valid-replacement");
    return {
      emptySelectionImageDelta: afterEmpty - before,
      nativePickerCancelProven: false,
      browserReplacementCancelProven: true,
      corruptSelectionImageDelta: afterCorrupt - before,
      corruptNotice,
      validImageId: validImage.id,
      originalSrc,
      replacementSrc,
      screenshot,
    };
  });

  report.ok = report.cases.every((entry) => entry.ok) && report.browserErrors.length === 0;
  if (report.browserErrors.length) {
    console.error(`FAIL  unhandled browser errors: ${JSON.stringify(report.browserErrors)}`);
  }
} catch (error) {
  report.ok = false;
  report.harnessFailure = error instanceof Error ? error.stack || error.message : String(error);
  console.error(error);
} finally {
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => undefined);
  server.kill("SIGTERM");
  fs.rmSync(SCRATCH, { recursive: true, force: true });
}

if (!report.ok) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
