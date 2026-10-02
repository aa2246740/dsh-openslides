#!/usr/bin/env node
/** DSH Hub contract: MiniMax, 410 generate, no Pi kernel. */
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

// The slides Hub deliberately listens on 13080 (docs/architecture/dsh-lock.md),
// not DSH.app's 3080, so default to that policy and honour the runtime override.
const BASE =
  process.env.BASE ||
  `http://127.0.0.1:${process.env.SLIDES_DSH_PORT || 13080}`;
const HUB = process.env.HUB_PATH || "/app/hub.html";
const OUT = path.resolve("output/verify-product-kernel.png");

function fail(message) {
  throw new Error(message);
}

async function request(pathname, init) {
  const response = await fetch(`${BASE}${pathname}`, init);
  return { response, body: await response.json().catch(() => ({})) };
}

const health = await request("/slides/health");
if (!health.response.ok || health.body.product !== "DSH SlideStudio") {
  fail(`slides health failed: ${health.response.status} ${JSON.stringify(health.body)}`);
}
if (health.body.kernel !== "dsh") fail("product kernel is not dsh");
if (health.body.kimiRuntime === true) fail("production shell reports a Kimi runtime");

const legacy = await request("/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ brief: "route rejection probe" }),
});
if (legacy.response.status !== 410) {
  fail(`legacy generate was not 410: ${legacy.response.status} ${legacy.body.error || ""}`);
}

const pi = await request("/api/pi/auth");
if (pi.response.status !== 410) {
  fail(`Pi auth was not 410: ${pi.response.status}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
try {
  await page.goto(`${BASE}${HUB}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  const title = await page.title();
  if (!/DSH SlideStudio/.test(title)) fail(`browser title is not DSH SlideStudio: ${title}`);
  if ((await page.locator('iframe[src*="kimi" i]').count()) !== 0) fail("Kimi iframe found");
  const label = (await page.locator("#model-label").innerText()).trim();
  // The kernel is multi-provider by design (AGENTS.md non-negotiable 4), so the
  // hub must show whatever provider/model this install selected — never a
  // hard-coded vendor. Assert it matches the health selection instead.
  const selection = health.body?.selection || health.body?.connection || {};
  if (!label) fail("model label is empty");
  const expectedModel = String(selection.model || "").trim();
  if (expectedModel && label !== expectedModel) {
    fail(`model label ${JSON.stringify(label)} does not match the selected model ${JSON.stringify(expectedModel)}`);
  }
  await page.screenshot({ path: OUT, fullPage: false });
  console.log(
    JSON.stringify(
      {
        ok: true,
        runtime: "dsh",
        minimaxReady: health.body.minimaxReady,
        modelLabel: label,
        rejectedLegacyRoute: true,
        rejectedPiAuth: true,
        kimiIframe: false,
        screenshot: OUT,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
