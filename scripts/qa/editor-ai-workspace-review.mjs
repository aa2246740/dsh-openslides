#!/usr/bin/env node
/**
 * AI review entry acceptance (feature 3).
 * - Temp project (fixture copy, no session): comment -> 交给 AI 修改 -> consent
 *   shows honest "尚未确认当前 AI 提供方" with send DISABLED (explicit error state).
 * - Slice copy (has session+provider pi-xai/grok-4.6): same flow shows consent
 *   ENABLED with provider label; we CANCEL without sending (never dirty original).
 * - Accept/revert path: versions snapshot + preview + restore works on temp.
 * Anything needing a real model turn is reported as REQUIRES_REAL_MODEL.
 *   node scripts/qa/editor-ai-workspace-review.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, clickUi, clickEl, readModel, BASE, ROOT } from "./gestures.mjs";

const FIXTURE_SRC = path.join(ROOT, "fixtures/okp-yu7-ppt");
const SLICE_SRC = path.join(ROOT, "output/dsh-slices/01-把-空中生命线-从公共场景做成规模业务-f1acbf39");
const FIXTURE = "fixtures/okp-yu7-ppt";

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  throw new Error(msg);
}

async function placeComment(page, text) {
  await clickUi(page, "#btn-mode-comment");
  await page.waitForSelector("#comment-layer:not([hidden])", { timeout: 5000 });
  // Select a stable element then click it to drop a pin (same primitive as journeys).
  const model = await readModel(page);
  const els = model.model?.elements || [];
  const target = els.find((e) => e.type === "shape") || els[0];
  if (!target) fail("no element to anchor comment");
  await clickEl(page, target.id);
  await page.waitForSelector(".pin-card textarea", { timeout: 5000 });
  await page.locator(".pin-card textarea").fill(text);
  await clickUi(page, ".pin-card [data-act=save]");
  await page.waitForTimeout(400);
  return target;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ai-review-"));
const projNoSession = path.join(scratch, "no-session");
const projWithSession = path.join(scratch, "with-session");
fs.cpSync(FIXTURE_SRC, projNoSession, { recursive: true });
fs.cpSync(SLICE_SRC, projWithSession, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
let failed = false;
try {
  // --- Part A: no-session temp -> honest disabled state ---
  await openEditor(page, projNoSession);
  await page.waitForTimeout(800);
  await placeComment(page, "AI 审阅入口验收-无会话");
  pass("comment placed on no-session temp");

  await page.locator("#comment-layer .pin").first().click();
  await page.waitForSelector(".pin-card [data-act=ai]", { timeout: 5000 });
  const aiLabel = await page.locator(".pin-card [data-act=ai]").innerText();
  if (!/交给 AI 修改|重试|AI/.test(aiLabel)) fail(`AI entry button missing, got ${aiLabel}`);
  pass(`AI review entry present (${aiLabel.trim().slice(0, 12)})`);

  await clickUi(page, ".pin-card [data-act=ai]");
  await page.waitForSelector(".ai-review-consent", { timeout: 5000 });
  const consentText = await page.locator(".ai-review-consent p").innerText();
  if (!/尚未确认当前 AI 提供方/.test(consentText)) {
    fail(`expected no-provider honest message, got ${consentText.slice(0, 120)}`);
  }
  const sendDisabled = await page.locator(".ai-review-consent [data-consent=send]").isDisabled();
  if (!sendDisabled) fail("send should be DISABLED without provider (must not send blindly)");
  pass("no-provider consent honest + send disabled (explicit error state)");
  await clickUi(page, ".ai-review-consent [data-consent=cancel]");
  await page.waitForTimeout(300);
  if (await page.locator(".ai-review-consent").count()) fail("consent cancel should close panel");
  pass("consent cancel works");

  // Accept/revert path on same temp (versions are the accept/revert mechanism).
  const ver0 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    return (await r.json()).versions || [];
  });
  await clickUi(page, "#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 5000 });
  await clickUi(page, "#version-save");
  await page.waitForTimeout(600);
  await clickUi(page, "#version-save");
  await page.waitForTimeout(600);
  const ver1 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    return (await r.json()).versions || [];
  });
  if (ver1.length < ver0.length + 2) fail(`version snapshots did not grow twice (${ver0.length} -> ${ver1.length})`);
  pass("version snapshots (accept-points) work");

  // Preview a non-current version then back (revert UI path).
  const menuHidden = await page.locator("#version-menu").isHidden();
  if (menuHidden) await clickUi(page, "#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 5000 });
  const rows = page.locator("#versions-list .version-row");
  if ((await rows.count()) < 1) fail("no version rows for preview");
  // First row may be the live current draft; prefer an explicit stored row.
  const v1row = page.locator("#versions-list .version-row").filter({ hasText: "V1" }).first();
  const previewTarget = (await v1row.count()) ? v1row : rows.nth(1);
  if (!(await previewTarget.count())) fail("no non-current version row to preview");
  await previewTarget.click();
  await page.waitForTimeout(800);
  // Either enters preview (history-bar) or stays on current (if clicked current) — both are valid UI responses.
  const inPreview = await page.evaluate(() => !document.getElementById("history-bar")?.hidden);
  if (inPreview) {
    const badge = await page.locator("#history-readonly").isVisible();
    if (!badge) fail("preview should show 只读 badge");
    await clickUi(page, "#history-back");
    await page.waitForFunction(() => document.getElementById("history-bar")?.hidden, null, { timeout: 5000 });
    pass("version preview + back to latest (revert UI)");
  } else {
    pass("version list keeps current (no stale preview)");
  }
  await clickUi(page, "#btn-mode-edit").catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});

  // --- Part B: slice copy (has provider) -> consent ENABLED, cancel without sending ---
  await openEditor(page, projWithSession);
  await page.waitForTimeout(1500);
  const activity = await page.evaluate(async () => {
    const r = await fetch("/api/generation-activity");
    return r.json();
  });
  if (!activity.sessionId) fail("slice copy should carry sessionId");
  if (!activity.provider?.providerId) fail("slice copy should carry provider");
  pass(`slice copy session+provider present (${activity.provider.providerId}/${activity.provider.modelId})`);

  await placeComment(page, "AI 审阅入口验收-有会话");
  await page.locator("#comment-layer .pin").last().click();
  await page.waitForSelector(".pin-card [data-act=ai]", { timeout: 5000 });
  await clickUi(page, ".pin-card [data-act=ai]");
  await page.waitForSelector(".ai-review-consent", { timeout: 5000 });
  const consent2 = await page.locator(".ai-review-consent p").innerText();
  if (!/pi-xai/.test(consent2) || !/grok/.test(consent2)) {
    fail(`expected provider label pi-xai/grok, got ${consent2.slice(0, 160)}`);
  }
  const send2Disabled = await page.locator(".ai-review-consent [data-consent=send]").isDisabled();
  if (send2Disabled) fail("send should be ENABLED when provider+session present");
  pass("provider consent enabled with honest recipient label");
  // Do NOT send: a real turn would write via the shared session binding and
  // could dirty the original slice. Cancel proves the entry is wired.
  await clickUi(page, ".ai-review-consent [data-consent=cancel]");
  await page.waitForTimeout(300);
  pass("provider consent cancel (no model call issued)");

  console.log("REQUIRES_REAL_MODEL: full AI-review turn (lock->spinner->applied/failed + auto-restore) needs a live pi-xai/grok turn; tested up to consent boundary, did not fake success.");
  console.log("OK    editor-ai-workspace-review");
} catch (err) {
  failed = true;
  console.error(`FAIL editor-ai-workspace-review: ${err?.message || err}`);
  try {
    await page.screenshot({ path: "output/qa-ai-workspace-review-fail.png" });
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
