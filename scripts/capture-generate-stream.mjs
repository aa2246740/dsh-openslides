import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import path from "node:path";
import fs from "node:fs";
import { requireExternalModelConsent } from "./qa/external-model-consent.mjs";

const out = path.resolve("docs/editor-oracle/runs/uiux-recreate");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "边缘推理平台 Q3 路线图";
requireExternalModelConsent({ script: "capture-generate-stream", brief: BRIEF });
fs.mkdirSync(out, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#brief");
await page.fill("#brief", BRIEF);
await page.click("#btn-send");
await page.waitForSelector(".agent-screen:not([hidden])");
await page.waitForSelector(".tool-row");
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, "22-generate-stream.png"), fullPage: false });
console.log("shot 22-generate-stream.png");
await browser.close();
