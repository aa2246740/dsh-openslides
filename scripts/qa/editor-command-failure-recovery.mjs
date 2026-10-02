#!/usr/bin/env node
/**
 * Focused failure-injection acceptance for the shared editor command path.
 *
 * Uses pinned Chromium, a random localhost port and a disposable PPTD copy.
 * The first insert and first undo are rejected in the browser route so the
 * server model cannot mutate; the same actions must then recover normally.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { waitEditorReady } from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-command-failure-"));
const PROJECT = path.join(SCRATCH, "project");
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/editor-command-failure-recovery"));
fs.cpSync(SOURCE, PROJECT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

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
const report = {
  schemaVersion: "open-slidestudio.editor-command-failure-recovery.v1",
  startedAt: new Date().toISOString(),
  port: PORT,
  fixture: path.relative(ROOT, SOURCE),
  runtime: "repository adapter -> ~/.codex/playwright-runtime/runtime.mjs",
  injected: [],
  commands: [],
  pageErrors: [],
  consoleErrors: [],
};

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`editor did not start on ${BASE}\n${serverLog.slice(-3000)}`);
}

async function apiModel(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error(`model ${response.status}`);
    const data = await response.json();
    return data.model ?? data;
  });
}

async function pollModel(page, predicate, label) {
  const deadline = Date.now() + 8_000;
  let latest;
  while (Date.now() <= deadline) {
    latest = await apiModel(page);
    if (predicate(latest)) return latest;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label}; latest=${JSON.stringify(latest)}`);
}

let browser;
try {
  await waitHealth();
  browser = await launchPinnedChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => report.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });

  let failInsert = true;
  let failUndo = true;
  await page.route("**/api/command", async (route) => {
    const body = route.request().postDataJSON();
    report.commands.push(body.cmd);
    if (body.cmd === "insert" && body.kind === "text" && failInsert) {
      failInsert = false;
      report.injected.push("insert");
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "INJECTED_INSERT_FAILURE", code: "INJECTED_INSERT_FAILURE" }),
      });
      return;
    }
    if (body.cmd === "undo" && failUndo) {
      failUndo = false;
      report.injected.push("undo");
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "INJECTED_UNDO_FAILURE", code: "INJECTED_UNDO_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT)}&page=0`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  const baseline = await apiModel(page);
  const baselineElements = structuredClone(baseline.elements);

  await page.locator('#insert-toolbar [data-insert="text"]').click();
  await page.waitForFunction(() => document.getElementById("app-toast")?.textContent?.includes("INJECTED_INSERT_FAILURE"));
  const afterFailedInsert = await apiModel(page);
  assert.deepEqual(afterFailedInsert.elements, baselineElements, "failed insert must not change the server model");
  assert.equal(await page.locator("#slide .el").count(), baselineElements.length, "failed insert must not create a local ghost element");

  await page.locator('#insert-toolbar [data-insert="text"]').click();
  const afterInsertRecovery = await pollModel(page, (model) => model.elements.length === baselineElements.length + 1, "insert did not recover");
  const insertedId = afterInsertRecovery.selection?.elementId;
  assert.ok(insertedId && afterInsertRecovery.elements.some((element) => element.id === insertedId), "successful retry must select the inserted element");

  await page.locator("#btn-undo").click();
  await page.waitForFunction(() => document.getElementById("app-toast")?.textContent?.includes("INJECTED_UNDO_FAILURE"));
  const afterFailedUndo = await apiModel(page);
  assert.ok(afterFailedUndo.elements.some((element) => element.id === insertedId), "failed undo must leave the successful insert intact");

  await page.locator("#btn-undo").click();
  const afterUndoRecovery = await pollModel(page, (model) => !model.elements.some((element) => element.id === insertedId), "undo did not recover");
  assert.deepEqual(afterUndoRecovery.elements, baselineElements, "successful undo retry must restore the baseline element set");

  await page.locator("#btn-redo").click();
  const afterRedo = await pollModel(page, (model) => model.elements.some((element) => element.id === insertedId), "redo did not work after the recovered undo");
  assert.equal(afterRedo.elements.length, baselineElements.length + 1);
  assert.deepEqual(report.injected, ["insert", "undo"]);

  const screenshot = path.join(OUT, "recovered-after-insert-undo-failures.png");
  await page.screenshot({ path: screenshot });
  report.evidence = {
    baselineCount: baselineElements.length,
    insertedId,
    afterFailedInsertCount: afterFailedInsert.elements.length,
    afterInsertRecoveryCount: afterInsertRecovery.elements.length,
    afterFailedUndoCount: afterFailedUndo.elements.length,
    afterUndoRecoveryCount: afterUndoRecovery.elements.length,
    afterRedoCount: afterRedo.elements.length,
    screenshot,
  };
  assert.deepEqual(report.pageErrors, [], `handled command failures must not emit unhandled page errors: ${report.pageErrors.join(" | ")}`);
  assert.ok(report.consoleErrors.filter((message) => !/Failed to load resource.*503/i.test(message)).length === 0,
    `failure injection emitted unexpected console errors: ${report.consoleErrors.join(" | ")}`);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error?.stack || String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => undefined);
  server.kill("SIGTERM");
  if (process.env.KEEP_QA_PROJECT !== "1") fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: report.ok, report: path.join(OUT, "report.json"), evidence: report.evidence }));
