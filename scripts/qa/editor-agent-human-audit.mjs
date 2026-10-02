#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { isApiCommandUrl } from "../lib/api-command-url.mjs";

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
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/qa-editor-agent"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-agent-audit-"));
const project = path.join(scratch, "project");
fs.cpSync(path.join(ROOT, "fixtures/okp-yu7-ppt"), project, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const report = {
  schemaVersion: "open-slidestudio.editor-agent-audit.v1",
  startedAt: new Date().toISOString(),
  base: BASE,
  project,
  evidence: [],
  browserErrors: [],
  limitations: [
    "The deterministic success and cancel scenarios use explicitly labelled HTTP test doubles; they prove browser state and request contracts, not model quality or provider availability.",
    "The no-session failure, attachment upload/delete, refresh restore, comment consent, and server persistence paths use the real native-web server.",
    "A credentialed DSH generation/edit turn is intentionally not started by this audit.",
  ],
};

function record(id, evidenceType, detail) {
  report.evidence.push({ id, evidenceType, detail });
  console.log(`PASS [${evidenceType}] ${id}: ${detail}`);
}

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), OPEN_SLIDESTUDIO_PROJECT: project },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start\n${serverLog}`);
}

async function ready(page) {
  await page.waitForFunction(() => {
    const title = document.getElementById("doc-title")?.textContent || "";
    return title && title !== "未加载";
  });
}

async function openEditor(page) {
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}`, { waitUntil: "networkidle" });
  await ready(page);
}

async function shot(page, name) {
  const file = path.join(OUT, `${String(report.evidence.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

await waitForServer();
const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") report.browserErrors.push(message.text());
});
page.on("pageerror", (error) => report.browserErrors.push(String(error)));
page.on("dialog", (dialog) => dialog.accept());

let fakeRoute;
try {
  await openEditor(page);

  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  await page.locator("#chat-close").click();
  await page.locator("#work-chat").waitFor({ state: "hidden" });
  await page.locator("#btn-sparkles").click();
  record("workspace-toggle", "real-local", "open, close, and reopen all changed the visible editor state");

  const textarea = page.locator("#work-brief");
  await textarea.fill("第一行");
  await textarea.press("Shift+Enter");
  assert.equal(await textarea.inputValue(), "第一行\n");
  assert.equal(await page.locator("#work-thread > .bubble").count(), 0);
  record("shift-enter", "real-local", "Shift+Enter inserted a newline without submitting");

  const versionsBefore = await page.evaluate(async () => (await (await fetch("/api/versions")).json()).versions.length);
  await textarea.fill("把当前页标题改得更清楚");
  await textarea.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("#work-thread .bubble")].some((node) => /没有可继续对话的 DSH Agent 会话/.test(node.textContent || "")));
  assert.equal(await page.locator("#work-form").isVisible(), true);
  assert.equal(await textarea.isEnabled(), true);
  assert.equal(await page.locator("#work-generation-lock").isHidden(), true);
  assert.equal(await textarea.inputValue(), "把当前页标题改得更清楚");
  assert.equal(await page.locator("#work-thread .tool-row.is-expandable").last().count(), 1);
  await page.locator("#work-thread .tool-row.is-expandable").last().click();
  assert.equal(await page.locator("#work-thread .tool-row.is-open .tool-detail").last().isVisible(), true);
  const versionsAfter = await page.evaluate(async () => (await (await fetch("/api/versions")).json()).versions.length);
  assert.equal(versionsAfter, versionsBefore);
  record("enter-failure-recovery-retry-tool", "real-local", "Enter submitted; no-session failed honestly; input, form, retry, and expandable error detail recovered without a version");
  await shot(page, "no-session-recovered");

  const fileA = path.join(scratch, "facts.md");
  const fileB = path.join(scratch, "metrics.csv");
  fs.writeFileSync(fileA, "# Facts\nRevenue: 42\n");
  fs.writeFileSync(fileB, "metric,value\nretention,91%\n");
  let releaseUpload;
  let markUploadSeen;
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const uploadSeen = new Promise((resolve) => { markUploadSeen = resolve; });
  const delayedUpload = async (route) => {
    markUploadSeen();
    await uploadGate;
    await route.continue();
  };
  // The editor posts attachments to /api/attachments?project=…, so the bare glob
  // no longer matches; route by pathname and bound the wait so a future URL
  // change fails loudly instead of hanging the suite.
  const attachmentRoute = (url) => url.pathname === "/api/attachments";
  await page.route(attachmentRoute, delayedUpload);
  const bubblesBeforeUpload = await page.locator("#work-thread > .bubble").count();
  await page.locator("#agent-attachment-file").setInputFiles([fileA, fileB]);
  await Promise.race([
    uploadSeen,
    page.waitForTimeout(15_000).then(() => {
      throw new Error("attachment upload was never routed; /api/attachments URL may have changed again");
    }),
  ]);
  await textarea.fill("附件还没上传完时不能发送");
  await textarea.press("Enter");
  assert.match(await page.locator("#app-toast").innerText(), /附件仍在上传/);
  assert.equal(await page.locator("#work-thread > .bubble").count(), bubblesBeforeUpload);
  releaseUpload();
  await page.waitForFunction(() => document.querySelectorAll("#agent-attachments .agent-attachment-chip").length === 2);
  await page.unroute(attachmentRoute, delayedUpload);
  record("attachment-upload-submit-guard", "real-local", "send was rejected while an attachment upload was still unresolved");
  const idsBeforeReload = await page.locator("#agent-attachments .agent-attachment-chip").evaluateAll((nodes) => nodes.map((node) => node.dataset.attachmentId));
  await page.reload({ waitUntil: "networkidle" });
  await ready(page);
  assert.equal(await page.locator("#agent-attachments .agent-attachment-chip").count(), 2);
  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  const removedId = idsBeforeReload[0];
  await page.locator("#agent-attachments .agent-attachment-chip button").first().click();
  await page.waitForFunction(() => document.querySelectorAll("#agent-attachments .agent-attachment-chip").length === 1);
  assert.equal((await page.request.get(`${BASE}/api/attachments/${encodeURIComponent(removedId)}`)).status(), 404);
  record("attachment-pending-remove-refresh", "real-local", "two files uploaded to the Agent API, survived refresh as pending chips, and exact removal deleted server context");

  const model = await page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
  const pageIds = model.pagePaths.map((value) => String(value).split("/").pop().replace(/\.page$/i, ""));
  const baselinePages = pageIds.map((pageId, index) => ({
    pageId,
    revision: 1,
    pageSha256: crypto.createHash("sha256").update(`before-${index}:${pageId}`).digest("hex"),
  }));
  let turnStarted = false;
  let statePoll = 0;
  let mode = "success";
  let capturedTurn;
  let capturedLock;
  let turnCalls = 0;
  let stopCalls = 0;
  const responseJson = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  fakeRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.pathname === "/api/generation-activity") {
      return responseJson(route, { phase: "complete", sessionId: "audit-session", provider: { providerId: "test-double", modelId: "deterministic" }, project: { path: project, pageCount: pageIds.length } });
    }
    if (method === "GET" && url.pathname === "/slides/state/audit-session") {
      if (!turnStarted) return responseJson(route, { agentStatus: "idle", inspection: { pages: baselinePages } });
      statePoll += 1;
      const changedIds = new Set((capturedTurn?.editorEdit?.pages || [capturedTurn?.editorEdit]).map((item) => item?.pageId).filter(Boolean));
      const pages = baselinePages.map((entry) => changedIds.has(entry.pageId) && mode === "success" ? { ...entry, revision: 2, pageSha256: `${entry.pageSha256}-changed` } : entry);
      return responseJson(route, { agentStatus: mode === "cancel" || statePoll === 1 ? "busy" : "idle", inspection: { pages } });
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock") {
      capturedLock = request.postDataJSON();
      return responseJson(route, {
        ok: true,
        lock: {
          token: "audit-lock",
          scope: {
            ...capturedLock.workspaceEdit,
            targetPages: capturedLock.workspaceEdit?.targetPages || [],
          },
        },
      });
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/renew") return responseJson(route, { ok: true, lock: { expiresAt: Date.now() + 60_000 } });
    if (method === "DELETE" && url.pathname === "/api/reviews/ai-lock") return responseJson(route, { ok: true, released: true });
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/verify") return responseJson(route, {
      ok: true,
      changed: true,
      changedTargetPageIds: (capturedTurn?.editorEdit?.pages || []).map((entry) => entry.pageId),
      scopeViolation: false,
    });
    if (method === "POST" && url.pathname === "/api/versions") return responseJson(route, { version: { id: `v-audit-${Date.now()}`, label: "Agent 修改前" } });
    if (method === "POST" && url.pathname === "/api/versions/restore") return responseJson(route, { model, thumbs: [], versions: [] });
    if (method === "POST" && url.pathname === "/slides/sessions/audit-session/turn") {
      turnCalls += 1;
      capturedTurn = request.postDataJSON();
      turnStarted = true;
      statePoll = 0;
      return responseJson(route, { ok: true, sessionId: "audit-session", agentStatus: "busy", attachments: (capturedTurn.attachments || []).map((id) => ({ id })) });
    }
    if (method === "POST" && url.pathname === "/slides/sessions/audit-session/stop") {
      stopCalls += 1;
      return responseJson(route, { ok: true, stopped: true });
    }
    return route.continue();
  };
  await page.route("**/*", fakeRoute);
  await page.reload({ waitUntil: "networkidle" });
  await ready(page);
  await page.locator("#btn-sparkles").click();
  await textarea.fill("优化当前页标题层级");
  await page.evaluate(() => {
    document.getElementById("work-form")?.requestSubmit();
    document.getElementById("work-form")?.requestSubmit();
  });
  await page.waitForFunction(() => document.querySelector("[data-agent-cancel]")?.disabled === false);
  assert.equal(await page.locator("#agent-attachments .agent-attachment-chip button").isDisabled(), true, "submitted attachments must be frozen until the turn settles");
  await page.waitForFunction(() => [...document.querySelectorAll("#work-thread .refine-card")].some((node) => /已修改/.test(node.textContent || "")));
  assert.equal(capturedTurn.attachments.length, 1);
  assert.equal(capturedTurn.editorEdit.pages.length, 1);
  assert.equal(turnCalls, 1, "two same-tick submits must enqueue one Agent turn");
  await page.waitForFunction(() => document.querySelectorAll("#agent-attachments .agent-attachment-chip").length === 0);
  assert.equal(await page.locator("#agent-attachments .agent-attachment-chip").count(), 0);
  record("attachment-turn-page-scope-success", "http-test-double", "the submitted DSH turn froze removal, carried the pending attachment ID and one authorized page, then consumed the chip");

  const targetIds = model.elements.slice(0, 2).map((element) => element.id);
  assert.equal(targetIds.length, 2, "fixture needs two elements for an exact multi-selection scope");
  const selectResponse = (id, multi) => page.waitForResponse((response) => {
    if (!isApiCommandUrl(response.url()) || response.request().method() !== "POST") return false;
    const body = response.request().postDataJSON();
    return body.cmd === "select" && (multi ? body.elementIds?.includes(id) : body.elementId === id);
  });
  await Promise.all([
    selectResponse(targetIds[0], false),
    page.locator(`#slide .el[data-id="${targetIds[0]}"]`).dispatchEvent("click"),
  ]);
  await Promise.all([
    selectResponse(targetIds[1], true),
    page.locator(`#slide .el[data-id="${targetIds[1]}"]`).dispatchEvent("click", { shiftKey: true }),
  ]);
  await page.waitForFunction((ids) => {
    const selected = [...document.querySelectorAll("#slide .el.selected")].map((node) => node.getAttribute("data-id"));
    return ids.every((id) => selected.includes(id));
  }, targetIds);
  assert.match(await page.locator("#work-target").innerText(), /当前页/,
    "a leftover canvas selection must not silently change the Agent workspace default from current page");
  const completedBeforeElements = await page.locator("#work-thread .refine-card").count();
  turnStarted = false;
  capturedTurn = undefined;
  capturedLock = undefined;
  await textarea.fill("把选中的两个对象层级拉开，其他内容保持不变");
  assert.match(await page.locator("#work-target").innerText(), /已选 2 个对象/,
    "only an explicit selected-object request may opt into the exact elements scope");
  assert.equal(await page.locator("#work-target").getAttribute("data-scope"), "elements");
  assert.equal(await page.locator("#work-target").getAttribute("data-valid"), "true");
  await textarea.press("Enter");
  await page.waitForFunction((count) => document.querySelectorAll("#work-thread .refine-card").length > count, completedBeforeElements);
  assert.equal(capturedLock.workspaceEdit.kind, "elements");
  assert.deepEqual(capturedLock.workspaceEdit.elementIds, targetIds);
  assert.match(capturedTurn.text, /只调用 edit_elements/);
  assert.match(capturedTurn.text, new RegExp(targetIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("、")));
  assert.doesNotMatch(capturedTurn.text, /随后 write_page 必须/);
  assert.equal(capturedTurn.editorEdit.pages.length, 1);
  record("multi-selection-exact-elements-scope", "http-test-double", `two selected objects stayed an exact elements scope (${targetIds.join(", ")}) and the turn required edit_elements rather than write_page`);

  turnStarted = false;
  capturedTurn = undefined;
  const deckBrief = "把整份文稿所有页面统一成克制的红白商务风";
  const deckTurnCallsBefore = turnCalls;
  await textarea.fill(deckBrief);
  assert.match(await page.locator("#work-target").innerText(), new RegExp(`整份文稿 · ${pageIds.length} 页`));
  await textarea.press("Enter");
  const deckDialog = page.locator("#deck-agent-confirm-dialog");
  await deckDialog.waitFor({ state: "visible" });
  assert.equal((await page.locator("#deck-agent-confirm-scope").innerText()).trim(), `整份文稿 · ${pageIds.length} 页`);
  assert.equal((await page.locator("#deck-agent-confirm-provider").innerText()).trim(), "test-double / deterministic");
  assert.match(await page.locator("#deck-agent-confirm-copy").innerText(), new RegExp(`整份 ${pageIds.length} 页.*发送前会保存一个可恢复版本`));
  assert.match(await deckDialog.innerText(), /恢复点\s*修改前保存版本/);
  assert.equal(await textarea.inputValue(), deckBrief, "opening confirmation must preserve the unsent brief");
  assert.equal(await page.locator("#deck-agent-confirm-send").evaluate((node) => node === document.activeElement), true,
    "confirmation must focus its primary action");

  const beforeProtectedKeys = await page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Meta+z");
  const afterProtectedKeys = await page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
  assert.deepEqual(afterProtectedKeys.elements, beforeProtectedKeys.elements, "Delete/Cmd-Z in confirmation must not mutate the slide");
  assert.equal(turnCalls, deckTurnCallsBefore, "confirmation keyboard input must not dispatch the Agent turn");

  await page.keyboard.press("Escape");
  await deckDialog.waitFor({ state: "hidden" });
  assert.equal(turnCalls, deckTurnCallsBefore, "Escape must cancel without sending");
  assert.equal(await textarea.inputValue(), deckBrief);
  assert.equal(await textarea.evaluate((node) => node === document.activeElement), true, "Escape must return focus to the composer");

  await textarea.press("Enter");
  await deckDialog.waitFor({ state: "visible" });
  await deckDialog.locator('button[value="cancel"]').click();
  await deckDialog.waitFor({ state: "hidden" });
  assert.equal(turnCalls, deckTurnCallsBefore, "Cancel must not send");
  assert.equal(await textarea.inputValue(), deckBrief);
  assert.equal(await textarea.evaluate((node) => node === document.activeElement), true, "Cancel must return focus to the composer");

  await textarea.press("Enter");
  await deckDialog.waitFor({ state: "visible" });
  await page.locator("#deck-agent-confirm-send").click();
  await page.waitForFunction(() => [...document.querySelectorAll("#work-thread .refine-card")].some((node) => /整份文稿/.test(node.textContent || "")));
  assert.equal(turnCalls, deckTurnCallsBefore + 1, "only confirmed deck scope may dispatch one Agent turn");
  assert.equal(capturedTurn.editorEdit.pages.length, pageIds.length);
  record("deck-scope", "http-test-double", `whole-deck wording required explicit provider/page/recovery confirmation; Escape and Cancel did not send, modal Delete/Cmd-Z did not reach the canvas, and confirmation authorized exactly ${pageIds.length} pages`);

  mode = "cancel";
  turnStarted = false;
  capturedTurn = undefined;
  await textarea.fill("把当前页标题改成取消测试");
  await textarea.press("Enter");
  for (let i = 0; i < 100 && !turnStarted; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(turnStarted, true, "cancel-after-dispatch scenario must first reach the DSH turn endpoint");
  // The composer square is the single stop entry now (the header button was
  // retired into it), so an empty composer during a locked turn means "stop".
  const stopSquare = page.locator("#work-form .composer-send.is-stopping");
  await stopSquare.waitFor({ state: "visible" });
  assert.equal(await stopSquare.getAttribute("data-control"), "chrome.workspace.stop");
  await stopSquare.click();
  await page.waitForFunction(() => [...document.querySelectorAll("#work-thread .bubble")].some((node) => /已取消这次 Agent 修改/.test(node.textContent || "")));
  assert.equal(stopCalls, 1);
  assert.equal(await page.locator("#work-form").isVisible(), true);
  assert.equal(await textarea.inputValue(), "把当前页标题改成取消测试");
  record("cancel-and-retry", "http-test-double", "cancel requested host stop, restored the protected snapshot, unlocked the form, and restored editable input");
  await shot(page, "cancel-recovered");

  await page.unroute("**/*", fakeRoute);
  fakeRoute = undefined;
  await page.evaluate(() => localStorage.setItem("oss.propertyPanelCollapsed", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await ready(page);
  await page.locator("#btn-sparkles").click();
  await page.locator("#work-chat").waitFor({ state: "visible" });
  await Promise.all([
    page.waitForResponse((response) => isApiCommandUrl(response.url()) && response.request().postDataJSON()?.cmd === "select"),
    page.locator("#slide").dispatchEvent("click"),
  ]);
  await page.locator("#slide").dispatchEvent("contextmenu", { button: 2, clientX: 20, clientY: 20 });
  await page.locator("#ctx-menu").waitFor({ state: "visible" });
  const blankActions = (await page.locator("#ctx-menu button").allTextContents())
    .map((text) => text.replace(/⌘./g, "").trim());
  // 设置背景色 retired with the theme menu: a blank canvas offers paste only.
  assert.deepEqual(blankActions, ["粘贴"]);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#ctx-menu").isHidden(), true);
  // The panel's collapsed flag is a pure user choice now (the retired 设置背景色
  // action used to expand it), so this case only asserts the surviving menu contract.
  record("blank-menu-and-panel", "real-local", "blank-canvas menu exposes only the surviving paste action; property-panel collapse stays a user choice");
  await page.locator("#chat-close").click();
  await page.locator("#work-chat").waitFor({ state: "hidden" });
  await page.locator("#btn-comments").click();
  await page.locator("#comment-panel").waitFor({ state: "visible" });
  // 真实用户路径：先点选批注目标（批注不会移动对象），再写意见。
  const auditTarget = await page.locator("#slide .el").first().boundingBox();
  await page.mouse.click(auditTarget.x + auditTarget.width / 2, auditTarget.y + auditTarget.height / 2);
  await page.locator("#comment-target-chips button").first().waitFor({ state: "visible" });
  await page.locator("#comment-draft").fill("请让 Agent 核对标题层级");
  await page.locator("#comment-add").click();
  await page.locator('#comment-list .comment-card [data-act="ai"]').last().click();
  await page.locator(".ai-review-consent").waitFor({ state: "visible" });
  assert.match(await page.locator(".ai-review-consent p").innerText(), /尚未确认当前 AI 提供方/);
  assert.equal(await page.locator(".ai-review-consent [data-consent=send]").isDisabled(), true);
  await page.locator(".ai-review-consent [data-consent=cancel]").click();
  record("comment-to-agent-consent", "real-local", "saved comment reached explicit provider consent and refused send when no recipient was known");

  assert.deepEqual(report.browserErrors, []);
  report.ok = true;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`OK editor-agent-human-audit ${path.join(OUT, "report.json")}`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: path.join(OUT, "FAIL.png") }).catch(() => undefined);
  throw error;
} finally {
  if (fakeRoute) await page.unroute("**/*", fakeRoute).catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  server.kill("SIGKILL");
  fs.rmSync(scratch, { recursive: true, force: true });
}
