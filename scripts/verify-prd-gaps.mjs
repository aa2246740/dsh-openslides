#!/usr/bin/env node
/**
 * Browser verification for PRD completeness gaps (export / versions / pins / chart / present / rail).
 *   node scripts/verify-prd-gaps.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import { cleanupFixtures } from "./qa/gestures.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const URL = `${BASE}/index.html?project=fixtures/okp-yu7-ppt`;
const OUT_DIR = path.resolve("output");

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function shot(name) {
  return path.join(OUT_DIR, `verify-prd-${name}.png`);
}

async function waitReady(page) {
  await page.waitForSelector("#slide .el", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById("doc-title")?.textContent || "";
      return t && t !== "未加载";
    },
    null,
    { timeout: 15000 },
  );
}

async function apiJson(page, pathName, opts = {}) {
  return page.evaluate(
    async ({ pathName, opts }) => {
      const res = await fetch(pathName, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      return res.json();
    },
    { pathName, opts },
  );
}

async function command(page, body) {
  return apiJson(page, "/api/command", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
// This suite mutates the fixture project (a new version, an element move, a
// seeded chart), so snapshot it first and restore it when the run ends.
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await waitReady(page);
  pass("editor loaded");

  // --- 1. export dialog progress + result ---
  await page.locator("#btn-export").click();
  await page.waitForSelector("#export-dialog[open]", { timeout: 4000 });
  await page.locator("#export-pptx").click();
  // A format button only marks the choice now; 下载 starts the export and is what
  // surfaces the progress state.
  await page.locator("#export-download").click();
  await page.waitForSelector("#export-progress:not([hidden])", { timeout: 4000 });
  const progressText = await page.locator("#export-progress").innerText();
  if (!progressText.includes("正在导出")) fail(`export progress missing 正在导出: ${progressText}`);
  pass("export progress shown");
  await page.waitForSelector("#export-result:not([hidden])", { timeout: 30000 });
  const resultText = await page.locator("#export-result").innerText();
  if (!resultText.includes("页")) fail(`export result missing 页: ${resultText}`);
  if (!/\d+(?:\.\d+)?\s*(KB|MB)/.test(resultText)) fail(`export result missing size: ${resultText}`);
  await page.screenshot({ path: shot("export"), fullPage: false });
  pass(`export result ${resultText.replace(/\s+/g, " ").trim()}`);
  await page.locator("#export-dialog menu button").click();

  // --- 2. version dropdown relative time ---
  await apiJson(page, "/api/versions", { method: "POST", body: JSON.stringify({ note: "manual check" }) });
  await page.locator("#btn-versions").click();
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 4000 });
  const versionText = await page.locator("#versions-list").innerText();
  if (!/前|刚刚/.test(versionText)) fail(`version rows missing relative time: ${versionText}`);
  await page.screenshot({ path: shot("versions"), fullPage: false });
  pass(`version relative time present (${versionText.includes("刚刚") ? "刚刚" : "前"})`);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const vm = document.getElementById("version-menu");
    if (vm) vm.hidden = true;
  });

  // --- 3. comment pin follows element ---
  const beforeModel = await apiJson(page, "/api/model");
  const target =
    (beforeModel.model?.elements || []).find((e) => e.type === "text" && e.id === "cover-title") ||
    (beforeModel.model?.elements || []).find((e) => e.type === "text") ||
    beforeModel.model?.elements?.[0];
  if (!target) fail("no element to bind comment pin");
  // Select with a real gesture, but away from the element's centre: a centre
  // click can land on whatever overlaps it, and an element-scoped comment binds
  // to the real selection. The selection is asserted, so a bad click fails loudly.
  const targetNode = page.locator(`#slide .el[data-id="${target.id}"]`);
  const targetBox = await targetNode.boundingBox();
  if (!targetBox) fail(`no box for ${target.id}`);
  await page.mouse.click(targetBox.x + 4, targetBox.y + 4);
  await page.waitForTimeout(250);
  const selection = (await apiJson(page, "/api/model")).model?.selection;
  if (selection?.elementId !== target.id) {
    fail(`could not select ${target.id}, selection=${JSON.stringify(selection)}`);
  }
  // Comment mode is panel-driven now: pick the scope, write the draft, submit.
  // The retired mode pill used to drop a pin from a raw canvas click instead.
  await page.locator("#btn-comments").click();
  await page.waitForSelector("#comment-layer:not([hidden])", { timeout: 4000 });
  // With an element selected the panel already scopes to 所选对象; the button is a
  // toggle, so clicking it unconditionally would turn the element scope back off.
  const elementsScope = page.locator('[data-comment-scope="elements"]');
  if ((await elementsScope.getAttribute("aria-pressed")) !== "true") {
    await elementsScope.click();
  }
  await page.locator("#comment-draft").fill("这里要放数据来源");
  await page.locator("#comment-add").click();
  if (process.env.PRD_DEBUG === "1") {
    await page.waitForTimeout(600);
    console.log(
      "DEBUG",
      JSON.stringify(
        await page.evaluate(() => ({
          scope: [...document.querySelectorAll("[data-comment-scope]")].map((b) => `${b.dataset.commentScope}:${b.getAttribute("aria-pressed")}`),
          pins: [...document.querySelectorAll(".pin")].map((p) => p.dataset.elementId || null),
          layerHidden: document.getElementById("comment-layer")?.hidden,
          panelHidden: document.getElementById("comment-panel")?.hidden,
          storage: Object.keys(localStorage)
            .filter((k) => k.startsWith("oss.comments:"))
            .map((k) => JSON.parse(localStorage.getItem(k) || "[]").map((r) => r.elementId)),
        })),
      ),
    );
  }
  // The fixture ships stored review threads, so identity comes from the element
  // binding rather than from "the first pin on the layer".
  await page.waitForFunction(
    (id) => [...document.querySelectorAll(".pin")].some((pin) => pin.dataset.elementId === id),
    target.id,
    { timeout: 4000 },
  );
  await page.evaluate(() => document.querySelector(".pin-card")?.remove());
  const pin = page.locator(`.pin[data-element-id="${target.id}"]`).first();
  // The pin is appended before the layer finishes laying out; wait for it to be
  // visible so its box exists.
  await pin.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  const pinBefore = await pin.boundingBox();
  if (!pinBefore) fail("pin has no box before move");
  const nextBounds = [target.bounds[0] + 180, target.bounds[1] + 110, target.bounds[2], target.bounds[3]];
  await command(page, { cmd: "select", elementId: target.id });
  await command(page, { cmd: "setBounds", bounds: nextBounds });
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator("#btn-comments").click();
  await page.waitForSelector(`.pin[data-element-id="${target.id}"]`, { timeout: 5000 });
  const pinAfter = await page.locator(`.pin[data-element-id="${target.id}"]`).first().boundingBox();
  if (!pinAfter) fail("pin missing after element move");
  const dx = Math.abs(pinAfter.x - pinBefore.x);
  const dy = Math.abs(pinAfter.y - pinBefore.y);
  if (dx < 12 && dy < 12) fail(`pin did not follow element: before=${JSON.stringify(pinBefore)} after=${JSON.stringify(pinAfter)}`);
  await page.screenshot({ path: shot("pin"), fullPage: false });
  pass(`comment pin moved dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
  // The edit/comment mode pill was retired; the comment action toggles the layer.
  await page.evaluate(() => document.getElementById("btn-comments")?.click());
  await page.waitForFunction(() => document.getElementById("comment-layer")?.hidden, null, { timeout: 4000 });

  // --- 4. chart cell invalid input ---
  // Chart insertion is retired from the editor UI by design (decks get charts
  // from the agent), so seed the element through the command path and select it
  // on the canvas before driving the data editor.
  await command(page, { cmd: "insert", kind: "chart" });
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator("#slide .el.chart").first().click();
  await page.waitForSelector("#ctx-bar:not([hidden])", { timeout: 8000 });
  await page.locator('#ctx-bar [data-control="element.chart.data.set"]').click();
  await page.waitForSelector("#chart-overlay:not([hidden])", { timeout: 5000 });
  const modelBeforeChart = await apiJson(page, "/api/model");
  const chartEl = (modelBeforeChart.model?.elements || []).find((e) => e.type === "chart");
  if (!chartEl) fail("inserted chart missing from model");
  const prevVal = Number(chartEl.chartData?.rows?.[0]?.[1]);
  if (!Number.isFinite(prevVal)) fail(`chart first value is not numeric: ${chartEl.chartData?.rows?.[0]?.[1]}`);
  const valueInput = page.locator("#chart-grid tr:not(.add-row) td input").nth(1);
  await valueInput.fill("abc");
  await valueInput.dispatchEvent("input");
  await valueInput.dispatchEvent("change");
  await page.waitForTimeout(400);
  const invalid = await page.locator("#chart-grid input.is-invalid").count();
  if (!invalid) fail("typing abc did not mark chart input .is-invalid");
  const modelAfterChart = await apiJson(page, "/api/model");
  const chartAfter = (modelAfterChart.model?.elements || []).find((e) => e.id === chartEl.id) ||
    (modelAfterChart.model?.elements || []).find((e) => e.type === "chart");
  const afterVal = Number(chartAfter?.chartData?.rows?.[0]?.[1]);
  if (afterVal !== prevVal) fail(`invalid chart input overwrote ${prevVal} with ${afterVal}`);
  await page.screenshot({ path: shot("chart"), fullPage: false });
  pass(`chart abc rejected; model kept ${prevVal}`);

  // --- 5. present mode hides chrome ---
  // The rejected chart draft above leaves the data overlay and a pending local
  // commit behind; close and reload so the chrome under test starts clean.
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator("#slide .el.text, #slide .el.chart, #slide .el").first().click({ force: true });
  await page.waitForSelector("#ctx-bar:not([hidden])", { timeout: 4000 });
  await page.locator("#btn-play").click();
  await page.waitForSelector("#present:not([hidden])", { timeout: 4000 });
  const pillHidden = await page.locator("#insert-toolbar").isHidden();
  const ctxHidden = await page.locator("#ctx-bar").isHidden();
  if (!pillHidden) fail("insert toolbar still visible in present mode");
  if (!ctxHidden) fail("ctx-bar still visible in present mode");
  await page.screenshot({ path: shot("present"), fullPage: false });
  pass("present mode hides insert toolbar + ctx-bar");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("present")?.hidden, null, { timeout: 4000 });
  pass("Escape exits present mode");

  // --- 6. rail insert line during drag ---
  const railOpen = await page.locator("#rail").isVisible();
  if (!railOpen) await page.locator("#btn-rail").click();
  await page.waitForSelector("#rail .thumb", { timeout: 4000 });
  const thumbCount = await page.locator("#rail .thumb").count();
  if (thumbCount < 3) fail(`need 3 rail thumbs, got ${thumbCount}`);
  const t1 = await page.locator("#rail .thumb").nth(0).boundingBox();
  const t3 = await page.locator("#rail .thumb").nth(2).boundingBox();
  if (!t1 || !t3) fail("rail thumbs missing boxes");
  await page.mouse.move(t1.x + t1.width / 2, t1.y + t1.height / 2);
  await page.mouse.down();
  await page.mouse.move(t3.x + t3.width / 2, t3.y + t3.height / 2, { steps: 16 });
  await page.waitForSelector(".rail-insert-line:not([hidden])", { timeout: 4000 });
  const lineVisible = await page.locator(".rail-insert-line").isVisible();
  if (!lineVisible) fail("rail insert line not visible during drag");
  await page.screenshot({ path: shot("rail"), fullPage: false });
  pass("rail insert line visible during drag");
  await page.mouse.up();

  console.log(`shot  ${shot("*")}`);
  console.log("OK    verify-prd-gaps");
} finally {
  await browser.close();
  cleanupFixtures();
}
