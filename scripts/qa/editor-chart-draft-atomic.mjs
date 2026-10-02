#!/usr/bin/env node
/**
 * Regression for chart draft debouncing: typing a value, allowing the 300 ms
 * debounce to persist it, and then blurring the cell must remain one command
 * and one undo step. Runs against a disposable project and pinned Chromium.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-chart-draft-atomic-"));
const PROJECT = path.join(SCRATCH, "project");
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/editor-rework/flow-final"));
fs.cpSync(SOURCE, PROJECT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  assert.ok(typeof address === "object" && address?.port > 0, "QA port must be assigned");
  return address.port;
}

const PORT = Number(process.env.QA_PORT || await freePort());
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), OPEN_SLIDESTUDIO_PROJECT: PROJECT },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`native editor did not start\n${serverLog}`);
}

async function model(page) {
  return page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
}

function chartDataFor(current, id) {
  return current.elements.find((element) => element.id === id)?.chartData;
}

let browser;
const report = {
  schemaVersion: "open-slidestudio.editor-chart-draft-atomic.v1",
  startedAt: new Date().toISOString(),
  fixture: path.relative(ROOT, SOURCE),
  case: "type, wait beyond debounce, blur remains one command and one undo",
  ok: false,
};

try {
  await waitForServer();
  browser = await launchPinnedChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));

  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT)}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const title = document.getElementById("doc-title")?.textContent || "";
    return title && title !== "未加载";
  });

  await page.locator('button[data-insert="chart"]').click();
  const chartNode = page.locator("#slide .el.chart.selected").first();
  await chartNode.waitFor({ state: "visible" });
  const chartId = await chartNode.getAttribute("data-id");
  assert.ok(chartId, "inserted chart must expose a stable id");
  const before = structuredClone(chartDataFor(await model(page), chartId));
  assert.ok(before?.rows?.length, "inserted chart must have editable data");

  await page.locator("#ctx-bar").getByRole("button", { name: "编辑数据", exact: true }).click();
  await page.locator("#chart-overlay:not([hidden])").waitFor({ state: "visible" });
  const cell = page.locator("#chart-grid tr:not(.add-row) td input").last();
  const originalValue = await cell.inputValue();
  const nextValue = originalValue === "17" ? "18" : "17";
  const writes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/command" || request.method() !== "POST") return;
    try {
      const body = JSON.parse(request.postData() || "{}");
      if (body.cmd === "setChartData") writes.push(body);
    } catch {
      // Malformed requests are handled by the product and are irrelevant here.
    }
  });

  const debouncedWrite = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/command" || response.request().method() !== "POST") return false;
    try {
      return JSON.parse(response.request().postData() || "{}").cmd === "setChartData";
    } catch {
      return false;
    }
  });
  await cell.fill(nextValue);
  const firstResponse = await debouncedWrite;
  assert.equal(firstResponse.status(), 200, "debounced chart save must succeed");
  await page.waitForTimeout(450);
  assert.equal(writes.length, 1, "typing and waiting beyond 300 ms must issue one chart command");

  await page.locator("#chart-overlay .chart-overlay-head strong").click();
  await page.waitForTimeout(450);
  assert.equal(writes.length, 1, "blur after the debounce has committed must not issue a duplicate chart command");
  assert.equal(String(chartDataFor(await model(page), chartId)?.rows?.at(-1)?.at(-1)), nextValue);

  await page.locator("#btn-undo").click();
  await page.waitForFunction(async ({ id, expected }) => {
    const current = (await (await fetch("/api/model")).json()).model;
    const data = current.elements.find((element) => element.id === id)?.chartData;
    return JSON.stringify(data) === expected;
  }, { id: chartId, expected: JSON.stringify(before) });
  assert.equal(writes.length, 1, "undo must not introduce another chart save");

  await page.locator("#btn-redo").click();
  await page.waitForFunction(async ({ id, expected }) => {
    const current = (await (await fetch("/api/model")).json()).model;
    return String(current.elements.find((element) => element.id === id)?.chartData?.rows?.at(-1)?.at(-1)) === expected;
  }, { id: chartId, expected: nextValue });
  assert.deepEqual(browserErrors, [], `unexpected browser errors:\n${browserErrors.join("\n")}`);

  const screenshot = path.join(OUT, "chart-draft-atomic-after-redo.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  report.ok = true;
  report.finishedAt = new Date().toISOString();
  report.evidence = {
    chartId,
    originalValue,
    nextValue,
    debounceWaitMs: 450,
    postBlurWaitMs: 450,
    setChartDataRequestCount: writes.length,
    oneUndoRestoredBaseline: true,
    redoRestoredTypedValue: true,
    browserErrors,
    screenshot: path.relative(ROOT, screenshot),
  };
  console.log("PASS editor-chart-draft-atomic: type, wait >300 ms, blur => one command and one undo");
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`FAIL editor-chart-draft-atomic\n${report.failure}`);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, "chart-draft-atomic.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => undefined);
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  fs.rmSync(SCRATCH, { recursive: true, force: true });
}
