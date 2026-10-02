#!/usr/bin/env node
/**
 * Comment-triggered agent modification acceptance (feature 6).
 * Temp project (fixture copy):
 *  1. hash disk pages/*.page before
 *  2. leave an element-bound comment via the contextual comment popover
 *  3. verify comment persisted via /api/reviews + disk review-threads file
 *  4. attach comment to conversation -> composer send
 *     (no-session temp: honest error; no model call, no disk change)
 *  5. verify NO fake change: pages hash unchanged, /api/model title unchanged,
 *     reload keeps comment + title.
 * Real Agent write +落盘 needs a live DSH turn (REQUIRES_REAL_MODEL).
 *   node scripts/qa/editor-ai-workspace-comment-agent.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, clickUi, clickEl, assertPersisted, BASE, ROOT } from "./gestures.mjs";

const FIXTURE_SRC = path.join(ROOT, "fixtures/okp-yu7-ppt");
const FIXTURE = "fixtures/okp-yu7-ppt";
const COMMENT = "批注触发验收：请把标题改大一点";

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  throw new Error(msg);
}

function hashPages(proj) {
  const h = crypto.createHash("sha256");
  const pagesDir = path.join(proj, "pages");
  for (const f of fs.readdirSync(pagesDir).sort()) {
    if (!f.endsWith(".page")) continue;
    h.update(f);
    h.update(fs.readFileSync(path.join(pagesDir, f)));
  }
  return h.digest("hex");
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-ai-comment-"));
const proj = path.join(scratch, "comment-proj");
fs.cpSync(FIXTURE_SRC, proj, { recursive: true });
const pagesBefore = hashPages(proj);
// This QA may share a sidecar with the user's tab; never read its global model.
async function readProjectModel(page) {
  const response = await page.request.get(`${BASE}/api/model?project=${encodeURIComponent(proj)}`);
  if (!response.ok()) fail(`project model read failed: ${response.status()}`);
  const data = await response.json();
  if (data.model?.rootDir !== proj) fail('model belongs to a different project');
  return data;
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
let failed = false;
try {
  await openEditor(page, proj);
  await page.waitForTimeout(800);
  const before = await readProjectModel(page);
  const titleBefore = before.model?.title || "";
  const pagePath = (before.model?.pagePaths || [])[before.model?.pageIndex ?? 0];
  if (!pagePath) fail("no pagePath for review API");
  pass(`temp page ${pagePath}`);

  // 1. Leave a comment.
  const els = before.model?.elements || [];
  const anchor = els.find((e) => e.type === "shape") || els[0];
  if (!anchor) fail("no anchor element");
  await clickEl(page, anchor.id);
  await clickUi(page, "#btn-comments");
  await page.waitForSelector("#comment-panel:not([hidden])", { timeout: 5000 });
  await page.locator("#comment-draft").fill(COMMENT);
  await clickUi(page, "#comment-add");
  await page.waitForSelector("#work-comment-items .comment-attachment", { timeout: 5000 });
  await page.waitForTimeout(500);
  // Adding a comment leaves annotation mode, and pins are drawn only while the mode is on.
  if (await page.locator("#btn-comments[aria-pressed='true']").count()) fail("annotation mode should exit after a comment is added");
  await clickUi(page, "#btn-comments");
  await page.waitForSelector("#comment-layer .pin", { timeout: 5000 }).catch(() => fail("comment pin missing after save"));
  pass("element-bound comment saved via the contextual comment popover");

  // 2. Comment persisted via API + disk.
  const reviews = await page.evaluate(async ({ pp, project }) => {
    const r = await fetch(`/api/reviews?pagePath=${encodeURIComponent(pp)}&project=${encodeURIComponent(project)}`);
    return r.json();
  }, { pp: pagePath, project: proj });
  const saved = (reviews.comments || []).find((c) => String(c.text || "").includes("批注触发验收"));
  if (!saved) fail(`comment missing from /api/reviews: ${JSON.stringify(reviews).slice(0, 200)}`);
  pass("comment persisted via /api/reviews");
  const threadsFile = path.join(proj, "_agent", "review-threads.v1.json");
  if (!fs.existsSync(threadsFile)) fail("disk _agent/review-threads.v1.json missing");
  if (!fs.readFileSync(threadsFile, "utf8").includes("批注触发验收")) {
    fail("comment text missing from disk threads file");
  }
  pass("comment落盘 (_agent/review-threads.v1.json)");

  // 3. A saved comment is attached; only the composer may dispatch it.
  await page.locator("#comment-layer .pin").first().click();
  if (await page.locator('#comment-panel [data-act="ai"], #comment-panel [data-act="retry"]').count()) fail("duplicate dispatch entry");
  await page.locator('#work-comment-batch:not([hidden])').waitFor();
  await page.locator('#work-form .composer-send').click();
  await page.waitForFunction(()=>/没有 AI 对话记录/.test(document.getElementById('app-toast')?.textContent || ''));
  pass("one composer entry refuses a document without an AI session");

  // 4. No fake change: disk pages + model title unchanged.
  const pagesAfter = hashPages(proj);
  if (pagesAfter !== pagesBefore) fail("pages/*.page changed without a model turn (fake edit?)");
  pass("磁盘 pages/*.page unchanged (no fake落盘)");
  const after = await readProjectModel(page);
  if ((after.model?.title || "") !== titleBefore) fail("title changed without a model turn");
  pass("/api/model title unchanged");

  // 5. Reload: comment persists, title persists.
  await assertPersisted(page, async () => {
    const again = await readProjectModel(page);
    if ((again.model?.title || "") !== titleBefore) throw new Error("title drifted after reload");
  });
  // Re-enter comment mode after reload to check pin survived.
  await clickUi(page, "#btn-comments");
  await page.waitForTimeout(600);
  const pinsAfter = await page.locator("#comment-layer .pin, #comment-rail").count().catch(() => 0);
  console.log(`INFO pins/rail nodes after reload: ${pinsAfter}`);
  const reviewsAfter = await page.evaluate(async ({ pp, project }) => {
    const r = await fetch(`/api/reviews?pagePath=${encodeURIComponent(pp)}&project=${encodeURIComponent(project)}`);
    return r.json();
  }, { pp: pagePath, project: proj });
  if (!(reviewsAfter.comments || []).some((c) => String(c.text || "").includes("批注触发验收"))) {
    fail("comment missing after reload");
  }
  pass("reload: comment + title persist");

  console.log("REQUIRES_REAL_MODEL: Agent按批注改 + 真实落盘 needs a live DSH turn on a session-bound project; temp has no session so only comment persistence + honest trigger boundary is covered.");
  console.log("OK    editor-ai-workspace-comment-agent");
} catch (err) {
  failed = true;
  console.error(`FAIL editor-ai-workspace-comment-agent: ${err?.message || err}`);
  try {
    await page.screenshot({ path: "output/qa-ai-workspace-comment-agent-fail.png" });
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
