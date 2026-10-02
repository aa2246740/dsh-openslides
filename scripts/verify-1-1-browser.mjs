import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const repo = path.resolve(".");
const out = path.resolve("docs/editor-oracle/runs/iframe-compare");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
fs.mkdirSync(out, { recursive: true });

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-verify-"));
fs.cpSync(path.join(repo, "fixtures/syn-empty"), scratch, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (name) => {
  const p = path.join(out, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log("shot", name);
};

const url = `${BASE}/?project=${encodeURIComponent(scratch)}`;

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#doc-title");
await page.waitForTimeout(500);

// The bottom "更多" menu and its theme surface are retired by design (manual
// editing belongs in PowerPoint), so the parity run starts at the surviving
// chrome: keyboard help.
await page.keyboard.press("Shift+/");
await page.waitForTimeout(200);
if (await page.locator("#kbd-help").isHidden()) throw new Error("keyboard help did not open");
await shot("31-keyboard-help.png");
await page.keyboard.press("Escape");

await page.click('[data-control="insert.text"]');
await page.waitForTimeout(300);
await page.locator('[data-control="element.text.toolbar.list.set"]').first().click();
await page.waitForTimeout(250);
if (!(await page.locator('[data-control="element.text.toolbar.list.set"].on').count())) {
  throw new Error("bullet list toggle did not activate");
}
await shot("32-text-list.png");

await page.click('[data-control="insert.shape"]');
await page.waitForSelector("#shape-grid .shape-cell");
await page.locator("#shape-grid .shape-cell").first().click();
await page.waitForTimeout(300);
await page.locator('.ctx-icon[data-control="element.shape.fill.set"]').first().click();
await page.waitForTimeout(150);
const grad = page.locator('[data-control="element.shape.fill.set"]', { hasText: "渐变" });
if (!(await grad.count())) throw new Error("gradient fill control missing");
await grad.first().click();
await page.waitForTimeout(250);
await shot("33-shape-gradient.png");

// Chart insertion is retired as a UI affordance, so the parity run inserts one
// through the command path and still captures its context bar and legend state.
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
if (insertedChart.status !== 200) throw new Error(`chart insert command failed: ${insertedChart.error}`);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#doc-title");
await page.locator("#slide .el.chart").first().click();
await page.waitForTimeout(400);
if (!(await page.locator("#ctx-bar .ctx-icon").count())) {
  throw new Error("chart selection ctx-bar is not the compact icon pill");
}
if (await page.locator("#ctx-bar > .ctx-btn").count()) {
  throw new Error("ctx-bar still dumps text buttons as direct children");
}
if (!(await page.locator('[data-control="element.chart.legend.set"].on').count())) {
  throw new Error("new chart should show legend on");
}
await page.click('[data-control="element.chart.legend.set"]');
await page.waitForTimeout(250);
if (await page.locator('[data-control="element.chart.legend.set"].on').count()) {
  throw new Error("legend toggle did not turn off");
}
await page.click('[data-control="element.chart.legend.set"]');
await page.waitForTimeout(250);
if (!(await page.locator('[data-control="element.chart.legend.set"].on').count())) {
  throw new Error("legend toggle did not turn back on");
}
await shot("34-chart-legend.png");

// SmartArt insertion and the theme menu are retired with the bottom menu, so
// they are no longer captured here; the SmartArt node controls remain live for
// agent-generated decks.

console.log("browser checks ok", { scratch });
await browser.close();
fs.rmSync(scratch, { recursive: true, force: true });
