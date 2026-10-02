import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import path from "node:path";
import fs from "node:fs";
import { requireExternalModelConsent } from "./qa/external-model-consent.mjs";

const out = path.resolve("docs/editor-oracle/runs/uiux-recreate");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "边缘推理平台 Q3 路线图";
requireExternalModelConsent({ script: "capture-generate-workspace", brief: BRIEF });
fs.mkdirSync(out, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url =
  `${BASE}/?generate=` +
  encodeURIComponent(BRIEF) +
  "&design=finance/black-gold-ledger&category=analysis-decision";
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#doc-title");
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, "23-generate-workspace.png"), fullPage: false });
console.log("shot 23-generate-workspace.png");
await page.waitForSelector(".refine-card", { timeout: 8000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, "24-generate-workspace-done.png"), fullPage: false });
console.log("shot 24-generate-workspace-done.png");
await browser.close();
