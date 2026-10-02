#!/usr/bin/env node
/**
 * Focused acceptance for the coherent selected-object inspector.
 *
 * Uses the pinned Chromium runtime, a random localhost port and disposable
 * copies of the canonical fixture. It never contacts :13080/:55200.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { dragCropHandle, insertViaCommand, waitEditorReady } from "./gestures.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "oss-inspector-coherent-"));
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-inspector-coherent"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
const ONLY = String(process.env.QA_ONLY || "").trim().toLowerCase();
const SKIP = String(process.env.QA_SKIP || "").trim().toLowerCase();
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
  schemaVersion: "open-slidestudio.editor-inspector-coherent-correction.v1",
  startedAt: new Date().toISOString(),
  fixture: path.relative(ROOT, SOURCE),
  port: PORT,
  runtime: "repository adapter -> ~/.codex/playwright-runtime/runtime.mjs",
  cases: [],
  browserErrors: [],
  commandTrace: [],
  limitations: [
    "Headless Chromium does not prove macOS IME candidate-window behavior or native file/color pickers.",
    "Signed-in Agent execution and the native IAB prompt journey remain root-owned native acceptance.",
    "This run uses disposable fixture copies and does not exercise the live :13080/:55200 runtime.",
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`native editor did not start on ${BASE}\n${serverLog.slice(-3000)}`);
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

let currentProject = "";
let shotIndex = 0;

async function openCase(name, pageIndex = 0) {
  currentProject = path.join(SCRATCH, name);
  fs.cpSync(SOURCE, currentProject, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 950 });
  if (page.url().startsWith(BASE)) {
    await page.evaluate(() => {
      localStorage.setItem("oss.propertyPanelCollapsed", "0");
      sessionStorage.clear();
    });
  }
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(currentProject)}&page=${pageIndex}`, { waitUntil: "networkidle" });
  await waitEditorReady(page);
  await page.evaluate(() => document.fonts?.ready);
  return currentProject;
}

async function readModel() {
  return page.evaluate(async () => {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error(`model ${response.status}`);
    const data = await response.json();
    return data.model ?? data;
  });
}

async function pollModel(predicate, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() <= deadline) {
    last = await readModel();
    if (predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label}; last=${JSON.stringify(last)}`);
}

async function captureCommand(expected, action, matches = () => true) {
  const commands = Array.isArray(expected) ? expected : [expected];
  const requestPromise = page.waitForRequest((request) => {
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try {
      const body = request.postDataJSON();
      return commands.includes(body.cmd) && matches(body);
    } catch { return false; }
  });
  await action();
  const request = await requestPromise;
  const response = await request.response();
  assert.ok(response, `${commands.join("/")} must receive a response`);
  const body = request.postDataJSON();
  const data = await response.json();
  assert.equal(response.status(), 200, `${body.cmd} must return HTTP 200`);
  return { body, data, model: data.model ?? data };
}

async function directCommand(body) {
  const result = await page.evaluate(async (payload) => {
    // Match the editor's own api(): it keys the live session by oss:tabId.
    const tab = sessionStorage.getItem("oss:tabId") || "";
    const response = await fetch(`/api/command${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, data: await response.json() };
  }, body);
  assert.equal(result.status, 200, `${body.cmd} setup command must return HTTP 200`);
  return result.data.model ?? result.data;
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
  if (SKIP && name.toLowerCase().includes(SKIP)) return;
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

function selected(model, id) {
  return model.elements.find((element) => element.id === id);
}

async function selectedId() {
  return page.locator("#slide .el.selected").first().getAttribute("data-id");
}

async function selectId(id, { shift = false } = {}) {
  const node = page.locator(`#slide .el[data-id="${id}"]`);
  await node.waitFor({ state: "attached" });
  await node.dispatchEvent("click", { button: 0, shiftKey: shift });
  await page.waitForFunction(({ wanted, multi }) => {
    const ids = [...document.querySelectorAll("#slide .el.selected")].map((item) => item.getAttribute("data-id"));
    return ids.includes(wanted) && (!multi ? ids.length === 1 : ids.length >= 2);
  }, { wanted: id, multi: shift });
}

async function insertText() {
  const result = await captureCommand("insert", () => page.locator('#insert-toolbar [data-insert="text"]').click(), (body) => body.kind === "text");
  return result.model.selection?.elementId || await selectedId();
}

async function insertShape() {
  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  const result = await captureCommand("insert", () => page.locator("#shape-grid .shape-cell").first().click(), (body) => body.kind === "shape");
  return result.model.selection?.elementId || await selectedId();
}

async function insertIcon() {
  // Icons have no insert affordance any more (the palette tab was retired with
  // the manual-icon entry), so seed one through the command path and select it.
  await insertViaCommand(page, "icon");
  await page.locator("#slide .el.icon").first().click();
  return (await selectedId()) || undefined;
}

async function insertLine() {
  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  await page.locator('#lib-tabs [data-lib="line"]').click();
  const result = await captureCommand("insert", () => page.locator("#line-presets button", { hasText: /^直线$/ }).click(), (body) => body.kind === "line");
  return result.model.selection?.elementId || await selectedId();
}

async function insertImage() {
  const chooserPromise = page.waitForEvent("filechooser");
  const requestPromise = page.waitForRequest((request) => {
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try { return request.postDataJSON()?.cmd === "insert" && request.postDataJSON()?.kind === "image"; } catch { return false; }
  });
  await page.locator('#insert-toolbar [data-insert="image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(SOURCE, "media/bg_data.png"));
  const request = await requestPromise;
  const response = await request.response();
  assert.ok(response);
  assert.equal(response.status(), 200);
  const data = await response.json();
  return (data.model ?? data).selection?.elementId || await selectedId();
}

async function insertTable() {
  await page.locator('#insert-toolbar [data-insert="table"]').click();
  const result = await captureCommand("insert", () => page.locator('#table-size-grid [data-r="3"][data-c="4"]').click(), (body) => body.kind === "table");
  assert.equal(await page.locator('#insert-toolbar [data-insert="table"]').getAttribute("aria-expanded"), "false",
    "choosing a table size must clear the insert trigger expanded state");
  assert.equal(await page.locator("#table-size").isHidden(), true, "choosing a table size must close the size picker");
  return result.model.selection?.elementId || await selectedId();
}

async function insertChart() {
  // Chart insertion has no editor affordance by design; seed through the command
  // path and keep testing how the chart's inspector behaves.
  await insertViaCommand(page, "chart");
  await page.locator("#slide .el.chart").first().click();
  return (await selectedId()) || undefined;
}

async function insertSmartArt() {
  // SmartArt insertion has no editor affordance by design. It seeds a grouped
  // set of shapes + text runs, so pick the exact element the command returned
  // and select it with the real Tab cycle (a centre click can land on whatever
  // overlaps it on the fixture page).
  const seeded = await insertViaCommand(page, "smartart");
  const id = (seeded.model?.elements || []).find((el) => el.smartArt)?.id;
  assert.ok(id, "command-seeded SmartArt must carry smartArt meta");
  for (let i = 0; i < 30; i += 1) {
    // The reload above clears the on-canvas selection, so read tolerantly.
    const current = await page.locator("#slide .el.selected").first()
      .getAttribute("data-id").catch(() => null);
    if (current === id) return id;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
  }
  const finalId = await page.locator("#slide .el.selected").first()
    .getAttribute("data-id").catch(() => null);
  assert.equal(finalId, id, `could not Tab-select the seeded SmartArt ${id}`);
  return id;
}

const TYPE_SECTIONS = {
  text: ["target", "text", "textbox", "position-arrange", "appearance", "actions"],
  shape: ["target", "shape", "position-arrange", "appearance", "actions"],
  image: ["target", "image", "position-arrange", "appearance", "actions"],
  line: ["target", "line", "position-arrange", "appearance", "actions"],
  icon: ["target", "icon", "position-arrange", "appearance", "actions"],
  table: ["target", "table", "position-arrange", "appearance", "actions"],
  chart: ["target", "chart", "position-arrange", "appearance", "actions"],
  smartart: ["target", "smartart", "position-arrange", "appearance", "actions"],
};

async function inspectorFacts() {
  return page.locator("#property-panel").evaluate((panel) => ({
    type: panel.dataset.inspectorType,
    selectionState: panel.dataset.selectionState,
    title: panel.querySelector("#property-title")?.textContent?.trim() || "",
    sections: [...panel.querySelectorAll("[data-inspector-section]")].map((node) => ({
      key: node.getAttribute("data-inspector-section"),
      title: node.querySelector(":scope > header h3, :scope > summary > span")?.textContent?.trim() || "",
    })),
    visibleLabels: [...panel.querySelectorAll("button, label, h3, summary")]
      .filter((node) => Boolean(node.getClientRects().length))
      .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim()),
    actionLabels: [...panel.querySelectorAll("button")]
      .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim()),
  }));
}

async function assertCoherentInspector(type) {
  const panel = page.locator("#property-panel");
  await panel.waitFor({ state: "visible" });
  await page.waitForFunction((wanted) => document.getElementById("property-panel")?.dataset.inspectorType === wanted, type);
  const facts = await inspectorFacts();
  assert.equal(facts.type, type);
  assert.equal(facts.selectionState, "single");
  assert.match(facts.title, new RegExp({ text: "文字", shape: "形状", image: "图片", line: "线条", icon: "图标", table: "表格", chart: "图表", smartart: "SmartArt" }[type], "i"));
  assert.deepEqual(facts.sections.map((section) => section.key), TYPE_SECTIONS[type], `${type} section order must match the coherent inspector contract`);
  assert.equal(facts.visibleLabels.some((label) => label === "更多" || label.startsWith("更多 ")), false, `${type} inspector must not contain a More bucket`);
  for (const [meaning, pattern] of [
    ["front", /^(置顶|置于顶层)$/],
    ["forward", /^(上移|上移一层)$/],
    ["backward", /^(下移|下移一层)$/],
    ["back", /^(置底|置于底层)$/],
    ["duplicate", /^复制副本$/],
    ["delete", /^(删除|删除选区)$/],
  ]) {
    assert.equal(facts.actionLabels.filter((entry) => pattern.test(entry)).length, 1, `${type} must expose exactly one inspector ${meaning} action`);
  }
  assert.equal(await panel.locator('[data-align-scope="page"]').count(), 1, `${type} single selection must expose page-relative object alignment`);
  return facts;
}

async function assertActionWithinPanelBounds() {
  const failures = await page.locator("#property-panel").evaluate((panel) => {
    const pr = panel.getBoundingClientRect();
    const nodes = [...panel.querySelectorAll("button, input, select, textarea")].filter((node) => Boolean(node.getClientRects().length));
    return nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      const label = node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName;
      return rect.left < pr.left - 1 || rect.right > pr.right + 1 ? [{ label, left: rect.left, right: rect.right, panelLeft: pr.left, panelRight: pr.right }] : [];
    });
  });
  assert.deepEqual(failures, [], `inspector controls must remain inside the panel: ${JSON.stringify(failures)}`);
}

async function assertUngroupUnavailable(message) {
  const button = page.getByRole("button", { name: "解组", exact: true });
  const count = await button.count();
  assert.ok(count <= 1, `${message}: ungroup must not be duplicated`);
  if (count === 1) assert.equal(await button.isDisabled(), true, `${message}: ungroup must not be enabled`);
  return count === 0 ? "absent" : "disabled";
}

try {
  await waitHealth();

  await runCase("empty selection gives recovery copy without inspector actions", async () => {
    await openCase("empty");
    await page.keyboard.press("Escape");
    const panel = page.locator("#property-panel");
    await page.waitForFunction(() => document.getElementById("property-panel")?.dataset.selectionState === "empty");
    assert.equal(await panel.getAttribute("data-inspector-type"), "none");
    assert.equal((await page.locator("#property-title").innerText()).trim(), "未选择对象");
    assert.ok(await page.locator("#property-empty").isVisible());
    assert.equal(await page.locator('#property-panel [data-control^="element."]').count(), 0);
    return { title: await page.locator("#property-title").innerText(), screenshot: await shot("empty-selection", panel) };
  });

  for (const [type, insert] of Object.entries({
    text: insertText,
    shape: insertShape,
    image: insertImage,
    line: insertLine,
    icon: insertIcon,
    table: insertTable,
    chart: insertChart,
    smartart: insertSmartArt,
  })) {
    await runCase(`${type} selection exposes only its coherent inspector sections`, async () => {
      await openCase(`type-${type}`);
      const id = await insert();
      assert.ok(id, `${type} insertion must return a selected id`);
      const facts = await assertCoherentInspector(type);
      await assertActionWithinPanelBounds();
      if (type === "text") {
        assert.equal((await page.locator("#pop-align-t > .property-control-label").innerText()).trim(), "文本对齐");
        assert.ok(await page.locator('#pop-align-t [data-control="element.text.toolbar.align.set"]').count() >= 6,
          "text alignment must expose horizontal and vertical choices under its explicit label");
        assert.equal(await page.locator('#pop-align-el > button[aria-label="对象对齐"]').count(), 1);
      }
      if (type === "shape") {
        await page.locator('[data-inspector-section="position-arrange"]').evaluate((node) => { node.open = true; });
        await assertUngroupUnavailable("ungrouped object");
      }
      if (type === "image") {
        assert.equal(await page.locator('#crop-start[data-control="element.image.crop.set"]').count(), 1, "image inspector must have one crop entry");
        assert.equal(await page.locator('#pop-crop > button[aria-label="遮罩形状"]').count(), 1, "image masking must be named separately from crop");
        await page.locator('#pop-image > button[aria-label="Agent 重建图片"]').click();
        assert.equal(await page.locator('#image-rebuild-form [data-control="element.image.rebuild"]').count(), 1, "image inspector must have one rebuild submit entry");
      }
      return { id, facts, screenshot: await shot(`type-${type}`, page.locator("#property-panel")) };
    });
  }

  await runCase("typed text and frame wrap remain separate reversible persistent transactions", async () => {
    await openCase("wrap-switch");
    const id = await insertText();
    const textNode = page.locator(`#slide .el.text[data-id="${id}"]`);
    const originalText = selected(await readModel(), id)?.text || "";
    const typedText = `Wrap transaction ${Date.now()}`;
    await textNode.dblclick();
    assert.equal(await textNode.getAttribute("contenteditable"), "true");
    await page.keyboard.press("Meta+A");
    await page.keyboard.type(typedText);
    const textChanged = await captureCommand("setRichText", () => page.locator("#property-title").click());
    assert.equal(selected(textChanged.model, id)?.text, typedText, "the typed text must commit before changing wrap");
    const input = page.locator('#property-panel input[type="checkbox"][role="switch"][aria-label="框内自动换行"]');
    await input.waitFor({ state: "visible" });
    const copy = await input.locator("xpath=ancestor::label[1]").innerText();
    assert.match(copy, /按文本框宽度换行/);
    assert.match(copy, /不自动增高或缩小字号/);
    const before = selected(await readModel(), id)?.wrap !== false;
    assert.equal(await input.isChecked(), before);
    const changed = await captureCommand("setTextStyle", () => input.setChecked(!before), (body) => body.controlId === "element.text.toolbar.wrap.set");
    assert.equal(selected(changed.model, id)?.wrap, !before);
    const undone = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.equal(selected(undone.model, id)?.wrap !== false, before);
    assert.equal(selected(undone.model, id)?.text, typedText, "the first undo after wrap must retain the committed text");
    const textUndone = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.equal(selected(textUndone.model, id)?.text, originalText, "the second undo must reach the preceding text transaction");
    const textRedone = await captureCommand("redo", () => page.locator("#btn-redo").click());
    assert.equal(selected(textRedone.model, id)?.text, typedText, "redo must restore the typed text before restoring wrap");
    const redone = await captureCommand("redo", () => page.locator("#btn-redo").click());
    assert.equal(selected(redone.model, id)?.wrap !== false, !before);
    assert.equal(selected(redone.model, id)?.text, typedText);
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    await selectId(id);
    assert.equal(await page.locator('[aria-label="框内自动换行"]').isChecked(), !before);
    assert.equal(selected(await readModel(), id)?.wrap !== false, !before);
    assert.equal(selected(await readModel(), id)?.text, typedText);
    return {
      id,
      originalText,
      typedText,
      before,
      after: !before,
      commands: [textChanged.body.cmd, changed.body.cmd, undone.body.cmd, textUndone.body.cmd, textRedone.body.cmd, redone.body.cmd],
    };
  });

  await runCase("invalid numeric drafts stay visible and do not mutate the model", async () => {
    await openCase("invalid-numeric-drafts");
    const id = await insertText();
    const position = page.locator('[data-inspector-section="position-arrange"]');
    await position.evaluate((node) => { node.open = true; });
    const initial = selected(await readModel(), id);
    const baselineCommands = report.commandTrace.length;
    const checks = [
      { label: "宽", value: "" },
      { label: "高", value: "-5" },
    ];
    for (const check of checks) {
      const input = position.locator(`input[aria-label="${check.label}"]`);
      await input.fill(check.value);
      await input.press("Tab");
      assert.equal(await input.inputValue(), check.value, `${check.label} invalid draft must not be replaced`);
      assert.equal(await input.getAttribute("aria-invalid"), "true", `${check.label} must expose aria-invalid`);
      const error = input.locator("xpath=ancestor::label[1]").locator('[role="alert"]');
      assert.equal(await error.isVisible(), true, `${check.label} must show inline recovery text`);
    }
    const size = page.locator('#property-panel input[aria-label="字号"]');
    await size.fill("0");
    await size.press("Tab");
    assert.equal(await size.inputValue(), "0", "font size 0 draft must not be replaced");
    assert.equal(await size.getAttribute("aria-invalid"), "true");
    assert.equal(await size.locator("xpath=ancestor::label[1]").locator('[role="alert"]').isVisible(), true, "font size must show inline recovery text");
    await page.waitForTimeout(150);
    assert.equal(report.commandTrace.length, baselineCommands, "invalid numeric drafts must emit no command");
    const after = selected(await readModel(), id);
    assert.deepEqual(after.bounds, initial.bounds);
    assert.equal(after.fontSize, initial.fontSize);
    return { id, bounds: initial.bounds, fontSize: initial.fontSize, commandDelta: 0, retained: checks.concat({ label: "字号", value: "0" }) };
  });

  await runCase("successful numeric mutation keeps details open and focus on the same field", async () => {
    await openCase("details-focus");
    const id = await insertShape();
    const position = page.locator('[data-inspector-section="position-arrange"]');
    await position.evaluate((node) => { node.open = true; });
    const width = position.locator('input[aria-label="宽"]');
    const before = selected(await readModel(), id).bounds[2];
    const after = before + 17;
    await width.focus();
    await width.fill(String(after));
    const changed = await captureCommand("setBounds", () => width.press("Enter"));
    assert.equal(selected(changed.model, id).bounds[2], after);
    assert.equal(await position.evaluate((node) => node.open), true, "position details must remain open after mutation");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "宽", "focus must return to the width field");
    return { id, before, after, sectionOpen: true, focusedField: "宽" };
  });

  await runCase("unknown current font is visible or explicitly named as a fallback", async () => {
    await openCase("unknown-font-state");
    const id = await insertText();
    const unknown = "__OSS_Agent_Legacy_Font__";
    await directCommand({
      cmd: "setTextStyle",
      controlId: "element.text.toolbar.fontfamily.set",
      patch: { fontFamily: unknown },
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    await selectId(id);
    const modelFont = selected(await readModel(), id)?.fontFamily;
    // The model exposes the CSS stack; the saved name is still the bare one.
    assert.match(String(modelFont), new RegExp(unknown));
    // The single 字体 select surfaces the saved face as "（当前字体）" when it
    // is outside the common Office list.
    const selects = page.locator('#property-panel select[data-control="element.text.toolbar.fontfamily.set"]');
    const count = await selects.count();
    assert.equal(count, 1, "text properties offer a single 字体 select");
    const textSection = (await page.locator('[data-inspector-section="text"]').innerText()).replace(/\s+/g, " ");
    const explicitFallback = textSection.includes(unknown) && /（当前字体）/.test(textSection);
    assert.ok(explicitFallback,
      `font controls must name the legacy face ${unknown}; section=${textSection}`);
    return { id, modelFont, explicitFallback };
  });

  await runCase("multi selection uses selection-relative alignment and meaningful distribution", async () => {
    await openCase("multi-selection");
    const ids = [await insertShape(), await insertShape(), await insertShape()];
    await selectId(ids[1]);
    await page.locator('[data-inspector-section="position-arrange"]').evaluate((node) => { node.open = true; });
    const movedX = selected(await readModel(), ids[1]).bounds[0] + 37;
    await captureCommand("setBounds", async () => {
      const x = page.locator("#ctx-bounds-0");
      await x.fill(String(movedX));
      await x.press("Enter");
    });
    await selectId(ids[0]);
    await selectId(ids[1], { shift: true });
    let facts = await inspectorFacts();
    assert.equal(facts.selectionState, "multi");
    assert.equal(facts.title, "2 个对象");
    assert.deepEqual(facts.sections.map((section) => section.key), ["target", "position-arrange", "actions"]);
    assert.equal(await page.locator('[data-align-scope="selection"]').count(), 1);
    assert.equal(await page.getByRole("button", { name: "对象对齐", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /水平分布|垂直分布/ }).count(), 0, "two objects must not expose meaningless distribution");
    const twoObjectUngroup = await assertUngroupUnavailable("ungrouped two-selection");
    await selectId(ids[2], { shift: true });
    facts = await inspectorFacts();
    assert.equal(facts.title, "3 个对象");
    assert.equal(await page.getByRole("button", { name: "水平分布", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "垂直分布", exact: true }).count(), 1);
    const threeObjectUngroup = await assertUngroupUnavailable("ungrouped three-selection");
    const beforeDistribution = (await readModel()).elements.filter((element) => ids.includes(element.id)).map((element) => ({ id: element.id, bounds: element.bounds }));
    const distributed = await captureCommand("distribute", () => page.getByRole("button", { name: "水平分布", exact: true }).click());
    const afterDistribution = distributed.model.elements.filter((element) => ids.includes(element.id)).map((element) => ({ id: element.id, bounds: element.bounds }));
    assert.notDeepEqual(afterDistribution, beforeDistribution, "three-object distribution must mutate object positions");
    const undoneDistribution = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.deepEqual(undoneDistribution.model.elements.filter((element) => ids.includes(element.id)).map((element) => ({ id: element.id, bounds: element.bounds })), beforeDistribution, "undo must restore pre-distribution positions");
    const grouped = await captureCommand("group", () => page.getByRole("button", { name: "编组", exact: true }).click());
    const groupIds = ids.map((id) => selected(grouped.model, id)?.groupId);
    assert.ok(groupIds[0] && groupIds.every((groupId) => groupId === groupIds[0]), "group must assign the exact selected objects to one group");
    assert.equal(await page.getByRole("button", { name: "解组", exact: true }).isDisabled(), false, "grouped selection must enable ungroup");
    const ungrouped = await captureCommand("ungroup", () => page.getByRole("button", { name: "解组", exact: true }).click());
    assert.ok(ids.every((id) => !selected(ungrouped.model, id)?.groupId), "ungroup must clear the group from every selected object");
    return { ids, facts, twoObjectUngroup, threeObjectUngroup, beforeDistribution, afterDistribution, groupId: groupIds[0], screenshot: await shot("multi-selection", page.locator("#property-panel")) };
  });

  await runCase("mixed locked selection blocks every destructive and movement action with a visible reason", async () => {
    await openCase("mixed-locked");
    const first = await insertShape();
    const second = await insertShape();
    await selectId(first);
    await page.locator('[data-inspector-section="position-arrange"]').evaluate((node) => { node.open = true; });
    await captureCommand("setLocked", () => page.getByRole("button", { name: "锁定", exact: true }).click());
    await selectId(second, { shift: true });
    const panel = page.locator("#property-panel");
    await page.locator('[data-inspector-section="position-arrange"]').evaluate((node) => { node.open = true; });
    assert.ok(await panel.getByText(/选区包含锁定对象.*请先解锁/).isVisible());
    for (const [meaning, name] of [
      ["front", /^(置顶|置于顶层)$/],
      ["forward", /^(上移|上移一层)$/],
      ["backward", /^(下移|下移一层)$/],
      ["back", /^(置底|置于底层)$/],
      ["group", "编组"],
      ["delete", /^(删除|删除选区)$/],
    ]) {
      const button = panel.getByRole("button", { name, exact: typeof name === "string" });
      assert.equal(await button.count(), 1, `${meaning} must exist once`);
      assert.equal(await button.isDisabled(), true, `${meaning} must be disabled for mixed locked selection`);
    }
    await assertUngroupUnavailable("mixed locked ungrouped selection");
    const unlock = panel.getByRole("button", { name: "解锁选区", exact: true });
    assert.equal(await unlock.isDisabled(), false);
    const result = await captureCommand("setLocked", () => unlock.click());
    assert.ok([first, second].every((id) => selected(result.model, id)?.locked !== true));
    return { ids: [first, second], warning: true, unlockCommand: result.body.cmd, screenshot: await shot("mixed-locked", panel) };
  });

  await runCase("hidden selection exposes one deterministic reveal action", async () => {
    await openCase("hidden-recovery");
    const first = await insertShape();
    const second = await insertShape();
    await selectId(first);
    await page.locator('[data-inspector-section="position-arrange"]').evaluate((node) => { node.open = true; });
    await captureCommand("setHidden", () => page.getByRole("button", { name: "隐藏", exact: true }).click());
    await selectId(second, { shift: true });
    const reveal = page.getByRole("button", { name: "显示选区", exact: true });
    assert.equal(await reveal.count(), 1);
    const result = await captureCommand("setHidden", () => reveal.click());
    assert.ok([first, second].every((id) => selected(result.model, id)?.hidden !== true));
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    const persisted = await readModel();
    assert.ok([first, second].every((id) => selected(persisted, id)?.hidden !== true));
    return { ids: [first, second], command: result.body.cmd };
  });

  await runCase("image rebuild opens an inline form without invoking window.prompt", async () => {
    await openCase("image-rebuild-inline");
    const id = await insertImage();
    let dialogs = 0;
    const onDialog = async (dialog) => {
      dialogs += 1;
      await dialog.dismiss();
    };
    page.on("dialog", onDialog);
    const before = selected(await readModel(), id);
    await page.locator('#pop-image > button[aria-label="Agent 重建图片"]').click();
    const field = page.locator("#image-rebuild-prompt");
    await field.waitFor({ state: "visible" });
    assert.equal(dialogs, 0, "image rebuild must not invoke a browser prompt");
    await field.fill("保留构图，重建为可编辑的三节点流程图");
    assert.equal(await field.inputValue(), "保留构图，重建为可编辑的三节点流程图");
    const cancel = page.getByRole("button", { name: "取消重建", exact: true });
    assert.equal(await cancel.count(), 1);
    await cancel.click();
    assert.equal(dialogs, 0);
    assert.deepEqual(selected(await readModel(), id), before, "cancelling inline rebuild must not mutate the image model");
    page.off("dialog", onDialog);
    return { id, dialogs, screenshot: await shot("image-inline-rebuild", page.locator("#property-panel")) };
  });

  await runCase("crop escape exits committed mode and one undo restores the prior crop", async () => {
    await openCase("image-crop-escape-undo");
    const id = await insertImage();
    const before = selected(await readModel(), id)?.crop || null;
    await page.locator("#crop-start").click();
    const image = page.locator(`#slide .el.image[data-id="${id}"]`);
    assert.equal(await image.evaluate((node) => node.classList.contains("is-cropping")), true);
    assert.equal((await page.locator("#crop-done").innerText()).trim(), "退出裁切",
      "the mode exit must not imply that prior drag changes were waiting to commit");
    assert.match((await page.locator('[data-inspector-section="image"]').innerText()).replace(/\s+/g, " "), /(已|即时)应用.*撤销|修改.*撤销/,
      "active crop mode must explain that drag changes apply immediately and remain undoable");

    const changed = await captureCommand("setImageCrop", () => dragCropHandle(page, id, "se", -42, -28));
    const applied = selected(changed.model, id)?.crop || null;
    assert.notDeepEqual(applied, before, "crop drag must mutate the selected image crop");
    await page.keyboard.press("Escape");
    assert.equal(await image.evaluate((node) => node.classList.contains("is-cropping")), false, "Escape must exit crop mode");
    assert.deepEqual(selected(await readModel(), id)?.crop || null, applied, "Escape exits; it must not silently roll back the already committed crop");
    await page.waitForFunction(() => /裁切.*(已应用|可撤销)|已应用.*撤销/.test(document.getElementById("app-toast")?.textContent || ""));

    const undone = await captureCommand("undo", () => page.locator("#btn-undo").click());
    assert.deepEqual(selected(undone.model, id)?.crop || null, before, "one undo must restore the exact pre-drag crop");
    const redone = await captureCommand("redo", () => page.locator("#btn-redo").click());
    assert.deepEqual(selected(redone.model, id)?.crop || null, applied, "redo must restore the committed crop");
    await page.reload({ waitUntil: "networkidle" });
    await waitEditorReady(page);
    await selectId(id);
    assert.deepEqual(selected(await readModel(), id)?.crop || null, applied, "the redone crop must persist through reload");
    return { id, before, applied, commands: [changed.body.cmd, undone.body.cmd, redone.body.cmd] };
  });

  await runCase("inspector remains bounded and reachable at all required desktop widths", async () => {
    await openCase("responsive");
    const id = await insertText();
    const evidence = [];
    for (const width of [1100, 1375, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.waitForTimeout(120);
      const panel = page.locator("#property-panel");
      if (await panel.evaluate((node) => node.classList.contains("is-collapsed"))) {
        await page.locator("#property-toggle").click();
      }
      await assertActionWithinPanelBounds();
      const bounds = await page.evaluate(() => {
        const root = document.documentElement;
        const panel = document.getElementById("property-panel").getBoundingClientRect();
        const selected = document.querySelector("#slide .el.selected").getBoundingClientRect();
        const actions = document.querySelector('[data-inspector-section="actions"]').getBoundingClientRect();
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
          selected: { left: selected.left, right: selected.right, top: selected.top, bottom: selected.bottom },
          actions: { left: actions.left, right: actions.right, top: actions.top, bottom: actions.bottom },
        };
      });
      assert.ok(bounds.scrollWidth <= bounds.clientWidth, `${width}px must not create horizontal document scrolling`);
      assert.ok(bounds.panel.left >= 0 && bounds.panel.right <= width, `${width}px property panel must remain in viewport`);
      assert.ok(bounds.selected.right > 0 && bounds.selected.left < width, `${width}px selected canvas object must remain visible`);
      await page.locator("#ctx-bar").evaluate((node) => { node.scrollTop = node.scrollHeight; });
      assert.ok(await page.locator('[data-inspector-section="actions"]').isVisible(), `${width}px common actions must be reachable`);
      evidence.push({ width, bounds, screenshot: await shot(`responsive-${width}`) });
    }
    assert.equal(selected(await readModel(), id)?.type, "text");
    return evidence;
  });

  const unexpectedErrors = report.browserErrors.filter((message) => !/favicon/i.test(message));
  assert.deepEqual(unexpectedErrors, [], `browser emitted errors: ${unexpectedErrors.join(" | ")}`);
} finally {
  report.finishedAt = new Date().toISOString();
  report.ok = report.cases.length > 0 && report.cases.every((item) => item.ok);
  report.summary = {
    total: report.cases.length,
    passed: report.cases.filter((item) => item.ok).length,
    failed: report.cases.filter((item) => !item.ok).length,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  server.kill("SIGKILL");
  if (!KEEP) fs.rmSync(SCRATCH, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, report: path.join(OUT, "report.json") }));
  if (!report.ok) process.exitCode = 1;
}
