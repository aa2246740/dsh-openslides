#!/usr/bin/env node
/**
 * Browser verification for native-web chart tool (type switch + data editor).
 *   node scripts/verify-chart-tool.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import { cleanupFixtures } from "./qa/gestures.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const URL = `${BASE}/index.html?project=fixtures/okp-yu7-ppt`;
const OUT = path.resolve("output/verify-chart-tool.png");
// The chart is seeded into the real fixture project through the command path, so
// snapshot the tree first and put it back afterwards.
cleanupFixtures();

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
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

async function chartSvg(page) {
  return page.evaluate(() => {
    const node = document.querySelector("#slide .el.selected svg") || document.querySelector("#slide .el.chart svg");
    return node ? node.innerHTML : "";
  });
}

async function waitSvg(page, kind, timeout = 8000) {
  await page.waitForFunction(
    (want) => {
      const node = document.querySelector("#slide .el.selected svg") || document.querySelector("#slide .el.chart svg");
      if (!node) return false;
      const html = node.innerHTML;
      if (want === "line") return html.includes("<polyline");
      if (want === "pie") return html.includes("<path");
      if (want === "area") return html.includes("<polygon");
      if (want === "bar") return html.includes("<rect") && !html.includes("<polyline") && !html.includes("<path");
      if (want === "has-D") return html.includes(">D<");
      if (want === "no-D") return !html.includes(">D<");
      return false;
    },
    kind,
    { timeout },
  );
}

async function switchType(page, label, kind) {
  const wrap = page.locator("#pop-chart-type");
  if (!(await wrap.locator(".ctx-pop").isVisible().catch(() => false))) {
    await wrap.locator("button.ctx-icon").click();
  }
  await page.locator("#pop-chart-type .ctx-btn", { hasText: label }).click();
  await waitSvg(page, kind);
  const html = await chartSvg(page);
  if (kind === "line" && !html.includes("<polyline")) fail("line type did not paint polyline");
  if (kind === "pie" && !html.includes("<path")) fail("pie type did not paint path slices");
  if (kind === "bar" && (html.includes("<polyline") || html.includes("<path"))) {
    fail("bar type still looks like line/pie");
  }
  if (kind === "bar" && !html.includes("<rect")) fail("bar type missing rects");
  const ctx = page.locator("#ctx-bar");
  if (await ctx.isHidden()) fail("ctx-bar closed after type switch");
  if (!(await page.locator("#slide .el.selected").count())) fail("chart deselected after type switch");
  pass(`type → ${label} (${kind})`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await waitReady(page);
  pass("editor loaded");

  // Chart insertion is retired as a UI affordance (decks get charts from the
  // agent; hand-editing belongs in PowerPoint). Insert through the command path
  // and keep verifying the chart's own type / colour / axis / data editor.
  const insertedChart = await page.evaluate(async () => {
    const project = new URLSearchParams(location.search).get("project") || "";
    const res = await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "insert", kind: "chart" }),
    });
    const data = await res.json();
    return { status: res.status, error: data.error ?? null };
  });
  if (insertedChart.status !== 200) fail(`chart insert command failed: ${insertedChart.error}`);
  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator("#slide .el.chart").first().click();
  await page.waitForSelector("#ctx-bar #pop-chart-type", { timeout: 8000 });
  pass("chart inserted via command; type popover present");

  if (!(await page.locator("#pop-chart-color").count())) fail("missing pop-chart-color");
  if (!(await page.locator("#pop-chart-axis").count())) fail("missing pop-chart-axis");
  pass("color + axis popovers present");

  const first = await chartSvg(page);
  if (!first.includes("<rect")) fail("inserted chart is not a bar chart");
  pass("inserted chart is bar");

  await switchType(page, "折线", "line");
  await switchType(page, "饼图", "pie");
  await switchType(page, "柱状", "bar");

  await page.locator('#ctx-bar [data-control="element.chart.data.set"]').click();
  await page.waitForSelector("#chart-overlay:not([hidden])", { timeout: 5000 });
  pass("编辑数据 overlay open");

  const seriesHeader = page.locator("#chart-grid th.s1 input").first();
  await seriesHeader.fill("营收");
  await seriesHeader.dispatchEvent("change");
  pass("renamed series header to 营收");

  await page.locator("#chart-overlay button", { hasText: "+ 行" }).click();
  await page.waitForTimeout(400);
  const dataRows = page.locator("#chart-grid tr:not(.add-row)");
  const rowCount = await dataRows.count();
  if (rowCount < 5) fail(`expected header+4 data rows after +行, got ${rowCount}`);
  const newRow = dataRows.nth(rowCount - 1);
  await newRow.locator("td input").nth(0).fill("D");
  const val = newRow.locator("td input").nth(1);
  await val.fill("7");
  await val.dispatchEvent("change");
  await page.waitForTimeout(500);
  await waitSvg(page, "has-D");
  const withD = await chartSvg(page);
  if (!withD.includes(">D<")) {
    fail(`chart svg missing category D after add: ${withD.slice(0, 400)}`);
  }
  pass("added row D=7; bar for D present");

  await newRow.hover();
  await newRow.locator(".chart-del").click();
  await page.waitForTimeout(600);
  await waitSvg(page, "no-D");
  pass("deleted row D");

  await page.evaluate(() => {
    const slide = document.getElementById("slide");
    if (!slide) return;
    slide.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.getElementById("chart-overlay")?.hidden, null, { timeout: 4000 });
  pass("overlay closed by slide click");

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`shot  ${OUT}`);
  console.log("OK    verify-chart-tool");
} finally {
  await browser.close();
  cleanupFixtures();
}
