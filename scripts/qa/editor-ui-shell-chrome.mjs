#!/usr/bin/env node
/**
 * UI-shell chrome acceptance: no share entry (intranet product), fullscreen,
 * rail preview-mode, rail collapse, keyboard-help panel.
 *
 * Covers (inventory): absence of #btn-share / #share-dialog,
 * #btn-fs, #btn-rail-view, #btn-rail, `?` → #kbd-help.
 *
 * Self-boots its own native-web server + scratch project (never touches the
 * shared :55200 editor), follows scripts/qa/gestures.mjs primitives, exits
 * non-zero on failure, kills its server and removes its scratch project.
 *
 *   node scripts/qa/editor-ui-shell-chrome.mjs
 *   QA_PORT=55422 QA_OUT=output/ui-shell-chrome node scripts/qa/editor-ui-shell-chrome.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import {
  clickUi,
  waitEditorReady,
  assertPersisted,
} from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.QA_PORT || 55422);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ui-shell-chrome-"));
const project = path.join(scratchRoot, "project");
const outDir = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/ui-shell-chrome"));
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
/** Live model via page-relative fetch (this script owns its server; gestures' BASE-bound read would hit :55200). */
const readLiveModel = () => page.evaluate(async () => {
  const res = await fetch("/api/model");
  const json = await res.json();
  return json.model ?? json;
});
async function pollModel(predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const model = await readLiveModel();
    if (predicate(model)) return model;
    if (Date.now() > deadline) throw new Error(`model never satisfied: ${label}`);
    await page.waitForTimeout(200);
  }
}
function pass(msg) {
  console.log(`PASS  ${msg}`);
}

try {
  await waitForHealth();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  pass("editor loaded");

  // --- 1. intranet product: no share entry or dialog ---
  assert.equal(await page.locator("#btn-share, #share-dialog").count(), 0, "intranet editor must not offer sharing");
  pass("no share entry");

  // --- 2. fullscreen: enter → exit, chrome unbroken ---
  const titleBefore = await page.locator("#doc-title").innerText();
  await clickUi(page, "#btn-fs");
  await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 5000 });
  await shot("fullscreen-open");
  pass("fullscreen entered");
  await clickUi(page, "#btn-fs");
  await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
  assert.equal(await page.locator("#doc-title").innerText(), titleBefore, "exiting fullscreen must keep chrome state");
  assert.ok(await page.locator("#slide").isVisible(), "slide must still render after fullscreen exit");
  pass("fullscreen exited, chrome intact");

  // --- 3. rail preview-mode toggle (+ localStorage persistence) ---
  await clickUi(page, "#btn-rail-view");
  await page.waitForFunction(() => document.getElementById("rail")?.classList.contains("is-list"), null, { timeout: 4000 });
  assert.equal(await page.locator("#btn-rail-view").getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => localStorage.getItem("oss.railView")), "list");
  await shot("rail-list");
  await assertPersisted(page, async (reloaded) => {
    assert.ok(
      await reloaded.evaluate(() => document.getElementById("rail")?.classList.contains("is-list")),
      "list preview mode must survive reload",
    );
  });
  pass("rail preview list persists across reload");
  await clickUi(page, "#btn-rail-view");
  await page.waitForFunction(() => document.getElementById("rail")?.classList.contains("is-thumbs"), null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("oss.railView")), "thumbs");
  pass("rail preview toggles back to thumbs");

  // --- 4. rail collapse: DOM immediate + model state ---
  // NOTE: pageRailOpen is chrome-ephemeral session state (like zoomPercent),
  // not PPTD document state — reload reopens the live session at the boot
  // default (open when pages > 1). So persistence here means the boot
  // default, not the collapsed state.
  if (await page.evaluate(() => document.getElementById("rail")?.hidden)) {
    await clickUi(page, "#btn-rail");
    await page.waitForFunction(() => !document.getElementById("rail")?.hidden, null, { timeout: 4000 });
  }
  await clickUi(page, "#btn-rail");
  await page.waitForFunction(() => document.getElementById("rail")?.hidden === true, null, { timeout: 4000 });
  await pollModel((model) => model.pageRailOpen === false, "pageRailOpen false");
  await shot("rail-collapsed");
  pass("rail collapses (DOM + model)");
  await assertPersisted(page, async (reloaded) => {
    assert.equal(await reloaded.evaluate(() => document.getElementById("rail")?.hidden), false, "reload must restore the boot-default open rail");
    const model = await reloaded.evaluate(async () => {
      const res = await fetch("/api/model");
      return (await res.json()).model ?? {};
    });
    assert.equal(model.pageRailOpen, true, "reload must restore boot-default pageRailOpen=true");
  });
  pass("rail reload restores boot default");
  // collapse once more straight after reload to prove the toggle still works
  await clickUi(page, "#btn-rail");
  await page.waitForFunction(() => document.getElementById("rail")?.hidden === true, null, { timeout: 4000 });
  await pollModel((model) => model.pageRailOpen === false, "pageRailOpen false again");
  await clickUi(page, "#btn-rail");
  await page.waitForFunction(() => document.getElementById("rail")?.hidden === false, null, { timeout: 4000 });
  await pollModel((model) => model.pageRailOpen === true, "pageRailOpen true");
  pass("rail toggle round-trips");

  // --- 5. keyboard-help panel: `?` opens, Esc closes ---
  await page.mouse.click(720, 450);
  await page.waitForTimeout(200);
  await page.keyboard.press("?");
  await page.waitForFunction(() => {
    const el = document.getElementById("kbd-help");
    return el && !el.hidden;
  }, null, { timeout: 4000 });
  assert.match(await page.locator("#kbd-help").innerText(), /快捷键/, "help panel must name itself");
  await shot("kbd-help");
  pass("`?` opens keyboard help");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("kbd-help")?.hidden === true, null, { timeout: 4000 });
  pass("Esc closes keyboard help");

  assert.deepEqual(browserErrors, [], `browser emitted errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, outDir }));
} finally {
  await browser.close();
  server.kill("SIGKILL");
  if (!process.env.KEEP_QA_PROJECT) fs.rmSync(scratchRoot, { recursive: true, force: true });
}
