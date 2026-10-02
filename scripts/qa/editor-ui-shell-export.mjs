#!/usr/bin/env node
/**
 * UI-shell export acceptance: real PNG download (non-empty) and the
 * export-error → retry recovery path.
 *
 * Covers (inventory): #export-png (genuine PNG download, not a stub) and
 * #export-retry (simulated 500 → visible error → retry downloads for real).
 *
 * Self-boots its own native-web server + scratch project, follows
 * scripts/qa/gestures.mjs primitives, exits non-zero on failure, kills its
 * server and removes its scratch project.
 *
 *   node scripts/qa/editor-ui-shell-export.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { clickUi, waitEditorReady } from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.QA_PORT || 55424);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ui-shell-export-"));
const project = path.join(scratchRoot, "project");
const outDir = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/ui-shell-export"));
fs.cpSync(SOURCE, project, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`native editor did not start\n${serverLog}`);
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("console", (message) => {
  // The retry test intentionally fails one /api/export call; that single
  // resource error is expected and asserted separately below.
  if (message.type() === "error" && !/api\/export|Failed to load resource/i.test(message.text())) {
    browserErrors.push(message.text());
  }
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
function pass(msg) {
  console.log(`PASS  ${msg}`);
}
async function openExportDialog() {
  await clickUi(page, "#btn-export");
  await page.waitForFunction(() => document.getElementById("export-dialog")?.open, null, { timeout: 4000 });
}
async function closeExportDialog() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("export-dialog")?.open, null, { timeout: 4000 });
}
async function downloadSize(download) {
  const filePath = await download.path();
  if (!filePath) throw new Error("download produced no file path");
  return fs.statSync(filePath).size;
}

try {
  await waitForHealth();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  pass("editor loaded");

  // --- 1. PNG export: real non-empty download + result card ---
  await openExportDialog();
  const pngButton = page.locator("#export-png");
  assert.equal(await pngButton.getAttribute("data-control"), "chrome.export.image", "PNG button must be oracle-governed");
  assert.equal(await pngButton.isDisabled(), false, "PNG button must be enabled");
  const pngDownloadPromise = page.waitForEvent("download", { timeout: 90000 });
  await clickUi(page, "#export-png");
  await clickUi(page, "#export-download");
  const pngDownload = await pngDownloadPromise;
  const pngBytes = await downloadSize(pngDownload);
  assert.match(pngDownload.suggestedFilename(), /\.png$/i, "download must be a .png file");
  assert.ok(pngBytes > 10240, `PNG must be a real render, got ${pngBytes} bytes`);
  await page.waitForFunction(() => !document.getElementById("export-result")?.hidden, null, { timeout: 8000 });
  assert.match(await page.locator("#export-result").innerText(), /页/, "result card must summarize the export");
  await shot("export-png-result");
  pass(`PNG exported (${pngBytes} bytes, ${pngDownload.suggestedFilename()})`);
  await closeExportDialog();

  // --- 2. export error → retry recovery ---
  await openExportDialog();
  let failuresLeft = 1;
  await page.route("**/api/export", async (route) => {
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      await route.fulfill({ status: 500, body: "qa-simulated-export-failure" });
      return;
    }
    await route.continue();
  });
  await clickUi(page, "#export-download");
  await page.waitForFunction(() => !document.getElementById("export-error")?.hidden, null, { timeout: 20000 });
  assert.match(await page.locator("#export-error-text").innerText(), /\S/, "error text must explain the failure");
  assert.ok(await page.locator("#export-retry").isVisible(), "retry control must appear on export failure");
  await shot("export-error");
  pass("export failure surfaces error + retry");
  await page.unroute("**/api/export");
  const retryDownloadPromise = page.waitForEvent("download", { timeout: 90000 });
  await clickUi(page, "#export-retry");
  const retryBytes = await downloadSize(await retryDownloadPromise);
  assert.ok(retryBytes > 10240, `retry must download a real file, got ${retryBytes} bytes`);
  await page.waitForFunction(() => !document.getElementById("export-result")?.hidden, null, { timeout: 8000 });
  await shot("export-retry-result");
  pass(`export retry recovered (${retryBytes} bytes)`);
  await closeExportDialog();

  assert.deepEqual(browserErrors, [], `browser emitted errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, outDir }));
} finally {
  await browser.close();
  server.kill("SIGKILL");
  if (!process.env.KEEP_QA_PROJECT) fs.rmSync(scratchRoot, { recursive: true, force: true });
}
