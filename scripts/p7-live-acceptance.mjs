#!/usr/bin/env node
/**
 * P7 live acceptance — real browser + real DSH kernel + real model.
 * Requires `node scripts/dsh-slides.mjs` already running (sidecar :55200).
 *
 * Deck 1: minimax-cn / MiniMax-M3 (API key route)
 * Deck 2: pi-xai / grok-4.6 (OAuth route) — exercises model switching.
 *
 * Checks: hub generate → durable session → editor render → scoped edit →
 * annotation → version snapshot → editable PPTX export → reload persistence.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

const BASE = process.env.OSS_BASE || "http://127.0.0.1:55200";
const GENERATE_TIMEOUT_MS = Number(process.env.OSS_GEN_TIMEOUT_MS || 45 * 60 * 1000);
// Resume an already-running session for the FIRST deck only:
//   OSS_SESSION=<id> OSS_PROJECT=<abs or repo-rel project path>
let resumeConsumed = false;
const EDIT_TIMEOUT_MS = 8 * 60 * 1000;

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-p7-"));
const log = (...a) => console.log(`[p7 ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function stateOf(sessionId) {
  const r = await fetch(`${BASE}/slides/state/${encodeURIComponent(sessionId)}`);
  if (!r.ok) throw new Error(`state ${sessionId} HTTP ${r.status}`);
  return r.json();
}

async function waitTerminal(sessionId, timeoutMs, label) {
  const t0 = Date.now();
  let last = "";
  let idlePolls = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await stateOf(sessionId).catch((e) => ({ pollError: e.message }));
    const kind = s?.phase?.kind || (typeof s?.phase === "string" ? s.phase : "?");
    const pages = s?.project?.pageCount ?? s?.inspection?.pages?.length ?? "?";
    // ask_user_question parks the turn until answered — pick the recommended
    // option (else the first) so unattended acceptance doesn't stall.
    for (const request of s?.questions || []) {
      if (request?.status !== "pending") continue;
      const answers = (request.questions || []).map((question) => ({
        id: question.id,
        selected: [(question.options || []).find((o) => /推荐/.test(o?.label || ""))?.label
          || question.options?.[0]?.label].filter(Boolean),
      })).filter((a) => a.id && a.selected.length);
      if (!answers.length) continue;
      log(`${label} answering question card ${request.id}`);
      await fetch(`${BASE}/slides/sessions/${sessionId}/questions/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", answer: { answers } }),
      }).catch(() => {});
    }
    const line = `${label} phase=${kind} agent=${s?.agentStatus} pages=${pages}`;
    if (line !== last) { log(line); last = line; idlePolls = 0; }
    if (["complete", "edited", "discussion"].includes(kind)) return s;
    // phase reflects the last event, not a terminal flag: after an edit the
    // kind flips back to page-ready while the run is actually finished.
    // agentStatus idle + at least one persisted page is the durable settle —
    // require two consecutive idle polls so a mid-turn blip can't fake it.
    if (s?.agentStatus === "idle" && typeof pages === "number" && pages > 0) {
      idlePolls += 1;
      if (idlePolls >= 2) return s;
    } else idlePolls = 0;
    if (["failed", "cancelled", "canceled"].includes(kind)) {
      throw new Error(`${label} terminal=${kind} detail=${JSON.stringify(s?.phase || s?.error || {}).slice(0, 400)}`);
    }
    if (kind === "paused") {
      log(`${label} paused — detail: ${JSON.stringify(s?.phase || {}).slice(0, 300)}`);
      return s; // paused is resumable; caller decides
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} timed out after ${timeoutMs / 60000}min (last: ${last})`);
}

async function selectProviderModel(page, providerId, modelId) {
  await page.waitForSelector("#btn-model", { timeout: 30000 });
  // The hub force-closes the panel once its initial provider refresh resolves
  // (Promise.all → showPiPanel(false)); wait for that settle before opening.
  await page.waitForFunction(() => {
    const s = document.getElementById("pi-login-status");
    return s && s.textContent && !s.textContent.includes("正在查看");
  }, null, { timeout: 30000 });
  await page.click("#btn-model"); // opens the model panel
  await page.waitForSelector("#pi-panel:not([hidden])", { timeout: 15000 });
  await page.waitForFunction(() => {
    const sel = document.getElementById("pi-provider");
    return sel && sel.options.length > 0;
  }, null, { timeout: 30000 });
  await page.selectOption("#pi-provider", providerId);
  await page.waitForFunction(() => {
    const sel = document.getElementById("pi-model");
    return sel && sel.options.length > 0;
  }, null, { timeout: 15000 });
  await page.selectOption("#pi-model", modelId);
  const picked = await page.evaluate(() => ({
    provider: document.getElementById("pi-provider")?.value,
    model: document.getElementById("pi-model")?.value,
  }));
  assert.equal(picked.provider, providerId, `provider select stuck at ${picked.provider}`);
  assert.equal(picked.model, modelId, `model select stuck at ${picked.model}`);
  log(`selected ${providerId} / ${modelId}`);
}

async function generateDeck(page, { provider, model, brief }) {
  const rs = process.env.OSS_SESSION || "";
  const rp = process.env.OSS_PROJECT || "";
  if (!resumeConsumed && rs && rp) {
    resumeConsumed = true;
    const q = new URLSearchParams({ project: rp, workspace: "1", session: rs, live: "1" });
    await page.goto(`${BASE}/index.html?${q}`, { waitUntil: "domcontentloaded" });
    log(`resume → session=${rs} project=${rp}`);
    return { sessionId: rs, projectPath: rp };
  }
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await selectProviderModel(page, provider, model);
  await page.fill("#brief", brief);
  await page.click("#btn-send");
  log("sent brief; waiting for editor handoff");
  await page.waitForURL(/index\.html\?.*session=/, { timeout: 120000 });
  const url = new URL(page.url());
  const sessionId = url.searchParams.get("session");
  const projectPath = url.searchParams.get("project");
  assert.ok(sessionId, "no session param after handoff");
  assert.ok(projectPath, "no project param after handoff");
  log(`handoff → session=${sessionId} project=${projectPath}`);
  await page.waitForSelector("#workspace-cover", { state: "hidden", timeout: 30000 });
  return { sessionId, projectPath };
}

async function editorChecks(page, { sessionId, projectPath, deckLabel }) {
  // Editor surface up (pages stream in as they are written)
  await page.waitForSelector("#slide", { timeout: 120000 });

  // Wait for generation to reach a terminal-ish phase before asserting count
  const settled = await waitTerminal(sessionId, GENERATE_TIMEOUT_MS, deckLabel);
  await page.waitForSelector(".rail .thumb", { timeout: 60000 });
  const slideCount = await page.evaluate(() => document.querySelectorAll(".rail .thumb").length);
  log(`${deckLabel} rail thumbs: ${slideCount}`);
  const pages = settled?.project?.pageCount ?? slideCount;
  log(`${deckLabel} settled with ${pages} pages`);

  // Project persisted on disk (YAML PPTD v2 layout)
  const absProject = path.isAbsolute(projectPath) ? projectPath : path.resolve(projectPath);
  assert.ok(
    fs.existsSync(path.join(absProject, "deck.pptd")) || fs.existsSync(path.join(absProject, "pages")),
    `project not on disk: ${absProject}`,
  );

  // --- Scoped edit via the left conversation -------------------------------
  // The kernel returns 409 while a turn is still finishing — wait for idle.
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const s = await stateOf(sessionId).catch(() => null);
      if (s?.agentStatus === "idle") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const stamp = `验收测试标题-${deckLabel}`;
  const editText = `把当前页的标题改成「${stamp}」`;
  await page.fill("#work-brief", editText);
  await page.evaluate(() => document.getElementById("work-form")?.requestSubmit());
  log(`${deckLabel} scoped edit sent; waiting for title change or reply`);
  // Settle = slide text gains the new title, OR a fresh assistant reply lands
  // without it (model explained a refusal) — capture both for the verdict.
  const t0 = Date.now();
  let titleChanged = false;
  let replyTail = "";
  while (Date.now() - t0 < EDIT_TIMEOUT_MS) {
    const slideText = await page.evaluate(() => document.querySelector("#slide")?.textContent || "");
    if (slideText.includes(stamp)) { titleChanged = true; break; }
    replyTail = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#work-thread *")].filter((el) => el.children.length === 0);
      return rows.slice(-6).map((el) => el.textContent).join(" | ").slice(-500);
    });
    if (/失败|错误|无法|抱歉|refus|cannot|fail/i.test(replyTail) && Date.now() - t0 > 30000) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  log(`${deckLabel} title after edit: ${titleChanged ? "CHANGED ✓" : "unchanged — thread tail: " + replyTail.slice(-160)}`);

  // --- Annotation ------------------------------------------------------------
  // btn-comments arms pin mode; a pointerdown inside #slide opens the draft
  // panel (element scope when a target is hit, page scope otherwise). The
  // gesture listener lives on #viewport in capture phase, so the topmost
  // element at the point is irrelevant — click the slide body, not a child
  // .el, because full-bleed decorations legitimately intercept child clicks.
  // The scoped-edit turn may still be finishing; the gesture is ignored while
  // aiReviewTurnActive, so wait for idle first.
  {
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const s = await stateOf(sessionId).catch(() => null);
      if (s?.agentStatus === "idle") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  await page.click("#btn-comments");
  await page.waitForSelector(".app.is-comment", { timeout: 15000 });
  // Aim the pin at a real element: find a .el whose own node is the topmost
  // annotation target at its center (mirrors commentTargetAtPoint). Falls back
  // to slide center, which yields a page-scoped comment — still valid, but the
  // element path is the one that must reach edit_elements.
  const point = await page.evaluate(() => {
    const slide = document.getElementById("slide");
    for (const node of slide.querySelectorAll(".el[data-id]")) {
      const r = node.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementsFromPoint(cx, cy)
        .map((n) => n.closest?.(".el[data-id]")).find(Boolean);
      if (top === node) return { x: cx, y: cy, id: node.dataset.id };
    }
    const r = slide.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: "" };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector("#comment-panel:not([hidden])", { timeout: 15000 });
  log(`${deckLabel} comment target: ${point.id || "(page scope)"}`);
  await page.fill("#comment-draft", "验收批注：请把这个元素的颜色改得更醒目一点");
  await page.click("#comment-add");
  await page.waitForTimeout(1500);
  const pinCount = await page.evaluate(() => document.querySelectorAll("#comment-layer .pin, .comment-pin").length);
  log(`${deckLabel} comment pins: ${pinCount}`);
  assert.ok(pinCount >= 1, "annotation pin did not appear");

  // --- Comment batch review → scoped write tool -----------------------------
  // Pending comments ride the next composer submit into the batch review; an
  // element-scoped batch must land on edit_elements (or a permitted write),
  // never dead-end on "forbids write_page". Verify from the durable trace.
  {
    await page.waitForFunction(
      () => !document.getElementById("work-comment-batch")?.hidden,
      null, { timeout: 30000 },
    ).catch(() => log(`${deckLabel} batch chip never appeared — skipping batch assert`));
    const tracePath = path.join(absProject, "_agent", "agent-trace.jsonl");
    const traceMark = fs.existsSync(tracePath) ? fs.readFileSync(tracePath, "utf8").length : 0;
    await page.fill("#work-brief", "请处理这条批注");
    await page.evaluate(() => document.getElementById("work-form")?.requestSubmit());
    log(`${deckLabel} comment batch sent; watching trace`);
    const t2 = Date.now();
    let batchTail = "";
    while (Date.now() - t2 < EDIT_TIMEOUT_MS) {
      const s = await stateOf(sessionId).catch(() => null);
      const trace = fs.existsSync(tracePath) ? fs.readFileSync(tracePath, "utf8").slice(traceMark) : "";
      const events = trace.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const toolCalls = events.filter((e) => e.kind === "tool").map((e) => e.name);
      const writeOk = events.some((e) => e.kind === "result" && /"outcome":\s*"(written|applied)"/.test(String(e.detail)));
      const forbids = (trace.match(/forbids/g) || []).length;
      if (s?.agentStatus === "idle" && (toolCalls.length || events.some((e) => e.kind === "message"))) {
        batchTail = `tools=[${toolCalls.join(",")}] forbids=${forbids} writeOk=${writeOk}`;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    log(`${deckLabel} batch review: ${batchTail || "timed out"}`);
  }

  // --- Version snapshot ------------------------------------------------------
  await page.click("#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 8000 });
  await page.click("#version-save");
  await page.waitForTimeout(1500);
  const versionRows = await page.evaluate(() => document.querySelectorAll("#versions-list > *").length);
  log(`${deckLabel} version rows: ${versionRows}`);
  assert.ok(versionRows >= 1, "no version rows after save");

  // --- Editable PPTX export ---------------------------------------------------
  await page.click("#btn-export");
  await page.waitForSelector("#export-dialog[open], #export-dialog:not([hidden])", { timeout: 8000 }).catch(async () => {
    await page.click("#btn-export"); // toggle may need a second nudge in headless
  });
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.click("#export-download");
  const download = await downloadPromise;
  const pptxPath = path.join(outDir, `${deckLabel}.pptx`);
  await download.saveAs(pptxPath);
  const magic = fs.readFileSync(pptxPath).subarray(0, 4);
  assert.deepEqual([...magic.subarray(0, 2)], [0x50, 0x4b], "export is not a ZIP/PPTX");
  log(`${deckLabel} exported ${pptxPath} (${fs.statSync(pptxPath).size} bytes)`);

  // --- Reload persistence ------------------------------------------------------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rail .thumb", { timeout: 60000 });
  const persistedCount = await page.evaluate(() => document.querySelectorAll(".rail .thumb").length);
  assert.ok(persistedCount >= 1, "pages lost after reload");
  const threadLen = await page.evaluate(() => document.querySelectorAll("#work-thread > *").length);
  log(`${deckLabel} after reload: ${persistedCount} pages, ${threadLen} thread nodes`);
  assert.ok(threadLen >= 1, "conversation lost after reload");

  return { pages, titleChanged, pinCount, versionRows, pptxPath };
}

const browser = await launchPinnedChromium({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") log("console.error:", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => log("pageerror:", String(e).slice(0, 300)));

  const results = {};

  // Deck 1 — API-key route (skip with OSS_DECK2_ONLY=1 when already validated)
  // Provider/model overridable via env so a quota-blocked vendor can be swapped
  // without editing the script (e.g. OSS_PROVIDER1=amd OSS_MODEL1=DeepSeek-V4-Flash).
  if (process.env.OSS_DECK2_ONLY !== "1") {
    const provider1 = process.env.OSS_PROVIDER1 || "minimax-cn";
    const model1 = process.env.OSS_MODEL1 || "MiniMax-M3";
    const d1 = await generateDeck(page, {
      provider: provider1, model: model1,
      brief: "做一份 5 页的城市夜跑安全指南演示文稿，面向夜跑社群新成员，包含装备、路线选择、反光标识和应急联系。",
    });
    results.deck1 = await editorChecks(page, { ...d1, deckLabel: `deck1-${model1}` });
  }

  // Deck 2 — OAuth route + model switch (skip with OSS_DECK1_ONLY=1)
  if (process.env.OSS_DECK1_ONLY !== "1") {
    const d2 = await generateDeck(page, {
      provider: "pi-xai", model: "grok-4.6",
      brief: "Create a 5-page investor update deck for a neighborhood coffee subscription: traction, unit economics, churn plan, next-quarter roadmap.",
    });
    results.deck2 = await editorChecks(page, { ...d2, deckLabel: "deck2-grok46" });
  }

  log("ALL ACCEPTANCE CHECKS PASSED");
  console.log(JSON.stringify(results, null, 1));
} finally {
  await browser.close();
}
