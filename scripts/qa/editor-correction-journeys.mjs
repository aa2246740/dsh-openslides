#!/usr/bin/env node
/**
 * Agent-first, human-correction journeys for the native editor.
 *
 * Uses only a pinned headless Chromium, an owned random localhost server and
 * disposable copies of the canonical fixture. It never talks to :13080/:55200.
 * Synthetic composition events are labelled as such and are not macOS IME QA.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { waitEditorReady } from "./gestures.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-correction-journeys-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-correction-journeys"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
const ONLY = String(process.env.QA_ONLY || "").trim().toLowerCase();
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
  assert.ok(port > 0);
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const report = {
  schemaVersion: "open-slidestudio.editor-correction-journeys.v1",
  startedAt: new Date().toISOString(),
  port: PORT,
  fixture: path.relative(ROOT, SOURCE),
  cases: [],
  browserErrors: [],
  commandTrace: [],
  fontResponses: [],
  limitations: [
    "Composition events are browser-synthetic; macOS IME candidate windows and physical keyboard composition are not proven.",
    "The native color/file pickers are outside headless coverage.",
    "Icon exhaustiveness means every option the product exposes in each style's capped 96-item All view, not all 1,895 catalog records.",
  ],
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
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`native editor did not start on ${BASE}\n${serverLog.slice(-2000)}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 1,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") report.browserErrors.push(message.text());
});
page.on("pageerror", (error) => report.browserErrors.push(String(error)));
page.on("request", (request) => {
  if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return;
  try { report.commandTrace.push(request.postDataJSON()?.cmd || "unknown"); } catch {}
});
page.on("response", async (response) => {
  if (!/\/fonts\/.*\.woff2(?:\?|$)/.test(response.url())) return;
  const entry = { file: new URL(response.url()).pathname.split("/").at(-1), status: response.status(), bytes: null };
  try { entry.bytes = (await response.body()).length; } catch {}
  report.fontResponses.push(entry);
});

let currentProject = "";
let shotIndex = 0;

async function openCase(name, pageIndex = 0) {
  currentProject = path.join(SCRATCH, name);
  fs.cpSync(SOURCE, currentProject, { recursive: true });
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(currentProject)}&page=${pageIndex}`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  await page.evaluate(() => document.fonts?.ready);
  return currentProject;
}

async function model() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error(`model ${response.status}`);
    const data = await response.json();
    return data.model ?? data;
  });
}

async function poll(predicate, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() <= deadline) {
    last = await model();
    if (predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label}; last=${JSON.stringify(last)}`);
}

async function shot(name, locator = null) {
  shotIndex += 1;
  const file = path.join(OUT, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file });
  return file;
}

async function runCase(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY)) return;
  const started = Date.now();
  try {
    const evidence = await fn();
    report.cases.push({ name, ok: true, durationMs: Date.now() - started, evidence });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const screenshot = await shot(`failure-${name.replace(/[^a-z0-9]+/gi, "-")}`).catch(() => null);
    report.cases.push({ name, ok: false, durationMs: Date.now() - started, error: error?.stack || String(error), screenshot });
    console.error(`FAIL  ${name}: ${error?.message || error}`);
  }
}

async function captureCommand(expected, action, matches = () => true) {
  const expectedCommands = Array.isArray(expected) ? expected : [expected];
  const expectedLabel = expectedCommands.join(" or ");
  const requestPromise = page.waitForRequest((request) => {
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try {
      const body = request.postDataJSON();
      return expectedCommands.includes(body.cmd) && matches(body);
    } catch { return false; }
  }).catch((error) => error);
  let actionError = null;
  try { await action(); } catch (error) { actionError = error; }
  const request = await requestPromise;
  if (actionError) throw actionError;
  if (request instanceof Error) throw request;
  const body = request.postDataJSON();
  const response = await request.response();
  assert.ok(response, `${expectedLabel} must receive a response`);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { body, status: response.status(), data };
}

async function selectId(id, { shift = false } = {}) {
  const node = page.locator(`#slide .el[data-id="${id}"]`);
  await node.waitFor({ state: "visible" });
  // Fixture objects can overlap. Dispatch only the click to the exact rendered
  // node; pointerdown would incorrectly exercise setPointerCapture without a
  // native active pointer and create a harness-only NotFoundError.
  await node.dispatchEvent("click", { button: 0, shiftKey: shift });
  await page.waitForFunction(({ wanted, multi }) => {
    const selected = [...document.querySelectorAll("#slide .el.selected")].map((item) => item.getAttribute("data-id"));
    return selected.includes(wanted) && (!multi ? selected.length === 1 : selected.length >= 2);
  }, { wanted: id, multi: shift });
}

async function openProperty(id) {
  const wrap = page.locator(`#${id}`);
  await wrap.waitFor({ state: "visible" });
  if (!(await wrap.evaluate((node) => node.classList.contains("open")))) await wrap.locator(":scope > button").click();
  await wrap.locator(".ctx-pop").waitFor({ state: "visible" });
  return wrap;
}

async function openObjectMenu(id) {
  const node = page.locator(`#slide .el[data-id="${id}"]`);
  await node.waitFor({ state: "visible" });
  await node.click({ button: "right", force: true });
  await page.locator("#ctx-menu").waitFor({ state: "visible" });
  return page.locator("#ctx-menu");
}

async function openBlankMenu() {
  await page.locator("#slide").click({ button: "right", position: { x: 8, y: 8 }, force: true });
  const menu = page.locator("#ctx-menu");
  await menu.waitFor({ state: "visible" });
  return menu;
}

async function clickContext(label) {
  const buttons = page.locator("#ctx-menu button");
  const labels = await buttons.locator(":scope > span").allTextContents();
  const matches = labels.flatMap((text, index) => text.trim() === label ? [index] : []);
  assert.equal(matches.length, 1, `context menu must contain one ${label}; got ${labels.join("/")}`);
  await buttons.nth(matches[0]).click();
}

async function clickPopAction(popId, label) {
  const buttons = page.locator(`#${popId} .ctx-pop .ctx-btn`);
  const labels = (await buttons.allTextContents()).map((text) => text.trim());
  const matches = labels.flatMap((text, index) => text === label ? [index] : []);
  assert.equal(matches.length, 1, `${popId} must contain one ${label}; got ${labels.join("/")}`);
  await buttons.nth(matches[0]).click();
}

async function insertShape() {
  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  const command = await captureCommand("insert", () => page.locator("#shape-grid .shape-cell").first().click(), (body) => body.kind === "shape");
  assert.equal(command.status, 200);
  return command.data.model.selection.elementId;
}

function selectedElement(m, id) {
  return m.elements.find((element) => element.id === id);
}

function richStyleAt(runs, offset) {
  let cursor = 0;
  for (const run of runs || []) {
    const end = cursor + String(run.text || "").length;
    if (offset >= cursor && offset < end) return run;
    cursor = end;
  }
  return null;
}

function readDiskElement(project, m, id) {
  const rel = m.pagePaths[m.pageIndex];
  const body = YAML.parse(fs.readFileSync(path.join(project, rel), "utf8"));
  return body.elements.find((element) => element.elementId === id);
}

try {
  await waitHealth();

  await runCase("double click and range styles preserve unselected text", async () => {
    const project = await openCase("text-range-style");
    const textNode = page.locator("#slide .el.text").filter({ hasText: /XIAOMI EV/ }).first();
    const id = await textNode.getAttribute("data-id");
    assert.ok(id);
    const original = (await textNode.innerText()).trim();
    assert.ok(original.length > 8);
    await textNode.dblclick();
    assert.equal(await textNode.getAttribute("contenteditable"), "true");
    const range = { start: 0, end: 6 };
    await textNode.evaluate((node, selectedRange) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      const point = (target) => {
        let used = 0;
        for (const text of texts) {
          const length = text.nodeValue?.length || 0;
          if (used + length >= target) return [text, target - used];
          used += length;
        }
        return [texts.at(-1), texts.at(-1)?.nodeValue?.length || 0];
      };
      const [startNode, startOffset] = point(selectedRange.start);
      const [endNode, endOffset] = point(selectedRange.end);
      const domRange = document.createRange();
      domRange.setStart(startNode, startOffset);
      domRange.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(domRange);
      document.dispatchEvent(new Event("selectionchange"));
    }, range);
    const beforeStyle = selectedElement(await model(), id);
    const styleTraceStart = report.commandTrace.length;
    const bold = await captureCommand("setTextRangeStyle", () =>
      page.locator('#property-panel button[data-control="element.text.toolbar.bold.toggle"]').click());
    assert.equal(bold.status, 200);
    assert.deepEqual([bold.body.start, bold.body.end], [range.start, range.end]);
    const textColor = page.locator('#ctx-bar input[data-control="element.text.toolbar.color.set"]');
    const color = "#be123c";
    const colored = await captureCommand("setTextRangeStyle", () => textColor.evaluate((input, value) => {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, color));
    assert.equal(colored.status, 200);
    assert.deepEqual([colored.body.start, colored.body.end], [range.start, range.end]);
    assert.deepEqual(report.commandTrace.slice(styleTraceStart), ["setTextRangeStyle", "setTextRangeStyle"],
      "range-only bold/color changes must not create redundant setRichText transactions");
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "range edit did not commit before navigation");
    await page.locator("#rail .thumb").first().click();
    const persisted = await poll((m) => m.pageIndex === 0, "could not return to edited page");
    const element = selectedElement(persisted, id);
    assert.equal(element.text, original);
    assert.equal(richStyleAt(element.runs, 1)?.bold, true);
    assert.equal(richStyleAt(element.runs, 1)?.color?.toLowerCase(), color);
    assert.notEqual(Boolean(richStyleAt(element.runs, range.end + 1)?.bold), true, "bold leaked outside selected range");
    assert.notEqual(richStyleAt(element.runs, range.end + 1)?.color?.toLowerCase(), color, "color leaked outside selected range");
    const colorUndone = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.deepEqual(selectedElement(colorUndone.data.model, id), selectedElement(bold.data.model, id),
      "one undo must remove only the color range transaction and retain bold");
    const boldUndone = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.deepEqual(selectedElement(boldUndone.data.model, id), beforeStyle,
      "the second undo must reach the pre-range-style element");
    const boldRedone = await captureCommand("redo", () => page.locator("#btn-redo").click());
    assert.deepEqual(selectedElement(boldRedone.data.model, id), selectedElement(bold.data.model, id));
    const colorRedone = await captureCommand("redo", () => page.locator("#btn-redo").click());
    const finalElement = selectedElement(colorRedone.data.model, id);
    assert.deepEqual(finalElement, element, "redo twice must restore both independent range transactions");
    const disk = readDiskElement(project, colorRedone.data.model, id);
    assert.match(disk.content.text, /font-weight:700/);
    assert.match(disk.content.text, /#be123c/i);
    return {
      id,
      original,
      range,
      styleCommands: [bold.body.cmd, colored.body.cmd],
      undoRedoCommands: [colorUndone.body.cmd, boldUndone.body.cmd, boldRedone.body.cmd, colorRedone.body.cmd],
      runs: finalElement.runs,
      diskRichText: disk.content.text,
      screenshot: await shot("text-range-style", textNode),
    };
  });

  await runCase("mixed English and synthetic Chinese composition commits in order", async () => {
    await openCase("mixed-composition");
    const textNode = page.locator("#slide .el.text").first();
    const id = await textNode.getAttribute("data-id");
    await textNode.dblclick();
    await page.keyboard.press("Meta+A");
    await page.keyboard.type("Agent ");
    const eventLog = await textNode.evaluate((node) => {
      const log = [];
      for (const type of ["compositionstart", "compositionupdate", "beforeinput", "input", "compositionend"]) {
        node.addEventListener(type, (event) => log.push({ type, data: event.data || "", inputType: event.inputType || "" }));
      }
      node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      node.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "中文" }));
      node.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: "中文", inputType: "insertCompositionText", isComposing: true }));
      document.execCommand("insertText", false, "中文");
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: "中文", inputType: "insertCompositionText", isComposing: true }));
      node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文" }));
      return log;
    });
    await page.keyboard.type(" done");
    const expected = "Agent 中文 done";
    assert.equal((await textNode.innerText()).trim(), expected);
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "composition text did not commit before navigation");
    await page.locator("#rail .thumb").first().click();
    const persisted = await poll((m) => m.pageIndex === 0, "could not return to composition page");
    assert.equal(selectedElement(persisted, id)?.text, expected);
    const types = eventLog.map((entry) => entry.type);
    assert.ok(types.indexOf("compositionstart") < types.indexOf("compositionupdate"));
    assert.ok(types.indexOf("compositionupdate") < types.lastIndexOf("compositionend"));
    assert.ok(types.includes("beforeinput") && types.includes("input"));
    return { id, expected, eventLog, limitation: "synthetic browser composition; macOS IME not proven" };
  });

  await runCase("Escape with isComposing and keyCode 229 does not cancel the text draft", async () => {
    await openCase("composition-escape-229");
    const textNode = page.locator("#slide .el.text").first();
    const id = await textNode.getAttribute("data-id");
    const original = (await textNode.innerText()).trim();
    await textNode.dblclick();
    await page.keyboard.press("Meta+A");
    const afterEscape = await textNode.evaluate((node) => {
      const id = node.getAttribute("data-id");
      node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      document.execCommand("insertText", false, "中文草稿");
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 229, isComposing: true });
      node.dispatchEvent(event);
      const live = document.querySelector(`#slide .el[data-id="${CSS.escape(id)}"]`);
      return {
        oldNodeConnected: node.isConnected,
        liveContentEditable: Boolean(live?.isContentEditable),
        liveText: live?.innerText || "",
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
      };
    });
    assert.equal(afterEscape.isComposing, true);
    assert.equal(afterEscape.keyCode, 229);
    assert.equal(afterEscape.liveContentEditable, true, `IME Escape must keep the live text editor active; state=${JSON.stringify(afterEscape)}`);
    assert.match(afterEscape.liveText, /中文草稿/, "IME Escape must not restore the pre-edit text");
    await textNode.evaluate((node) => node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文草稿" })));
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "composition Escape draft did not commit after compositionend");
    await page.locator("#rail .thumb").first().click();
    const persisted = await poll((m) => m.pageIndex === 0, "could not return to IME page");
    assert.equal(selectedElement(persisted, id)?.text, "中文草稿");
    return { id, original, afterEscape, persisted: "中文草稿", limitation: "synthetic browser IME sequence" };
  });

  await runCase("link UI button and CmdK save modify cancel reject remove undo redo and reload", async () => {
    const project = await openCase("link-ui-full-element");
    const textNode = page.locator("#slide .el.text").first();
    const id = await textNode.getAttribute("data-id");
    await selectId(id);
    const dialog = page.locator("#text-link-dialog");
    const input = page.locator("#text-link-input");
    const linkButton = page.locator('#ctx-bar button[data-control="element.text.toolbar.link.set"]');
    let javascriptDialogs = 0;
    const onJavascriptDialog = (entry) => {
      javascriptDialogs += 1;
      void entry.dismiss();
    };
    page.on("dialog", onJavascriptDialog);
    try {
      await linkButton.click();
      await dialog.waitFor({ state: "visible" });
      assert.equal(await page.evaluate(() => document.activeElement?.id), "text-link-input");
      assert.match(await page.locator("#text-link-scope").innerText(), /作用于整个文本框/);
      assert.equal(await page.locator("#text-link-remove").isDisabled(), true);
      const firstHref = "https://example.test/guide";
      await input.fill(firstHref);
      const saved = await captureCommand("setTextStyle", () => page.locator("#text-link-save").click(),
        (body) => body.controlId === "element.text.toolbar.link.set");
      assert.equal(saved.status, 200);
      assert.equal(saved.body.patch.href, firstHref);
      await dialog.waitFor({ state: "hidden" });
      assert.equal(selectedElement(saved.data.model, id)?.href, firstHref);
      assert.equal(readDiskElement(project, saved.data.model, id)?.content?.href, firstHref);
      assert.equal(await page.locator(`#slide .el.text[data-id="${id}"]`).getAttribute("data-href"), firstHref);

      await page.keyboard.press("Meta+K");
      await dialog.waitFor({ state: "visible" });
      assert.equal(await input.inputValue(), firstHref);
      const openLink = page.locator("#text-link-open");
      assert.equal(await openLink.isVisible(), true);
      assert.equal(await openLink.getAttribute("href"), firstHref);
      assert.equal(await openLink.getAttribute("target"), "_blank");
      assert.match(await openLink.getAttribute("rel"), /noopener/);
      assert.match(await openLink.getAttribute("rel"), /noreferrer/);
      const secondHref = "mailto:qa@example.test";
      await input.fill(secondHref);
      const modified = await captureCommand("setTextStyle", () => input.press("Enter"),
        (body) => body.controlId === "element.text.toolbar.link.set");
      assert.equal(modified.body.patch.href, secondHref);
      assert.equal(selectedElement(modified.data.model, id)?.href, secondHref);
      await dialog.waitFor({ state: "hidden" });

      const stableCommandCount = report.commandTrace.length;
      await page.keyboard.press("Meta+K");
      await input.fill("tel:+8613800138000");
      await page.locator("#text-link-cancel").click();
      await dialog.waitFor({ state: "hidden" });
      await page.waitForTimeout(100);
      assert.equal(report.commandTrace.length, stableCommandCount, "Cancel must not send a link command");
      assert.equal(selectedElement(await model(), id)?.href, secondHref);

      await page.keyboard.press("Meta+K");
      await input.fill("tel:+8613800138000");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.waitForTimeout(100);
      assert.equal(report.commandTrace.length, stableCommandCount, "Escape must not send a link command");
      assert.equal(selectedElement(await model(), id)?.href, secondHref);
      assert.equal(await page.evaluate((elementId) => document.activeElement?.getAttribute?.("data-id") === elementId, id), true,
        "Escape must restore focus to the selected text element");

      await page.keyboard.press("Meta+K");
      const beforeInvalid = report.commandTrace.length;
      await input.fill("javascript:alert(1)");
      await page.locator("#text-link-save").click();
      const error = page.locator("#text-link-error");
      await error.waitFor({ state: "visible" });
      assert.match(await error.innerText(), /仅支持 http、https、mailto、tel 或站内相对地址/);
      assert.equal(await input.inputValue(), "javascript:alert(1)");
      assert.equal(await dialog.evaluate((node) => node.open), true);
      assert.equal(report.commandTrace.length, beforeInvalid);
      await input.fill("data:text/html,bad");
      await input.press("Enter");
      await error.waitFor({ state: "visible" });
      assert.equal(await input.inputValue(), "data:text/html,bad");
      assert.equal(report.commandTrace.length, beforeInvalid);
      assert.equal(selectedElement(await model(), id)?.href, secondHref);
      await page.locator("#text-link-cancel").click();
      await dialog.waitFor({ state: "hidden" });

      await linkButton.click();
      await dialog.waitFor({ state: "visible" });
      assert.equal(await page.locator("#text-link-remove").isEnabled(), true);
      const removed = await captureCommand("setTextStyle", () => page.locator("#text-link-remove").click(),
        (body) => body.controlId === "element.text.toolbar.link.set");
      assert.equal(removed.body.patch.href, null);
      assert.equal(selectedElement(removed.data.model, id)?.href, undefined);
      assert.equal(readDiskElement(project, removed.data.model, id)?.content?.href, undefined);

      const undoButton = page.locator("#btn-undo");
      const redoButton = page.locator("#btn-redo");
      assert.equal(await undoButton.getAttribute("aria-label"), "撤销");
      assert.equal(await redoButton.getAttribute("aria-label"), "重做");
      assert.equal(await undoButton.getAttribute("data-control"), "chrome.history.undo");
      assert.equal(await redoButton.getAttribute("data-control"), "chrome.history.redo");
      const undoPaths = await undoButton.locator("svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
      const redoPaths = await redoButton.locator("svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
      assert.equal(undoPaths.length, 2);
      assert.equal(redoPaths.length, 2);
      assert.notDeepEqual(undoPaths, redoPaths, "undo and redo must not render the same arrow");
      const undone = await captureCommand("undo", () => undoButton.click());
      assert.equal(selectedElement(undone.data.model, id)?.href, secondHref);
      const redone = await captureCommand("redo", () => redoButton.click());
      assert.equal(selectedElement(redone.data.model, id)?.href, undefined);
      await page.reload({ waitUntil: "networkidle" });
      await waitEditorReady(page);
      const reloaded = await model();
      assert.equal(selectedElement(reloaded, id)?.href, undefined);
      assert.equal(readDiskElement(project, reloaded, id)?.content?.href, undefined);
      assert.equal(javascriptDialogs, 0, "the link editor must not depend on window.prompt");
      return { id, firstHref, secondHref, cancelCommandDelta: 0, escapeCommandDelta: 0, invalidCommandDelta: 0, removed: true, undoPaths, redoPaths, javascriptDialogs, reloaded: true };
    } finally {
      page.off("dialog", onJavascriptDialog);
    }
  });

  await runCase("link UI preserves rich text and restores a local selection while applying whole-box href", async () => {
    const project = await openCase("link-ui-rich-selection");
    const textNode = page.locator("#slide .el.text").filter({ hasText: /XIAOMI EV/ }).first();
    const id = await textNode.getAttribute("data-id");
    const beforeModel = await model();
    const before = selectedElement(beforeModel, id);
    const beforeDiskText = readDiskElement(project, beforeModel, id)?.content?.text;
    await textNode.dblclick();
    const range = { start: 0, end: 6 };
    const selectedText = await textNode.evaluate((node, selectedRange) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      const point = (target) => {
        let used = 0;
        for (const text of texts) {
          const length = text.nodeValue?.length || 0;
          if (used + length >= target) return [text, target - used];
          used += length;
        }
        return [texts.at(-1), texts.at(-1)?.nodeValue?.length || 0];
      };
      const [startNode, startOffset] = point(selectedRange.start);
      const [endNode, endOffset] = point(selectedRange.end);
      const selection = window.getSelection();
      const domRange = document.createRange();
      domRange.setStart(startNode, startOffset);
      domRange.setEnd(endNode, endOffset);
      selection.removeAllRanges();
      selection.addRange(domRange);
      document.dispatchEvent(new Event("selectionchange"));
      return selection.toString();
    }, range);
    assert.equal(selectedText.length, range.end - range.start);
    const linkButton = page.locator('#ctx-bar button[data-control="element.text.toolbar.link.set"]');
    await linkButton.click();
    const dialog = page.locator("#text-link-dialog");
    await dialog.waitFor({ state: "visible" });
    assert.match(await page.locator("#text-link-scope").innerText(), /作用于整个文本框.*恢复当前文字选区/);
    await page.locator("#text-link-cancel").click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction((expected) => window.getSelection()?.toString() === expected, selectedText);
    assert.equal(await textNode.getAttribute("contenteditable"), "true");

    await linkButton.click();
    await dialog.waitFor({ state: "visible" });
    const href = "/docs/human-correction";
    await page.locator("#text-link-input").fill(href);
    const saved = await captureCommand("setTextStyle", () => page.locator("#text-link-save").click(),
      (body) => body.controlId === "element.text.toolbar.link.set");
    assert.equal(saved.body.patch.href, href);
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction((expected) => window.getSelection()?.toString() === expected, selectedText);
    const after = selectedElement(saved.data.model, id);
    assert.equal(after.href, href);
    assert.equal(after.text, before.text);
    assert.deepEqual(after.runs, before.runs);
    const disk = readDiskElement(project, saved.data.model, id);
    assert.equal(disk.content.href, href);
    assert.equal(disk.content.text, beforeDiskText);
    return { id, range, selectedText, scope: "whole text box", href, textPreserved: true, runsPreserved: true, diskRichTextPreserved: true };
  });

  await runCase("keyboard nudge duplicate cross-page clipboard delete undo redo", async () => {
    await openCase("keyboard-clipboard");
    const id = await insertShape();
    let current = await model();
    const start = [...selectedElement(current, id).bounds];
    let moved = await captureCommand("setBounds", () => page.keyboard.press("ArrowRight"));
    assert.equal(moved.status, 200);
    assert.deepEqual(selectedElement(moved.data.model, id).bounds, [start[0] + 1, start[1], start[2], start[3]]);
    moved = await captureCommand("setBounds", () => page.keyboard.press("Shift+ArrowDown"));
    assert.equal(moved.status, 200);
    assert.deepEqual(selectedElement(moved.data.model, id).bounds, [start[0] + 1, start[1] + 10, start[2], start[3]]);

    const duplicated = await captureCommand("duplicateSelected", () => page.keyboard.press("Meta+D"));
    assert.equal(duplicated.status, 200);
    const duplicateId = duplicated.data.model.selection.elementIds?.[0] || duplicated.data.model.selection.elementId;
    assert.ok(duplicateId && duplicateId !== id);
    assert.deepEqual(selectedElement(duplicated.data.model, duplicateId).bounds, [start[0] + 25, start[1] + 34, start[2], start[3]]);
    const undoDuplicate = await captureCommand("undo", () => page.keyboard.press("Meta+Z"));
    assert.equal(selectedElement(undoDuplicate.data.model, duplicateId), undefined);
    await selectId(id);
    const copied = await captureCommand("copySelected", () => page.keyboard.press("Meta+C"));
    assert.equal(copied.status, 200);
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "clipboard journey did not reach page 2");
    const beforePaste = (await model()).elements.length;
    const pasted = await captureCommand("pasteClipboard", () => page.keyboard.press("Meta+V"));
    assert.equal(pasted.status, 200);
    assert.equal(pasted.data.model.elements.length, beforePaste + 1);
    const pastedId = pasted.data.model.selection.elementIds?.[0] || pasted.data.model.selection.elementId;
    assert.ok(pastedId, "cross-page paste must select the created object");
    assert.equal(selectedElement(pasted.data.model, pastedId).shapeName, selectedElement(copied.data.model, id).shapeName);
    const deleted = await captureCommand("deleteSelected", () => page.keyboard.press("Delete"));
    assert.equal(selectedElement(deleted.data.model, pastedId), undefined);
    const undone = await captureCommand("undo", () => page.keyboard.press("Meta+Z"));
    assert.ok(selectedElement(undone.data.model, pastedId));
    const redone = await captureCommand("redo", () => page.keyboard.press("Meta+Shift+Z"));
    assert.equal(selectedElement(redone.data.model, pastedId), undefined);
    return { id, start, nudge: [1, 10], duplicateId, pastedId, page: 2, screenshot: await shot("keyboard-cross-page") };
  });

  await runCase("external plain-text clipboard replaces stale internal object clipboard", async () => {
    await openCase("external-plain-text-paste");
    const sourceId = await insertShape();
    const copied = await captureCommand("copySelected", () => page.keyboard.press("Meta+C"));
    assert.equal(copied.status, 200);
    const externalText = "外部纠错数值 2026：42.75%";
    await page.evaluate((text) => navigator.clipboard.writeText(text), externalText);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), externalText);
    await page.keyboard.press("Escape");
    await poll((m) => m.selection?.kind === "none", "Escape did not clear selection before external paste");
    const before = await model();
    const result = await captureCommand(["insert", "pasteClipboard"], () => page.keyboard.press("Meta+V"), (body) =>
      body.cmd === "pasteClipboard" || body.kind === "text");
    const after = result.data.model || await model();
    const insertedTexts = after.elements.filter((element) => element.type === "text" && element.text?.includes(externalText));
    const selectedText = after.elements.find((element) =>
      element.id === (after.selection?.elementId || after.selection?.elementIds?.[0]))?.text || "";
    const newShapes = after.elements.filter((element) => element.type === "shape").length - before.elements.filter((element) => element.type === "shape").length;
    assert.equal(result.status, 200, `external paste must be accepted; status=${result.status} body=${JSON.stringify(result.data)}`);
    assert.equal(result.body.cmd, "insert", `external plain text must take the atomic text insertion path; got ${result.body.cmd}`);
    assert.equal(result.body.kind, "text");
    assert.equal(result.body.text, externalText);
    assert.equal(insertedTexts.length, 1, `external plain text must create/edit text exactly once; selected text=${JSON.stringify(selectedText)}; stale internal shape delta=${newShapes}`);
    assert.equal(newShapes, 0, "external plain text must not paste the stale internally copied shape");
    return { sourceId, externalText, status: result.status, insertedTextId: insertedTexts[0]?.id, staleShapeDelta: newShapes };
  });

  await runCase("external plain text keeps native paste inside text editors and inputs", async () => {
    await openCase("native-text-paste");
    const textNode = page.locator("#slide .el.text").first();
    const id = await textNode.getAttribute("data-id");
    const textValue = "正文内原生粘贴 135 万元";
    await textNode.dblclick();
    await page.keyboard.press("Meta+A");
    await page.evaluate((text) => navigator.clipboard.writeText(text), textValue);
    const insertCountBefore = report.commandTrace.filter((command) => command === "insert").length;
    await page.keyboard.press("Meta+V");
    assert.equal((await textNode.innerText()).trim(), textValue);
    assert.equal(report.commandTrace.filter((command) => command === "insert").length, insertCountBefore, "contenteditable paste must not create a canvas object");
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "text paste did not commit before page navigation");
    await page.locator("#rail .thumb").first().click();
    const persisted = await poll((m) => m.pageIndex === 0, "could not return to pasted text page");
    assert.equal(selectedElement(persisted, id)?.text, textValue);

    await page.locator("#btn-sparkles").click();
    const brief = page.locator("#work-brief");
    const inputValue = "输入框原生粘贴";
    await brief.fill("待替换");
    await brief.press("Meta+A");
    await page.evaluate((text) => navigator.clipboard.writeText(text), inputValue);
    await brief.press("Meta+V");
    assert.equal(await brief.inputValue(), inputValue);
    assert.equal(report.commandTrace.filter((command) => command === "insert").length, insertCountBefore, "textarea paste must not create a canvas object");
    return { id, textValue, inputValue, canvasInsertDelta: 0 };
  });

  await runCase("clipboard cross path context copy then keyboard paste preserves the object", async () => {
    await openCase("clipboard-context-copy-keyboard-paste");
    const sourceId = await insertShape();
    const source = selectedElement(await model(), sourceId);
    await openObjectMenu(sourceId);
    const copied = await captureCommand("copySelected", () => clickContext("复制"));
    assert.equal(copied.status, 200);
    await page.keyboard.press("Escape");
    await poll((m) => m.selection?.kind === "none", "context-copy journey did not clear selection");
    const before = await model();
    const pasted = await captureCommand("pasteClipboard", () => page.keyboard.press("Meta+V"));
    const pastedId = pasted.data.model.selection?.elementId || pasted.data.model.selection?.elementIds?.[0];
    const created = selectedElement(pasted.data.model, pastedId);
    assert.equal(pasted.data.model.elements.length, before.elements.length + 1);
    assert.ok(created && pastedId !== sourceId);
    assert.equal(created.shapeName, source.shapeName);
    return { sourceId, pastedId, commands: [copied.body.cmd, pasted.body.cmd], preservedShapeName: created.shapeName };
  });

  await runCase("clipboard cross path keyboard copy then context paste preserves the object", async () => {
    await openCase("clipboard-keyboard-copy-context-paste");
    const sourceId = await insertShape();
    const source = selectedElement(await model(), sourceId);
    const copied = await captureCommand("copySelected", () => page.keyboard.press("Meta+C"));
    assert.equal(copied.status, 200);
    await page.keyboard.press("Escape");
    await poll((m) => m.selection?.kind === "none", "keyboard-copy journey did not clear selection");
    const before = await model();
    const menu = await openBlankMenu();
    const pasted = await captureCommand("pasteClipboard", () => menu.getByRole("button", { name: /粘贴/ }).click());
    const pastedId = pasted.data.model.selection?.elementId || pasted.data.model.selection?.elementIds?.[0];
    const created = selectedElement(pasted.data.model, pastedId);
    assert.equal(pasted.data.model.elements.length, before.elements.length + 1);
    assert.ok(created && pastedId !== sourceId);
    assert.equal(created.shapeName, source.shapeName);
    return { sourceId, pastedId, commands: [copied.body.cmd, pasted.body.cmd], preservedShapeName: created.shapeName };
  });

  await runCase("clipboard cross path external text then context paste inserts text only", async () => {
    await openCase("clipboard-external-text-context-paste");
    const externalText = "右键粘贴外部纠错 98.6%";
    await page.evaluate((text) => navigator.clipboard.writeText(text), externalText);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), externalText);
    const before = await model();
    const menu = await openBlankMenu();
    const pasted = await captureCommand("insert", () => menu.getByRole("button", { name: /粘贴/ }).click(), (body) => body.kind === "text");
    assert.equal(pasted.body.text, externalText);
    const pastedId = pasted.data.model.selection?.elementId || pasted.data.model.selection?.elementIds?.[0];
    const created = selectedElement(pasted.data.model, pastedId);
    assert.equal(pasted.data.model.elements.length, before.elements.length + 1);
    assert.equal(created?.type, "text");
    assert.equal(created?.text, externalText);
    return { pastedId, command: pasted.body.cmd, kind: pasted.body.kind, text: created.text };
  });

  await runCase("clipboard cross path context cut then keyboard paste restores the object", async () => {
    await openCase("clipboard-context-cut-keyboard-paste");
    const sourceId = await insertShape();
    const source = selectedElement(await model(), sourceId);
    await openObjectMenu(sourceId);
    const copyRequest = page.waitForRequest((request) =>
      isApiCommandUrl(request.url()) && request.method() === "POST" && request.postDataJSON()?.cmd === "copySelected");
    const deleteResponse = page.waitForResponse((response) =>
      isApiCommandUrl(response.url()) && response.request().postDataJSON()?.cmd === "deleteSelected");
    await clickContext("剪切");
    assert.equal((await copyRequest).postDataJSON().cmd, "copySelected");
    assert.equal((await deleteResponse).status(), 200);
    const cutModel = await poll((m) => !selectedElement(m, sourceId), "context cut did not remove the source object");
    const pasted = await captureCommand("pasteClipboard", () => page.keyboard.press("Meta+V"));
    const pastedId = pasted.data.model.selection?.elementId || pasted.data.model.selection?.elementIds?.[0];
    const restored = selectedElement(pasted.data.model, pastedId);
    assert.equal(pasted.data.model.elements.length, cutModel.elements.length + 1);
    assert.ok(restored);
    assert.equal(restored.shapeName, source.shapeName);
    return { sourceId, pastedId, commands: ["copySelected", "deleteSelected", pasted.body.cmd], preservedShapeName: restored.shapeName };
  });

  await runCase("clipboard menu permission failure stays inert and points to keyboard shortcuts", async () => {
    await openCase("clipboard-menu-permission-failure");
    const sourceId = await insertShape();
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "write", {
        configurable: true,
        value: async () => { throw new DOMException("QA clipboard write denied", "NotAllowedError"); },
      });
      Object.defineProperty(navigator.clipboard, "read", {
        configurable: true,
        value: async () => { throw new DOMException("QA clipboard read denied", "NotAllowedError"); },
      });
    });
    const beforeCopy = report.commandTrace.filter((command) => command === "copySelected").length;
    await openObjectMenu(sourceId);
    await clickContext("复制");
    const toast = page.locator("#app-toast");
    await toast.waitFor({ state: "visible" });
    assert.match(await toast.innerText(), /⌘C/);
    await page.waitForTimeout(100);
    assert.equal(report.commandTrace.filter((command) => command === "copySelected").length, beforeCopy,
      "denied menu copy must not mutate the server clipboard");

    await page.keyboard.press("Escape");
    await poll((m) => m.selection?.kind === "none", "permission-failure journey did not clear selection");
    const beforePaste = {
      paste: report.commandTrace.filter((command) => command === "pasteClipboard").length,
      insert: report.commandTrace.filter((command) => command === "insert").length,
      elements: (await model()).elements.length,
    };
    const menu = await openBlankMenu();
    await menu.getByRole("button", { name: /粘贴/ }).click();
    await page.waitForFunction(() => document.querySelector("#app-toast")?.textContent?.includes("⌘V"));
    assert.equal(report.commandTrace.filter((command) => command === "pasteClipboard").length, beforePaste.paste);
    assert.equal(report.commandTrace.filter((command) => command === "insert").length, beforePaste.insert);
    assert.equal((await model()).elements.length, beforePaste.elements);
    return { sourceId, copyToast: "⌘C", pasteToast: "⌘V", serverCommandsOnDeniedCopyPaste: 0, elementDelta: 0 };
  });

  await runCase("clipboard object marker expires after reload without inserting its label", async () => {
    await openCase("clipboard-marker-expired-after-reload");
    const sourceId = await insertShape();
    const copied = await captureCommand("copySelected", () => page.keyboard.press("Meta+C"));
    assert.equal(copied.status, 200);
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    const before = await model();
    const beforeCommands = {
      paste: report.commandTrace.filter((command) => command === "pasteClipboard").length,
      insert: report.commandTrace.filter((command) => command === "insert").length,
    };
    await page.keyboard.press("Meta+V");
    const toast = page.locator("#app-toast");
    await toast.waitFor({ state: "visible" });
    const toastText = await toast.innerText();
    assert.match(toastText, /来自其他标签页或已失效.*重新复制/);
    await page.waitForTimeout(100);
    const after = await model();
    assert.equal(report.commandTrace.filter((command) => command === "pasteClipboard").length, beforeCommands.paste);
    assert.equal(report.commandTrace.filter((command) => command === "insert").length, beforeCommands.insert);
    assert.equal(after.elements.length, before.elements.length);
    assert.equal(after.elements.some((element) => element.type === "text" && /DSH SlideStudio 对象/.test(element.text || "")), false,
      "expired internal marker must never become visible slide text");
    return { sourceId, toast: toastText, serverCommandDelta: 0, elementDelta: 0, markerLabelInserted: false };
  });

  await runCase("clipboard delayed menu copy rejects a changed selection", async () => {
    await openCase("clipboard-delayed-copy-selection-change");
    const first = await insertShape();
    const second = await insertShape();
    await selectId(second);
    await page.evaluate(() => {
      globalThis.__qaResolveClipboardWrite = null;
      Object.defineProperty(navigator.clipboard, "write", {
        configurable: true,
        value: () => new Promise((resolve) => { globalThis.__qaResolveClipboardWrite = resolve; }),
      });
    });
    const beforeCopy = report.commandTrace.filter((command) => command === "copySelected").length;
    await openObjectMenu(second);
    await clickContext("复制");
    await page.waitForFunction(() => typeof globalThis.__qaResolveClipboardWrite === "function");
    await selectId(first);
    await page.evaluate(() => globalThis.__qaResolveClipboardWrite());
    const toast = page.locator("#app-toast");
    await toast.waitFor({ state: "visible" });
    const toastText = await toast.innerText();
    assert.match(toastText, /所选对象已变化.*重新复制/);
    await page.waitForTimeout(100);
    assert.equal(report.commandTrace.filter((command) => command === "copySelected").length, beforeCopy,
      "a delayed context-menu copy must not capture a later selection");
    assert.deepEqual((await model()).selection.elementIds || [(await model()).selection.elementId], [first]);
    return { copiedCandidate: second, laterSelection: first, toast: toastText, copySelectedDelta: 0 };
  });

  await runCase("responsive desktop widths keep selected canvas and AI workspace usable", async () => {
    const states = [];
    const layout = () => page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node || node.hidden || getComputedStyle(node).display === "none") return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const property = document.querySelector("#property-panel");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        shell: rect(".shell"),
        chat: rect("#work-chat"),
        app: rect(".app"),
        workspace: rect(".workspace"),
        rail: rect("#rail"),
        stage: rect(".stage-wrap"),
        stageViewport: rect("#viewport"),
        slideCard: rect(".slide-card"),
        property: rect("#property-panel"),
        propertyAutoCollapsed: property?.hasAttribute("data-agent-auto-collapsed") || false,
        propertyCollapsed: property?.classList.contains("is-collapsed") || false,
        propertyExpanded: document.querySelector("#property-toggle")?.getAttribute("aria-expanded"),
        propertyTitle: document.querySelector("#property-title")?.textContent || "",
        aiExpanded: document.querySelector("#btn-sparkles")?.getAttribute("aria-expanded"),
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolbarOverflowX: document.querySelector(".toolbar")?.scrollWidth - document.querySelector(".toolbar")?.clientWidth,
      };
    });
    const assertGeometry = (state, label) => {
      assert.ok(state.chat && state.app && state.workspace && state.rail && state.stage && state.property, `${label}: core regions must be visible`);
      assert.ok(state.chat.right <= state.app.left + 1, `${label}: AI workspace overlaps app`);
      assert.ok(state.rail.right <= state.stage.left + 1, `${label}: page rail overlaps stage`);
      assert.ok(state.stage.right <= state.property.left + 1, `${label}: stage overlaps property panel`);
      assert.ok(state.property.right <= state.workspace.right + 1, `${label}: property panel leaves workspace`);
      assert.ok(state.stage.width >= 600, `${label}: selected canvas stage is too narrow (${state.stage.width})`);
      assert.ok(state.slideCard.width <= state.stageViewport.width + 1, `${label}: slide card is wider than its viewport`);
      assert.ok(state.documentOverflowX <= 1, `${label}: document overflows horizontally by ${state.documentOverflowX}px`);
      assert.ok(state.toolbarOverflowX <= 1, `${label}: toolbar overflows horizontally by ${state.toolbarOverflowX}px`);
      assert.equal(state.aiExpanded, "true", `${label}: AI toggle state mismatch`);
      assert.notEqual(state.propertyTitle, "未选择对象", `${label}: object context was lost`);
    };

    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await openCase(`responsive-selected-${width}`);
      const id = await insertShape();
      const preferenceBefore = await page.evaluate(() => localStorage.getItem("oss.propertyPanelCollapsed"));
      await page.locator("#btn-sparkles").click();
      await page.locator("#work-chat").waitFor({ state: "visible" });
      await page.waitForTimeout(250);
      const opened = await layout();
      const shouldAutoCollapse = width <= 1440;
      assert.equal(opened.propertyAutoCollapsed, shouldAutoCollapse, `${width}: automatic property collapse mismatch`);
      assert.equal(opened.propertyCollapsed, shouldAutoCollapse, `${width}: property visual collapse mismatch`);
      assertGeometry(opened, `${width}px selected-first`);
      assert.equal(await page.evaluate(() => localStorage.getItem("oss.propertyPanelCollapsed")), preferenceBefore,
        `${width}: temporary AI collapse must not change the saved preference`);
      states.push({ width, flow: "selected-first/open", ...opened });

      if (width === 1280) {
        await page.locator("#property-toggle").click();
        await page.waitForTimeout(250);
        const manuallyExpanded = await layout();
        assert.equal(manuallyExpanded.propertyAutoCollapsed, false);
        assert.equal(manuallyExpanded.propertyCollapsed, false);
        assert.equal(manuallyExpanded.propertyExpanded, "true");
        assert.ok(manuallyExpanded.stage.width < opened.stage.width, "explicit property expansion should reclaim its visible width");
        states.push({ width, flow: "selected-first/manual-expand", ...manuallyExpanded });
      }

      await page.locator("#chat-close").click();
      await page.locator("#work-chat").waitFor({ state: "hidden" });
      await page.waitForTimeout(250);
      const closed = await layout();
      assert.equal(closed.propertyAutoCollapsed, false);
      assert.equal(closed.propertyCollapsed, false);
      assert.equal(closed.propertyExpanded, "true");
      assert.notEqual(closed.propertyTitle, "未选择对象");
      assert.ok(selectedElement(await model(), id));
      states.push({ width, flow: "selected-first/closed", ...closed });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await openCase("responsive-ai-first-selection");
    await page.keyboard.press("Escape");
    await poll((m) => m.selection?.kind === "none", "AI-first flow did not start without selection");
    await page.locator("#btn-sparkles").click();
    await page.locator("#work-chat").waitFor({ state: "visible" });
    const existingId = await page.locator("#slide .el").first().getAttribute("data-id");
    await selectId(existingId);
    await page.waitForFunction(() => document.querySelector("#property-panel")?.hasAttribute("data-agent-auto-collapsed"));
    await page.waitForTimeout(200);
    const aiFirst = await layout();
    assertGeometry(aiFirst, "1280px AI-first then selection");
    assert.equal(aiFirst.propertyAutoCollapsed, true);
    states.push({ width: 1280, flow: "AI-first/select", ...aiFirst });

    await openCase("responsive-workspace-route-selection");
    await page.goto(`${BASE}/index.html?project=${encodeURIComponent(currentProject)}&page=0&workspace=1`, { waitUntil: "networkidle" });
    await waitEditorReady(page);
    await page.locator("#work-chat").waitFor({ state: "visible" });
    const routeId = await page.locator("#slide .el").first().getAttribute("data-id");
    await selectId(routeId);
    await page.waitForFunction(() => document.querySelector("#property-panel")?.hasAttribute("data-agent-auto-collapsed"));
    await page.waitForTimeout(200);
    const route = await layout();
    assertGeometry(route, "1280px workspace route then selection");
    assert.equal(route.propertyAutoCollapsed, true);
    states.push({ width: 1280, flow: "workspace=1/select", ...route });
    await page.setViewportSize({ width: 1440, height: 950 });
    return { widths: [1280, 1440, 1920], states };
  });

  await runCase("locked mixed selection disables destructive and movement menus", async () => {
    await openCase("locked-mixed");
    const first = await insertShape();
    const second = await insertShape();
    // The second insert is the topmost object and therefore the real pointer
    // target at the overlapping default bounds.
    await selectId(second);
    await openObjectMenu(second);
    const locked = await captureCommand("setLocked", () => clickContext("锁定"));
    assert.equal(locked.status, 200);
    assert.equal(selectedElement(locked.data.model, second).locked, true, `lock result mismatch: first=${first} second=${second} selection=${JSON.stringify(locked.data.model.selection)} flags=${JSON.stringify(locked.data.model.elements.filter((element) => element.id === first || element.id === second).map((element) => ({ id: element.id, locked: element.locked })))}`);
    await selectId(first, { shift: true });
    const mixed = await model();
    assert.deepEqual(new Set(mixed.selection.elementIds), new Set([first, second]));
    const position = page.locator('[data-inspector-section="position-arrange"]');
    await position.evaluate((node) => { node.open = true; });
    const shouldDisable = [
      ["置顶", /^(置顶|置于顶层)$/],
      ["上移", /^(上移|上移一层)$/],
      ["下移", /^(下移|下移一层)$/],
      ["置底", /^(置底|置于底层)$/],
      ["编组", "编组"],
      ["删除选区", /^(删除|删除选区)$/],
    ];
    const actual = {};
    for (const [key, name] of shouldDisable) {
      const button = page.getByRole("button", { name, exact: typeof name === "string" });
      assert.equal(await button.count(), 1, `${key} must exist exactly once`);
      actual[key] = await button.isDisabled();
    }
    const ungroup = page.getByRole("button", { name: "解组", exact: true });
    const ungroupCount = await ungroup.count();
    assert.ok(ungroupCount <= 1, "ungroup must not be duplicated");
    actual["解组"] = ungroupCount === 0 ? true : await ungroup.isDisabled();
    const align = page.locator('#pop-align > button');
    actual["pop-align"] = await align.isDisabled();
    let deleteGuard = null;
    if (!actual["删除选区"]) {
      const before = JSON.stringify(mixed.elements);
      const rejected = await captureCommand("deleteSelected", () => page.getByRole("button", { name: "删除选区", exact: true }).click());
      deleteGuard = { status: rejected.status, response: rejected.data };
      assert.notEqual(rejected.status, 200, "server must reject deletion containing a locked object");
      assert.equal(JSON.stringify((await model()).elements), before, "rejected locked deletion must not mutate the page");
    }
    const expectedDisabled = Object.fromEntries([...shouldDisable.map(([key]) => key), "解组", "pop-align"].map((label) => [label, true]));
    assert.deepEqual(actual, expectedDisabled, `mixed locked menu state mismatch; actual=${JSON.stringify(actual)} deleteGuard=${JSON.stringify(deleteGuard)}`);
    return { first, second, actual, selection: mixed.selection };
  });

  await runCase("hidden mixed selection has deterministic reveal semantics", async () => {
    await openCase("hidden-mixed");
    const first = await insertShape();
    const second = await insertShape();
    await selectId(second);
    let position = page.locator('[data-inspector-section="position-arrange"]');
    await position.evaluate((node) => { node.open = true; });
    const hidden = await captureCommand("setHidden", () => page.getByRole("button", { name: "隐藏", exact: true }).click());
    assert.equal(selectedElement(hidden.data.model, second).hidden, true);
    await selectId(first, { shift: true });
    const mixed = await model();
    assert.deepEqual(new Set(mixed.selection.elementIds), new Set([first, second]));
    position = page.locator('[data-inspector-section="position-arrange"]');
    await position.evaluate((node) => { node.open = true; });
    const reveal = page.getByRole("button", { name: "显示选区", exact: true });
    assert.equal(await reveal.count(), 1, "first hidden object must give mixed selection an explicit reveal action");
    const revealed = await captureCommand("setHidden", () => reveal.click());
    assert.equal(selectedElement(revealed.data.model, second).hidden, false);
    assert.equal(selectedElement(revealed.data.model, first).hidden, false);
    return { first, second, action: "显示", bothVisible: true };
  });

  await runCase("long object context menu remains inside the viewport", async () => {
    await openCase("context-menu-viewport");
    await insertShape();
    const id = await insertShape();
    const menu = await openObjectMenu(id);
    const geometry = await menu.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.viewportWidth && geometry.bottom <= geometry.viewportHeight,
      `context menu must be reachable without leaving the viewport: ${JSON.stringify(geometry)}`);
    return geometry;
  });

  await runCase("every visible object context-menu action executes its command", async () => {
    await openCase("context-menu-actions");
    const first = await insertShape();
    const second = await insertShape();
    const target = second;
    await selectId(target);
    let menu = await openObjectMenu(target);
    const expectedLabels = ["剪切", "复制", "粘贴", "复制副本", "置于顶层", "上移一层", "下移一层", "置于底层", "编组", "解组", "锁定", "删除"];
    assert.deepEqual((await menu.locator("button > span").allTextContents()).map((text) => text.trim()), expectedLabels);
    const evidence = [];

    menu = await openObjectMenu(target);
    evidence.push({ label: "复制", result: await captureCommand("copySelected", () => clickContext("复制")) });
    menu = await openObjectMenu(target);
    const beforePaste = (await model()).elements.length;
    const paste = await captureCommand("pasteClipboard", () => clickContext("粘贴"));
    assert.equal(paste.data.model.elements.length, beforePaste + 1);
    evidence.push({ label: "粘贴", command: paste.body.cmd });
    await captureCommand("undo", () => page.locator("#btn-undo").click());

    await selectId(target);
    menu = await openObjectMenu(target);
    const beforeDuplicate = (await model()).elements.length;
    const duplicate = await captureCommand("duplicateSelected", () => clickContext("复制副本"));
    assert.equal(duplicate.data.model.elements.length, beforeDuplicate + 1);
    evidence.push({ label: "复制副本", command: duplicate.body.cmd });
    await captureCommand("undo", () => page.locator("#btn-undo").click());

    for (const [label, dir] of [["置于顶层", "front"], ["上移一层", "forward"], ["下移一层", "backward"], ["置于底层", "back"]]) {
      await selectId(target);
      menu = await openObjectMenu(target);
      const arranged = await captureCommand("arrange", () => clickContext(label));
      assert.equal(arranged.body.dir, dir);
      evidence.push({ label, command: arranged.body.cmd, dir });
      await captureCommand("undo", () => page.locator("#btn-undo").click());
    }

    await selectId(first, { shift: false });
    await selectId(second, { shift: true });
    menu = await openObjectMenu(second);
    const grouped = await captureCommand("group", () => clickContext("编组"));
    const groupIds = [first, second].map((id) => selectedElement(grouped.data.model, id)?.groupId);
    assert.ok(groupIds[0] && groupIds[0] === groupIds[1]);
    evidence.push({ label: "编组", command: grouped.body.cmd, groupId: groupIds[0] });
    menu = await openObjectMenu(second);
    const ungrouped = await captureCommand("ungroup", () => clickContext("解组"));
    assert.ok([first, second].every((id) => !selectedElement(ungrouped.data.model, id)?.groupId));
    evidence.push({ label: "解组", command: ungrouped.body.cmd });

    await selectId(target);
    menu = await openObjectMenu(target);
    const locked = await captureCommand("setLocked", () => clickContext("锁定"));
    assert.equal(selectedElement(locked.data.model, target).locked, true);
    menu = await openObjectMenu(target);
    const unlocked = await captureCommand("setLocked", () => clickContext("解锁"));
    assert.equal(selectedElement(unlocked.data.model, target).locked, false);
    evidence.push({ label: "锁定/解锁", commands: [locked.body.cmd, unlocked.body.cmd] });

    await selectId(target);
    menu = await openObjectMenu(target);
    const cutCopy = page.waitForRequest((request) => isApiCommandUrl(request.url()) && request.postDataJSON()?.cmd === "copySelected");
    const cutDelete = page.waitForResponse((response) => isApiCommandUrl(response.url()) && response.request().postDataJSON()?.cmd === "deleteSelected");
    await clickContext("剪切");
    assert.equal((await cutCopy).postDataJSON().cmd, "copySelected");
    assert.equal((await cutDelete).status(), 200);
    assert.equal(selectedElement(await model(), target), undefined);
    evidence.push({ label: "剪切", commands: ["copySelected", "deleteSelected"] });
    await captureCommand("undo", () => page.locator("#btn-undo").click());

    await selectId(target);
    menu = await openObjectMenu(target);
    const deleted = await captureCommand("deleteSelected", () => clickContext("删除"));
    assert.equal(selectedElement(deleted.data.model, target), undefined);
    evidence.push({ label: "删除", command: deleted.body.cmd });
    await captureCommand("undo", () => page.locator("#btn-undo").click());

    return { expectedLabels, actions: evidence.map((item) => ({ label: item.label, command: item.command, commands: item.commands, dir: item.dir })), screenshot: await shot("context-menu-actions") };
  });

  await runCase("blank context menu exposes paste while paste works cross-page", async () => {
    await openCase("blank-context-menu");
    const id = await insertShape();
    await captureCommand("copySelected", () => page.keyboard.press("Meta+C"));
    await page.locator("#rail .thumb").nth(1).click();
    await poll((m) => m.pageIndex === 1, "blank-menu journey did not reach page 2");
    await page.locator("#slide").click({ button: "right", position: { x: 8, y: 8 }, force: true });
    const menu = page.locator("#ctx-menu");
    await menu.waitFor({ state: "visible" });
    const labels = (await menu.locator("button").allTextContents()).map((text) => text.replace(/⌘./g, "").trim());
    // 设置背景色 retired with the theme menu: a blank page now offers paste only.
    assert.deepEqual(labels, ["粘贴"]);
    assert.equal(await menu.getByRole("button", { name: /粘贴/ }).getAttribute("data-control"), "element.duplicate");
    const before = (await model()).elements.length;
    const pasted = await captureCommand("pasteClipboard", () => menu.getByRole("button", { name: /粘贴/ }).click());
    assert.equal(pasted.data.model.elements.length, before + 1);
    return { copiedFromPage: 1, pastedToPage: 2, sourceId: id, labels };
  });

  await runCase("all declared fonts load and missing font has a stable visible fallback", async () => {
    const project = await openCase("font-loading");
    const textNode = page.locator("#slide .el.text").filter({ hasText: /XIAOMI EV/ }).first();
    const id = await textNode.getAttribute("data-id");
    await selectId(id);
    // Between 900 and 1440 px the inspector auto-collapses while chat is open,
    // which zeroes the font selects. Expand it before touching them.
    const panel = page.locator("#property-panel");
    if ((await panel.getAttribute("class") || "").includes("is-collapsed")) {
      await page.locator("#property-toggle").click();
      await page.waitForFunction(() => !document.getElementById("property-panel")?.classList.contains("is-collapsed"));
    }
    // One "字体" select; each option is an ea+latin pair of Office-common faces.
    const fontSelect = page.locator('#property-panel select[data-control="element.text.toolbar.fontfamily.set"]');
    assert.equal(await fontSelect.count(), 1, "text properties offer a single 字体 select");
    const pairs = await fontSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
    assert.deepEqual(pairs, ["微软雅黑|Arial", "黑体|Arial", "宋体|Times New Roman", "楷体|Times New Roman", "仿宋|Times New Roman"]);
    const eaFamilies = [...new Set(pairs.map((pair) => pair.split("|")[0]))];
    const latinFamilies = [...new Set(pairs.map((pair) => pair.split("|")[1]))];
    const fontState = await page.evaluate(async (wanted) => {
      const sample = "SlideStudio 人类纠错 123";
      const normalized = (family) => String(family).replace(/^['"]|['"]$/g, "");
      const result = [];
      for (const family of wanted) {
        await document.fonts.load(`24px "${family}"`, sample);
        const faces = [...document.fonts].filter((face) => normalized(face.family) === family);
        result.push({ family, check: document.fonts.check(`24px "${family}"`, sample), statuses: faces.map((face) => face.status) });
      }
      return result;
    }, [...eaFamilies, ...latinFamilies]);
    for (const entry of fontState) {
      assert.equal(entry.check, true, `${entry.family} must be available to document.fonts`);
    }
    const known = await captureCommand("setTextStyle", () => fontSelect.selectOption("宋体|Times New Roman"));
    assert.equal(known.status, 200);
    const knownShot = await shot("font-known-georgia", textNode);
    const knownHash = crypto.createHash("sha256").update(fs.readFileSync(knownShot)).digest("hex");
    // Restate the target: the style command above may settle selection.
    const fallback = await page.evaluate(async () => {
      // The editor keys its live session by oss:tabId; a bare /api/command
      // lands on the default tab and sees no selection.
      const tab = sessionStorage.getItem("oss:tabId") || "";
      const response = await fetch(`/api/command${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "setTextStyle",
          controlId: "element.text.toolbar.fontfamily.set",
          // A bare unknown name stands for both scripts, same as an Agent write.
          patch: { fontFamily: "__OSS_Missing_Font__" },
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(fallback.status, 200);
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    const fallbackNode = page.locator(`#slide .el.text[data-id="${id}"]`);
    const fallbackShot = await shot("font-missing-fallback", fallbackNode);
    const fallbackHash = crypto.createHash("sha256").update(fs.readFileSync(fallbackShot)).digest("hex");
    assert.notEqual(fallbackHash, knownHash, "known and missing-font renderings should produce different pixels");
    assert.equal((await fallbackNode.innerText()).trim().length > 0, true, "fallback text must remain visible");
    const metrics = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const sample = "SlideStudio 人类纠错 123";
      ctx.font = '24px "__OSS_Missing_Font__", sans-serif';
      const missing = ctx.measureText(sample).width;
      ctx.font = "24px sans-serif";
      const sans = ctx.measureText(sample).width;
      return { missing, sans, equal: Math.abs(missing - sans) < 0.01 };
    });
    assert.equal(metrics.equal, true, "missing family must resolve to the declared browser sans-serif fallback metrics");
    const persisted = await model();
    // The live model paints a CSS stack; the disk keeps the bare name exactly
    // as written, since old decks are not rewritten on read.
    assert.match(String(selectedElement(persisted, id).fontFamily), /__OSS_Missing_Font__/);
    assert.equal(readDiskElement(project, persisted, id).content.fontFamily, "__OSS_Missing_Font__");
    return { families: fontState, loadedFontResponses: report.fontResponses.filter((entry) => entry.status === 200 && entry.bytes > 0).length, knownShot, fallbackShot, knownHash, fallbackHash, metrics };
  });

  // Manual icon insertion (and its palette with fas/far/fab style lists) is
  // retired by design: icons arrive from the agent, and hand-editing belongs in
  // PowerPoint. The case is therefore not part of this journey any more.
} catch (error) {
  report.harnessFailure = error?.stack || String(error);
} finally {
  report.finishedAt = new Date().toISOString();
  report.ok = !report.harnessFailure && report.cases.every((entry) => entry.ok) && report.browserErrors.length === 0;
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  if (!KEEP) fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: report.ok, passed: report.cases.filter((entry) => entry.ok).length, failed: report.cases.filter((entry) => !entry.ok).length, browserErrors: report.browserErrors.length, report: path.join(OUT, "report.json") }));
if (!report.ok) process.exitCode = 1;
