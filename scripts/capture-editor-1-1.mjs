import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const repo = path.resolve(".");
const out = path.resolve("docs/editor-oracle/runs/uiux-recreate");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
fs.mkdirSync(out, { recursive: true });

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-"));
fs.cpSync(path.join(repo, "fixtures/syn-empty"), scratch, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (name) => {
  const p = path.join(out, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log("shot", name);
};

await page.goto(`${BASE}/?project=${encodeURIComponent(scratch)}`, {
  waitUntil: "networkidle",
});
await page.waitForSelector("#doc-title");
await page.waitForTimeout(400);

await page.click('[data-control="insert.text"]');
await page.waitForTimeout(250);
await shot("14-ctx-text.png");

await page.click('[data-control="insert.shape"]');
await page.waitForSelector("#shape-grid .shape-cell");
await page.locator("#shape-grid .shape-cell").first().click();
await page.waitForTimeout(250);
await shot("15-ctx-shape.png");

await page.click('[data-control="insert.chart"]');
await page.waitForTimeout(350);
await shot("16-ctx-chart.png");
await page.click('[data-control="element.chart.data.set"]');
await page.waitForTimeout(250);
await shot("17-chart-edit-data.png");
await page.locator("#slide").click({ position: { x: 40, y: 40 } });

await page.locator("#slide").click({ button: "right", position: { x: 80, y: 80 } });
await page.waitForTimeout(200);
await shot("18-context-menu.png");
await page.keyboard.press("Escape");

await page.click('[data-insert="more"]');
await page.waitForTimeout(150);
await page.click('[data-insert="smartart"]');
await page.waitForSelector("#smartart-palette button[data-layout=process]");
await page.click("#smartart-palette button[data-layout=process]");
await page.waitForTimeout(400);
await shot("19-smartart-process.png");
await page.click('[data-control="element.smartart.layout.set"]');
await page.waitForTimeout(200);
await shot("20-smartart-layout-pop.png");

// black-gold finance deck cover (generated palette fix)
const finance = path.join(repo, "output/ab-black-gold");
if (fs.existsSync(finance)) {
  await page.goto(`${BASE}/?project=${encodeURIComponent(finance)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#doc-title");
  await page.waitForTimeout(400);
  await shot("21-black-gold-cover.png");
}

await browser.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log("ok", out);
