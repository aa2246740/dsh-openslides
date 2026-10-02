#!/usr/bin/env node
/**
 * Human-sequence regression probe for editor boundaries that isolated control
 * tests do not cover: pending edits followed immediately by navigation/export,
 * page-structure undo, and injected persistence failures. Uses real
 * pointer/keyboard event streams and a scratch copy of the fixture. Production
 * code is never modified.
 *
 *   QA_PORT=55481 node scripts/qa/editor-human-audit.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { clickUi, pickTableSize, waitEditorReady } from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.QA_PORT || 55481);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-human-audit-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/editor-human-audit"));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const browserErrors = [];
const expectedBrowserErrors = [];
let expectedFaultResponses = 0;
let serverLog = "";
let shotIndex = 0;

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`native editor did not start\n${serverLog}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (expectedFaultResponses > 0 && message.text().includes("Failed to load resource")) {
    expectedFaultResponses -= 1;
    expectedBrowserErrors.push(message.text());
    return;
  }
  browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

async function screenshot(name) {
  shotIndex += 1;
  const file = path.join(OUT, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function rawModel() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: response.status, body };
  });
}

async function model() {
  const result = await rawModel();
  assert.equal(result.status, 200, `model request failed: ${JSON.stringify(result.body)}`);
  return result.body.model ?? result.body;
}

async function poll(predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() <= deadline) {
    last = await rawModel().catch((error) => ({ status: 0, body: { error: String(error) } }));
    if (await predicate(last)) return last;
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

async function addTableAndType(text) {
  await clickUi(page, 'button[data-insert="table"]');
  await pickTableSize(page, 2, 2);
  const table = page.locator("#slide .el.table.selected").first();
  await table.waitFor({ state: "visible" });
  const cell = table.locator("td").first();
  await cell.dblclick();
  await page.keyboard.type(text);
  assert.equal(await cell.innerText(), text, "typed table value must be visible before boundary action");
  return { table, cell, id: await table.getAttribute("data-id") };
}

async function runCase(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, ok: true, evidence });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const shot = await screenshot(name.replace(/[^a-z0-9]+/gi, "-")).catch(() => null);
    results.push({ name, ok: false, error: error?.stack || String(error), screenshot: shot });
    console.error(`FAIL  ${name}: ${error?.message || error}`);
  }
}

try {
  await waitForHealth();

  await runCase("table edit is committed before rail navigation", async () => {
    await openCase("table-rail");
    const value = "AUDIT_TABLE_RAIL";
    const { id } = await addTableAndType(value);
    await page.locator("#rail .thumb").nth(1).click();
    const switched = await poll(
      (entry) => entry.status === 200 && entry.body.model?.pageIndex === 1,
      "server model did not switch to page 2",
    );
    await page.waitForTimeout(250);
    const activeDom = await page.locator("#rail .thumb.active").getAttribute("data-page-index");
    const staleTableVisible = await page.locator(`#slide .el.table[data-id="${id}"]`).isVisible().catch(() => false);
    assert.equal(activeDom, "1", "rail DOM must follow the model page after leaving a table cell");
    assert.equal(staleTableVisible, false, "old-page table must not remain visible after page switch");
    return { modelPage: switched.body.model.pageIndex, activeDom, staleTableVisible };
  });

  await runCase("table edit is committed before export opens", async () => {
    await openCase("table-export");
    const value = "AUDIT_TABLE_EXPORT";
    const { id } = await addTableAndType(value);
    await clickUi(page, "#btn-export");
    await page.locator("#export-dialog[open]").waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const current = await model();
    const table = current.elements.find((element) => element.id === id);
    assert.equal(
      table?.tableRows?.[0]?.[0]?.text,
      value,
      "model/disk source must include the visible table edit before export can be offered",
    );
    return { tableId: id, modelValue: table?.tableRows?.[0]?.[0]?.text };
  });

  await runCase("notes autosave remains bound to the page where typing occurred", async () => {
    const project = await openCase("notes-rail");
    const value = "AUDIT_NOTES_PAGE_ONE";
    await clickUi(page, "#btn-notes-link");
    await page.locator("#notes-text").fill(value);
    await page.locator("#rail .thumb").nth(1).click();
    await poll(
      (entry) => entry.status === 200 && entry.body.model?.pageIndex === 1,
      "server model did not switch to page 2",
    );
    await page.waitForTimeout(700);

    await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
    await waitEditorReady(page);
    const pageOne = await model();
    await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=1`, { waitUntil: "networkidle" });
    await waitEditorReady(page);
    const pageTwo = await model();
    assert.equal(pageOne.notes, value, "typed notes must persist on page 1 despite immediate navigation");
    assert.notEqual(pageTwo.notes, value, "typed page-1 notes must never be written to page 2");
    return { pageOneNotes: pageOne.notes, pageTwoNotes: pageTwo.notes };
  });

  await runCase("undo after adding the last page keeps a valid current page", async () => {
    await openCase("add-undo");
    const before = await model();
    await clickUi(page, "#rail .rail-add");
    await poll(
      (entry) => entry.status === 200 && entry.body.model?.pageCount === before.pageCount + 1,
      "page add did not complete",
    );
    await clickUi(page, "#btn-undo");
    const after = await poll(
      (entry) => entry.status !== 200 || entry.body.model?.pageCount === before.pageCount,
      "undo did not settle",
    );
    assert.equal(after.status, 200, `undo left /api/model unavailable: ${JSON.stringify(after.body)}`);
    assert.ok(
      after.body.model.pageIndex >= 0 && after.body.model.pageIndex < after.body.model.pageCount,
      `undo left invalid page ${after.body.model.pageIndex}/${after.body.model.pageCount}`,
    );
    return { before: [before.pageIndex, before.pageCount], after: [after.body.model.pageIndex, after.body.model.pageCount] };
  });

  await runCase("table edit is one undoable transaction across the toolbar boundary", async () => {
    await openCase("table-undo-redo");
    const value = "AUDIT_TABLE_UNDO_REDO";
    const { id } = await addTableAndType(value);
    await clickUi(page, "#btn-undo");
    const undone = await poll((entry) => {
      const table = entry.body.model?.elements?.find((element) => element.id === id);
      return entry.status === 200 && table?.tableRows?.[0]?.[0]?.text !== value;
    }, "undo did not revert the pending table edit");
    const undoneValue = undone.body.model.elements.find((element) => element.id === id)?.tableRows?.[0]?.[0]?.text;
    await clickUi(page, "#btn-redo");
    const redone = await poll((entry) => {
      const table = entry.body.model?.elements?.find((element) => element.id === id);
      return entry.status === 200 && table?.tableRows?.[0]?.[0]?.text === value;
    }, "redo did not restore the table edit");
    await screenshot("table-undo-redo");
    return {
      tableId: id,
      undoneValue,
      redoneValue: redone.body.model.elements.find((element) => element.id === id)?.tableRows?.[0]?.[0]?.text,
    };
  });

  await runCase("shape gallery search categories line presets and icon filters stay usable", async () => {
    await openCase("shape-library");
    await clickUi(page, 'button[data-insert="shape"]');
    const allShapeCount = await page.locator("#shape-grid .shape-cell").count();
    const categoryCount = await page.locator("#shape-cats .shape-cat").count();
    assert.ok(allShapeCount >= 100, `full shape gallery unexpectedly small: ${allShapeCount}`);
    assert.ok(categoryCount > 1, `shape categories missing: ${categoryCount}`);

    await page.locator("#shape-search").fill("rect");
    const filteredShapeCount = await page.locator("#shape-grid .shape-cell").count();
    assert.ok(filteredShapeCount > 0 && filteredShapeCount < allShapeCount,
      `shape search did not narrow the gallery: ${filteredShapeCount}/${allShapeCount}`);
    await page.locator("#shape-search").fill("");
    await page.locator("#shape-cats .shape-cat").nth(1).click();
    assert.ok(await page.locator("#shape-cats .shape-cat").nth(1).evaluate((node) => node.classList.contains("on")),
      "shape category click did not update the selected category");
    assert.ok(await page.locator("#shape-grid .shape-cell").count(), "selected shape category was empty");

    await page.locator('#lib-tabs [data-lib="line"]').click();
    const linePresetCount = await page.locator("#line-presets button").count();
    assert.ok(linePresetCount >= 3, `line preset library unexpectedly small: ${linePresetCount}`);
    await page.locator("#line-presets button").first().click();
    await page.locator("#slide .el.line.selected").waitFor({ state: "visible" });

    await clickUi(page, 'button[data-insert="shape"]');
    await page.locator('#lib-tabs [data-lib="icon"]').click();
    await page.locator('#icon-styles [data-style="far"]').click();
    assert.ok(await page.locator('#icon-styles [data-style="far"]').evaluate((node) => node.classList.contains("on")),
      "outline icon-style switch did not become active");
    const outlineIconCount = await page.locator("#icon-grid button").count();
    assert.ok(outlineIconCount > 0, "outline icon library was empty");
    await page.locator('#icon-styles [data-style="fas"]').click();
    await page.locator('#icon-cats button', { hasText: "箭头" }).click();
    const arrowIconCount = await page.locator("#icon-grid button").count();
    assert.ok(arrowIconCount > 0, "arrow icon category was empty");
    await screenshot("shape-library-filters");
    await page.locator("#icon-grid button").first().click();
    await page.locator("#slide .el.icon.selected").waitFor({ state: "visible" });
    return { allShapeCount, filteredShapeCount, categoryCount, linePresetCount, outlineIconCount, arrowIconCount };
  });

  await runCase("keyboard copy and context-menu paste share the editor clipboard", async () => {
    await openCase("keyboard-context-clipboard");
    await clickUi(page, 'button[data-insert="shape"]');
    await page.locator("#shape-grid .shape-cell").first().click();
    const selected = page.locator("#slide .el.shape.selected").first();
    await selected.waitFor({ state: "visible" });
    const before = await page.locator("#slide .el.shape").count();
    await page.keyboard.press("Meta+C");
    await selected.click({ button: "right", force: true });
    const menu = page.locator("#ctx-menu");
    await menu.waitFor({ state: "visible" });
    await menu.getByRole("button", { name: /粘贴/ }).click();
    await page.waitForFunction((count) => document.querySelectorAll("#slide .el.shape").length === count + 1, before);
    const pasted = page.locator("#slide .el.shape.selected").first();
    await pasted.click({ button: "right", force: true });
    await menu.waitFor({ state: "visible" });
    await menu.getByRole("button", { name: /复制副本/ }).click();
    await page.waitForFunction((count) => document.querySelectorAll("#slide .el.shape").length === count + 2, before);
    const after = await page.locator("#slide .el.shape").count();
    await screenshot("keyboard-context-clipboard");
    return { before, after, delta: after - before };
  });

  await runCase("rejected text save blocks navigation and retries without losing the edit", async () => {
    await openCase("text-save-retry");
    const textNode = page.locator("#slide .el.text").first();
    const id = await textNode.getAttribute("data-id");
    const value = "AUDIT_RETRY_TEXT_SENTINEL";
    let rejected = false;
    const handler = async (route) => {
      const body = route.request().postDataJSON();
      if (!rejected && body.cmd === "setRichText") {
        rejected = true;
        expectedFaultResponses += 1;
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"INJECTED_SAVE_FAILURE"}' });
        return;
      }
      await route.continue();
    };
    await page.route("**/api/command", handler);
    try {
      await textNode.dblclick();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type(value);
      await page.locator("#rail .thumb").nth(1).click();
      await page.waitForTimeout(450);
      assert.equal((await model()).pageIndex, 0, "failed text save must block the first navigation");
      assert.match(await page.locator(`#slide .el.text[data-id="${id}"]`).innerText(), new RegExp(value),
        "failed text save must leave the local editable value visible");

      await page.locator("#rail .thumb").nth(1).click();
      await poll((entry) => entry.body.model?.pageIndex === 1, "text-save retry did not allow navigation");
      await page.locator("#rail .thumb").nth(0).click();
      const restored = await poll((entry) => entry.body.model?.pageIndex === 0, "could not return to text page");
      assert.equal(restored.body.model.elements.find((element) => element.id === id)?.text, value,
        "retried text save did not persist the local edit");
      return { rejected, finalPage: restored.body.model.pageIndex, text: value };
    } finally {
      await page.unroute("**/api/command", handler);
    }
  });

  await runCase("rejected notes save blocks once and retries the original page buffer", async () => {
    await openCase("notes-save-retry");
    const value = "AUDIT_RETRY_NOTES_SENTINEL";
    let rejected = false;
    const handler = async (route) => {
      const body = route.request().postDataJSON();
      if (!rejected && body.cmd === "setNotes") {
        rejected = true;
        expectedFaultResponses += 1;
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"INJECTED_NOTES_FAILURE"}' });
        return;
      }
      await route.continue();
    };
    await page.route("**/api/command", handler);
    try {
      await clickUi(page, "#btn-notes-link");
      await page.locator("#notes-text").fill(value);
      await page.locator("#rail .thumb").nth(1).click();
      await page.waitForTimeout(400);
      assert.equal((await model()).pageIndex, 0, "failed notes save must block the first navigation");
      await page.locator("#rail .thumb").nth(1).click();
      await poll((entry) => entry.body.model?.pageIndex === 1, "notes-save retry did not allow navigation");
      await page.locator("#rail .thumb").nth(0).click();
      const restored = await poll((entry) => entry.body.model?.pageIndex === 0, "could not return to notes page");
      assert.equal(restored.body.model.notes, value, "retried notes save did not persist its original buffer");
      return { rejected, finalPage: restored.body.model.pageIndex, notes: restored.body.model.notes };
    } finally {
      await page.unroute("**/api/command", handler);
    }
  });

  await runCase("notes typed while navigation is in flight stay on the capture-time page", async () => {
    await openCase("notes-inflight-navigation");
    const value = "AUDIT_INFLIGHT_NOTES_SENTINEL";
    let delayed = false;
    const handler = async (route) => {
      const body = route.request().postDataJSON();
      if (!delayed && body.cmd === "goToPage") {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    };
    await page.route("**/api/command", handler);
    try {
      await clickUi(page, "#btn-notes-link");
      await page.locator("#rail .thumb").nth(1).click();
      await page.waitForTimeout(80);
      await page.locator("#notes-text").fill(value);
      await clickUi(page, "#btn-export");
      await page.locator("#export-dialog[open]").waitFor({ state: "visible" });
      const pageTwo = await model();
      assert.equal(pageTwo.pageIndex, 1, "delayed navigation did not finish on page 2");
      assert.notEqual(pageTwo.notes, value, "capture-time page-1 notes leaked onto page 2");
      await page.locator("#export-dialog").evaluate((dialog) => dialog.close());
      await page.locator("#rail .thumb").nth(0).click();
      const pageOne = await poll((entry) => entry.body.model?.pageIndex === 0, "could not return to page 1");
      assert.equal(pageOne.body.model.notes, value, "capture-time page-1 notes were not persisted to page 1");
      return { delayed, pageOneNotes: pageOne.body.model.notes, pageTwoNotes: pageTwo.notes };
    } finally {
      await page.unroute("**/api/command", handler);
    }
  });
} finally {
  const report = {
    schemaVersion: "open-slidestudio.editor-human-audit.v1",
    generatedAt: new Date().toISOString(),
    base: BASE,
    results,
    browserErrors,
    expectedBrowserErrors,
    serverLog: serverLog.slice(-8000),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  server.kill("SIGTERM");
  fs.rmSync(SCRATCH, { recursive: true, force: true });
}

if (results.some((result) => !result.ok)) process.exitCode = 1;
