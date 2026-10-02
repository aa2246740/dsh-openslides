#!/usr/bin/env node
/**
 * Hover feedback on Hub + editor chrome. Playwright hover + computed style.
 *   node scripts/verify-hover-chrome.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { openEditor, cleanupFixtures, restartNativeWebServer } from "./qa/gestures.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

async function assertHover(page, selector, name) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 8000 });
  await loc.evaluate((el) => {
    el.style.setProperty("transition", "none", "important");
  });
  const before = await loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundColor, s.color, s.transform, s.filter, s.boxShadow, s.cursor].join("|");
  });
  await loc.hover();
  await page.waitForTimeout(40);
  const after = await loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundColor, s.color, s.transform, s.filter, s.boxShadow, s.cursor].join("|");
  });
  if (before === after) {
    fail(`hover did not change paint on ${name} (${selector}): ${after}`);
  }
  pass(`hover ${name}`);
  return after;
}

async function assertTooltip(page, selector, expected) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 8000 });
  await loc.hover();
  const tip = page.locator("#ui-tooltip:not([hidden])");
  await tip.waitFor({ state: "visible", timeout: 1600 });
  const actual = (await tip.innerText()).trim();
  if (actual !== expected) fail(`tooltip ${selector}: expected ${expected}, got ${actual}`);
  const describedBy = await loc.getAttribute("aria-describedby");
  if (describedBy !== "ui-tooltip") fail(`tooltip ${selector} is not exposed via aria-describedby`);
  pass(`tooltip ${expected}`);
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  await assertHover(page, "#btn-attach", "Hub 附件");
  // #btn-kind is permanently hidden in the markup: Slides is the only output
  // kind, so the selector takes no part in this baseline.
  await assertHover(page, "#btn-layout", "Hub 版式");
  await assertHover(page, "#btn-model", "Hub 模型");
  await page.fill("#brief", "hover 核验");
  await assertHover(page, "#btn-send", "Hub 发送");
  // Style cards live inside the style popover, which opens from the style chip.
  await page.locator("#style-chip").click();
  const card = page.locator("#style-pop .style-reference-card").first();
  await card.waitFor({ state: "visible" });
  const imgBefore = await card.locator(".style-reference-preview").evaluate((el) => getComputedStyle(el).transform);
  await card.hover();
  await page.waitForTimeout(60);
  const imgAfter = await card.locator(".style-reference-preview").evaluate((el) => getComputedStyle(el).transform);
  if (imgBefore === imgAfter) fail(`hover did not lift Hub 模板卡 (transform ${imgAfter})`);
  pass("hover Hub 风格参考卡");
  // The old style-card hint text was retired with the copy rewrite; hover-lift is
  // the live contract, asserted above.
  await page.screenshot({ path: path.join(OUT_DIR, "qa-hover-hub.png") });

  await openEditor(page, PROJECT);
  await assertHover(page, "#btn-play", "放映");
  await assertHover(page, "#btn-export", "导出");
  // The bottom "更多" menu (消息 / 主题色) and the edit/comment mode pill are
  // retired by design, so they no longer take part in this baseline.
  await assertHover(page, "#btn-undo", "撤销");
  await assertHover(page, '[data-control="insert.text"]', "插入文本");
  await assertHover(page, '[data-control="insert.shape"]', "插入形状");
  await assertHover(page, '[data-control="insert.table"]', "插入表格");
  // insert.chart has no editor affordance by design; charts arrive from the agent.
  await assertHover(page, "#btn-notes-link", "显示演讲者备注");
  await assertTooltip(page, "#btn-fs", "全屏");
  await assertTooltip(page, "#btn-rail-view", "预览模式");
  await assertTooltip(page, "#btn-rail", "收起");
  await assertTooltip(page, "#btn-zoom-out", "缩小");
  await assertTooltip(page, "#btn-zoom-in", "放大");
  await assertTooltip(page, '[data-control="insert.text"]', "插入文本");
  await page.screenshot({ path: path.join(OUT_DIR, "qa-hover-editor.png") });

  await page.locator('#insert-toolbar [data-control="insert.table"]').first().click();
  await page.locator(`.table-size-cell[data-r="2"][data-c="2"]`).click();
  await page.waitForSelector("#slide .el.selected.table", { timeout: 8000 });
  const td = page.locator("#slide .el.selected.table td").first();
  await td.waitFor({ state: "visible" });
  const cursor = await td.evaluate((el) => getComputedStyle(el).cursor);
  if (cursor !== "grab") fail(`selected table cell cursor should be grab, got ${cursor}`);
  pass("selected table uses grab cursor");
  await td.hover();
  const tdBg = await td.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (!/rgb/.test(tdBg)) fail(`table cell hover background missing: ${tdBg}`);
  pass("table cell hover paints");

  await page.locator("#btn-export").click();
  await page.waitForSelector("#export-dialog[open]", { timeout: 4000 });
  await assertHover(page, "#export-pptx", "导出 PPTX 行");
  await page.keyboard.press("Escape");

  console.log("OK    verify-hover-chrome");
} finally {
  await browser.close();
  cleanupFixtures();
}
