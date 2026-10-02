#!/usr/bin/env node
/** Hub create requires MiniMax and rejects /api/generate. */
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

// The slides Hub deliberately listens on 13080 (docs/architecture/dsh-lock.md),
// not DSH.app's 3080, so default to that policy and honour the runtime override.
const BASE =
  process.env.BASE ||
  `http://127.0.0.1:${process.env.SLIDES_DSH_PORT || 13080}`;
const HUB = process.env.HUB_PATH || "/app/hub.html";
const OUT = path.resolve("output/verify-hub-flow.png");

function fail(message) {
  throw new Error(message);
}

async function waitHealth() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/slides/health`);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`DSH not healthy at ${BASE}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await waitHealth();

const legacy = await fetch(`${BASE}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ brief: "legacy fallback probe", model: "Playbook" }),
});
const legacyBody = await legacy.json().catch(() => ({}));
if (legacy.status !== 410) {
  fail(`Playbook product route was not 410: ${legacy.status} ${legacyBody.error || ""}`);
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${BASE}${HUB}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  if ((await page.locator("#model-menu").count()) !== 0) fail("legacy model menu remains");
  const wordmark = await page.locator(".wordmark").innerText();
  if (wordmark !== "Open SlideStudio") fail(`wordmark is ${wordmark}`);
  await page.screenshot({ path: OUT, fullPage: false });
  if (pageErrors.length) fail(`page errors: ${pageErrors.join(" | ")}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        rejectedLegacyRoute: true,
        wordmark,
        screenshot: OUT,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
