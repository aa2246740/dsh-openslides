#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

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
const source = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-toolbar-actions-"));
const project = path.join(scratch, "project");
const out = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/editor-toolbar-qa"));
fs.cpSync(source, project, { recursive: true });
fs.mkdirSync(out, { recursive: true });

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`editor server did not start\n${serverLog}`);
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

const elementCount = () => page.locator("#slide .el[data-id]").count();
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
async function expectAdded(action, minimum = 1) {
  const before = await elementCount();
  await action();
  await page.waitForTimeout(500);
  const after = await elementCount();
  assert.ok(after >= before + minimum, `expected at least ${minimum} element(s), got ${before}->${after}`);
  return after;
}
function contextButton(title) {
  return page.locator("#ctx-bar").getByRole("button", { name: title, exact: true }).first();
}
async function openContext(title) {
  const button = contextButton(title);
  const alreadyOpen = await button.evaluate((node) =>
    node.parentElement?.classList.contains("ctx-popwrap") &&
    node.parentElement.classList.contains("open"),
  );
  if (!alreadyOpen) await button.click();
  await page.waitForTimeout(120);
  return button;
}
async function openInspectorSection(key) {
  const section = page.locator(`#property-panel [data-inspector-section="${key}"]`);
  await section.waitFor({ state: "visible" });
  if (await section.evaluate((node) => node.tagName === "DETAILS" && !node.open)) {
    await section.locator(":scope > summary").click();
  }
  return section;
}

try {
  await waitForServer();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.evaluate(() => document.fonts?.ready);

  // One top-level comment entry opens and closes the review panel.
  assert.equal(await page.locator('[data-control="chrome.comment.pin"]').count(), 1);
  await page.locator("#btn-comments").click();
  assert.ok(await page.locator("#comment-panel").isVisible(), "comment entry must open the review panel");
  assert.equal(await page.locator("#btn-comments").getAttribute("aria-expanded"), "true");
  await page.locator("#comment-panel-close").click();
  assert.ok(!(await page.locator("#comment-panel").isVisible()), "comment panel must have a close path");

  // AI workspace: it must open and provide a close/toggle path.
  await page.locator("#btn-sparkles").click();
  assert.ok(await page.locator("#work-chat").isVisible(), "AI button must open work chat");
  await shot("ai-workspace-open");
  const closeChat = page.locator("#chat-close");
  assert.ok(await closeChat.isVisible(), "AI work chat must have a visible close control");
  await closeChat.click();
  assert.ok(!(await page.locator("#work-chat").isVisible()), "AI close control must restore the full editor");
  await shot("ai-workspace-closed");

  // Text.
  await expectAdded(async () => page.locator('button[data-insert="text"]').click());
  assert.ok(await page.locator("#slide .el.text.selected.is-editing").isVisible(), "new text must enter editing state");
  await page.keyboard.press("Escape");
  const insertedText = page.locator("#slide .el.text").last();
  await insertedText.click();
  const wrapToggle = page.locator('#property-panel input[role="switch"][data-control="element.text.toolbar.wrap.set"]');
  assert.ok(await wrapToggle.isVisible(), "text toolbar must expose the verified wrap control");
  assert.equal(await wrapToggle.getAttribute("aria-label"), "框内自动换行");
  assert.equal(await wrapToggle.isChecked(), true, "new text must begin with wrapping enabled");
  await wrapToggle.setChecked(false);
  await page.waitForTimeout(180);
  assert.equal(await insertedText.evaluate((node) => getComputedStyle(node).whiteSpace), "nowrap", "wrap control must disable wrapping");
  await page.locator('#property-panel input[role="switch"][data-control="element.text.toolbar.wrap.set"]').setChecked(true);
  await page.waitForTimeout(180);
  assert.notEqual(await insertedText.evaluate((node) => getComputedStyle(node).whiteSpace), "nowrap", "wrap control must restore wrapping");
  assert.equal((await page.locator("#pop-align-t > .property-control-label").innerText()).trim(), "文本对齐");
  for (const label of ["文字水平左对齐", "文字水平居中对齐", "文字水平右对齐", "文字水平两端对齐", "文字垂直顶部对齐", "文字垂直居中对齐", "文字垂直底部对齐"]) {
    assert.ok(await page.locator("#pop-align-t").getByRole("button", { name: label, exact: true }).isVisible(), `${label} must be explicit`);
  }
  const numberedList = page.locator('#property-panel button[data-control="element.text.toolbar.list.set"][aria-label="编号列表"]');
  assert.equal(await numberedList.count(), 1, "numbered-list command must remain a named direct choice");
  assert.match(await numberedList.innerText(), /编号/);
  await page.keyboard.press("Escape");

  // Shape.
  await page.locator('button[data-insert="shape"]').click();
  await page.locator("#shape-grid .shape-cell").first().waitFor({ state: "visible" });
  await expectAdded(async () => page.locator("#shape-grid .shape-cell").first().click());
  assert.ok(await page.locator("#slide .el.shape.selected").isVisible(), "new shape must be selected");
  await page.keyboard.press("Escape");

  // Image upload.
  const imageFile = path.join(source, "media/bg_data.png");
  const imageBefore = await elementCount();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator('button[data-insert="image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(imageFile);
  await page.waitForTimeout(900);
  assert.ok(await elementCount() > imageBefore, "image picker must insert the chosen image");
  assert.ok(await page.locator("#slide .el.image.selected").isVisible(), "inserted image must be selected");
  await page.keyboard.press("Escape");

  // 3x4 table.
  await page.locator('button[data-insert="table"]').click();
  const tableCell = page.locator('#table-size-grid .table-size-cell[data-r="3"][data-c="4"]');
  await tableCell.waitFor({ state: "visible" });
  await expectAdded(async () => tableCell.click());
  assert.equal(await page.locator("#slide .el.table.selected table tr").count(), 3, "3x4 table must have 3 rows");
  assert.equal(await page.locator("#slide .el.table.selected table tr").first().locator("td").count(), 4, "3x4 table must have 4 columns");
  await page.keyboard.press("Escape");

  // Chart and its context controls. Chart insertion has no editor affordance by
  // design: decks get their charts from the agent, and hand-editing belongs in
  // PowerPoint. Insert through the command path, then drive the rest of this
  // block through the real UI.
  const insertedChart = await page.evaluate(async () => {
    const project = new URLSearchParams(location.search).get("project") || "";
    const res = await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "insert", kind: "chart" }),
    });
    const data = await res.json();
    return {
      status: res.status,
      error: data.error ?? null,
      charts: (data.model?.elements || []).filter((el) => el.type === "chart").length,
    };
  });
  assert.equal(insertedChart.status, 200, `chart insert command must succeed (${insertedChart.error})`);
  assert.equal(insertedChart.charts, 1, `exactly one chart expected, got ${insertedChart.charts}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.locator("#slide .el.chart").first().click();

  const selectedChart = page.locator("#slide .el.chart.selected");
  await selectedChart.waitFor({ state: "visible" });
  const chartId = await selectedChart.getAttribute("data-id");
  assert.ok(chartId, "inserted chart must expose a stable element id");
  const chart = page.locator(`#slide .el.chart[data-id="${chartId}"]`);
  assert.notEqual(await chart.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");

  assert.equal(await page.locator('[data-control="chrome.comment.pin"]').count(), 1, "chart selection must not duplicate comment entry");

  await openContext("编辑数据");
  assert.ok(await page.locator("#chart-overlay").isVisible(), "edit-data overlay must open");
  assert.equal(
    await page.locator(".chart-grid-scroll").evaluate((node) => getComputedStyle(node).overflowX),
    "auto",
    "wide chart data must scroll instead of clipping",
  );
  const firstSeriesHeader = page.locator("#chart-grid th.s1").first();
  assert.notEqual(
    await firstSeriesHeader.evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(76, 156, 255)",
    "series headers must not use the old saturated blue fill",
  );
  assert.notEqual(
    await firstSeriesHeader.locator("input").evaluate((node) => getComputedStyle(node).color),
    "rgb(255, 255, 255)",
    "series names must use readable dark text on the neutral header",
  );
  assert.ok(
    await firstSeriesHeader.locator(".s1-swatch").evaluate((node) => getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)"),
    "series color must remain visible as a compact swatch",
  );
  const firstValue = page.locator("#chart-grid tr").nth(1).locator("td input").nth(1);
  await firstValue.fill("not-a-number");
  assert.equal(await firstValue.getAttribute("aria-invalid"), "true", "invalid chart data must be exposed semantically");
  assert.ok(await page.locator("#chart-data-status").filter({ hasText: "请输入数字" }).isVisible(), "invalid chart data must show visible recovery text");
  await firstValue.fill("7");
  assert.notEqual(await firstValue.getAttribute("aria-invalid"), "true", "valid chart data must clear aria-invalid");
  await firstValue.press("Tab");
  await page.waitForTimeout(500);
  assert.ok(await chart.locator("svg text").filter({ hasText: /^7$/ }).count(), "chart must live-update edited data");
  await page.keyboard.press("Escape");
  await page.mouse.click(1200, 600);
  await page.waitForTimeout(150);
  await chart.click();

  await openContext("图表类型");
  await page.locator("#pop-chart-type .ctx-btn", { hasText: "折线" }).click();
  await page.waitForTimeout(350);
  assert.ok(await chart.locator("svg polyline").count(), "line type must repaint the chart");
  await openContext("图表类型");
  await page.locator("#pop-chart-type .ctx-btn", { hasText: "柱状" }).click();
  await page.waitForTimeout(350);
  assert.ok(await chart.locator("svg rect").count(), "bar type must repaint the chart");

  await openContext("系列色");
  const colorInput = page.locator("#ctx-chart-color-0");
  await colorInput.evaluate((input) => {
    input.value = "#e11d48";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(350);
  assert.equal((await chart.locator("svg rect").first().getAttribute("fill"))?.toLowerCase(), "#e11d48", "series color must repaint and persist");

  await openContext("坐标轴");
  await page.locator("#ctx-chart-axis-x").fill("季度");
  await page.locator("#ctx-chart-axis-x").press("Tab");
  await page.waitForTimeout(350);
  assert.ok(await chart.locator("svg text").filter({ hasText: "季度" }).count(), "axis title must repaint");

  await openContext("标题");
  const titleInput = page.locator("#pop-chart-title input");
  await titleInput.fill("收入趋势");
  await titleInput.press("Tab");
  await page.waitForTimeout(350);
  assert.ok(await chart.locator("svg text").filter({ hasText: "收入趋势" }).count(), "chart title must repaint");

  const labelsButton = contextButton("数据标签");
  assert.ok(await labelsButton.evaluate((button) => button.classList.contains("on")), "labels must begin active");
  assert.equal(await labelsButton.getAttribute("aria-pressed"), "true", "labels must expose its state");
  assert.equal(await labelsButton.getAttribute("data-tip"), "隐藏数据标签", "labels tooltip must explain the action");
  assert.match(await labelsButton.innerText(), /数据标签/, "labels must have a visible name");
  await labelsButton.hover();
  await page.waitForTimeout(360);
  assert.equal(await page.locator("#ui-tooltip").innerText(), "隐藏数据标签", "labels hover must show a human-readable action");
  await labelsButton.click();
  await page.waitForTimeout(250);
  assert.ok(!(await contextButton("数据标签").evaluate((button) => button.classList.contains("on"))), "labels toggle must turn off");
  assert.equal(await contextButton("数据标签").getAttribute("aria-pressed"), "false");
  assert.equal(await contextButton("数据标签").getAttribute("data-tip"), "显示数据标签");

  const legendButton = contextButton("图例");
  assert.ok(await legendButton.evaluate((button) => button.classList.contains("on")), "legend must begin active");
  assert.equal(await legendButton.getAttribute("aria-pressed"), "true", "legend must expose its state");
  assert.equal(await legendButton.getAttribute("data-tip"), "隐藏图例", "legend tooltip must explain the action");
  assert.match(await legendButton.innerText(), /图例/, "legend must have a visible name");
  await legendButton.click();
  await page.waitForTimeout(250);
  assert.ok(!(await contextButton("图例").evaluate((button) => button.classList.contains("on"))), "legend toggle must turn off");
  await contextButton("图例").click();

  const unnamedIconButtons = await page.locator("#ctx-bar button").evaluateAll((buttons) =>
    buttons
      .filter((button) => !button.textContent.trim())
      .filter((button) => !button.getAttribute("aria-label") || !button.getAttribute("data-tip"))
      .map((button) => ({ control: button.getAttribute("data-control"), html: button.outerHTML.slice(0, 180) })),
  );
  assert.deepEqual(unnamedIconButtons, [], "every icon-only chart toolbar button must have a name and hover explanation");

  await openInspectorSection("position-arrange");
  assert.equal(await page.locator("#pop-layers .ctx-btn").count(), 4, "the direct layer group must expose all four actions");
  for (const action of ["置于底层", "上移一层", "下移一层", "置于顶层"]) {
    await openInspectorSection("position-arrange");
    await page.locator("#pop-layers .ctx-btn", { hasText: action }).click();
    await page.waitForTimeout(180);
    assert.ok(await page.locator("#slide .el.chart.selected").isVisible(), `${action} must preserve selection`);
  }

  assert.equal(await page.locator('#property-panel [data-inspector-section] >> text="更多"').count(), 0,
    "the inspector must not restore a More bucket");
  await openInspectorSection("appearance");
  const shadow = page.locator('#property-panel input[role="switch"][data-control="element.shadow.set"]');
  assert.equal(await shadow.count(), 1, "appearance must expose one direct shadow switch");
  await shadow.setChecked(true);
  await page.waitForTimeout(180);
  assert.notEqual(await chart.evaluate((node) => getComputedStyle(node).boxShadow), "none", "shadow toggle must repaint");

  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "水平翻转", exact: true }).click();
  await page.waitForTimeout(180);
  assert.match(await chart.evaluate((node) => node.style.transform), /scaleX\(-1\)/, "horizontal flip must repaint");
  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "垂直翻转", exact: true }).click();
  await page.waitForTimeout(180);
  assert.match(await chart.evaluate((node) => node.style.transform), /scaleY\(-1\)/, "vertical flip must repaint");

  await openInspectorSection("position-arrange");
  const rotation = page.locator('#ctx-rotation[data-control="element.rotate.set"]');
  assert.equal(await rotation.getAttribute("aria-label"), "旋转");
  await rotation.fill("15");
  await rotation.press("Tab");
  await page.waitForTimeout(180);
  assert.match(await chart.evaluate((node) => node.style.transform), /rotate\(15deg\)/, "rotation input must repaint");

  for (const [field, value, cssProperty, expected] of [
    ["X", "120", "left", "120px"],
    ["Y", "160", "top", "160px"],
    ["宽", "560", "width", "560px"],
    ["高", "260", "height", "260px"],
  ]) {
    await openInspectorSection("position-arrange");
    const input = page.locator('[data-inspector-section="position-arrange"]').getByRole("spinbutton", { name: field, exact: true });
    await input.fill(value);
    await input.press("Tab");
    await page.waitForTimeout(180);
    assert.equal(await chart.evaluate((node, property) => node.style[property], cssProperty), expected, `${field} must update bounds`);
  }

  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "锁定", exact: true }).click();
  await page.waitForTimeout(180);
  assert.ok(await chart.evaluate((node) => node.classList.contains("is-locked")), "lock must repaint");
  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await page.waitForTimeout(180);
  assert.ok(!(await chart.evaluate((node) => node.classList.contains("is-locked"))), "lock must toggle off");

  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  await page.waitForTimeout(180);
  assert.ok(await chart.evaluate((node) => node.classList.contains("is-hidden")), "hide must repaint");
  await openInspectorSection("position-arrange");
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.waitForTimeout(180);
  assert.ok(!(await chart.evaluate((node) => node.classList.contains("is-hidden"))), "hide must toggle off");

  const chartCountBeforeCopy = await page.locator("#slide .el.chart").count();
  await page.locator('[data-inspector-section="actions"] [data-control="element.duplicate"]').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#slide .el.chart").count(), chartCountBeforeCopy + 1, "copy must duplicate the chart");
  await page.locator('[data-inspector-section="actions"] [data-control="element.delete"]').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#slide .el.chart").count(), chartCountBeforeCopy, "delete must remove the copied chart");
  await chart.click({ force: true });

  // The bottom "更多" menu was retired with its theme, formula, SmartArt and
  // chart-insert entries: this product generates decks with the agent and hands
  // hand-editing off to PowerPoint. Only the surviving chrome actions are
  // asserted here.
  assert.equal(await page.locator("#composer-plus").count(), 1, "composer owns the single attachment entry");
  assert.equal(await page.locator("#agent-attachment-file").count(), 1, "exactly one attachment input is mounted");
  await page.locator("#btn-comments").click();
  assert.ok(await page.locator("#comment-panel").isVisible(), "direct comment action must open review panel");
  await page.locator("#comment-panel-close").click();
  await page.locator("#btn-sparkles").click();
  assert.ok(await page.locator("#work-chat").isVisible(), "direct AI action must open work chat");
  await page.locator("#chat-close").click();

  assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join(" | ")}`);
  await shot("editor-toolbar-actions");
  console.log(JSON.stringify({ ok: true, screenshot: path.join(out, "editor-toolbar-actions.png") }));
} finally {
  await browser.close();
  server.kill("SIGKILL");
  if (!process.env.KEEP_QA_PROJECT) fs.rmSync(scratch, { recursive: true, force: true });
}
