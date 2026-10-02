#!/usr/bin/env node
/**
 * Generation history panel acceptance (feature 2).
 * Opens output/dsh-slices/01-把-空中生命线-从公共场景做成规模业务-f1acbf39
 * READ-ONLY. Verifies #editor-generation* shows persisted history entries.
 * Asserts disk untouched (deck.pptd + pages hash before/after).
 *   node scripts/qa/editor-ai-workspace-generation.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, clickUi, BASE, ROOT } from "./gestures.mjs";

const SLICE = "output/dsh-slices/01-把-空中生命线-从公共场景做成规模业务-f1acbf39";
const SLICE_ABS = path.join(ROOT, SLICE);
const FIXTURE = "fixtures/okp-yu7-ppt";

function hashTree() {
  const h = crypto.createHash("sha256");
  const files = ["deck.pptd"];
  const pagesDir = path.join(SLICE_ABS, "pages");
  for (const f of fs.readdirSync(pagesDir).sort()) files.push(path.join("pages", f));
  for (const rel of files) {
    const abs = path.join(SLICE_ABS, rel);
    if (fs.existsSync(abs)) {
      h.update(rel);
      h.update(fs.readFileSync(abs));
    }
  }
  // Include agent ledger size marker (read-only check must not grow versions).
  return h.digest("hex");
}

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  throw new Error(msg);
}

const beforeHash = hashTree();
const beforeVersions = await fetch(`${BASE}/api/versions`).then((r) => r.json()).catch(() => null);

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
let failed = false;
try {
  await openEditor(page, SLICE);
  await page.waitForTimeout(1200);

  // Workspace must be open to see the panel.
  if (await page.evaluate(() => document.getElementById("work-chat")?.hidden)) {
    await clickUi(page, "#btn-sparkles");
    await page.waitForTimeout(1500);
  }
  const genHidden = await page.evaluate(() => document.getElementById("editor-generation")?.hidden);
  if (genHidden) fail("#editor-generation should be visible for a generated project");
  pass("generation panel visible");

  const info = await page.evaluate(() => ({
    status: document.getElementById("editor-generation-status")?.textContent,
    stages: [...document.querySelectorAll("#editor-generation-stages span")].map((s) => ({
      stage: s.dataset.stage,
      cls: s.className,
    })),
    tiles: document.querySelectorAll("#editor-generation-pages span").length,
    written: document.querySelectorAll("#editor-generation-pages span.is-written").length,
    eventCount: document.getElementById("editor-generation-event-count")?.textContent,
    events: document.querySelectorAll("#editor-generation-event-list li").length,
    detail: document.getElementById("editor-generation-detail")?.textContent,
    formHidden: document.getElementById("work-form")?.hidden,
    lockHidden: document.getElementById("work-generation-lock")?.hidden,
  }));

  if (info.status !== "已完成") fail(`status expected 已完成, got ${JSON.stringify(info.status)}`);
  pass("status 已完成");

  for (const s of info.stages) {
    if (!s.cls.includes("is-done")) fail(`stage ${s.stage} should be is-done, got ${s.cls}`);
  }
  pass("all 4 stages is-done");

  if (info.tiles !== 21) fail(`expected 21 page tiles, got ${info.tiles}`);
  if (info.written !== 21) fail(`expected 21 written tiles, got ${info.written}`);
  pass("21/21 page tiles written");

  if (info.events !== 234) fail(`expected 234 event entries, got ${info.events}`);
  if (!/234/.test(info.eventCount || "")) fail(`event count label should contain 234, got ${info.eventCount}`);
  pass("234 tool/think event entries");

  if (!/共 21 页、234 条/.test(info.detail || "")) {
    fail(`detail should summarise 21 pages/234 records, got ${JSON.stringify(info.detail?.slice(0, 120))}`);
  }
  pass("detail summary retains full history");

  if (info.formHidden) fail("#work-form should be usable after complete (not locked)");
  if (!info.lockHidden) fail("generation lock should be hidden after complete");
  pass("composer unlocked after complete");

  // The panel-collapse toggle and the header stop button were retired: the
  // composer square is the single stop entry now, and the process flow is the
  // panel body so collapsing it changed nothing.
  for (const retired of ["#editor-generation-toggle", "#editor-generation-stop"]) {
    if (await page.locator(retired).isVisible()) fail(`${retired} should be retired (hidden)`);
  }
  pass("retired generation toggle/stop stay hidden");

  // API cross-check: DOM matches /api/generation-activity + /api/model.
  const activity = await page.evaluate(async () => {
    const r = await fetch("/api/generation-activity");
    return r.json();
  });
  if (activity.phase !== "complete") fail(`API phase expected complete, got ${activity.phase}`);
  if (activity.sessionId !== "f1acbf39-653f-4a8a-861b-69decc027207") {
    fail(`API sessionId mismatch: ${activity.sessionId}`);
  }
  if ((activity.events || []).length !== 234) fail(`API events expected 234, got ${(activity.events || []).length}`);
  pass("API generation-activity matches DOM (complete/234)");

  const model = await page.evaluate(async () => {
    const r = await fetch("/api/model");
    return r.json();
  });
  if ((model.model?.pageCount ?? 0) !== 21) fail(`API model pageCount expected 21, got ${model.model?.pageCount}`);
  pass("API model pageCount 21");

  console.log("OK    editor-ai-workspace-generation");
} catch (err) {
  failed = true;
  console.error(`FAIL editor-ai-workspace-generation: ${err?.message || err}`);
  try {
    await page.screenshot({ path: "output/qa-ai-workspace-generation-fail.png" });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  try {
    await fetch(`${BASE}/api/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: FIXTURE, page: 0 }),
    });
  } catch {}
  const afterHash = hashTree();
  if (afterHash !== beforeHash) {
    console.error(`FAIL slice was modified on disk (hash ${beforeHash.slice(0, 12)} -> ${afterHash.slice(0, 12)})`);
    process.exitCode = 1;
  } else {
    console.log("PASS slice read-only: disk hash unchanged");
  }
  if (failed && process.exitCode == null) process.exitCode = 1;
}
