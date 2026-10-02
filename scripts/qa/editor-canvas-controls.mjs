#!/usr/bin/env node
/**
 * Exhaustive editor canvas control acceptance.
 *
 * Owns a random localhost port and a disposable copy of the canonical fixture.
 * It never talks to the product ports and never writes the source fixture.
 * Every recorded row proves a DOM identity or a real /api/command response; the
 * checkpoints additionally prove undo, redo, and reload persistence.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";
import { insertViaCommand } from "./gestures.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SCRATCH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "oss-canvas-controls-"));
const PROJECT = path.join(SCRATCH_ROOT, "project");
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-canvas-controls"));
const KEEP = process.env.KEEP_QA_PROJECT === "1";
fs.cpSync(SOURCE, PROJECT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const ledger = {
  schemaVersion: "open-slidestudio.editor-canvas-controls.v1",
  startedAt: new Date().toISOString(),
  transport: "owned localhost native-web server",
  fixture: path.relative(ROOT, SOURCE),
  rows: [],
  browserErrors: [],
  limitations: [],
};

function row(id, state, assertion, evidence = {}) {
  ledger.rows.push({ id, state, assertion, status: "pass", ...evidence });
}

function safeBody(body) {
  const copy = structuredClone(body || {});
  if (typeof copy.src === "string") copy.src = `<image:${copy.src.length} chars>`;
  return copy;
}

async function randomPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  assert.ok(port > 0, "random local port must be allocated");
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
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`native-web did not start on owned port ${PORT}\n${serverLog.slice(-2000)}`);
}

const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") ledger.browserErrors.push(message.text());
});
page.on("pageerror", (error) => ledger.browserErrors.push(String(error)));

const readModel = () => page.evaluate(async () => {
  const response = await fetch("/api/model");
  if (!response.ok) throw new Error(`model ${response.status}`);
  const data = await response.json();
  return data.model ?? data;
});

function selected(model, id) {
  return model.elements.find((element) => element.id === id);
}

function diskElement(id) {
  for (const name of fs.readdirSync(path.join(PROJECT, "pages"))) {
    if (!name.endsWith(".page")) continue;
    const pageBody = YAML.parse(fs.readFileSync(path.join(PROJECT, "pages", name), "utf8"));
    const element = pageBody?.elements?.find((candidate) => candidate?.elementId === id);
    if (element) return element;
  }
  return null;
}

async function waitSelectedType(type) {
  const locator = page.locator(`#slide .el.${type}.selected`).first();
  await locator.waitFor({ state: "visible" });
  const id = await locator.getAttribute("data-id");
  assert.ok(id, `${type} selection must have a stable id`);
  return id;
}

async function selectId(id, modifiers = []) {
  const before = await readModel();
  const multi = modifiers.includes("Shift");
  const selectedBefore = before.selection?.kind === "element"
    ? [before.selection.elementId]
    : before.selection?.kind === "multi"
      ? before.selection.elementIds || []
      : [];
  const needsSelectCommand = multi
    ? !selectedBefore.includes(id)
    : selectedBefore.length !== 1 || selectedBefore[0] !== id;
  const element = page.locator(`#slide .el[data-id="${id}"]`);
  const click = async () => {
    // Inserted scratch objects intentionally overlap. Dispatch to the exact
    // rendered node so hit-testing cannot select whichever object is on top;
    // the production click handler and command/render path still run intact.
    if (await element.evaluate((node) => node.classList.contains("table"))) {
      await element.locator("td").first().dispatchEvent("click", { shiftKey: multi });
    } else {
      await element.dispatchEvent("click", { shiftKey: multi });
    }
  };
  if (needsSelectCommand) {
    const result = await captureCommand("select", click, (body) =>
      multi ? body.elementIds?.includes(id) : body.elementId === id);
    const selection = result.model.selection;
    assert.ok(
      multi
        ? selection?.kind === "multi" && selection.elementIds?.includes(id)
        : selection?.kind === "element" && selection.elementId === id,
      `select response must include ${id}; request=${JSON.stringify(safeBody(result.body))}; responseSelection=${JSON.stringify(selection)}`,
    );
  } else {
    await click();
  }
  await page.waitForFunction(({ targetId }) =>
    [...document.querySelectorAll("#slide .el.selected")]
      .some((node) => node.getAttribute("data-id") === targetId), { targetId: id });
  if (!multi) {
    const type = selected(await readModel(), id)?.type;
    await waitPropertyIdentity(type, id);
  }
}

async function waitPropertyIdentity(type, id) {
  // The coherent inspector moved the text controls out of the retired #pop-type
  // popover into the property panel; per-type identity markers are scope-qualified
  // here so each type is checked where its controls actually live.
  const semanticSelector = {
    text: "#property-panel .property-text-styles",
    shape: "#ctx-bar #pop-adj",
    image: "#ctx-bar #pop-crop",
    table: "#ctx-bar #pop-table",
    chart: '#ctx-bar [data-control="element.chart.data.set"]',
    icon: "#ctx-bar #pop-icon",
    line: "#ctx-bar #pop-line",
  }[type];
  assert.ok(semanticSelector, `selection ${id} must have a known property-panel identity`);
  await page.locator(semanticSelector).waitFor({ state: "visible", timeout: 2_000 });
}

async function pointerSelectId(id) {
  const model = await readModel();
  const type = selected(model, id)?.type;
  const element = page.locator(`#slide .el[data-id="${id}"]`);
  const target = type === "table" ? element.locator("td").first() : element;
  const result = await captureCommand("select", () => target.click(), (body) => body.elementId === id);
  assert.equal(result.model.selection?.elementId, id, `pointer select must return ${id}`);
  await page.waitForFunction(({ targetId }) =>
    [...document.querySelectorAll("#slide .el.selected")]
      .some((node) => node.getAttribute("data-id") === targetId), { targetId: id });
  await waitPropertyIdentity(type, id);
}

async function arrangeFixtureBounds(id, bounds) {
  await selectId(id);
  for (let index = 0; index < bounds.length; index += 1) {
    // X/Y/宽/高 live in the property panel's 位置与排列 section now.
    const boundsInput = page.locator('#property-panel input[data-control="element.bounds.set"]').nth(index);
    await boundsInput.waitFor({ state: "visible", timeout: 4000 });
    const result = await captureCommand("setBounds", () => changeInput(boundsInput, bounds[index]));
    assert.equal(selected(result.model, id)?.bounds?.[index], bounds[index]);
  }
}

/** Click a property-panel control by its data-control (optional exact label). */
async function clickPanelByControl(control, label) {
  let target = page.locator(`#property-panel [data-control="${control}"]`);
  if (label) target = target.filter({ hasText: new RegExp(`^${label}$`) });
  const first = target.first();
  await first.waitFor({ state: "visible", timeout: 4000 });
  await first.click();
}

/** The coherent inspector keeps text controls in the property panel, always visible. */
async function expectPanelControl(control) {
  const target = page.locator(`#property-panel [data-control="${control}"]`).first();
  if (!(await target.isVisible().catch(() => false))) {
    // The coherent inspector collapses some sections (外观 …); open the one that
    // owns this control the way a user would, by clicking its summary.
    const section = page.locator('#property-panel details[data-inspector-section]')
      .filter({ has: page.locator(`[data-control="${control}"]`) })
      .first();
    if (await section.count()) {
      if (!(await section.evaluate((node) => node.open))) {
        await section.locator("summary").first().click();
      }
    }
  }
  await target.waitFor({ state: "visible", timeout: 4000 });
}

/** Click a labelled button inside the property panel (the retired popovers' replacement). */
async function clickPanelControl(label) {
  const button = page.locator("#property-panel").getByRole("button", { name: label, exact: true }).first();
  await button.waitFor({ state: "visible", timeout: 4000 });
  await button.click();
}

/** Open (or re-open) the 高级排版 popover; a repaint replaces it, so always click. */
async function openAdvancedTypography() {
  const wrap = page.locator("#pop-type-advanced");
  await wrap.waitFor({ state: "visible", timeout: 4000 });
  if (!(await wrap.evaluate((node) => node.classList.contains("open")))) {
    await wrap.locator(":scope > button").click();
  }
  await page.locator('#pop-type-advanced-panel input, #pop-type-advanced-panel select').first()
    .waitFor({ state: "attached", timeout: 4000 });
}

async function captureCommand(expected, action, matches = () => true) {
  const requestPromise = page.waitForRequest((request) => {
    if (!isApiCommandUrl(request.url()) || request.method() !== "POST") return false;
    try {
      const body = JSON.parse(request.postData() || "{}");
      return body.cmd === expected && matches(body);
    } catch {
      return false;
    }
  }).catch((error) => error);
  await action();
  const request = await requestPromise;
  if (request instanceof Error) throw request;
  const body = JSON.parse(request.postData() || "{}");
  assert.equal(body.cmd, expected, `control must emit ${expected}, got ${body.cmd}`);
  const response = await request.response();
  assert.ok(response, `${expected} must receive a response`);
  assert.equal(response.status(), 200, `${expected} must return HTTP 200`);
  const data = await response.json();
  assert.ok(data.model, `${expected} must return the resulting model`);
  return { body, model: data.model };
}

async function mutate({ id, state, command, action, verify, assertion }) {
  console.log(`RUN   ${id}`);
  const result = await captureCommand(command, action);
  await verify(result.model, result.body);
  row(id, state, assertion, { command, request: safeBody(result.body) });
  return result.model;
}

async function openPop(id, label, control) {
  const wrap = page.locator(`#${id}`);
  // A collapsed 属性 section renders its controls with zero size, so open the
  // section that owns this popover before asserting its identity.
  if (!(await wrap.isVisible().catch(() => false))) {
    const section = page.locator('#property-panel details[data-inspector-section]')
      .filter({ has: page.locator(`#${id}`) })
      .first();
    if (await section.count()) {
      if (!(await section.evaluate((node) => node.open))) {
        await section.locator("summary").first().click();
      }
    }
  }
  await wrap.waitFor({ state: "visible", timeout: 8000 });
  assert.equal(await wrap.count(), 1, `${id} must be unique`);
  const trigger = wrap.locator(":scope > button");
  assert.equal(await trigger.getAttribute("data-control"), control, `${id} control identity`);
  assert.equal(await trigger.getAttribute("data-tip"), label, `${id} tooltip identity`);
  assert.equal((await trigger.locator(".ctx-visible-label").innerText()).trim(), label, `${id} visible label`);
  if (!(await wrap.evaluate((node) => node.classList.contains("open")))) await trigger.click();
  await page.waitForFunction((popId) => document.getElementById(popId)?.classList.contains("open"), id);
  row(`identity.${id}`, "property-panel", `${label} has a unique trigger, control id, tooltip, visible label and open panel`);
  return wrap;
}

async function clickMenu(popId, label) {
  const buttons = page.locator(`#${popId} .ctx-pop .ctx-btn`);
  const texts = (await buttons.allTextContents()).map((text) => text.trim());
  const matches = texts.flatMap((text, index) => text === label ? [index] : []);
  assert.equal(matches.length, 1, `${popId} must contain exactly one ${label} action; got ${texts.join("/")}`);
  const button = buttons.nth(matches[0]);
  await button.waitFor({ state: "visible" });
  await button.click();
}

async function changeInput(locator, value) {
  await locator.evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function clickProperty(label) {
  // A prior submenu may intentionally remain open across model refreshes.
  // Close it before addressing a sibling trigger so the floating panel cannot
  // consume the pointer event meant for the property button.
  if (await page.locator("#ctx-bar .ctx-popwrap.open").count()) await page.keyboard.press("Escape");
  // Per-type controls are split between the ctx-bar popovers and the property
  // panel; the panel wraps the ctx-bar, so one scope covers both. Match the
  // visible text first, then an aria-label that starts with the same label
  // (e.g. 项目符号 → 项目符号列表).
  const scope = page.locator("#property-panel");
  for (const candidate of [
    scope.locator("button").filter({ hasText: new RegExp(`^${label}$`) }),
    scope.locator(`button[aria-label^="${label}"]`),
  ]) {
    const first = candidate.first();
    if (!(await first.count())) continue;
    await first.waitFor({ state: "visible", timeout: 4000 });
    assert.equal(await first.isDisabled(), false, `${label} property action must be enabled`);
    await first.click();
    return;
  }
  throw new Error(`clickProperty: no visible control for ${label}`);
}

async function reloadAndFind(id) {
  const pageIndex = (await readModel()).pageIndex;
  const url = new URL(page.url());
  url.searchParams.set("page", String(pageIndex));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  const model = await readModel();
  const element = selected(model, id);
  assert.ok(element, `element ${id} must survive reload`);
  return element;
}

async function checkpoint({ id, state, elementId, before, after, getter }) {
  const undo = await captureCommand("undo", () => page.locator("#btn-undo").click());
  assert.deepEqual(getter(selected(undo.model, elementId)), before, `${state} undo must restore the prior value`);
  const redo = await captureCommand("redo", () => page.locator("#btn-redo").click());
  assert.deepEqual(getter(selected(redo.model, elementId)), after, `${state} redo must restore the mutation`);
  const persisted = await reloadAndFind(elementId);
  assert.deepEqual(getter(persisted), after, `${state} mutation must persist after reload`);
  row(id, state, "undo restores before, redo restores after, and reload preserves after", { before, after });
}

async function insertSimple(kind) {
  const button = page.locator(`#insert-toolbar [data-insert="${kind}"]`);
  if (!(await button.count())) {
    // chart / icon / smartart have no manual entry by design: seed the element
    // through the command path and select it on the canvas.
    const seeded = await insertViaCommand(page, kind);
    const id = (seeded.model?.elements || []).find((element) => element.type === kind)?.id;
    assert.ok(id, `command-seeded ${kind} must exist in the returned model`);
    // Pick the seeded element: click just inside its own box (its centre may be
    // covered by a sibling), then fall back to the real Tab cycle.
    const seededNode = page.locator(`#slide .el[data-id="${id}"]`).first();
    const seededBox = await seededNode.boundingBox().catch(() => null);
    if (seededBox) await page.mouse.click(seededBox.x + 6, seededBox.y + 6);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = await page.locator("#slide .el.selected").first()
        .getAttribute("data-id").catch(() => null);
      if (current === id) return id;
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
    }
    const state = await page.evaluate(async () => {
      const res = await fetch("/api/model");
      const model = (await res.json()).model;
      return {
        pageIndex: model?.pageIndex,
        selection: model?.selection,
        domIds: [...document.querySelectorAll("#slide .el")].map((node) => node.dataset.id),
      };
    });
    assert.fail(`could not select the seeded ${kind} ${id}: ${JSON.stringify(state)}`);
  }
  const result = await mutate({
    id: `insert.${kind}`,
    state: "no-selection",
    command: "insert",
    action: () => page.locator(`#insert-toolbar [data-insert="${kind}"]`).click(),
    verify: async (model, body) => {
      assert.equal(body.kind, kind);
      assert.ok(model.elements.some((element) => element.type === kind));
    },
    assertion: `primary ${kind} button inserts a real editable ${kind}`,
  });
  return result.selection?.elementId || await waitSelectedType(kind);
}

async function assertMainState(type, required, forbidden = []) {
  const title = (await page.locator("#property-title").innerText()).trim();
  assert.ok(title.length > 0, `${type} must name the property panel`);
  // The coherent inspector splits per-type controls between the ctx-bar popovers
  // and the property panel, so the visible label set is the union of both.
  const labels = [
    ...(await page.locator("#ctx-bar .ctx-visible-label").allTextContents()),
    ...(await page.locator("#property-panel .property-control-label").allTextContents()),
    ...(await page.locator("#property-panel .property-direct-field > span").allTextContents()),
  ].map((text) => text.trim());
  for (const label of required) assert.ok(labels.includes(label), `${type} must expose ${label}: ${labels.join("/")}`);
  for (const label of forbidden) assert.ok(!labels.includes(label), `${type} must not expose ${label}: ${labels.join("/")}`);
  row(`state.${type}`, type, "property panel exposes the required main controls and omits forbidden controls", { title, labels });
}

async function textFlow() {
  const id = await insertSimple("text");
  await page.keyboard.press("Escape");
  await selectId(id);
  await assertMainState("text",
    ["字体", "字号", "行距", "字距", "高亮色", "文字颜色", "文本对齐", "对象对齐", "列表", "图层"],
    ["批注"]);

  await expectPanelControl("element.text.toolbar.fontfamily.set");
  for (const [label, selector, value, key, expected, control] of [
    ["字号", '#property-panel [data-control="element.text.toolbar.fontsize.set"]', 31, "fontSize", 31, "element.text.toolbar.fontsize.set"],
    ["行距", '#pop-type-advanced-panel [data-control="element.text.toolbar.lineheight.set"]', 1.5, "lineHeight", 1.5, "element.text.toolbar.lineheight.set"],
    ["字距", '#pop-type-advanced-panel [data-control="element.text.toolbar.letterspacing.set"]', 2, "letterSpacing", 2, "element.text.toolbar.letterspacing.set"],
    ["高亮", '#pop-type-advanced-panel input[type="color"][data-control="element.text.toolbar.highlight.set"]', "#fff59d", "backgroundColor", "#fff59d", "element.text.toolbar.highlight.set"],
  ]) {
    // 行距 / 字距 / 高亮 live in the 高级排版 popover; 字号 / 字体 are panel fields.
    if (control.startsWith("element.text.toolbar.lineheight") || control.endsWith("letterspacing.set") || control.endsWith("highlight.set")) {
      await openAdvancedTypography();
    } else {
      await expectPanelControl("element.text.toolbar.fontfamily.set");
    }
    await mutate({
      id: control,
      state: "text",
      command: "setTextStyle",
      action: () => changeInput(page.locator(selector), value),
      verify: async (model) => assert.equal(String(selected(model, id)?.[key]).toLowerCase(), String(expected).toLowerCase()),
      assertion: `${label} updates the returned text model`,
    });
  }
  await expectPanelControl("element.text.toolbar.fontfamily.set");
  // One 字体 select; each option is an ea+latin pair, stored separately.
  const fontSelector = '#property-panel select[data-control="element.text.toolbar.fontfamily.set"]';
  assert.equal(await page.locator(fontSelector).count(), 1, "text properties offer a single 字体 select");
  const pairOptions = await page.locator(`${fontSelector} option`).evaluateAll((options) =>
    options.map((option) => option.value));
  assert.deepEqual(pairOptions, ["微软雅黑|Arial", "黑体|Arial", "宋体|Times New Roman", "楷体|Times New Roman", "仿宋|Times New Roman"],
    "字体 lists the 5 common ea faces, each with its latin partner");
  for (const pair of pairOptions) {
    const [ea, latin] = pair.split("|");
    await expectPanelControl("element.text.toolbar.fontfamily.set");
    await mutate({
      id: `element.text.toolbar.fontfamily.set.${ea}`,
      state: "text",
      command: "setTextStyle",
      action: () => changeInput(page.locator(fontSelector), pair),
      verify: async (model) => {
        const el = selected(model, id);
        assert.equal(el?.fontEastAsian, ea);
        assert.equal(el?.fontLatin, latin);
      },
      assertion: `font pair ${ea} + ${latin} persists in the returned model`,
    });
  }
  for (const lineHeight of [1, 1.2, 1.5, 1.8, 2]) {
    await openPop("pop-type-advanced", "高级排版", "element.text.toolbar.lineheight.set");
    await mutate({
      id: `element.text.toolbar.lineheight.set.${lineHeight}`,
      state: "text",
      command: "setTextStyle",
      action: () => changeInput(page.locator('#pop-type-advanced-panel [data-control="element.text.toolbar.lineheight.set"]'), lineHeight),
      verify: async (model) => assert.equal(selected(model, id)?.lineHeight, lineHeight),
      assertion: `line-height preset ${lineHeight} is selectable and persists in the returned model`,
    });
  }
  for (const [label, key, control, command] of [["B", "bold", "element.text.toolbar.bold.toggle", "setBold"], ["I", "italic", "element.text.toolbar.italic.toggle", "setTextStyle"], ["U", "underline", "element.text.toolbar.underline.toggle", "setTextStyle"]]) {
    await expectPanelControl(control);
    await mutate({
      id: control,
      state: "text",
      command,
      action: () => page.locator(`#property-panel [data-control="${control}"]`).first().click(),
      verify: async (model) => assert.equal(selected(model, id)?.[key], true),
      assertion: `${label} sets ${key} in the returned text model`,
    });
  }
  await mutate({
    id: "element.text.toolbar.color.set",
    state: "text",
    command: "setTextStyle",
    action: () => changeInput(page.locator('#property-panel input[data-control="element.text.toolbar.color.set"]'), "#123456"),
    verify: async (model) => assert.equal(selected(model, id)?.color?.toLowerCase(), "#123456"),
    assertion: "text color writes the selected color",
  });
  const textAlignments = [
    ["左", "left", null], ["中", "center", null], ["右", "right", null], ["两端", "justify", null],
    ["顶部", null, "top"], ["居中", null, "middle"], ["底部", null, "bottom"],
  ];
  for (const [label, horizontal, vertical] of textAlignments) {
    // 文本对齐 is a panel segment block (#pop-align-t) now, not a ctx-bar popover.
    await page.locator("#pop-align-t").waitFor({ state: "visible", timeout: 4000 });
    await mutate({
      id: `element.text.toolbar.align.set.${horizontal || vertical}`,
      state: "text",
      command: "setTextStyle",
      action: () => page.locator("#pop-align-t button").filter({ hasText: new RegExp(`^${label}$`) }).first().click(),
      verify: async (model) => {
        const align = selected(model, id)?.align || [];
        if (horizontal) assert.equal(align[0], horizontal);
        if (vertical) assert.equal(align[1], vertical);
      },
      assertion: `${label} updates the corresponding text alignment axis`,
    });
  }
  for (const [label, expected] of [["项目符号", "bullet"], ["编号", "number"]]) {
    await mutate({
      id: `element.text.toolbar.list.set.${expected}`,
      state: "text",
      command: "setTextStyle",
      action: () => clickProperty(label),
      verify: async (model) => assert.equal(selected(model, id)?.list, expected),
      assertion: `${label} writes list=${expected}`,
    });
  }
  await mutate({
    id: "element.text.toolbar.link.set",
    state: "text",
    command: "setTextStyle",
    // Links use the in-app dialog now (#text-link-dialog), not window.prompt.
    action: async () => {
      await clickPanelByControl("element.text.toolbar.link.set");
      await page.locator("#text-link-dialog").waitFor({ state: "visible", timeout: 4000 });
      await page.locator("#text-link-input").fill("https://example.test/canvas");
      await page.locator("#text-link-save").click();
    },
    verify: async (model) => assert.equal(selected(model, id)?.href, "https://example.test/canvas"),
    assertion: "link dialog writes the returned href",
  });
  const beforeWrap = selected(await readModel(), id)?.wrap !== false;
  const wrapModel = await mutate({
    id: "element.text.toolbar.wrap.set",
    state: "text",
    command: "setTextStyle",
    action: () => clickPanelByControl("element.text.toolbar.wrap.set"),
    verify: async (model) => assert.equal(selected(model, id)?.wrap, !beforeWrap),
    assertion: "wrap toggle changes the returned model",
  });
  await checkpoint({ id: "checkpoint.text", state: "text", elementId: id, before: beforeWrap, after: selected(wrapModel, id)?.wrap, getter: (element) => element?.wrap !== false });
  return id;
}

async function shapeFlow() {
  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  const inserted = await mutate({
    id: "insert.shape",
    state: "no-selection",
    command: "insert",
    action: () => page.locator("#shape-grid .shape-cell").first().click(),
    verify: async (model, body) => {
      assert.equal(body.kind, "shape");
      assert.equal(selected(model, model.selection?.elementId)?.shapeName, body.shapeName);
    },
    assertion: "shape palette tile inserts the exact shapeName returned by the command",
  });
  const id = inserted.selection?.elementId || await waitSelectedType("shape");
  await assertMainState("shape", ["调整 / 形状", "填充", "描边", "对象对齐", "图层", "对象状态"], ["批注"]);
  await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
  await mutate({
    id: "element.shape.kind.set",
    state: "shape",
    command: "setShape",
    action: () => changeInput(page.locator('#pop-adj select[data-control="element.shape.kind.set"]'), "roundRect"),
    verify: async (model) => assert.equal(selected(model, id)?.shapeName, "roundRect"),
    assertion: "shape selector writes roundRect",
  });
  await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
  const adjustment = page.locator('#pop-adj input[data-control="element.shape.adjust.set"]').first();
  if (await adjustment.count()) {
    await mutate({
      id: "element.shape.adjust.set",
      state: "shape",
      command: "setAdjustments",
      action: () => changeInput(adjustment, 24000),
      verify: async (model) => assert.equal(selected(model, id)?.adjustments?.[0], 24000),
      assertion: "shape adjustment writes a real adjustment value",
    });
  }
  const shapeCatalog = await page.evaluate(async () => (await fetch("/api/catalog/shapes")).json().then((data) => data.shapes || []));
  assert.equal(shapeCatalog.length, 177, "shape selector must use the complete 177-item catalog");
  await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
  assert.deepEqual(
    await page.locator('#pop-adj select[data-control="element.shape.kind.set"] option').evaluateAll((options) => options.map((option) => option.value)),
    shapeCatalog.map((item) => item.name),
    "shape selector order must match the shared catalog",
  );
  let inspectedHandles = 0;
  let mutatedHandles = 0;
  for (let index = 0; index < shapeCatalog.length; index += 1) {
    const item = shapeCatalog[index];
    await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
    await mutate({
      id: `element.shape.kind.set.catalog.${index}`,
      state: "shape",
      command: "setShape",
      action: () => changeInput(page.locator('#pop-adj select[data-control="element.shape.kind.set"]'), item.name),
      verify: async (model) => assert.equal(selected(model, id)?.shapeName, item.name),
      assertion: `shape selector accepts shared catalog id ${item.name}`,
    });
    await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
    const handleCount = await page.locator('#pop-adj input[data-control="element.shape.adjust.set"]').count();
    assert.equal(handleCount, item.defaults?.length || 0, `${item.name} handle count must match catalog defaults`);
    for (let handleIndex = 0; handleIndex < handleCount; handleIndex += 1) {
      await openPop("pop-adj", "调整 / 形状", "element.shape.adjust.set");
      const handle = page.locator('#pop-adj input[data-control="element.shape.adjust.set"]').nth(handleIndex);
      const [min, max, value] = await Promise.all([
        handle.getAttribute("min").then(Number),
        handle.getAttribute("max").then(Number),
        handle.inputValue().then(Number),
      ]);
      assert.ok(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(value), `${item.name} adjustment ${handleIndex} must be finite`);
      assert.ok(max >= min && value >= min && value <= max, `${item.name} adjustment ${handleIndex} must fit its range`);
      assert.equal(await handle.getAttribute("aria-label"), `形状调整 ${handleIndex + 1}`);
      assert.ok(max > min, `${item.name} adjustment ${handleIndex} must expose a mutable range`);
      const next = value === min ? max : min;
      await mutate({
        id: `element.shape.adjust.set.catalog.${index}.${handleIndex}`,
        state: "shape",
        command: "setAdjustments",
        action: () => changeInput(handle, next),
        verify: async (model, body) => {
          assert.equal(body.adjustments?.[handleIndex], next, `${item.name} adjustment ${handleIndex} request must preserve the chosen value`);
          assert.equal(selected(model, id)?.adjustments?.[handleIndex], next, `${item.name} adjustment ${handleIndex} response must persist the chosen value`);
          assert.equal(diskElement(id)?.adjustments?.[handleIndex], next, `${item.name} adjustment ${handleIndex} must persist to the scratch .page file`);
        },
        assertion: `${item.name} adjustment ${handleIndex + 1} changes through its own bound range and persists in both the returned model and scratch .page file`,
      });
      inspectedHandles += 1;
      mutatedHandles += 1;
    }
  }
  row("element.shape.adjust.catalog", "shape", "all catalog shapes expose the declared number of finite, ranged and labelled adjustment handles, and every handle is changed once and verified on disk", { shapeCount: shapeCatalog.length, inspectedHandles, mutatedHandles, diskVerifiedHandles: mutatedHandles });

  await openPop("pop-fill", "填充", "element.shape.fill.set");
  const swatchCount = await page.locator("#pop-fill .ctx-swatches .ctx-swatch").count();
  assert.ok(swatchCount > 0, "shape fill must expose theme swatches");
  for (let index = 0; index < swatchCount; index += 1) {
    await openPop("pop-fill", "填充", "element.shape.fill.set");
    const swatch = page.locator("#pop-fill .ctx-swatches .ctx-swatch").nth(index);
    const color = await swatch.getAttribute("data-tip") || await swatch.getAttribute("title");
    assert.match(color || "", /^#[0-9a-f]{6}$/i);
    await mutate({
      id: `element.shape.fill.set.theme.${index}`,
      state: "shape",
      command: "setFill",
      action: () => swatch.click(),
      verify: async (model, body) => {
        assert.equal(body.color.toLowerCase(), color.toLowerCase());
        assert.match(JSON.stringify(selected(model, id)), new RegExp(color.slice(1), "i"));
      },
      assertion: `theme swatch ${color} writes its exact shape fill`,
    });
  }
  await openPop("pop-fill", "填充", "element.shape.fill.set");
  await mutate({
    id: "element.shape.fill.set.solid",
    state: "shape",
    command: "setFill",
    action: () => changeInput(page.locator("#ctx-fill-color"), "#2468ac"),
    verify: async (model) => assert.match(JSON.stringify(selected(model, id)), /2468ac/i),
    assertion: "solid fill persists in the returned shape",
  });
  for (const [label, selector, color, stopIndex] of [
    ["渐变起", '#pop-fill input[aria-label="形状渐变起始色"]', "#102030", 0],
    ["渐变止", '#pop-fill input[aria-label="形状渐变结束色"]', "#d0e0f0", 1],
  ]) {
    await openPop("pop-fill", "填充", "element.shape.fill.set");
    await mutate({
      id: `element.shape.fill.set.${stopIndex === 0 ? "gradient-start" : "gradient-end"}`,
      state: "shape",
      command: "setFill",
      action: () => changeInput(page.locator(selector), color),
      verify: async (model, body) => {
        assert.equal(body.fill?.type, "gradient");
        assert.equal(body.fill?.stops?.[stopIndex]?.color.toLowerCase(), color);
        assert.match(JSON.stringify(selected(model, id)), new RegExp(color.slice(1), "i"));
      },
      assertion: `${label} change independently submits and persists its gradient stop`,
    });
  }
  await openPop("pop-fill", "填充", "element.shape.fill.set");
  const gradientInputs = page.locator('#pop-fill input[type="color"]');
  await gradientInputs.nth(1).evaluate((input) => { input.value = "#111111"; });
  await gradientInputs.nth(2).evaluate((input) => { input.value = "#abcdef"; });
  await mutate({
    id: "element.shape.fill.set.gradient",
    state: "shape",
    command: "setFill",
    action: () => clickMenu("pop-fill", "渐变"),
    verify: async (model) => assert.match(JSON.stringify(selected(model, id)), /gradient/i),
    assertion: "gradient action writes a gradient fill object",
  });
  await openPop("pop-border", "No border", "element.shape.border.set").catch(() => openPop("pop-border", "描边", "element.shape.border.set"));
  await mutate({
    id: "element.shape.border.set.width",
    state: "shape",
    command: "setBorder",
    action: () => changeInput(page.locator('#pop-border input[type="number"]'), 3),
    verify: async (model) => assert.equal(selected(model, id)?.border?.width, 3),
    assertion: "border width writes width=3",
  });
  await openPop("pop-border", "描边", "element.shape.border.set");
  await mutate({
    id: "element.shape.border.set.none",
    state: "shape",
    command: "setBorder",
    action: () => clickMenu("pop-border", "无边框"),
    verify: async (model) => assert.equal(selected(model, id)?.border?.width, 0),
    assertion: "no-border writes width=0",
  });
  const opacityBefore = selected(await readModel(), id)?.opacity ?? 1;
  await expectPanelControl("element.opacity.set");
  const opacityModel = await mutate({
    id: "element.opacity.set",
    state: "shape",
    command: "setOpacity",
    action: () => changeInput(page.locator('#property-panel input[data-control="element.opacity.set"]'), 73),
    verify: async (model) => assert.equal(selected(model, id)?.opacity, 0.73),
    assertion: "opacity range writes 0.73",
  });
  await checkpoint({ id: "checkpoint.shape", state: "shape", elementId: id, before: opacityBefore, after: selected(opacityModel, id)?.opacity, getter: (element) => element?.opacity ?? 1 });
  return id;
}

async function iconAndLineFlow() {
  // Icon insertion has no editor affordance by design (the palette tab was
  // retired), so seed one through the command path and select it.
  const seededIcon = await insertViaCommand(page, "icon");
  const iconId = (seededIcon.model?.elements || []).find((element) => element.type === "icon")?.id;
  assert.ok(iconId, "command-seeded icon must exist in the returned model");
  await page.locator(`#slide .el[data-id="${iconId}"]`).first().click({ force: true });
  await waitSelectedType("icon");
  await assertMainState("icon", ["图标", "对象对齐", "图层", "对象状态"], ["批注"]);
  await openPop("pop-icon", "图标", "element.icon.name.set");
  const iconOptions = page.locator('#pop-icon select[data-control="element.icon.name.set"] option');
  assert.ok(await iconOptions.count() >= 2, "icon menu must expose alternative names");
  const alternative = await iconOptions.nth(1).getAttribute("value");
  await mutate({
    id: "element.icon.name.set",
    state: "icon",
    command: "setIconName",
    action: () => changeInput(page.locator('#pop-icon select[data-control="element.icon.name.set"]'), alternative),
    verify: async (model) => assert.equal(selected(model, iconId)?.iconName, alternative),
    assertion: "icon name selector writes the selected icon name",
  });
  await openPop("pop-icon", "图标", "element.icon.name.set");
  await mutate({
    id: "element.icon.color.set",
    state: "icon",
    command: "setFill",
    action: () => changeInput(page.locator('#pop-icon input[data-control="element.icon.color.set"]'), "#7654ba"),
    verify: async (model) => assert.match(JSON.stringify(selected(model, iconId)), /7654ba/i),
    assertion: "icon color writes the selected fill",
  });

  await page.locator('#insert-toolbar [data-insert="shape"]').click();
  await page.locator('#lib-tabs [data-lib="line"]').click();
  const lineInsert = await captureCommand("insert", () => page.locator("#line-presets button").filter({ hasText: /^直线$/ }).click());
  const lineId = lineInsert.model.selection?.elementId || await waitSelectedType("line");
  await assertMainState("line", ["对象对齐", "图层", "对象状态"], ["批注"]);
  await openPop("pop-line", "线条", "element.line.arrow.set");
  await mutate({
    id: "element.line.label.set",
    state: "line",
    command: "setLineLabel",
    action: () => changeInput(page.locator('#pop-line input[data-control="element.line.label.set"]'), "连接说明"),
    verify: async (model) => assert.equal(selected(model, lineId)?.lineLabel, "连接说明"),
    assertion: "line label writes the entered text",
  });
  for (const [style, label] of [["solid", "实线"], ["dash", "虚线"], ["dot", "点线"]]) {
    await openPop("pop-line", "线条", "element.line.arrow.set");
    await mutate({
      id: `element.shape.border.set.${style}`,
      state: "line",
      command: "setBorder",
      action: async () => {
        const button = page.locator(`#pop-line .ctx-btn[data-value="${style}"]`);
        assert.equal((await button.innerText()).trim(), label);
        await button.click();
      },
      verify: async (model) => assert.equal(selected(model, lineId)?.border?.style, style),
      assertion: `${label} writes the line border style ${style}`,
    });
  }
  const arrowValues = ["", "arrow", "stealth", "diamond", "oval"];
  for (const value of arrowValues) {
    await openPop("pop-line", "线条", "element.line.arrow.set");
    await mutate({
      id: `element.line.arrow.set.start.${value || "none"}`,
      state: "line",
      command: "setLineArrow",
      action: () => changeInput(page.locator('#pop-line select[aria-label="线条起点样式"]'), value),
      verify: async (model) => assert.equal(selected(model, lineId)?.lineArrow?.[0] || "", value),
      assertion: `line start arrow writes ${value || "none"}`,
    });
  }
  for (const value of arrowValues) {
    await openPop("pop-line", "线条", "element.line.arrow.set");
    await mutate({
      id: `element.line.arrow.set.end.${value || "none"}`,
      state: "line",
      command: "setLineArrow",
      action: () => changeInput(page.locator('#pop-line select[aria-label="线条终点样式"]'), value),
      verify: async (model) => assert.equal(selected(model, lineId)?.lineArrow?.[1] || "", value),
      assertion: `line end arrow writes ${value || "none"}`,
    });
  }
  for (const [curve, label] of [["sharp", "折角"], ["round", "圆角"], ["smooth", "平滑"]]) {
    await openPop("pop-line", "线条", "element.line.arrow.set");
    await mutate({
      id: `element.line.curve.set.${curve}`,
      state: "line",
      command: "setLineCurve",
      action: async () => {
        const button = page.locator(`#pop-line .ctx-btn[data-value="${curve}"]`);
        assert.equal((await button.innerText()).trim(), label);
        await button.click();
      },
      verify: async (model) => assert.equal(selected(model, lineId)?.lineCurve, curve),
      assertion: `${label} writes the line curve ${curve}`,
    });
  }
  return { iconId, lineId };
}

async function imageFlow() {
  const imageFile = path.join(SOURCE, "media/bg_data.png");
  const chooserPromise = page.waitForEvent("filechooser");
  const responsePromise = page.waitForResponse((response) => isApiCommandUrl(response.url()) && response.request().method() === "POST" && JSON.parse(response.request().postData() || "{}").cmd === "insert");
  await page.locator('#insert-toolbar [data-insert="image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(imageFile);
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const imageId = (await response.json()).model.selection?.elementId || await waitSelectedType("image");
  row("insert.image", "no-selection", "image chooser inserts an editable image through /api/command");
  await assertMainState("image", ["遮罩形状", "填充方式", "对象对齐", "图层", "对象状态"], ["批注"]);
  const masks = [["矩形", null], ["椭圆", "ellipse"], ["圆角矩形", "roundRect"], ["菱形", "diamond"], ["六边形", "hexagon"]];
  for (const [label, shapeName] of masks) {
    // The popover is the 遮罩形状 picker now (crop mode itself moved to the panel).
    await openPop("pop-crop", "遮罩形状", "element.image.mask.set");
    await mutate({
      id: `element.image.mask.set.${shapeName || "rect"}`,
      state: "image",
      command: "setImageCropShape",
      action: () => clickMenu("pop-crop", label),
      verify: async (model) => assert.equal(selected(model, imageId)?.cropShape?.shapeName || null, shapeName),
      assertion: `${label} writes the expected crop shape`,
    });
  }
  const fits = [["裁切铺满", "cover"], ["完整显示", "contain"], ["拉伸填满", "fill"]];
  let fitBefore = selected(await readModel(), imageId)?.fit || "cover";
  let fitAfter = fitBefore;
  for (const [label, mode] of fits) {
    // 填充方式 lives in the property panel now (the 图片 popover was retired).
    await expectPanelControl("element.image.fit.set");
    const model = await mutate({
      id: `element.image.fit.set.${mode}`,
      state: "image",
      command: "setImageFit",
      action: () => changeInput(page.locator('#property-panel select[data-control="element.image.fit.set"]'), mode),
      verify: async (next) => assert.equal(selected(next, imageId)?.fit, mode),
      assertion: `${label} writes imageFit=${mode}`,
    });
    fitAfter = selected(model, imageId)?.fit;
  }
  await checkpoint({ id: "checkpoint.image", state: "image", elementId: imageId, before: "contain", after: fitAfter, getter: (element) => element?.fit });
  assert.notEqual(fitBefore, undefined);
  return imageId;
}

async function tableFlow() {
  await page.locator('#insert-toolbar [data-insert="table"]').click();
  const result = await captureCommand("insert", () => page.locator('#table-size-grid [data-r="3"][data-c="4"]').click());
  const tableId = result.model.selection?.elementId || await waitSelectedType("table");
  await page.waitForTimeout(300);
  await page.locator(`#slide .el.table[data-id="${tableId}"] td`).first().click();
  await assertMainState("table", ["表格", "对象对齐", "图层", "对象状态"], ["批注"]);
  await openPop("pop-table", "表格", "element.table.row.add");
  await expectPanelControl("element.opacity.set");
  // 表格 keeps a ctx-bar trigger; 不透明度 is a panel field now — identity is the
  // control id plus its trigger icon, not a shared popover markup.
  const tableTrigger = await page.locator("#pop-table > button").evaluate((node) => ({
    control: node.getAttribute("data-control"),
    svg: node.querySelector("svg")?.innerHTML || "",
  }));
  const opacityField = await page.locator('#property-panel [data-control="element.opacity.set"]').first().evaluate((node) => ({
    control: node.getAttribute("data-control"),
  }));
  assert.equal(tableTrigger.control, "element.table.row.add");
  assert.equal(opacityField.control, "element.opacity.set");
  assert.notEqual(tableTrigger.control, opacityField.control, "table and opacity must keep distinct control ids");
  assert.ok(tableTrigger.svg, "table trigger keeps its icon");
  assert.ok(await page.locator("#pop-table .ctx-pop .ctx-btn", { hasText: "+行" }).count());
  assert.equal(await page.locator('#property-panel input[data-control="element.opacity.set"]').count(), 1);
  row("identity.table-vs-opacity", "table", "table and opacity keep distinct ids, controls, labels, markup and panel content");

  for (const [label, command, key, delta, oracle] of [
    ["+行", "tableRow", "rows", 1, "element.table.row.add"],
    ["-行", "tableRow", "rows", -1, "element.table.row.delete"],
    ["+列", "tableCol", "cols", 1, "element.table.col.add"],
    ["-列", "tableCol", "cols", -1, "element.table.col.delete"],
  ]) {
    const before = selected(await readModel(), tableId);
    const beforeCount = key === "rows" ? before.tableRows.length : before.tableRows[0].length;
    await openPop("pop-table", "表格", "element.table.row.add");
    await mutate({
      id: oracle,
      state: "table",
      command,
      action: () => clickMenu("pop-table", label),
      verify: async (model) => {
        const table = selected(model, tableId);
        const afterCount = key === "rows" ? table.tableRows.length : table.tableRows[0].length;
        assert.equal(afterCount, beforeCount + delta);
      },
      assertion: `${label} changes the returned table ${key} count by ${delta}`,
    });
  }
  await openPop("pop-table", "表格", "element.table.row.add");
  await mutate({
    id: "element.table.cell.fill.set",
    state: "table",
    command: "tableFill",
    action: () => changeInput(page.locator("#ctx-table-fill"), "#dbeafe"),
    verify: async (model) => assert.equal(selected(model, tableId)?.tableRows?.[0]?.[0]?.fill?.toLowerCase(), "#dbeafe"),
    assertion: "cell fill writes the selected cell color",
  });
  let previousAlign = null;
  let lastAlign = null;
  for (const [label, align] of [["左齐", "left"], ["居中", "center"], ["右齐", "right"]]) {
    previousAlign = selected(await readModel(), tableId)?.tableRows?.[0]?.[0]?.align || null;
    await openPop("pop-table", "表格", "element.table.row.add");
    const model = await mutate({
      id: `element.table.cell.align.set.${align}`,
      state: "table",
      command: "setTableAlign",
      action: () => clickMenu("pop-table", label),
      verify: async (next) => assert.deepEqual(selected(next, tableId)?.tableRows?.[0]?.[0]?.align, [align, "middle"]),
      assertion: `${label} writes [${align},middle]`,
    });
    lastAlign = selected(model, tableId)?.tableRows?.[0]?.[0]?.align;
  }
  await checkpoint({ id: "checkpoint.table", state: "table", elementId: tableId, before: previousAlign, after: lastAlign, getter: (element) => element?.tableRows?.[0]?.[0]?.align || null });
  await selectId(tableId);
  const cells = page.locator(`#slide .el.table[data-id="${tableId}"] td`);
  await cells.nth(0).click();
  await cells.nth(1).click({ modifiers: ["Shift"] });
  await openPop("pop-table", "表格", "element.table.row.add");
  await mutate({
    id: "element.table.merge",
    state: "table",
    command: "tableMerge",
    action: () => clickMenu("pop-table", "合并"),
    verify: async (model) => assert.equal(selected(model, tableId)?.tableRows?.[0]?.[0]?.colSpan, 2),
    assertion: "merge writes a two-column cell span",
  });
  return tableId;
}

async function chartFlow() {
  const id = await insertSimple("chart");
  await assertMainState("chart", ["编辑数据", "图表类型", "系列色", "坐标轴", "标题", "数据标签", "图例", "对象对齐", "图层", "对象状态"], ["批注"]);
  for (const [label, type] of [["柱状", "bar"], ["折线", "line"], ["面积", "area"], ["饼图", "pie"]]) {
    await openPop("pop-chart-type", "图表类型", "element.chart.type.set");
    await mutate({
      id: `element.chart.type.set.${type}`,
      state: "chart",
      command: "setChartType",
      action: () => clickMenu("pop-chart-type", label),
      verify: async (model) => assert.equal(selected(model, id)?.chartType, type),
      assertion: `${label} writes chartType=${type}`,
    });
  }
  await openPop("pop-chart-color", "系列色", "element.chart.series.color.set");
  await mutate({
    id: "element.chart.series.color.set",
    state: "chart",
    command: "setChartSeriesFill",
    action: () => changeInput(page.locator("#ctx-chart-color-0"), "#d0472a"),
    verify: async (model) => assert.equal(selected(model, id)?.chartColors?.[0]?.toLowerCase(), "#d0472a"),
    assertion: "first chart series writes its selected color",
  });
  for (const [selector, key, value] of [["#ctx-chart-axis-x", "x", "季度"], ["#ctx-chart-axis-y", "y", "收入"], ["#ctx-chart-axis-secondary-y", "secondaryY", "增速"]]) {
    await openPop("pop-chart-axis", "坐标轴", "element.chart.axis.set");
    await mutate({
      id: `element.chart.axis.set.${key}`,
      state: "chart",
      command: "setChartAxis",
      action: () => changeInput(page.locator(selector), value),
      verify: async (model) => assert.equal(selected(model, id)?.chartAxis?.[key], value),
      assertion: `${key} axis title writes the entered value`,
    });
  }
  await openPop("pop-chart-title", "标题", "element.chart.title.set");
  await mutate({
    id: "element.chart.title.set",
    state: "chart",
    command: "setChartTitle",
    action: () => changeInput(page.locator("#pop-chart-title input"), "控制矩阵图表"),
    verify: async (model) => assert.equal(selected(model, id)?.chartTitle, "控制矩阵图表"),
    assertion: "chart title writes the entered value",
  });
  const beforeLabels = selected(await readModel(), id)?.chartLabels !== false;
  await mutate({
    id: "element.chart.labels.set",
    state: "chart",
    command: "setChartLabels",
    action: () => clickProperty("数据标签"),
    verify: async (model) => assert.equal(selected(model, id)?.chartLabels !== false, !beforeLabels),
    assertion: "data-label toggle changes the returned boolean",
  });
  const beforeLegend = Boolean(selected(await readModel(), id)?.chartLegend);
  const legendModel = await mutate({
    id: "element.chart.legend.set",
    state: "chart",
    command: "setChartLegend",
    action: () => clickProperty("图例"),
    verify: async (model) => assert.equal(Boolean(selected(model, id)?.chartLegend), !beforeLegend),
    assertion: "legend toggle changes the returned boolean",
  });
  await checkpoint({ id: "checkpoint.chart", state: "chart", elementId: id, before: beforeLegend, after: Boolean(selected(legendModel, id)?.chartLegend), getter: (element) => Boolean(element?.chartLegend) });
  await selectId(id);
  await openPop("pop-align-el", "对象对齐", "element.arrange.align.set");
  await mutate({
    id: "element.chart.arrange.align.set.left",
    state: "chart",
    command: "align",
    action: () => clickMenu("pop-align-el", "左齐"),
    verify: async (model, body) => {
      assert.equal(body.edge, "left");
      assert.ok(selected(model, id));
    },
    assertion: "chart uses the shared object alignment command and remains editable",
  });
  await expectPanelControl("element.opacity.set");
  await mutate({
    id: "element.chart.opacity.set",
    state: "chart",
    command: "setOpacity",
    action: () => changeInput(page.locator('#property-panel input[data-control="element.opacity.set"]'), 81),
    verify: async (model) => assert.equal(selected(model, id)?.opacity, 0.81),
    assertion: "chart opacity writes 0.81 through the shared element command",
  });
  await selectId(id);
  await clickProperty("编辑数据");
  await page.locator("#chart-overlay").waitFor({ state: "visible" });
  const value = page.locator("#chart-grid tr").nth(1).locator("td input").nth(1);
  const chartDataResult = await mutate({
    id: "element.chart.data.set",
    state: "chart",
    command: "setChartData",
    action: async () => { await value.fill("17"); await value.press("Tab"); },
    verify: async (model) => assert.equal(Number(selected(model, id)?.chartData?.rows?.[0]?.[1]), 17),
    assertion: "chart grid cell writes numeric data through the real command",
  });
  assert.ok(chartDataResult);
  await page.locator("#chart-overlay-close").click();
  return id;
}

async function commonAndIdentityFlow(ids) {
  await reloadAndFind(ids.chartId);
  await arrangeFixtureBounds(ids.tableId, [20, 370, 240, 140]);
  await arrangeFixtureBounds(ids.chartId, [680, 30, 250, 170]);
  await selectId(ids.shapeId);
  await pointerSelectId(ids.tableId);
  await pointerSelectId(ids.chartId);
  await pointerSelectId(ids.tableId);
  row("identity.pointer.table-chart-table", "table/chart", "non-overlapping objects switch table → chart → table through real pointer clicks, real select commands, selected DOM state, and matching property controls", {
    tableBounds: [20, 370, 240, 140], chartBounds: [680, 30, 250, 170], timeoutMs: 2_000,
  });
  const cycle = [ids.tableId, ids.shapeId, ids.imageId, ids.textId, ids.chartId, ids.tableId];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (const id of cycle) {
      await selectId(id);
      const model = await readModel();
      const type = selected(model, id)?.type;
      const visibleLabels = (await page.locator("#ctx-bar .ctx-visible-label").allTextContents()).map((text) => text.trim());
      console.log(`STATE ${type}:${id} ${visibleLabels.join("/")}`);
      assert.equal(await page.locator("#property-panel").count(), 1, "property panel must stay unique");
      assert.equal(await page.locator("#ctx-bar").count(), 1, "context bar must stay unique");
      assert.equal(await page.locator("#ctx-bar [id^=pop-]").evaluateAll((nodes) => new Set(nodes.map((node) => node.id)).size), await page.locator("#ctx-bar [id^=pop-]").count(), "pop ids must remain unique");
      if (type === "table") {
        assert.equal(await page.locator("#pop-table").count(), 1, `table menu missing; labels=${visibleLabels.join("/")}`);
        assert.equal(await page.locator('#property-panel [data-control="element.opacity.set"]').count(), 1);
      } else {
        assert.equal(await page.locator("#pop-table").count(), 0);
      }
    }
  }
  row("identity.cross-type-rerender", "text/shape/image/table/chart", "24 exact-node synthetic selections keep one property panel, unique pop ids, and table/opacity identity; synthetic dispatch avoids hit-testing deliberately overlapping fixture objects");

  await selectId(ids.shapeId);
  for (const [label, dir, oracle, control] of [["上移一层", "forward", "element.arrange.forward", "element.arrange.forward"], ["下移一层", "backward", "element.arrange.backward", "element.arrange.backward"], ["置于顶层", "front", "element.arrange.forward.front", "element.arrange.forward"], ["置于底层", "back", "element.arrange.backward.back", "element.arrange.backward"]]) {
    // 图层 is a panel section now (the #pop-layers popover is retired); two
    // buttons share each control id, so match the visible label.
    await mutate({
      id: oracle,
      state: "shape/common",
      command: "arrange",
      action: () => clickPanelByControl(control, label),
      verify: async (_model, body) => assert.equal(body.dir, dir),
      assertion: `${label} emits arrange dir=${dir} and returns a model`,
    });
  }
  const beforeShadow = selected(await readModel(), ids.shapeId)?.shadow || null;
  await mutate({ id: "element.shadow.set", state: "shape/common", command: "setShadow", action: () => clickPanelByControl("element.shadow.set"), verify: async (model) => assert.notDeepEqual(selected(model, ids.shapeId)?.shadow || null, beforeShadow), assertion: "shadow toggles the returned model" });
  for (const [label, axis] of [["水平翻转", "h"], ["垂直翻转", "v"]]) {
    await mutate({ id: `element.arrange.flip.set.${axis}`, state: "shape/common", command: "flip", action: () => clickPanelByControl("element.arrange.flip.set", label), verify: async (_model, body) => assert.equal(body.axis, axis), assertion: `${label} emits flip axis=${axis}` });
  }
  await mutate({ id: "element.rotate.set", state: "shape/common", command: "setRotation", action: () => changeInput(page.locator('#property-panel input[data-control="element.rotate.set"]'), 23), verify: async (model) => assert.equal(selected(model, ids.shapeId)?.rotation, 23), assertion: "rotation writes 23 degrees" });
  for (const [index, label, value] of [[0, "X", 111], [1, "Y", 123], [2, "W", 234], [3, "H", 156]]) {
    await mutate({ id: `element.bounds.set.${label}`, state: "shape/common", command: "setBounds", action: () => changeInput(page.locator('#property-panel input[data-control="element.bounds.set"]').nth(index), value), verify: async (model) => assert.equal(selected(model, ids.shapeId)?.bounds?.[index], value), assertion: `${label} writes bounds[${index}]=${value}` });
  }
  await mutate({ id: "element.lock.toggle", state: "shape/common", command: "setLocked", action: () => clickPanelByControl("element.lock.toggle"), verify: async (model) => assert.equal(selected(model, ids.shapeId)?.locked, true), assertion: "lock action sets locked=true" });
  await captureCommand("undo", () => page.locator("#btn-undo").click());
  await selectId(ids.shapeId);
  const beforeCount = (await readModel()).elements.length;
  await mutate({ id: "element.duplicate", state: "shape/common", command: "duplicateSelected", action: () => clickPanelByControl("element.duplicate"), verify: async (model) => assert.equal(model.elements.length, beforeCount + 1), assertion: "duplicate adds exactly one returned element" });
  await captureCommand("undo", () => page.locator("#btn-undo").click());

  await selectId(ids.shapeId);
  await mutate({ id: "element.visibility.toggle", state: "shape/common", command: "setHidden", action: () => clickPanelByControl("element.visibility.toggle"), verify: async (model) => assert.equal(selected(model, ids.shapeId)?.hidden, true), assertion: "hide action sets hidden=true" });
  await captureCommand("undo", () => page.locator("#btn-undo").click());
  await selectId(ids.shapeId);
  await mutate({ id: "element.delete", state: "shape/common", command: "deleteSelected", action: () => clickPanelByControl("element.delete"), verify: async (model) => assert.equal(selected(model, ids.shapeId), undefined), assertion: "delete removes the selected element" });
  await captureCommand("undo", () => page.locator("#btn-undo").click());

  await selectId(ids.shapeId);
  await selectId(ids.lineId, ["Shift"]);
  await selectId(ids.iconId, ["Shift"]);
  // 编组 / 解组 live inside the 对象对齐 popover, so the panel labels are these two.
  await assertMainState("multi", ["对象对齐", "图层"], ["批注"]);
  for (const [label, edge] of [["左齐", "left"], ["水平居中", "center"], ["右齐", "right"], ["上齐", "top"], ["垂直居中", "middle"], ["下齐", "bottom"]]) {
    await openPop("pop-align", "对象对齐", "element.arrange.align.set");
    await mutate({ id: `element.arrange.align.set.${edge}`, state: "multi", command: "align", action: () => clickMenu("pop-align", label), verify: async (_model, body) => assert.equal(body.edge, edge), assertion: `${label} emits align edge=${edge}` });
  }
  for (const [label, axis] of [["水平分布", "h"], ["垂直分布", "v"]]) {
    // Distribution buttons are panel actions and only render for >=3 selected
    // objects (this flow selects three).
    await mutate({ id: `element.arrange.distribute.set.${axis}`, state: "multi", command: "distribute", action: () => clickPanelByControl("element.arrange.distribute.set", label), verify: async (_model, body) => assert.equal(body.axis, axis), assertion: `${label} emits distribute axis=${axis}` });
  }
  const grouped = await mutate({ id: "element.group.set", state: "multi", command: "group", action: () => clickPanelByControl("element.group.set"), verify: async (model) => assert.ok(model.elements.some((element) => element.groupId)), assertion: "group assigns a group id in the returned model" });
  assert.ok(grouped);
  await mutate({ id: "element.ungroup.set", state: "multi", command: "ungroup", action: () => clickPanelByControl("element.ungroup.set"), verify: async (model) => assert.ok(!model.elements.filter((element) => [ids.shapeId, ids.lineId, ids.iconId].includes(element.id)).some((element) => element.groupId)), assertion: "ungroup clears group ids" });
}

async function commentAndAiFlow(elementId) {
  assert.equal(await page.locator("#btn-mode-comment").count(), 0, "legacy bottom comment control must be removed");
  assert.equal(await page.locator("#btn-comments").count(), 1, "one global comments button must exist");
  await selectId(elementId);
  await page.locator("#btn-comments").click();
  await page.locator("#comment-panel").waitFor({ state: "visible" });
  assert.match(await page.locator("#comment-target").innerText(), /范围：第 \d+ 页 · 表格/);
  const scopes = await page.locator("[data-comment-scope]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-comment-scope")));
  assert.equal(new Set(scopes).size, scopes.length, "comment scopes must be unique");
  assert.equal(await page.locator('#ctx-bar [data-control="chrome.comment.pin"]').count(), 0, "property bar must not repeat the global comment entry");
  row("chrome.comment.pin.identity", "selected element", "one global comments entry opens a target-aware panel; no contextual duplicate", { scopes });
  await page.locator("#btn-comments").click();
  await page.locator("#comment-panel").waitFor({ state: "hidden" });
  await page.locator("#property-panel").waitFor({ state: "visible" });

  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  await page.locator("#chat-close").click();
  await page.locator("#work-chat").waitFor({ state: "hidden" });
  assert.ok(await page.locator("#property-panel").isVisible(), "closing AI restores the editor property panel");
  row("chrome.workspace.toggle", "canvas", "AI opens, closes, and returns focus/layout to the editor");
}

try {
  await waitForServer();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT)}&page=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.evaluate(() => document.fonts?.ready);
  await page.locator("#insert-toolbar").waitFor({ state: "visible" });
  await page.locator("#property-panel").waitFor({ state: "attached" });

  const beforePages = (await readModel()).pageCount;
  await mutate({
    id: "chrome.pages.add",
    state: "no-selection",
    command: "addPage",
    action: () => page.locator("#rail .rail-add").click(),
    verify: async (model) => assert.equal(model.pageCount, beforePages + 1),
    assertion: "a blank scratch page is created for destructive control checks",
  });

  const textId = await textFlow();
  const shapeId = await shapeFlow();
  const { iconId, lineId } = await iconAndLineFlow();
  const imageId = await imageFlow();
  const tableId = await tableFlow();
  const chartId = await chartFlow();
  await commonAndIdentityFlow({ textId, shapeId, iconId, lineId, imageId, tableId, chartId });
  await commentAndAiFlow(tableId);

  assert.deepEqual(ledger.browserErrors, [], `browser errors: ${ledger.browserErrors.join(" | ")}`);
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = { passedRows: ledger.rows.length, failedRows: 0 };
  await page.screenshot({ path: path.join(OUT, "editor-canvas-controls-final.png"), fullPage: false });
  fs.writeFileSync(path.join(OUT, "editor-canvas-controls-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, port: PORT, rows: ledger.rows.length, ledger: path.join(OUT, "editor-canvas-controls-ledger.json") }));
} catch (error) {
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = { passedRows: ledger.rows.length, failedRows: 1 };
  ledger.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  fs.writeFileSync(path.join(OUT, "editor-canvas-controls-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  if (!KEEP) fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
}
