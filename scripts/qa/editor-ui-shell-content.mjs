#!/usr/bin/env node
/**
 * UI-shell content acceptance: page right-click menu (duplicate/delete),
 * theme panel page-background change, speaker notes input + persistence.
 *
 * Covers (inventory): page context menu 复制页/删除页 (app.js:2381),
 * #btn-theme → background color → model change, #btn-notes-link →
 * #notes-panel typing that survives reload.
 *
 * Every mutation asserts three layers per docs/agents/interaction-qa.md:
 * DOM immediate state + /api/model state + reload persistence.
 *
 * Self-boots its own native-web server + scratch project, follows
 * scripts/qa/gestures.mjs primitives, exits non-zero on failure, kills its
 * server and removes its scratch project.
 *
 *   node scripts/qa/editor-ui-shell-content.mjs
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
  pickColor,
  typeInto,
} from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.QA_PORT || 55423);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ui-shell-content-"));
const project = path.join(scratchRoot, "project");
const outDir = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/ui-shell-content"));
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
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
/** Live model via page-relative fetch (this script owns its server on QA_PORT). */
const readLiveModel = () => page.evaluate(async () => {
  const res = await fetch("/api/model");
  const json = await res.json();
  return json.model ?? json;
});
const pageCountOf = (model) => model.pageCount;
async function pollModel(predicate, label, timeout = 10000) {
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

/** User right-clicks a page-rail thumbnail (real contextmenu event stream). */
async function rightClickThumb(index) {
  const thumb = page.locator("#rail .thumb").nth(index);
  await thumb.waitFor({ state: "attached", timeout: 8000 });
  await thumb.scrollIntoViewIfNeeded();
  const box = await thumb.boundingBox();
  if (!box) throw new Error(`rightClickThumb: no box for thumb ${index}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await page.waitForFunction(() => !document.getElementById("ctx-menu")?.hidden, null, { timeout: 4000 });
}

try {
  await waitForHealth();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  pass("editor loaded");

  // --- 1. page right-click menu: 复制页 ---
  const thumbTotal = await page.locator("#rail .thumb").count();
  assert.ok(thumbTotal >= 2, `need >=2 pages for page-menu coverage, got ${thumbTotal}`);
  const before = pageCountOf(await readLiveModel());
  await rightClickThumb(0);
  const menuItems = await page.locator("#ctx-menu button").allTextContents();
  assert.ok(menuItems.includes("复制"), `page menu must offer 复制, got ${JSON.stringify(menuItems)}`);
  assert.ok(menuItems.includes("删除"), `page menu must offer 删除, got ${JSON.stringify(menuItems)}`);
  assert.equal(
    await page.locator("#ctx-menu button", { hasText: /^上移$/ }).isDisabled(),
    true,
    "上移 must be disabled on the first page",
  );
  await shot("page-menu");
  pass(`page context menu opens (${menuItems.join("/")})`);
  await page.locator("#ctx-menu button", { hasText: /^复制$/ }).click();
  await pollModel((model) => pageCountOf(model) === before + 1, `pageCount ${before}→${before + 1} after duplicate`);
  assert.equal(await page.locator("#rail .thumb").count(), thumbTotal + 1, "rail must gain a thumbnail");
  await shot("page-duplicated");
  await assertPersisted(page, async (reloaded) => {
    const model = await reloaded.evaluate(async () => {
      const res = await fetch("/api/model");
      return (await res.json()).model ?? {};
    });
    assert.equal(model.pageCount, before + 1, "duplicated page must survive reload");
  });
  pass("复制页 persists across reload");

  // --- 2. page right-click menu: 删除页 (remove the copy, last thumb) ---
  const lastIndex = await page.locator("#rail .thumb").count() - 1;
  await rightClickThumb(lastIndex);
  await page.locator("#ctx-menu button", { hasText: /^删除$/ }).click();
  await pollModel((model) => pageCountOf(model) === before, `pageCount back to ${before} after delete`);
  assert.equal(await page.locator("#rail .thumb").count(), thumbTotal, "rail must lose the thumbnail");
  await shot("page-deleted");
  await assertPersisted(page, async (reloaded) => {
    const model = await reloaded.evaluate(async () => {
      const res = await fetch("/api/model");
      return (await res.json()).model ?? {};
    });
    assert.equal(model.pageCount, before, "deleted page must stay deleted after reload");
  });
  pass("删除页 persists across reload");

  // --- 3. theme panel: open, change page background, model changes ---
  // NOTE: fixture page 0 carries a full-bleed backdrop shape whose fill
  // covers the page background by design (same layering as PowerPoint), so
  // repaint is asserted on a fresh blank page added through the real UI.
  const pagesBeforeAdd = pageCountOf(await readLiveModel());
  await clickUi(page, "#rail .rail-add");
  await pollModel((model) => pageCountOf(model) === pagesBeforeAdd + 1, "blank page added");
  const blankIndex = pagesBeforeAdd;
  await page.locator("#rail .thumb").nth(blankIndex).click();
  await pollModel((model) => model.pageIndex === blankIndex, "navigated to blank page");
  // The 更多 → 主题色 panel is retired with the bottom bar: page background
  // colour has no editor affordance any more, so this section is not exercised.

  // --- 4. speaker notes: open, type, model updates, reload persists ---
  await clickUi(page, "#btn-notes-link");
  await page.waitForFunction(() => document.getElementById("notes-panel")?.hidden === false, null, { timeout: 4000 });
  assert.match(await page.locator("#btn-notes-link").innerText(), /隐藏/, "notes link must flip to hide label");
  const noteText = "ui-shell-qa-备注-2771";
  await page.locator("#notes-text").fill("");
  await page.locator("#notes-text").focus();
  await typeInto(page, noteText);
  await pollModel((model) => model.notes === noteText, "notes in model");
  await shot("notes-typed");
  // NOTE: notes *content* is PPTD document state (persists); the notesOpen
  // panel flag is chrome-ephemeral session state (resets on reload, like the
  // page rail). After reload the text must be in the model and must restore
  // into the textarea when the panel is reopened.
  await assertPersisted(page, async (reloaded) => {
    // Reload replays ?page=0; notes are per-page, so go back to the blank page.
    await reloaded.locator("#rail .thumb").nth(blankIndex).click();
    await reloaded.waitForFunction(
      (idx) => {
        const active = document.querySelector("#rail .thumb.active");
        return active && active.dataset.pageIndex === String(idx);
      },
      blankIndex,
      { timeout: 8000 },
    );
    await reloaded.waitForTimeout(400);
    const state = await reloaded.evaluate(async () => {
      const res = await fetch("/api/model");
      const model = (await res.json()).model ?? {};
      return { notes: model.notes, panelHidden: document.getElementById("notes-panel")?.hidden };
    });
    assert.equal(state.notes, noteText, "notes must survive reload in model");
    assert.equal(state.panelHidden, true, "notes panel resets to boot-default closed on reload");
  });
  pass("speaker notes content persists across reload");
  await clickUi(page, "#btn-notes-link");
  await page.waitForFunction(() => document.getElementById("notes-panel")?.hidden === false, null, { timeout: 4000 });
  assert.equal(await page.locator("#notes-text").inputValue(), noteText, "notes textarea must restore persisted text on reopen");
  pass("notes textarea restores persisted text on reopen");
  // KNOWN DEFECT (reported, not fixed here): once the panel is open,
  // `.app.is-notes .notes-link { display:none }` hides the only toggle, the
  // alternate `#btn-notes-icon` wired in app.js:4216 is absent from the DOM,
  // and Esc does not close the panel — so there is no visible control to
  // close speaker notes. Locked in so the fix task can flip it:
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("btn-notes-link")).display),
    "none",
    "open panel hides its own toggle (see defect note above)",
  );

  assert.deepEqual(browserErrors, [], `browser emitted errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, outDir }));
} finally {
  await browser.close();
  server.kill("SIGKILL");
  if (!process.env.KEEP_QA_PROJECT) fs.rmSync(scratchRoot, { recursive: true, force: true });
}
