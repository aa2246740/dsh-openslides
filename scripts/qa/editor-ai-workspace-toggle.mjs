#!/usr/bin/env node
/**
 * AI workspace toggle acceptance (feature 1).
 * Covers #btn-sparkles / #chat-close switching #work-chat, stable across 2 cycles.
 * Uses live editor on BASE (default 55200). No restart, no mutation.
 *   node scripts/qa/editor-ai-workspace-toggle.mjs
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, clickUi } from "./gestures.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const PROJECT = process.env.QA_PROJECT || "fixtures/okp-yu7-ppt";

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  throw new Error(msg);
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
let failed = false;
try {
  await openEditor(page, PROJECT);
  await page.waitForTimeout(800);

  // Ensure known start: workspace hidden.
  const initiallyHidden = await page.evaluate(() => document.getElementById("work-chat")?.hidden);
  if (!initiallyHidden) {
    await clickUi(page, "#chat-close");
    await page.waitForTimeout(300);
  }
  if (!(await page.evaluate(() => document.getElementById("work-chat")?.hidden))) {
    fail("workspace should start hidden");
  }
  pass("workspace starts hidden");

  for (let i = 0; i < 2; i += 1) {
    await clickUi(page, "#btn-sparkles");
    await page.waitForFunction(() => !document.getElementById("work-chat")?.hidden, null, { timeout: 5000 });
    const briefFocused = await page.evaluate(() => document.activeElement?.id === "work-brief");
    if (!briefFocused) fail(`cycle ${i}: #work-brief should gain focus on open`);
    const composerVisible = await page.locator("#work-form").isVisible();
    if (!composerVisible) fail(`cycle ${i}: #work-form should be visible when workspace open`);
    pass(`cycle ${i} open via #btn-sparkles`);

    await clickUi(page, "#chat-close");
    await page.waitForFunction(() => document.getElementById("work-chat")?.hidden, null, { timeout: 5000 });
    pass(`cycle ${i} close via #chat-close`);
  }

  // Toggle via sparkles when open should also close (toggle behaviour).
  await clickUi(page, "#btn-sparkles");
  await page.waitForFunction(() => !document.getElementById("work-chat")?.hidden, null, { timeout: 5000 });
  await clickUi(page, "#btn-sparkles");
  await page.waitForFunction(() => document.getElementById("work-chat")?.hidden, null, { timeout: 5000 });
  pass("sparkles toggles closed when already open");

  // No dead-button: both controls responded with DOM change within timeout.
  console.log("OK    editor-ai-workspace-toggle");
} catch (err) {
  failed = true;
  console.error(`FAIL editor-ai-workspace-toggle: ${err?.message || err}`);
  try {
    await page.screenshot({ path: "output/qa-ai-workspace-toggle-fail.png" });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  // Self-cleaning: restore live project to fixture (no mutation was made, but
  // another tab may have changed it; reopen is idempotent).
  try {
    await fetch(`${BASE}/api/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: PROJECT, page: 0 }),
    });
  } catch {}
  if (failed && process.exitCode == null) process.exitCode = 1;
}
