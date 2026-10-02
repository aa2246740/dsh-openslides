#!/usr/bin/env node
/**
 * Batch comment submission acceptance: attach comments (across pages) and submit them
 * as ONE Agent turn from the left composer.
 *
 * Phase 1 — real server lock protocol (no UI):
 *   POST /api/reviews/ai-lock/batch acquires ONE project lock for comments on two
 *   pages (the guard file lists every comment), a second lock is refused, apply
 *   resolves them all and releases it, and a stale revision refuses the whole
 *   batch without touching any comment.
 * Phase 2 — the UI chain (real project server, stubbed DSH host session):
 *   automatic cross-page context + inline draft editing -> one composer send ->
 *   exactly one protected snapshot -> ONE turn carrying editorEdit.pages[] and
 *   reviewScope.items[] for every locked comment -> success resolves all of them.
 * Phase 3 — pre-accept rejection retains the draft; post-accept verification
 *   failure stays on its original message. Reopening and retry preserve the next
 *   draft and use the original submitted instruction, including at narrow widths.
 *
 * The Host session endpoints are stubbed because a scratch fixture has no DSH
 * generation ledger, so the browser (by design) refuses to dispatch a real turn;
 * the lock semantics themselves run against the real server in phase 1 and the
 * phase 2/3 stub mirrors that contract faithfully.
 *
 *   node scripts/qa/editor-comment-batch.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

import {editorReviewScopesFromEdit} from "../../packages/dsh-slides-host/dist/routes.js";
import {recordConversationMessage} from "../../packages/dsh-slides-host/dist/assistant-conversation.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function randomPort() {
  const holder = net.createServer();
  await new Promise((resolve, reject) => {
    holder.once("error", reject);
    holder.listen(0, "127.0.0.1", resolve);
  });
  const address = holder.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => holder.close(resolve));
  assert.ok(port > 0, "random QA port must be assigned");
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-comment-batch"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-comment-batch-"));
const project = path.join(scratch, "project");
fs.cpSync(path.join(ROOT, "fixtures/okp-yu7-ppt"), project, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const { loadProject: readFixture, saveProject: saveFixture } = await import("../../packages/pptd-v2/dist/index.js");
function simulateAuthorizedWrites(items) {
  const deck = readFixture(project);
  for (const item of items) {
    const scope = item.scope || item;
    const page = deck.pages.find(entry => path.basename(entry.path, ".page") === scope.pageId);
    assert.ok(page, "stub must find its authorized page");
    for (const element of page.page.elements) {
      if (scope.kind === "elements" && !scope.elementIds.includes(element.elementId)) continue;
      // Explicit model stub: only change an authorized object's geometry.
      element.bounds[0] += 1;
    }
  }
  saveFixture(deck);
}
const SESSION = "batch-session";
const GUARD = path.join(project, "_agent", "ai-review-lock.v1.json");
const COMMENT_IDS = ["batch-a", "batch-b", "batch-c"];
const report = {
  schemaVersion: "open-slidestudio.editor-comment-batch.v1",
  startedAt: new Date().toISOString(),
  base: BASE,
  project,
  steps: [],
  turnBodies: [],
  browserErrors: [],
};

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  report.steps.push({ name, detail, at: new Date().toISOString() });
}
function fail(message) {
  throw new Error(message);
}

let serverLog = "";
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), OPEN_SLIDESTUDIO_PROJECT: project },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {
    if (attempt === 79) fail(`native server did not start\n${serverLog}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function api(pathname, init) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}
async function mustApi(pathname, init) {
  const result = await api(pathname, init);
  if (result.status >= 400) fail(`${pathname} → ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}
const opened = await mustApi("/api/open", { method: "POST", body: JSON.stringify({ path: project, page: 0 }) });
const pagePaths = opened.model.pagePaths.slice(0, 2);
assert.equal(pagePaths.length, 2, "fixture must expose two pages");
const fixturePageBytes = new Map(pagePaths.map(name => [name, fs.readFileSync(path.join(project, name))]));
const firstPageElements = opened.model.elements.map((element) => element.id).slice(0, 2);
assert.equal(firstPageElements.length >= 2, true, "first page must expose two elements");

async function readReviews(pagePath) {
  const body = await mustApi(`/api/reviews?project=${encodeURIComponent(project)}&pagePath=${encodeURIComponent(pagePath)}`);
  return body.comments;
}
async function readAllReviews() {
  return (await mustApi(`/api/reviews?all=1&project=${encodeURIComponent(project)}`)).pages;
}
async function upsertComment(pagePath, comment) {
  return (await mustApi("/api/reviews", {
    method: "PATCH",
    body: JSON.stringify({ project, pagePath, comment }),
  })).comment;
}
async function commentOn(pagePath, id) {
  return (await readReviews(pagePath)).find((comment) => comment.id === id);
}
async function setStatus(pagePath, id, patch) {
  const comment = await commentOn(pagePath, id);
  if (!comment) return undefined;
  return upsertComment(pagePath, { ...comment, ...patch });
}
async function resetComments() {
  for (const [name, bytes] of fixturePageBytes) fs.writeFileSync(path.join(project, name), bytes);
  for (const [index, pagePath] of pagePaths.entries()) {
    const ids = index === 0 ? [COMMENT_IDS[0], COMMENT_IDS[1]] : [COMMENT_IDS[2]];
    for (const id of ids) {
      const comment = await commentOn(pagePath, id);
      if (!comment) continue;
      if (comment.aiStatus !== "idle" || comment.aiError) {
        await upsertComment(pagePath, { ...comment, aiStatus: "idle", aiError: null });
      }
    }
  }
}

await upsertComment(pagePaths[0], {
  id: COMMENT_IDS[0],
  text: "把标题改短一点",
  scope: { kind: "elements", elementIds: [firstPageElements[0]] },
});
await upsertComment(pagePaths[0], {
  id: COMMENT_IDS[1],
  text: "把标题颜色改深",
  scope: { kind: "elements", elementIds: [firstPageElements[1]] },
});
await upsertComment(pagePaths[1], {
  id: COMMENT_IDS[2],
  text: "这一页补一句结论",
  scope: { kind: "page", elementIds: [] },
});
pass("comments.seeded", `${pagePaths[0]}=2 · ${pagePaths[1]}=1`);

// ── Phase 1: the real server lock protocol ─────────────────────────────────
const lockItems = [
  { pagePath: pagePaths[0], commentId: COMMENT_IDS[0], commentRevision: (await commentOn(pagePaths[0], COMMENT_IDS[0])).revision },
  { pagePath: pagePaths[0], commentId: COMMENT_IDS[1], commentRevision: (await commentOn(pagePaths[0], COMMENT_IDS[1])).revision },
  { pagePath: pagePaths[1], commentId: COMMENT_IDS[2], commentRevision: (await commentOn(pagePaths[1], COMMENT_IDS[2])).revision },
];
const acquired = await api("/api/reviews/ai-lock/batch", {
  method: "POST",
  body: JSON.stringify({ project, items: lockItems }),
});
assert.equal(acquired.status, 200, `batch lock must be acquired: ${JSON.stringify(acquired.body)}`);
assert.equal(acquired.body.items.length, 3);
assert.deepEqual(acquired.body.items.map((item) => item.commentId).sort(), [...COMMENT_IDS].sort());
const guardAfterAcquire = JSON.parse(fs.readFileSync(GUARD, "utf8"));
assert.equal(guardAfterAcquire.items.length, 3, "the guard file must list every locked comment");
for (const [pagePath, ids] of [[pagePaths[0], [COMMENT_IDS[0], COMMENT_IDS[1]]], [pagePaths[1], [COMMENT_IDS[2]]]]) {
  for (const id of ids) {
    assert.equal((await commentOn(pagePath, id)).aiStatus, "running", `${id} must be running while the batch lock is held`);
  }
}
pass("phase1.lock-covers-cross-page-batch", `guardItems=${guardAfterAcquire.items.length}`);

// Fresh revisions: acquiring the lock marked the comments running, so a second
// attempt with stale numbers would be refused as a content conflict first.
const freshLockItems = [
  { pagePath: pagePaths[0], commentId: COMMENT_IDS[0], commentRevision: (await commentOn(pagePaths[0], COMMENT_IDS[0])).revision },
  { pagePath: pagePaths[0], commentId: COMMENT_IDS[1], commentRevision: (await commentOn(pagePaths[0], COMMENT_IDS[1])).revision },
  { pagePath: pagePaths[1], commentId: COMMENT_IDS[2], commentRevision: (await commentOn(pagePaths[1], COMMENT_IDS[2])).revision },
];
const secondLock = await api("/api/reviews/ai-lock/batch", {
  method: "POST",
  body: JSON.stringify({ project, items: freshLockItems }),
});
assert.equal(secondLock.status, 409, "a second batch lock must be refused while one is held");
assert.equal(secondLock.body.code, "AI_REVIEW_LOCKED");
pass("phase1.single-project-lock", secondLock.body.code);

simulateAuthorizedWrites(guardAfterAcquire.items);
const appliedByServer = await mustApi("/api/reviews/ai-lock/batch/apply", {
  method: "POST",
  body: JSON.stringify({ project, token: acquired.body.token }),
});
assert.equal(appliedByServer.ok, true);
assert.equal(appliedByServer.applied.length, 3);
assert.equal(fs.existsSync(GUARD), false, "apply must release the lock");
for (const [pagePath, ids] of [[pagePaths[0], [COMMENT_IDS[0], COMMENT_IDS[1]]], [pagePaths[1], [COMMENT_IDS[2]]]]) {
  for (const id of ids) {
    assert.equal((await commentOn(pagePath, id)).aiStatus, "applied", `${id} must be resolved after apply`);
  }
}
pass("phase1.apply-resolves-all", `applied=${appliedByServer.applied.length}`);

const stale = await api("/api/reviews/ai-lock/batch", {
  method: "POST",
  body: JSON.stringify({ project, items: lockItems.map((item) => ({ ...item, commentRevision: 99 })) }),
});
assert.equal(stale.status, 409, "a stale revision must refuse the whole batch");
assert.equal(stale.body.code, "REVIEW_BATCH_CONFLICT");
assert.equal(stale.body.stale.length, 3);
assert.equal((await commentOn(pagePaths[1], COMMENT_IDS[2])).aiStatus, "applied", "a refused batch must not touch any comment");
pass("phase1.stale-refuses-whole-batch", stale.body.code);

await resetComments();
assert.equal((await commentOn(pagePaths[0], COMMENT_IDS[0])).aiStatus, "idle");

// ── Phase 2/3: the UI chain against a stubbed DSH host ─────────────────────
const baselinePages = [
  { pageId: path.basename(pagePaths[0], ".page"), revision: 1, pageSha256: "a".repeat(64) },
  { pageId: path.basename(pagePaths[1], ".page"), revision: 4, pageSha256: "b".repeat(64) },
];
const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "zh-CN" });
const page = await context.newPage();
page.on("pageerror", (error) => report.browserErrors.push(String(error.message || error)));
page.on("console", (message) => {
  if (message.type() === "error") report.browserErrors.push(message.text());
});

let turnStarted = false;
let turnPolls = 0;
let guardItemsDuringApply = null;
const hostCalls = { stop: 0, restore: 0, cancel: 0, renew: 0, apply: 0 };
let turnShouldFail = false;
let holdTurn = true;
let acceptedShouldFail = false;
let snapshotRequests = 0;
const turnBodies = [];
let lastTurnPageIds = new Set();

await page.context().route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const isHost = !url.pathname.startsWith("/api/") && url.pathname.startsWith("/slides/");
  const json = (status, body) => {
    if (status >= 400) console.error(`STUB ${method} ${url.pathname} → ${status} ${JSON.stringify(body)}`);
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  };
  try {
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/batch") {
      // Real lock, real side effects (guard file + running status). A scratch
      // fixture has no DSH generation ledger, so the server reports a null
      // pageRevision; a real project always has one, so patch just those two
      // numbers to let the browser dispatch. Phase 1 covers the untouched
      // contract.
      const real = await api("/api/reviews/ai-lock/batch", { method: "POST", body: request.postData() });
      if (real.status !== 200) return json(real.status, real.body);
      assert.ok(real.body.submission?.id, "lock HTTP contract returns the durable submission identity");
      const items = real.body.items.map((item) => ({ ...item, pageRevision: 1, pageSha256: "a".repeat(64) }));
      return json(200, { ...real.body, items });
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/batch/apply") {
      hostCalls.apply += 1;
      guardItemsDuringApply = fs.existsSync(GUARD)
        ? JSON.parse(fs.readFileSync(GUARD, "utf8")).items?.length ?? null
        : null;
      return route.continue();
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/batch/cancel") {
      hostCalls.cancel += 1;
      return route.continue();
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/renew") {
      hostCalls.renew += 1;
      const real = await api("/api/reviews/ai-lock/renew", { method: "POST", body: request.postData() });
      if (real.status >= 400) console.error(`REAL renew → ${real.status} ${JSON.stringify(real.body)}`);
      return json(real.status, real.body);
    }
    if (url.pathname === "/slides/providers") return json(200, {providers:[{id:"qa-stub",name:"QA",ready:true,models:["qa-stub-1","qa-stub-2"]}]});
    if (url.pathname === "/api/generation-activity") {
      const real = await mustApi("/api/generation-activity?project=" + encodeURIComponent(project));
      return json(200, {
        ...real,
        ok: true,
        sessionId: SESSION,
        agentStatus: turnStarted && (holdTurn || turnPolls <= 1) ? "busy" : "idle",
        phase: { kind: turnStarted ? "running" : "idle" },
        provider: { providerId: "qa-stub", modelId: "qa-stub-1" },
        project: { path: project },
      });
    }
    if (isHost && url.pathname === `/slides/state/${SESSION}`) {
      if (turnStarted) turnPolls += 1;
      const pages = turnStarted
        ? baselinePages.map((entry) => (lastTurnPageIds.has(entry.pageId)
          ? { ...entry, revision: entry.revision + 1, pageSha256: `${entry.pageSha256.slice(0, 60)}zzzz` }
          : entry))
        : baselinePages;
      // The host reports busy while the model works, then idle with the changed
      // baselines: that transition is what ends the protected turn.
      return json(200, { agentStatus: turnStarted && (holdTurn || turnPolls <= 1) ? "busy" : "idle", inspection: { pages } });
    }
    if (isHost && url.pathname === `/slides/sessions/${SESSION}/events`) {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "\n" });
    }
    if (isHost && url.pathname === `/slides/sessions/${SESSION}/turn` && method === "POST") {
      const body = request.postDataJSON();
      try { editorReviewScopesFromEdit(body.editorEdit); }
      catch (error) { return json(400, {error:error.message,code:"invalid_review_scope"}); }
      turnBodies.push(body);
      report.turnBodies.push(body);
      // Only the pages this turn authorized may look changed: a retry targets
      // just one page, and the app treats any other changed page as a scope
      // violation (correctly).
      lastTurnPageIds = new Set((body.editorEdit?.pages || []).map((entry) => entry.pageId).filter(Boolean));
      if (turnShouldFail) return json(500, { error: "qa stub: model turn failed" });
      if (!acceptedShouldFail) simulateAuthorizedWrites(body.editorEdit.reviewScope.items);
      const userMessage = recordConversationMessage(project, body.userText, "edit", body.editorEdit.authorizationId.slice("comment-batch:".length));
      turnStarted = true;
      turnPolls = 0;
      return json(200, { ok: true, userMessage });
    }
    if (isHost && url.pathname === `/slides/sessions/${SESSION}/stop`) {
      hostCalls.stop += 1;
      return json(200, { ok: true, stopped: true });
    }
    if (method === "POST" && url.pathname === "/api/versions") {
      snapshotRequests += 1;
      return json(200, { ok: true, version: { id: `stub-version-${snapshotRequests}` } });
    }
    if (method === "POST" && url.pathname === "/api/versions/restore") {
      hostCalls.restore += 1;
      const current = await mustApi("/api/model");
      return json(200, { ok: true, model: current.model, thumbs: current.thumbs || [], versions: [] });
    }
  } catch (error) {
    return json(500, { error: String(error?.message || error) });
  }
  return route.continue();
});

const chipLabel = () => page.locator("#work-comment-batch-label").innerText();
const attachments = () => page.locator('#work-comment-items .comment-attachment');

try {
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0&workspace=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll('#work-comment-items .comment-attachment').length === 3);
  assert.equal(await attachments().count(),3,'All pending comments restore directly into the composer');
  pass("context.restores-all-pending", await chipLabel());
  assert.equal(await page.locator('#comment-panel input[type="checkbox"], #comment-inbox-toggle, [data-comment-scope]').count(),0);
  const crossPageRow=page.locator('#work-comment-items [data-comment-id="batch-c"]');
  await crossPageRow.locator('.comment-attachment-open').click();
  await page.locator('#comment-list .comment-card[data-comment-id="batch-c"]').waitFor();
  assert.equal(await page.locator('#comment-layer .pin[data-comment-id="batch-c"]').innerText(),'3','Canvas and composer numbering match across pages');
  pass("context.opens-cross-page-target",await chipLabel());
  await page.locator('#work-comment-items [data-comment-id="batch-a"] .comment-attachment-open').click();
  await page.locator('#comment-list .comment-card[data-comment-id="batch-a"] textarea').fill('最新修改要求：标题用红色');
  assert.match(await page.locator('#work-comment-items [data-comment-id="batch-a"]').innerText(),/最新修改要求/);
  assert.equal(await page.locator('#comment-panel [data-act="ai"], #comment-panel [data-act="retry"], #comment-panel [data-act="stop"]').count(),0);
  pass("context.edits-preview-before-send", await chipLabel());

  await page.locator('#assistant-model').selectOption('qa-stub/qa-stub-2');
  await page.locator('#work-brief').fill('保持其他内容不变');
  assert.equal(await page.locator('#work-form .composer-send').getAttribute('aria-label'),'发送 3 条批注');
  assert.equal(turnBodies.length,0,'Attaching comments must not dispatch a turn');
  await page.screenshot({path:path.join(OUT,'comments-ready-to-send.png')});
  await page.click("#work-form .composer-send");
  assert.equal(await page.locator('.ai-review-consent').count(),0,'No second confirmation or dispatch entry');
  pass("composer.single-submit", "one click dispatches all attached comments");
  const deadline = Date.now() + 20_000;
  while (!turnBodies.length && Date.now() < deadline) await page.waitForTimeout(100);
  if (!turnBodies.length) {
    fail(`one submit must dispatch exactly one Agent turn — ${JSON.stringify({
      comments: Object.values(await readAllReviews()).flat().map((comment) => ({ id: comment.id, aiStatus: comment.aiStatus, aiError: comment.aiError })),
      snapshotRequests,
      guardItemsDuringApply,
      toast: await page.evaluate(() => [...document.querySelectorAll("#app-toast, #toast, .toast")].map((node) => node.textContent).join(" | ")),
      browserErrors: report.browserErrors,
    })}`);
  }
  await page.locator('#work-comment-batch').waitFor({state:'hidden'});
  assert.equal(await page.locator('#work-brief').inputValue(),'','accepted text clears before AI completes');
  assert.equal(hostCalls.apply,0,'AI is deliberately held in progress');
  assert.equal(await page.locator('.generation-user-receipt[data-state="running"]').count(),1);
  assert.equal(turnBodies.length,1,'one click starts one turn');
  assert.equal(await page.locator('#work-form .composer-send').getAttribute('aria-label'),'停止生成');
  await page.screenshot({path:path.join(OUT,'accepted-composer-empty.png')});
  await page.locator('#work-brief').fill('下一条草稿不能被上一轮清除');
  const otherTab=await page.context().newPage();
  await otherTab.goto(page.url(),{waitUntil:'domcontentloaded'});
  await otherTab.locator('.generation-user-receipt[data-state="running"]').waitFor();
  assert.equal(await otherTab.locator('#work-comment-items .comment-attachment').count(),0,'reopened view reconstructs sent state from disk');
  await otherTab.close();
  pass("accepted.clears-before-completion-and-survives-reopen");
  holdTurn=false;
  const turn = turnBodies[0];
  assert.deepEqual(turn.modelSelection,{provider:'qa-stub',model:'qa-stub-2'});
  assert.match(turn.userText,/最新修改要求：标题用红色/);
  assert.match(turn.userText,/保持其他内容不变/);
  assert.equal((await commentOn(pagePaths[0],COMMENT_IDS[0])).text,'最新修改要求：标题用红色');

  assert.equal(turn.editorEdit.pages.length, 2, "the turn must authorize both pages");
  assert.equal(turn.editorEdit.reviewScope.items.length, 3, "the turn must carry all three locked comments");
  assert.deepEqual(turn.editorEdit.reviewScope.items.map((item) => item.commentId).sort(), [...COMMENT_IDS].sort());
  assert.equal(turn.editorEdit.reviewScope.items.filter((item) => item.kind === "elements").length, 2);
  assert.equal(turn.editorEdit.reviewScope.items.filter((item) => item.kind === "page").length, 1);
  for (const [index,id] of COMMENT_IDS.slice(0,2).entries()) {
    assert.deepEqual(turn.editorEdit.reviewScope.items.find(item=>item.commentId===id).elementIds,[firstPageElements[index]],'Each comment retains its own target instead of the page union');
  }
  for (const pagePath of pagePaths) {
    const pageId = path.basename(pagePath, ".page");
    assert.match(turn.text, new RegExp(pageId), `the instruction must name page ${pageId}`);
    assert.ok(
      turn.editorEdit.pages.some((entry) => entry.pageId === pageId && /^[a-f0-9]{64}$/.test(entry.pageSha256)),
      `each authorized page must carry its own verified sha256 (${pageId})`,
    );
  }
  for (const text of ["最新修改要求：标题用红色", "把标题颜色改深", "这一页补一句结论"]) {
    assert.match(turn.text, new RegExp(text), "every comment text must reach the turn");
  }
  pass("turn.one-batch-payload", `pages=${turn.editorEdit.pages.length} items=${turn.editorEdit.reviewScope.items.length}`);

  assert.equal(snapshotRequests, 1, "a batch takes exactly one protected version snapshot");
  pass("version.single-snapshot", `snapshotRequests=${snapshotRequests}`);

  const appliedDeadline = Date.now() + 30_000;
  let applied = false;
  while (Date.now() < appliedDeadline) {
    const all = Object.values(await readAllReviews()).flat();
    applied = COMMENT_IDS.every((id) => all.find((comment) => comment.id === id)?.aiStatus === "applied");
    if (applied) break;
    await page.waitForTimeout(250);
  }
  if (!applied) {
    fail(`success must mark every batched comment applied — ${JSON.stringify({
      comments: Object.values(await readAllReviews()).flat().map((comment) => ({ id: comment.id, aiStatus: comment.aiStatus, aiError: comment.aiError })),
      activeLockItems: fs.existsSync(GUARD) ? JSON.parse(fs.readFileSync(GUARD, "utf8")).items?.length : null,
      turnPolls,
      toast: await page.evaluate(() => [...document.querySelectorAll("#app-toast, #toast, .toast")].map((node) => node.textContent).join(" | ")),
      generation: await page.evaluate(() => document.getElementById("editor-generation-event-list")?.textContent?.slice(0, 120) || ""),
      browserErrors: report.browserErrors,
    })}`);
  }
  assert.equal(fs.existsSync(GUARD), false);
  assert.equal(guardItemsDuringApply, 3, "one lock must cover all three comments");
  pass("apply.resolves-all", `guardItems=${guardItemsDuringApply}`);
  await page.locator('#work-comment-batch').waitFor({state:'hidden'});
  assert.equal(await page.locator('#work-brief').inputValue(),'下一条草稿不能被上一轮清除');
  await page.locator('.generation-user-receipt[data-state="applied"]').waitFor();
  pass("success.preserves-next-draft");

  // ── Phase 3: failure + retry ──────────────────────────────────────────
  turnStarted = false;
  turnShouldFail = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.locator('#work-comment-batch').waitFor({state:'hidden'});
  assert.equal(await attachments().count(),0,'Applied comments do not return after reload');
  fs.writeFileSync(path.join(project, pagePaths[1]), fixturePageBytes.get(pagePaths[1]));
  await setStatus(pagePaths[1],COMMENT_IDS[2],{aiStatus:'idle',resolved:false,aiError:null,aiSubmissionId:null});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#work-comment-items .comment-attachment').length===1);
  await page.click("#work-form .composer-send");

  // Toasts expire after a few seconds; collect them while the failure settles.
  const toasts = [];
  let stopToastWatch = false;
  const toastWatch = (async () => {
    // Never reject: Node treats an unhandled rejection as fatal, and the page can
    // be torn down while this watcher is still polling.
    try {
      const until = Date.now() + 12_000;
      while (Date.now() < until && !stopToastWatch) {
        const text = await page.evaluate(() => [...document.querySelectorAll("#app-toast, #toast, .toast")].map((node) => node.textContent.trim()).filter(Boolean).join(" | "));
        if (text && !toasts.includes(text)) toasts.push(text);
        await page.waitForTimeout(200);
      }
    } catch {
      // Page closed; the collected toasts are still reported on failure.
    }
  })();

  let failedComment = null;
  const failDeadline = Date.now() + 30_000;
  while (Date.now() < failDeadline) {
    const target = await commentOn(pagePaths[1], COMMENT_IDS[2]);
    if (target?.aiStatus === "failed") {
      failedComment = target;
      break;
    }
    await page.waitForTimeout(250);
  }
  stopToastWatch = true;
  await toastWatch.catch(() => undefined);
  if (!failedComment) {
    await toastWatch.catch(() => undefined);
    fail(`a failing turn must mark the comment failed instead of leaving it running — ${JSON.stringify({
      comments: Object.values(await readAllReviews()).flat().map((comment) => ({ id: comment.id, aiStatus: comment.aiStatus, aiError: comment.aiError })),
      guard: fs.existsSync(GUARD) ? JSON.parse(fs.readFileSync(GUARD, "utf8")).items?.length ?? null : null,
      toasts,
      hostCalls,
      browserErrors: report.browserErrors,
    })}`);
  }
  assert.match(String(failedComment.aiError || ""), /failed|失败/i, "a failed batch must record why");
  assert.equal(fs.existsSync(GUARD), false, "a failed batch must not leave a lock behind");
  pass("failure.retryable", `aiStatus=${failedComment.aiStatus}`);

  assert.equal(await page.locator('#comment-list [data-act="retry"]').count(),0);
  await page.waitForFunction(()=>/1 条批注/.test(document.getElementById('work-comment-batch-label')?.textContent || ''));
  pass("failure.attachment-retained", await chipLabel());

  turnShouldFail = false;
  acceptedShouldFail = true;
  holdTurn = true;
  await page.locator('#work-brief').fill('这条是随批注发送的补充');
  await page.click("#work-form .composer-send");
  await page.locator('#work-comment-batch').waitFor({state:'hidden'});
  assert.equal(await page.locator('#work-brief').inputValue(),'');
  await page.locator('#work-brief').fill('保留我的新草稿');
  holdTurn = false;
  const historyRetry=page.locator('.generation-user-receipt[data-state="failed"] button');
  await historyRetry.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.generation-user-receipt[data-state="failed"] button')].some(button=>!button.disabled));
  assert.equal(await attachments().count(),0,'accepted failure stays out of composer');
  assert.equal(await page.locator('[data-process-key="turn-end"]').count(),0,'review result appears once, under its own message');
  assert.match(await page.locator('.generation-user-receipt[data-state="failed"]').innerText(),/已恢复修改前版本/);
  assert.equal(await page.locator('#work-brief').inputValue(),'保留我的新草稿');
  await page.screenshot({path:path.join(OUT,'accepted-failure-in-history.png')});
  pass("failure.accepted-message-owns-retry-and-preserves-draft");
  for (const width of [375,877]) {
    await page.setViewportSize({width,height:900});
    await historyRetry.scrollIntoViewIfNeeded();
    const bounds=await page.locator('.generation-user-receipt[data-state="failed"]').evaluate(el=>{
      const box=el.getBoundingClientRect(),button=el.querySelector('button').getBoundingClientRect();
      return {left:box.left,right:box.right,buttonLeft:button.left,buttonRight:button.right,viewport:innerWidth,client:el.clientWidth,scroll:el.scrollWidth};
    });
    assert.ok(bounds.left>=0 && bounds.right<=bounds.viewport+1 && bounds.buttonRight<=bounds.viewport+1 && bounds.scroll<=bounds.client+1,JSON.stringify(bounds));
    await page.screenshot({path:path.join(OUT,'failure-retry-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:900});
  pass("failure.retry-responsive-no-overflow");
  await page.reload({waitUntil:'domcontentloaded'});
  await historyRetry.waitFor();
  assert.equal(await attachments().count(),0,'reload never reattaches a failed sent batch');
  await page.locator('#work-brief').fill('重试时也保留这条草稿');
  acceptedShouldFail = false;
  const before = turnBodies.length;
  await historyRetry.click();
  const retryDeadline = Date.now() + 30_000;
  let recovered = false;
  while (Date.now() < retryDeadline) {
    if (turnBodies.length > before && (await commentOn(pagePaths[1], COMMENT_IDS[2]))?.aiStatus === "applied") {
      recovered = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  if (!recovered) {
    fail(`重试 must dispatch a new turn and resolve the comment — ${JSON.stringify({
      comments: Object.values(await readAllReviews()).flat().map((comment) => ({ id: comment.id, aiStatus: comment.aiStatus, aiError: comment.aiError })),
      turns: turnBodies.length,
      lastTurnItems: turnBodies.at(-1)?.editorEdit?.reviewScope?.items?.length ?? null,
      attachment: await chipLabel(),
      guard: fs.existsSync(GUARD) ? JSON.parse(fs.readFileSync(GUARD, "utf8")).items?.length ?? null : null,
      toast: await page.evaluate(() => document.getElementById("app-toast")?.textContent || ""),
      hostCalls,
      browserErrors: report.browserErrors,
    })}`);
  }
  assert.equal(turnBodies[before].editorEdit.reviewScope.items.length, 1, "a retry carries only its own comment");
  assert.equal(await page.locator('#work-brief').inputValue(),'重试时也保留这条草稿');
  assert.match(turnBodies[before].userText,/这条是随批注发送的补充/);
  assert.doesNotMatch(turnBodies[before].userText,/重试时也保留这条草稿/);
  pass("retry.preserves-new-draft-and-reuses-original-instruction");
  pass("retry.dispatches-and-resolves", `turns=${turnBodies.length}`);

  await page.screenshot({ path: path.join(OUT, "batch-comment-submit.png") });
  // Phase 3 turns the stub into a 500 on purpose, which is the only 5xx expected.
  const unexpectedErrors = report.browserErrors.filter((entry) => !/status of (500|409)/.test(entry));
  assert.deepEqual(unexpectedErrors, [], `browser errors: ${unexpectedErrors.join(" | ")}`);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, steps: report.steps.length, report: path.join(OUT, "report.json") }));
} catch (error) {
  await page.screenshot({path:path.join(OUT,'failure-debug.png')}).catch(()=>{});
  report.failureUi=await page.locator('#work-chat').innerText().catch(()=>'');
  report.finishedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await page.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  server.kill("SIGKILL");
}
