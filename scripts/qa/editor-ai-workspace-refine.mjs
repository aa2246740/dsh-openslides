#!/usr/bin/env node
/**
 * Refine send acceptance (feature 4).
 * Temp 1-page-ish project (fixture copy): send minimal refine
 * 「把标题改成 验收测试」, assert honest state-machine boundary:
 * - agent-turn appears, error bubble surfaces "没有可继续对话的 DSH Agent 会话"
 * - no fake success: title unchanged in /api/model AND after reload
 * - no version created for the failed turn
 * Full title-change + persistence needs a real LLM turn (REQUIRES_REAL_MODEL).
 *   node scripts/qa/editor-ai-workspace-refine.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, clickUi, readModel, assertPersisted, BASE, ROOT } from "./gestures.mjs";

const FIXTURE_SRC = path.join(ROOT, "fixtures/okp-yu7-ppt");
const FIXTURE = "fixtures/okp-yu7-ppt";
const REFINE_TEXT = "把标题改成 验收测试";

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  throw new Error(msg);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ai-refine-"));
const proj = path.join(scratch, "one-page");
fs.cpSync(FIXTURE_SRC, proj, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
let failed = false;
try {
  await openEditor(page, proj);
  await page.waitForTimeout(800);
  const before = await readModel(page);
  const titleBefore = before.model?.title || "";
  if (!titleBefore) fail("temp project has no title");
  pass(`temp title before: ${titleBefore.slice(0, 24)}`);

  const ver0 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    return (await r.json()).versions || [];
  });

  if (await page.evaluate(() => document.getElementById("work-chat")?.hidden)) {
    await clickUi(page, "#btn-sparkles");
    await page.waitForTimeout(600);
  }
  await page.locator("#work-brief").fill(REFINE_TEXT);
  const targetLabel = await page.evaluate(() => document.getElementById("work-target")?.textContent);
  if (!targetLabel) fail("#work-target should label the refine scope");
  pass(`refine target labelled: ${targetLabel.slice(0, 30)}`);

  await clickUi(page, "#work-form .composer-send");
  // State machine boundary: agent-turn row appears (spinner/running state).
  await page.waitForSelector("#work-thread .agent-turn", { timeout: 8000 });
  pass("agent-turn row appears (state machine entered)");

  // Honest terminal state for a session-less temp: error bubble, not fake success.
  await page.waitForFunction(
    () => [...document.querySelectorAll("#work-thread .bubble, #work-thread .agent-complete")].some((n) => /没有可继续对话的 DSH Agent 会话/.test(n.textContent || "")),
    null,
    { timeout: 20000 },
  );
  pass("honest error surfaced (no DSH session, no fake success)");

  const toastHidden = await page.evaluate(() => document.getElementById("app-toast")?.hidden);
  // Toast is for success; error path uses bubble. Just record, do not require toast.
  console.log(`INFO toast hidden after failed refine: ${toastHidden}`);

  const briefEnabled = await page.evaluate(() => !document.getElementById("work-brief")?.disabled);
  if (!briefEnabled) fail("#work-brief should be re-enabled after terminal error");
  pass("composer re-enabled after terminal state");

  const after = await readModel(page);
  if ((after.model?.title || "") !== titleBefore) {
    fail(`title must NOT change on failed refine: ${JSON.stringify(after.model?.title)}`);
  }
  pass("title unchanged in /api/model (no fake edit)");

  const ver1 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    return (await r.json()).versions || [];
  });
  if (ver1.length !== ver0.length) {
    fail(`failed refine must not create a version (${ver0.length} -> ${ver1.length})`);
  }
  pass("no version created for failed refine");

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    if ((again.model?.title || "") !== titleBefore) throw new Error("title drifted after reload");
  });
  pass("reload persistence: title still original");

  console.log("REQUIRES_REAL_MODEL: title-change + toast + persisted edit needs a live DSH turn (session + pi-xai/grok); temp has no session so only the honest error boundary is covered.");
  console.log("OK    editor-ai-workspace-refine");
} catch (err) {
  failed = true;
  console.error(`FAIL editor-ai-workspace-refine: ${err?.message || err}`);
  try {
    await page.screenshot({ path: "output/qa-ai-workspace-refine-fail.png" });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(scratch, { recursive: true, force: true });
  try {
    await fetch(`${BASE}/api/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: FIXTURE, page: 0 }),
    });
  } catch {}
  if (failed && process.exitCode == null) process.exitCode = 1;
}
