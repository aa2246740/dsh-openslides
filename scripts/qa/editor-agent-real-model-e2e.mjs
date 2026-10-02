#!/usr/bin/env node
// REAL-MODEL end-to-end proof for the agentic edit contract. No stubs:
// the browser drives the actual composer against the running stack
// (sidecar 55200 + DSH kernel 13080) with a live provider. Each turn goes
// intent(model) -> lock -> confirm -> turn(model+tools) -> verify on the
// real lock/persist/verify path. Asserts disk truth after every turn.
//
// Usage: node scripts/qa/editor-agent-real-model-e2e.mjs
// Env:   QA_BASE (default http://127.0.0.1:55200)
//        QA_PROJECT (default output/dsh-slices/deck-74021fe2 — has a bound session)
//        QA_MODEL  (default minimax-cn/MiniMax-M3)
//        QA_TURNS  (comma list to run a subset, e.g. "insert,meta")
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject } from "../../packages/pptd-v2/dist/index.js";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const BASE = process.env.QA_BASE || "http://127.0.0.1:55200";
const PROJECT = process.env.QA_PROJECT || path.join(ROOT, "output/dsh-slices/deck-74021fe2");
const MODEL = process.env.QA_MODEL || "minimax-cn/MiniMax-M3";
const OUT = process.env.QA_OUT || path.join(ROOT, "output/agent-real-model-e2e");
const ONLY = (process.env.QA_TURNS || "").split(",").map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const live = () => loadProject(PROJECT);
const manifestIds = () => live().pages.map((e) => path.basename(e.path, ".page"));
const deckTitle = () => live().presentation.title || "";
const report = { base: BASE, project: PROJECT, model: MODEL, turns: [] };
const TURN_TIMEOUT = Number(process.env.QA_TURN_TIMEOUT_MS) || 480_000;

async function waitTurnSettled(page, userText, screenshotName) {
  // Phase A — the turn must be *accepted* first: either a pending-edit key
  // appears (lock acquired, agent running) or a new reply card lands
  // (discuss / refusal path that never takes a lock). Checking for absence
  // immediately races the intent call and returns before the lock exists.
  const cardCount = await page.$$eval(".generation-message-card, .generation-note-card", (n) => n.length);
  const began = await page.waitForFunction(
    (prevCards) => Object.keys(localStorage).some((key) => key.startsWith("slides.pending-edit:"))
      || document.querySelectorAll(".generation-message-card, .generation-note-card").length > prevCards,
    cardCount, { timeout: 120_000 },
  ).then(() => true).catch(() => false);
  if (!began) {
    await page.screenshot({ path: path.join(OUT, screenshotName) });
    throw new Error(`turn never began for ${JSON.stringify(userText)} — no lock, no reply`);
  }
  // Phase B — wait until the lock/verify cycle fully settles.
  await page.waitForFunction(
    () => !Object.keys(localStorage).some((key) => key.startsWith("slides.pending-edit:"))
      && !document.querySelector("#editor-generation-title")?.textContent?.includes("正在"),
    undefined,
    { timeout: TURN_TIMEOUT },
  );
  await page.screenshot({ path: path.join(OUT, screenshotName) });
  const cards = await page.$$eval(".generation-message-card, .generation-note-card",
    (nodes) => nodes.map((n) => n.innerText || ""));
  const last = cards[cards.length - 1] || "";
  return last;
}

async function sendTurn(page, text) {
  const input = page.getByLabel("与 AI 协作", { exact: true });
  await input.fill(text);
  await input.press("Enter");
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
let dialogSeen = 0;
page.on("dialog", (d) => { dialogSeen += 1; void d.accept(); });

// Observe-only probes: log every hop of the real chain, never modify it.
const hops = { intents: [], locks: [], turns: [], verifies: [] };
await page.route("**/slides/assistant-intent", async (route) => {
  const response = await route.fetch();
  hops.intents.push({ status: response.status(), body: await response.json().catch(() => null) });
  await route.fulfill({ response });
});
await page.route("**/api/reviews/ai-lock?**", async (route) => {
  const req = route.request().postDataJSON();
  const response = await route.fetch();
  hops.locks.push({ request: req?.workspaceEdit ?? req, status: response.status(), body: await response.json().catch(() => null) });
  await route.fulfill({ response });
});
await page.route("**/api/reviews/ai-lock/verify?**", async (route) => {
  const response = await route.fetch();
  hops.verifies.push({ status: response.status(), body: await response.json().catch(() => null) });
  await route.fulfill({ response });
});
await page.route("**/slides/sessions/*/turn", async (route) => {
  const req = route.request().postDataJSON();
  const response = await route.fetch();
  hops.turns.push({ userText: req?.userText, editorEdit: Boolean(req?.editorEdit), status: response.status(), body: await response.json().catch(() => null) });
  await route.fulfill({ response });
});

try {
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(PROJECT)}&workspace=1`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("与 AI 协作", { exact: true }).waitFor({ timeout: 30000 });
  // Wait for the model roster, then pin the model for every turn.
  await page.waitForFunction(
    (value) => [...document.querySelectorAll("#assistant-model option")].some((o) => o.value === value),
    MODEL, { timeout: 20000 },
  );
  await page.selectOption("#assistant-model", MODEL);
  const baseTitle = deckTitle();
  const basePages = manifestIds();
  console.log(`[e2e] project=${PROJECT}`);
  console.log(`[e2e] baseline: title=${JSON.stringify(baseTitle)} pages=${basePages.join(",")}`);

  const run = (name, fn) => ONLY.length && !ONLY.includes(name) ? report.turns.push({ name, skipped: true }) : fn();

  // --- 1. structural insert (real model writes the new page) ---------------
  // Unique title per run: repeating an already-satisfied request is correctly
  // deduplicated by the agent ("already added"), which is product-correct but
  // breaks the naive page-count assertion.
  const insertTitle = `验收里程碑-${Date.now().toString(36).slice(-4)}`;
  await run("insert", async () => {
    const before = manifestIds();
    await sendTurn(page, `在最后一页后加一页，标题写「${insertTitle}」`);
    const reply = await waitTurnSettled(page, "insert", "10-insert.png");
    const after = manifestIds();
    report.turns.push({ name: "insert", reply, before, after });
    assert.equal(after.length, before.length + 1, `insert should add exactly one page: ${after.join(",")}`);
    assert.deepEqual(after.slice(0, before.length), before, "baseline order must be preserved");
  });
  console.log("[e2e] insert done:", manifestIds().join(","));

  // --- 2. metadata-only turn ----------------------------------------------
  await run("meta", async () => {
    const before = manifestIds();
    await sendTurn(page, "把文稿标题改成「城市步行·路演版」");
    const reply = await waitTurnSettled(page, "meta", "20-meta.png");
    report.turns.push({ name: "meta", reply, title: deckTitle() });
    assert.equal(deckTitle(), "城市步行·路演版", `title should change: ${deckTitle()}`);
    assert.deepEqual(manifestIds(), before, "meta-only turn must not touch the manifest");
  });
  console.log("[e2e] meta done:", deckTitle());

  // --- 2b. compound: structural insert + deck title in one message ---------
  await run("compound", async () => {
    const before = manifestIds();
    const title = `复合验收-${Date.now().toString(36).slice(-4)}`;
    await sendTurn(page, `再加一页附录，标题写「${title}」，同时把文稿标题改成「城市步行·终版」`);
    const reply = await waitTurnSettled(page, "compound", "25-compound.png");
    const after = manifestIds();
    report.turns.push({ name: "compound", reply, before, after, title: deckTitle() });
    assert.equal(after.length, before.length + 1, `compound should add one page: ${after.join(",")}`);
    assert.deepEqual(after.slice(0, before.length), before, "baseline order must be preserved");
    assert.equal(deckTitle(), "城市步行·终版", `compound should rename deck: ${deckTitle()}`);
  });
  console.log("[e2e] compound done:", manifestIds().join(","), "|", deckTitle());

  // --- 2c. editable PPTX export stays available -----------------------------
  await run("export", async () => {
    // Same route the toolbar uses: POST /api/export {format, project}.
    const res = await page.evaluate(async (projectPath) => {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pptx", project: projectPath }),
      }).catch(() => null);
      if (!r) return null;
      const buf = await r.arrayBuffer();
      // PPTX is a zip container — editable export must start with PK.
      const head = new Uint8Array(buf.slice(0, 4));
      return { status: r.status, bytes: buf.byteLength, zip: head[0] === 0x50 && head[1] === 0x4b };
    }, PROJECT);
    report.turns.push({ name: "export", response: res });
    assert.ok(res && res.status === 200 && res.zip && res.bytes > 1000,
      `export should return an editable PPTX zip: ${JSON.stringify(res)}`);
  });
  console.log("[e2e] export done");

  // --- 3. reorder ----------------------------------------------------------
  await run("reorder", async () => {
    const before = manifestIds();
    if (before.length < 2) { report.turns.push({ name: "reorder", skipped: "need >=2 pages" }); return; }
    await sendTurn(page, "把第1页挪到最后一页");
    const reply = await waitTurnSettled(page, "reorder", "30-reorder.png");
    const after = manifestIds();
    report.turns.push({ name: "reorder", reply, before, after });
    assert.deepEqual(after, [...before.slice(1), before[0]], `expected rotation: ${after.join(",")}`);
  });
  console.log("[e2e] reorder done:", manifestIds().join(","));

  // --- 4. delete with confirm ----------------------------------------------
  await run("delete", async () => {
    const before = manifestIds();
    if (before.length < 2) { report.turns.push({ name: "delete", skipped: "need >=2 pages" }); return; }
    const dialogsBefore = dialogSeen;
    await sendTurn(page, "删掉第2页");
    const reply = await waitTurnSettled(page, "delete", "40-delete.png");
    const after = manifestIds();
    report.turns.push({ name: "delete", reply, before, after, confirmShown: dialogSeen > dialogsBefore });
    assert.equal(dialogSeen > dialogsBefore, true, "delete must show a confirm dialog");
    assert.deepEqual(after, before.filter((_, i) => i !== 1), `page 2 should be gone: ${after.join(",")}`);
  });
  console.log("[e2e] delete done:", manifestIds().join(","));

  // --- 5. page-scoped rewrite must NOT wipe the deck ------------------------
  await run("page-rewrite", async () => {
    const before = manifestIds();
    await sendTurn(page, "重写文稿第1页，换个更有冲击力的标题");
    const reply = await waitTurnSettled(page, "page-rewrite", "50-page-rewrite.png");
    const after = manifestIds();
    report.turns.push({ name: "page-rewrite", reply, before, after });
    assert.deepEqual(after, before, `page-scoped rewrite must not change manifest: ${after.join(",")}`);
  });
  console.log("[e2e] page-rewrite done:", manifestIds().join(","));

  // --- 6. discuss must stay read-only ---------------------------------------
  await run("discuss", async () => {
    const before = manifestIds();
    const titleBefore = deckTitle();
    await sendTurn(page, "先别改，给我两个配色建议");
    // Discuss turns don't take locks; wait for a reply card to settle.
    await page.waitForFunction(
      (count) => document.querySelectorAll(".generation-message-card").length >= count,
      report.turns.filter((t) => !t.skipped).length, { timeout: TURN_TIMEOUT },
    ).catch(() => {});
    await page.screenshot({ path: path.join(OUT, "60-discuss.png") });
    assert.deepEqual(manifestIds(), before, "discuss must not touch manifest");
    assert.equal(deckTitle(), titleBefore, "discuss must not touch title");
    report.turns.push({ name: "discuss", ok: true });
  });
  console.log("[e2e] discuss done — deck untouched");

  fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify({ ...report, hops }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, pages: manifestIds(), title: deckTitle(), turns: report.turns.length }));
} catch (error) {
  // Failure bundle: hops + page state + screenshot for postmortem.
  fs.writeFileSync(path.join(OUT, "failure.json"), JSON.stringify({ error: String(error), hops, pageErrors, report }, null, 2));
  await page.screenshot({ path: path.join(OUT, "99-failure.png") }).catch(() => {});
  console.error("[e2e] hops:", JSON.stringify(hops, null, 1).slice(0, 4000));
  throw error;
} finally {
  // In-flight route fetches race browser teardown — drain them quietly.
  await page?.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await browser?.close();
}
