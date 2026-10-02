#!/usr/bin/env node
// Visual proof for the agentic edit contract: a real server, real lock,
// real persist/verify path — only the model call is stubbed (same technique
// as assistant-structure-dom.test.mjs). Captures screenshots showing the
// authorized scope label and the applied result.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureRunLedger, recordPageRevision, currentPageRevision, stableSha256 } from "../../packages/presentation-run/dist/index.js";
import { executeGenerateTool, persistWrittenPages } from "../../packages/presentation-run/dist/domain/agent-tools.js";
import { loadPlaybook } from "../../packages/presentation-run/dist/domain/playbook.js";
import { loadProject } from "../../packages/pptd-v2/dist/index.js";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const OUT = process.env.QA_OUT || path.join(ROOT, "output/agent-meta-proof");
fs.mkdirSync(OUT, { recursive: true });

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "slides-meta-proof-"));
const project = path.join(scratch, "project");
fs.mkdirSync(path.join(project, "pages"), { recursive: true });
const pagePaths = ["pages/1_cover.page", "pages/2_points.page", "pages/3_close.page"];
const titles = ["城市步行·协作验收", "两条核心建议", "谢谢观看"];
fs.writeFileSync(path.join(project, "deck.pptd"), JSON.stringify({ version: "v2", title: "城市步行·协作验收", size: [960, 540], theme: {}, pages: pagePaths }));
for (const [i, p] of pagePaths.entries()) {
  fs.writeFileSync(path.join(project, p), JSON.stringify({
    pageType: i === 0 ? "cover" : "content",
    background: { type: "solid", color: "#F7F4EC" },
    elements: [{ elementId: "title", elementType: "text", bounds: [80, 200, 800, 90], content: { text: titles[i], fontSize: 40, color: "#14355C" } }],
  }));
}
ensureRunLedger(project, { manifestSha256: "a".repeat(64), requirementsId: "b".repeat(64), requirements: [] });
for (const entry of loadProject(project).pages) {
  recordPageRevision(project, { contextEpochId: "meta-proof" }, path.basename(entry.path, ".page"), entry.page);
}

const port = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => { const n = srv.address().port; srv.close(() => resolve(n)); });
});
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), OPEN_SLIDESTUDIO_PROJECT: project, SLIDESTUDIO_RETENTION_DAYS: "0" },
  stdio: "ignore",
});

let browser, page;
const locks = [], verifies = [];
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await launchPinnedChromium({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console:${m.text()}`); });
  page.on("dialog", (d) => void d.accept());
  let busy = false;
  const livePages = () => loadProject(project).pages.map((entry) => path.basename(entry.path, ".page"));
  const liveTitle = () => loadProject(project).presentation.title || "";
  const state = () => ({
    agentStatus: busy ? "busy" : "idle",
    phase: { kind: "page-ready" },
    inspection: { pages: livePages().map((pageId) => ({ pageId, ...currentPageRevision(project, pageId) })) },
  });
  const activity = {
    ok: true, sessionId: "meta-proof", brief: "协作验收", phase: "edited", agentStatus: "idle",
    provider: { providerId: "test", modelId: "cheap" },
    stages: [],
    events: [{ id: "hello", kind: "message", at: "2026-09-22T09:00:00Z", detail: "文稿已准备好，继续对话即可修改。", status: "complete" }],
    conversation: { version: 1, mode: "edit", messages: [] },
  };
  await page.route("**/api/generation-activity**", async (route) => {
    const data = await (await route.fetch()).json();
    await route.fulfill({ json: { ...activity, ...state(), project: { path: project, title: liveTitle(), pageCount: livePages().length, pagePaths: livePages().map((id) => `pages/${id}.page`) }, assistantArtifacts: data.assistantArtifacts, phase: busy ? "reviewing" : "edited" } });
  });
  await page.route("**/slides/providers", (route) => route.fulfill({ json: { providers: [{ id: "test", name: "Test", ready: true, models: ["cheap"] }] } }));
  await page.route("**/slides/state/meta-proof", (route) => route.fulfill({ json: state() }));
  await page.route("**/slides/sessions/meta-proof/events", (route) => route.abort());
  await page.route("**/slides/assistant-intent", (route) => route.fulfill({ json: {
    ok: true, intent: "edit", scope: "deck", pages: [],
    structureOnly: true, insertIndex: 1, editableMeta: ["title"],
  } }));
  await page.route("**/api/reviews/ai-lock?**", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.workspaceEdit) locks.push(body);
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.route("**/api/reviews/ai-lock/verify?**", async (route) => {
    const response = await route.fetch();
    verifies.push(await response.json());
    await route.fulfill({ response });
  });
  await page.route("**/slides/sessions/meta-proof/stop", (route) => { busy = false; return route.fulfill({ json: { ok: true, stopped: true } }); });
  await page.route("**/slides/sessions/meta-proof/turn", async (route) => {
    const body = route.request().postDataJSON();
    activity.conversation.messages.push({ id: "u1", at: new Date().toISOString(), text: body.userText, mode: "edit", clientRequestId: body.clientRequestId });
    fs.mkdirSync(path.join(project, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(project, "_agent/assistant-conversation.v1.json"), JSON.stringify(activity.conversation));
    busy = true;
    await route.fulfill({ json: { ok: true, userMessage: { id: "u1", text: body.userText, at: new Date().toISOString() } } });
  });

  await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=1`, { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("与 AI 协作", { exact: true });
  try {
    await input.waitFor({ timeout: 15000 });
  } catch (error) {
    await page.screenshot({ path: path.join(OUT, "00-boot-failure.png") });
    console.error("pageErrors:", pageErrors.slice(0, 8));
    console.error("body:", (await page.evaluate(() => document.body.innerText)).slice(0, 600));
    throw error;
  }
  await input.fill("在第1页后加一页目录，顺便把文稿标题改成路演版");
  await input.press("Enter");
  // Wait until the scope label is live in the panel header — that's the
  // authorization contract rendered for the user.
  await page.waitForFunction(() => document.querySelector("#editor-generation-title")?.textContent?.includes("结构调整"), undefined, { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "01-scope-label.png") });

  // The "agent" turn: write the new page through the real persist path and
  // rename the deck through the real update_deck tool — both authorized by
  // the lock the browser just acquired.
  const writerState = () => ({ brief: "meta-proof", playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [], projectRoot: project });
  const inserted = persistWrittenPages(writerState(), [{
    id: "new_toc", pageType: "content",
    elements: [
      { elementId: "toc-bg", elementType: "shape", shapeName: "rect", bounds: [0, 0, 960, 540], fill: { type: "solid", color: "#F7F4EC" } },
      { elementId: "toc-t", elementType: "text", bounds: [80, 160, 800, 80], content: { text: "目录", fontSize: 36, color: "#14355C" } },
    ],
  }]);
  assert.equal(inserted.ok, true, JSON.stringify(inserted));
  const meta = executeGenerateTool("update_deck", { title: "城市步行·路演版" }, writerState());
  assert.equal(meta.ok, true, JSON.stringify(meta));
  // Only the genuinely new page gets a revision fact — recording one for an
  // untouched baseline page would look like an out-of-scope modification.
  recordPageRevision(project, { contextEpochId: "meta-proof", commandId: "proof-new_toc" }, "new_toc", loadProject(project).pages.find((e) => e.path === "pages/new_toc.page").page);
  activity.events.push({ id: "reply", kind: "message", at: new Date().toISOString(), detail: "已在第 1 页后新增目录页，并把文稿标题改为「城市步行·路演版」。", status: "complete" });
  // Give the poller a moment to observe busy, then finish the turn.
  await new Promise((r) => setTimeout(r, 1500));
  busy = false;
  await page.waitForFunction(() => !Object.keys(localStorage).some((key) => key.startsWith("slides.pending-edit:")), undefined, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#editor-generation-title")?.textContent?.includes("路演版"), undefined, { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "02-result.png") });

  const after = loadProject(project);
  assert.deepEqual(after.pages.map((e) => e.path), ["pages/1_cover.page", "pages/new_toc.page", "pages/2_points.page", "pages/3_close.page"]);
  assert.equal(after.presentation.title, "城市步行·路演版");
  assert.deepEqual(verifies.at(-1).changedMetaFields, ["title"]);
  assert.equal(verifies.at(-1).scopeViolation, false);
  fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify({
    lock: locks[0]?.workspaceEdit,
    verify: verifies.at(-1),
    finalPages: after.pages.map((e) => e.path),
    finalTitle: after.presentation.title,
  }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, shots: ["01-scope-label.png", "02-result.png"], pages: after.pages.map((e) => e.path), title: after.presentation.title }));
} finally {
  if (page) await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await browser?.close();
  if (server.exitCode === null) {
    const done = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await done;
  }
}
