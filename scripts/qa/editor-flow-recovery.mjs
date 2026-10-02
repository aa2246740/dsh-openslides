#!/usr/bin/env node
/**
 * Regression gate for the editor handoff/recovery states documented in
 * output/editor-rework/flow-fixes.md. Every case gets a fresh browser page and
 * reports independently so one red contract does not hide the remaining reds.
 * The server and project are isolated fixture copies; no live deck is opened.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-flow-recovery-"));
const project = path.join(scratch, "project");
fs.cpSync(path.join(ROOT, "fixtures/okp-yu7-ppt"), project, { recursive: true });

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return address.port;
}

const port = Number(process.env.QA_PORT || await freePort());
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), OPEN_SLIDESTUDIO_PROJECT: project },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
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

async function openEditor(page, query = {}) {
  const params = new URLSearchParams({ project, ...query });
  await page.goto(`${base}/index.html?${params}`, { waitUntil: "networkidle" });
  await ready(page);
}

async function readModel(page) {
  return page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
}

async function showComments(page) {
  const panel = page.locator("#comment-panel");
  if (await panel.isHidden()) await page.locator("#btn-comments").click();
  await panel.waitFor({ state: "visible" });
}

async function createComment(page, text) {
  const current = await readModel(page);
  const anchor = current.elements?.[0];
  assert.ok(anchor?.id, "fixture needs one element for a scoped comment");
  // Dispatch through the real slide delegation without requiring the chosen
  // element's visual center to be unobscured by a higher z-order element.
  await page.locator(`#slide .el[data-id="${anchor.id}"]`).dispatchEvent("click");
  await showComments(page);
  await page.locator('[data-comment-scope="elements"]').click();
  await page.locator("#comment-draft").fill(text);
  await page.locator("#comment-add").click();
  await page.locator("#comment-list .comment-card", { hasText: text }).waitFor({ state: "visible" });
  return current;
}

await waitForServer();
const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const failures = [];

async function runCase(name, body) {
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  try {
    await body(page);
    assert.deepEqual(browserErrors, [], `unexpected browser errors:\n${browserErrors.join("\n")}`);
    console.log(`PASS editor-flow-recovery: ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL editor-flow-recovery: ${name}\n${error?.stack || error}`);
  } finally {
    await page.close().catch(() => {});
  }
}

try {
  await runCase("no-session Agent workspace shows its scope guidance", async (page) => {
    await openEditor(page);
    await page.locator("#btn-sparkles").click();
    await page.locator("#work-chat").waitFor({ state: "visible" });
    await page.locator("#work-empty").waitFor({ state: "visible", timeout: 5_000 });
    assert.match(await page.locator("#work-empty").innerText(), /当前页|所选对象|整份文稿/);
  });

  await runCase("comment loading is distinct from authoritative empty", async (page) => {
    await openEditor(page);
    let releaseRead;
    const readGate = new Promise((resolve) => { releaseRead = resolve; });
    let markReadStarted;
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    let markReadFinished;
    const readFinished = new Promise((resolve) => { markReadFinished = resolve; });
    const delayedRead = async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      markReadStarted();
      try {
        await readGate;
        return await route.continue();
      } finally {
        markReadFinished();
      }
    };
    await page.route("**/api/reviews?*", delayedRead);
    try {
      await showComments(page);
      await readStarted;
      const pendingCopy = await page.locator("#comment-list").innerText();
      assert.match(pendingCopy, /加载|读取|同步/);
      assert.doesNotMatch(pendingCopy, /还没有未解决批注/);
    } finally {
      releaseRead();
      await readFinished;
      await page.unroute("**/api/reviews?*", delayedRead);
    }
    await page.locator("#comment-list .comment-list-empty").waitFor({ state: "visible", timeout: 5_000 });
  });

  await runCase("failed comment resolve rolls back and remains visible", async (page) => {
    const text = `Flow recovery resolve ${Date.now()}`;
    await openEditor(page);
    await createComment(page, text);
    let releaseResolve;
    const resolveGate = new Promise((resolve) => { releaseResolve = resolve; });
    let resolveRequests = 0;
    const failResolve = async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      resolveRequests += 1;
      await resolveGate;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced resolve failure" }),
      });
    };
    await page.route("**/api/reviews", failResolve);
    const card = page.locator("#comment-list .comment-card", { hasText: text });
    const commentId = await card.getAttribute("data-comment-id");
    assert.ok(commentId, "saved comment card needs a durable id");
    const resolve = card.locator('[data-act="del"]');
    try {
      await resolve.click();
      await page.waitForFunction((id) => {
        const cardNode = document.querySelector(`#comment-list .comment-card[data-comment-id="${CSS.escape(id)}"]`);
        const button = cardNode?.querySelector('[data-act="del"]');
        return cardNode?.getAttribute("aria-busy") === "true" && button?.disabled;
      }, commentId, { timeout: 5_000 });
      await resolve.click({ force: true }).catch(() => {});
    } finally {
      releaseResolve();
    }
    await page.waitForFunction(() => /forced resolve failure|批注保存失败/.test(document.getElementById("app-toast")?.textContent || ""));
    await card.waitFor({ state: "visible" });
    assert.equal(resolveRequests, 1, "resolve busy state must prevent a duplicate PATCH");
    await page.unroute("**/api/reviews", failResolve);

    const serverComments = await page.evaluate(async ({ projectPath }) => {
      const state = await (await fetch("/api/model")).json();
      const pagePath = state.model.pagePaths[state.model.pageIndex];
      return (await (await fetch(`/api/reviews?pagePath=${encodeURIComponent(pagePath)}&project=${encodeURIComponent(projectPath)}`)).json()).comments;
    }, { projectPath: project });
    assert.equal(serverComments.some((comment) => comment.text === text && !comment.resolved), true);
  });

  await runCase("comment HTTP error labels cache and Retry restores authoritative state", async (page) => {
    const text = `Flow recovery cache ${Date.now()}`;
    await openEditor(page);
    await createComment(page, text);
    let failNextRead = true;
    const failThenRecover = async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      if (failNextRead) {
        failNextRead = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "forced review read failure" }),
        });
      }
      return route.continue();
    };
    await page.route("**/api/reviews?*", failThenRecover);
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await showComments(page);
    await page.waitForFunction(() => /缓存|离线/.test(document.getElementById("comment-list")?.textContent || ""), null, { timeout: 5_000 });
    const retry = page.getByRole("button", { name: /重试|重新加载/ });
    await retry.waitFor({ state: "visible" });
    await retry.click();
    await page.waitForFunction((commentText) => {
      const list = document.getElementById("comment-list");
      return Boolean([...list?.querySelectorAll(".comment-card") || []].some((node) => node.textContent?.includes(commentText))) &&
        !/缓存|离线|失败/.test(list?.textContent || "");
    }, text);
    await page.unroute("**/api/reviews?*", failThenRecover);
  });

  await runCase("live disconnect is fail-closed until same-session terminal", async (page) => {
    let activityMode = "active";
    const current = await (await fetch(`${base}/api/model`)).json();
    const routeActivity = async (route) => {
      if (activityMode === "disconnected") return route.abort("failed");
      const sessionId = activityMode === "other-terminal" ? "other-session" : "flow-session";
      const phase = activityMode === "active" ? "generating" : "complete";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId,
          phase,
          provider: { providerId: "qa", modelId: "recovery-double" },
          project: { path: project, pageCount: current.model.pageCount },
          events: [],
          inspection: { pages: [] },
        }),
      });
    };
    await page.route("**/api/generation-activity?*", routeActivity);
    await openEditor(page, { live: "1", session: "flow-session" });
    await page.waitForFunction(() => document.querySelector(".app")?.classList.contains("is-live-generation"));

    activityMode = "disconnected";
    await page.waitForFunction(() => /断|连接|读取失败|重连/.test(document.getElementById("editor-generation-detail")?.textContent || ""), null, { timeout: 8_000 });
    assert.equal(await page.locator("#work-brief").isDisabled(), true);
    assert.doesNotMatch(await page.locator("#editor-generation-detail").innerText(), /解除写入保护/);
    const elementsBefore = (await readModel(page)).elements.length;
    await page.locator('[data-insert="text"]').first().click({ force: true }).catch(() => {});
    assert.equal((await readModel(page)).elements.length, elementsBefore, "disconnect must block insertion");

    activityMode = "other-terminal";
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    assert.equal(await page.locator("#work-brief").isDisabled(), true, "another session cannot release this route");

    activityMode = "same-terminal";
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await page.waitForFunction(() => !document.querySelector("#work-brief")?.disabled, null, { timeout: 8_000 });
    await page.unroute("**/api/generation-activity?*", routeActivity);
  });
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} editor flow recovery case(s) failed:`);
  for (const { name, error } of failures) console.error(`- ${name}: ${error?.message || error}`);
  process.exitCode = 1;
}
