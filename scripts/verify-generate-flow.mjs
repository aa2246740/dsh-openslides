#!/usr/bin/env node
/**
 * Browser verification for in-editor generate flow after slimmed NDJSON done.
 *   node scripts/verify-generate-flow.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { requireExternalModelConsent } from "./qa/external-model-consent.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "测试生成流";
const URL = `${BASE}/index.html?project=fixtures/okp-yu7-ppt&generate=${encodeURIComponent(BRIEF)}`;
const OUT = path.resolve("output/verify-generate-flow.png");
requireExternalModelConsent({ script: "verify-generate-flow", brief: BRIEF });

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#work-chat:not([hidden])", { timeout: 15000 });
  pass("work-chat visible from ?generate=");

  await page.waitForSelector("#work-thread .tool-row", { timeout: 30000 });
  pass("tool rows appeared");

  await page.waitForSelector("#work-thread .refine-card", { timeout: 90000 });
  pass("refine / V-card appeared");

  const err = await page.locator("#work-thread .agent-complete .bubble").count();
  if (err) {
    const text = await page.locator("#work-thread .agent-complete .bubble").first().innerText();
    fail(`error bubble in agent-complete: ${text}`);
  }
  pass("no error bubble");

  const card = await page.locator("#work-thread .refine-card").innerText();
  if (!/已生成/.test(card) || !/V1/.test(card)) {
    fail(`refine-card missing V1 / page count: ${card}`);
  }
  pass(`refine-card: ${card.replace(/\s+/g, " ").trim()}`);

  await page.waitForSelector("#slide .el", { timeout: 15000 });
  const n = await page.locator("#slide .el").count();
  if (n < 1) fail("slide has no elements after generate");
  pass(`slide repainted with ${n} elements`);

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`shot  ${OUT}`);
  console.log("OK    verify-generate-flow");
} finally {
  await browser.close();
}
