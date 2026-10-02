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
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, "output/editor-agent-scope-routing"));

async function randomPort() {
  const holder = net.createServer();
  await new Promise((resolve, reject) => {
    holder.once("error", reject);
    holder.listen(0, "127.0.0.1", resolve);
  });
  const address = holder.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => holder.close(resolve));
  assert.ok(port > 0);
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-agent-scope-"));
const project = path.join(scratch, "project");
fs.cpSync(path.join(ROOT, "fixtures/okp-yu7-ppt"), project, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const report = {
  schemaVersion: "open-slidestudio.editor-agent-scope-routing.v2",
  startedAt: new Date().toISOString(),
  runtime: "repository adapter -> ~/.codex/playwright-runtime/runtime.mjs",
  isolation: { port: PORT, project, contactedLivePorts: false },
  rows: [],
  browserErrors: [],
  requests: { locks: [], lockScopes: [], versions: [], turns: [], restores: [], releases: [] },
  limitations: [
    "DSH session and turn responses are explicitly labelled deterministic HTTP doubles; this run proves browser routing and request contracts, not provider quality.",
    "Backend prospective-write guard injection and root native multi-page model acceptance are separate gates in docs/qa/editor-agent-scope-routing-matrix.md.",
    "Existing icon, SmartArt and formula-text preservation is exercised through the real canvas command, persistence and inspector paths; credentialed provider generation remains a separate root gate.",
  ],
};

function record(id, assertion, evidence = {}) {
  report.rows.push({ id, status: "pass", assertion, evidence });
  console.log(`PASS ${id}: ${assertion}`);
}

function shaFor(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function pageIdFromPath(value) {
  return String(value || "").split("/").pop().replace(/\.page$/i, "");
}

function responseJson(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitFor(predicate, label, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out: ${label}`);
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
  await waitFor(async () => {
    try {
      return (await fetch(`${BASE}/api/health`)).ok;
    } catch {
      return false;
    }
  }, `native-web server on ${PORT}`, 12_000);
}

let browser;
let page;
let fakeRoute;
let fatal;

try {
  await waitForServer();
  browser = await launchPinnedChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") report.browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => report.browserErrors.push(String(error)));

  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");

  const goToPage = (index) => Promise.all([
    page.waitForResponse((response) => {
      if (!isApiCommandUrl(response.url())) return false;
      const body = response.request().postDataJSON();
      return body?.cmd === "goToPage" && body?.index === index;
    }),
    page.locator("#rail .thumb").nth(index).click(),
  ]);
  await goToPage(2);
  const model = await page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
  assert.equal(model.pageIndex, 2, "fixture must be on page 3");
  const pageIds = model.pagePaths.map(pageIdFromPath);
  assert.equal(pageIds.length, 8, "scope matrix requires the eight-page fixture");
  const revisions = pageIds.map((pageId, index) => ({
    pageId,
    revision: index + 11,
    pageSha256: shaFor(`scope-baseline:${pageId}`),
  }));

  const initialIds = model.elements.slice(0, 2).map((element) => element.id);
  assert.equal(initialIds.length, 2, "page 3 must contain at least two selectable elements");
  const restoredModel = structuredClone(model);
  restoredModel.selection = { kind: "multi", elementIds: initialIds };
  const selectResponse = (id, multi) => page.waitForResponse((response) => {
    if (!isApiCommandUrl(response.url())) return false;
    const body = response.request().postDataJSON();
    return body?.cmd === "select" && (multi ? body.elementIds?.includes(id) : body.elementId === id);
  });
  await Promise.all([
    selectResponse(initialIds[0], false),
    page.locator(`#slide .el[data-id="${initialIds[0]}"]`).dispatchEvent("click"),
  ]);
  await Promise.all([
    selectResponse(initialIds[1], true),
    page.locator(`#slide .el[data-id="${initialIds[1]}"]`).dispatchEvent("click", { shiftKey: true }),
  ]);

  let lockSequence = 0;
  fakeRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.pathname === "/api/generation-activity") {
      return responseJson(route, {
        phase: "complete",
        sessionId: "scope-audit-session",
        provider: { providerId: "test-double", modelId: "scope-contract" },
        project: { path: project, pageCount: pageIds.length },
      });
    }
    if (method === "GET" && url.pathname === "/slides/state/scope-audit-session") {
      return responseJson(route, { agentStatus: "idle", inspection: { pages: revisions } });
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock") {
      const body = request.postDataJSON();
      report.requests.locks.push(body);
      lockSequence += 1;
      const requestText = String(body.workspaceEdit.requestText || "").replace(/\s+/g, "");
      const backgroundColorOverride = body.workspaceEdit.kind !== "elements" &&
        /背景/.test(requestText) && !/背景(?:图|图片|照片)/.test(requestText);
      const lockedScope = {
        ...body.workspaceEdit,
        backgroundColorOverride,
        targetPages: body.workspaceEdit.targetPages,
      };
      report.requests.lockScopes.push(lockedScope);
      return responseJson(route, {
        ok: true,
        lock: {
          token: `scope-lock-${lockSequence}`,
          scope: lockedScope,
        },
      });
    }
    if (method === "POST" && url.pathname === "/api/reviews/ai-lock/renew") {
      return responseJson(route, { ok: true, lock: { expiresAt: Date.now() + 60_000 } });
    }
    if (method === "DELETE" && url.pathname === "/api/reviews/ai-lock") {
      report.requests.releases.push(request.postDataJSON());
      return responseJson(route, { ok: true, released: true });
    }
    if (method === "POST" && url.pathname === "/api/versions") {
      const body = request.postDataJSON();
      report.requests.versions.push(body);
      return responseJson(route, { version: { id: `scope-version-${report.requests.versions.length}`, label: "Agent 修改前" } });
    }
    if (method === "POST" && url.pathname === "/api/versions/restore") {
      report.requests.restores.push(request.postDataJSON());
      return responseJson(route, { model: restoredModel, thumbs: [], versions: [], reviewsPreserved: true });
    }
    if (method === "POST" && url.pathname === "/slides/sessions/scope-audit-session/stop") {
      return responseJson(route, { ok: true, stopped: true });
    }
    if (method === "POST" && url.pathname === "/slides/sessions/scope-audit-session/turn") {
      report.requests.turns.push(request.postDataJSON());
      return responseJson(route, { ok: false, error: "INJECTED_SCOPE_TURN_STOP" });
    }
    return route.continue();
  };
  await page.route("**/*", fakeRoute);
  await page.locator("#btn-sparkles").click();
  const textarea = page.locator("#work-brief");
  const target = page.locator("#work-target");

  assert.match(await target.innerText(), /第 3 页 · 当前页/);
  assert.equal(await target.getAttribute("data-scope"), "page");
  assert.equal(await target.getAttribute("data-valid"), "true");
  record("default-current-page-with-selection", "A leftover two-object selection keeps the Agent target on current page", {
    selectedElementIds: initialIds,
    currentPageId: pageIds[2],
  });

  const inspectTarget = async ({ id, prompt, scope, label, valid = true }) => {
    await textarea.fill(prompt);
    assert.equal(await target.getAttribute("data-scope"), scope, `${id} scope`);
    assert.equal(await target.getAttribute("data-valid"), String(valid), `${id} validity`);
    assert.equal(await textarea.getAttribute("aria-invalid"), valid ? "false" : "true", `${id} composer validity`);
    assert.match(await target.innerText(), label, `${id} label`);
    record(id, `Target parser resolved ${JSON.stringify(prompt)} without dispatch`, {
      scope,
      valid,
      label: await target.innerText(),
    });
  };

  const routingRows = [
    { id: "explicit-elements-target", prompt: "把选中的两个对象层级拉开，其他内容保持不变", scope: "elements", label: /已选 2 个对象/ },
    { id: "arabic-page-2", prompt: "修改第2页标题", scope: "pages", label: /第 2 页 · 指定页面/ },
    { id: "chinese-page-2", prompt: "修改第二页标题", scope: "pages", label: /第 2 页 · 指定页面/ },
    { id: "list-pages-2-4", prompt: "修改第2、4页标题", scope: "pages", label: /第 2、4 页 · 指定 2 页/ },
    { id: "conjunction-pages-2-4", prompt: "修改第2和第4页标题", scope: "pages", label: /第 2、4 页 · 指定 2 页/ },
    { id: "range-pages-2-4", prompt: "统一第2-4页背景", scope: "pages", label: /第 2、3、4 页 · 指定 3 页/ },
    { id: "attribute-number-not-page", prompt: "字号改24", scope: "page", label: /第 3 页 · 当前页/ },
    { id: "numeric-list-not-pages", prompt: "把两个数值改成2和4", scope: "page", label: /第 3 页 · 当前页/ },
    { id: "font-size-list-not-pages", prompt: "字号用24和36", scope: "page", label: /第 3 页 · 当前页/ },
    { id: "current-page-all-text-not-deck", prompt: "本页所有文字字号统一", scope: "page", label: /第 3 页 · 当前页/ },
    { id: "negated-deck-page-2", prompt: "不要改整份，只改第2页", scope: "pages", label: /第 2 页 · 指定页面/ },
    { id: "excluded-page-2-positive-page-4", prompt: "不要改第2页，改第4页", scope: "pages", label: /第 4 页 · 指定页面/ },
    { id: "whole-deck-background", prompt: "把整份 PPT 背景改成浅蓝色", scope: "deck", label: /整份文稿 · 8 页/ },
    { id: "full-range-normalizes-deck", prompt: "修改第1-8页背景", scope: "deck", label: /覆盖整份文稿/ },
    { id: "out-of-range", prompt: "修改第9页标题", scope: "invalid", label: /超出.*1–8/, valid: false },
    { id: "negative-page-number", prompt: "修改第-1页标题", scope: "invalid", label: /页码|格式|无法/, valid: false },
    { id: "fractional-page-number", prompt: "修改第2.5页标题", scope: "invalid", label: /页码|格式|无法/, valid: false },
    { id: "contradictory-subset-and-deck", prompt: "只改第2页，同时修改整份PPT", scope: "invalid", label: /范围互相冲突/, valid: false },
    { id: "elements-and-other-page-conflict", prompt: "把所选对象和第4页标题一起修改", scope: "invalid", label: /所选对象.*不能同时指定其他页面/, valid: false },
  ];
  for (const row of routingRows) await inspectTarget(row);

  const submitAndCapture = async ({ id, prompt, scope, pageIndexes, elementIds = [], deck = false, backgroundColorOverride = false }) => {
    await textarea.fill(prompt);
    assert.equal(await target.getAttribute("data-scope"), scope);
    const before = {
      locks: report.requests.locks.length,
      versions: report.requests.versions.length,
      turns: report.requests.turns.length,
      restores: report.requests.restores.length,
    };
    await textarea.press("Enter");
    if (deck) {
      const dialog = page.locator("#deck-agent-confirm-dialog");
      await dialog.waitFor({ state: "visible" });
      assert.match(await page.locator("#deck-agent-confirm-scope").innerText(), /整份文稿 · 8 页/);
      await page.locator("#deck-agent-confirm-send").click();
    }
    await waitFor(() => report.requests.turns.length === before.turns + 1, `${id} turn capture`);
    await page.waitForFunction(() => {
      const form = document.getElementById("work-form");
      const input = document.getElementById("work-brief");
      return form && !form.hidden && input && !input.disabled && input.value.length > 0;
    });
    assert.equal(report.requests.locks.length, before.locks + 1, `${id} lock count`);
    assert.equal(report.requests.versions.length, before.versions + 1, `${id} version count`);
    assert.equal(report.requests.turns.length, before.turns + 1, `${id} turn count`);
    await waitFor(() => report.requests.restores.length === before.restores + 1, `${id} restore after injected failure`);

    const lock = report.requests.locks.at(-1).workspaceEdit;
    const lockedScope = report.requests.lockScopes.at(-1);
    const turn = report.requests.turns.at(-1);
    const expectedPageIds = pageIndexes.map((index) => pageIds[index]);
    assert.equal(lock.kind, scope);
    assert.equal(lock.pageId, scope === "deck" ? pageIds[2] : expectedPageIds[0]);
    assert.deepEqual(lock.targetPages.map((entry) => entry.pageId), expectedPageIds);
    assert.deepEqual(lock.elementIds, elementIds);
    assert.equal(lock.requestText, prompt, "the server must receive the exact request text used to bind background-color capability");
    assert.equal(lockedScope.backgroundColorOverride, backgroundColorOverride);
    assert.deepEqual(turn.editorEdit.pages.map((entry) => entry.pageId), expectedPageIds);
    assert.deepEqual(turn.editorEdit.pages, lock.targetPages);
    if (scope === "elements") {
      assert.match(turn.text, /只允许修改所选元素/);
      for (const elementId of elementIds) assert.match(turn.text, new RegExp(elementId));
      assert.match(turn.text, /只调用 edit_elements/);
    } else if (scope === "pages") {
      for (const pageId of expectedPageIds) assert.match(turn.text, new RegExp(pageId));
      for (const [index, pageId] of pageIds.entries()) {
        if (!pageIndexes.includes(index)) assert.doesNotMatch(turn.text, new RegExp(`允许修改[^\n]*${pageId}`));
      }
    } else if (scope === "deck") {
      assert.match(turn.text, /整份文稿/);
    }
    record(id, "Displayed target, lock scope, protected version and DSH turn carried the same exact authorization", {
      scope,
      pageIds: expectedPageIds,
      elementIds,
      backgroundColorOverride,
      version: report.requests.versions.at(-1),
    });
  };

  await submitAndCapture({ id: "payload-default-current-page", prompt: "优化标题层级", scope: "page", pageIndexes: [2] });
  await submitAndCapture({ id: "payload-explicit-elements", prompt: "把选中的两个对象层级拉开", scope: "elements", pageIndexes: [2], elementIds: initialIds });
  await submitAndCapture({ id: "payload-noncurrent-page", prompt: "修改第2页标题", scope: "pages", pageIndexes: [1] });
  await submitAndCapture({ id: "payload-subset-pages", prompt: "修改第2、4页标题", scope: "pages", pageIndexes: [1, 3] });
  await submitAndCapture({ id: "payload-range-pages", prompt: "统一第2-4页背景", scope: "pages", pageIndexes: [1, 2, 3], backgroundColorOverride: true });
  await submitAndCapture({ id: "payload-subset-hex-background", prompt: "把第2、4页背景改成 #F3F7FF", scope: "pages", pageIndexes: [1, 3], backgroundColorOverride: true });
  await submitAndCapture({ id: "payload-background-image-keeps-color-override-off", prompt: "把第2页背景图片换成新的照片", scope: "pages", pageIndexes: [1], backgroundColorOverride: false });
  await submitAndCapture({ id: "payload-deck-background", prompt: "把整份 PPT 背景改成浅蓝色", scope: "deck", pageIndexes: [0, 1, 2, 3, 4, 5, 6, 7], deck: true, backgroundColorOverride: true });

  const assertNoDispatch = async (id, prompt) => {
    await textarea.fill(prompt);
    assert.equal(await target.getAttribute("data-valid"), "false");
    assert.equal(await textarea.getAttribute("aria-invalid"), "true");
    const before = {
      locks: report.requests.locks.length,
      versions: report.requests.versions.length,
      turns: report.requests.turns.length,
    };
    await textarea.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.deepEqual({
      locks: report.requests.locks.length,
      versions: report.requests.versions.length,
      turns: report.requests.turns.length,
    }, before, `${id} must stop before lock/version/turn`);
    assert.equal(await textarea.inputValue(), prompt);
    record(id, "Invalid scope remained editable and emitted no lock, version or DSH turn", { prompt });
  };
  await assertNoDispatch("no-dispatch-out-of-range", "修改第9页标题");
  await assertNoDispatch("no-dispatch-negative-page", "修改第-1页标题");
  await assertNoDispatch("no-dispatch-fractional-page", "修改第2.5页标题");
  await assertNoDispatch("no-dispatch-contradiction", "只改第2页，同时修改整份PPT");
  await assertNoDispatch("no-dispatch-elements-page-conflict", "把所选对象和第4页标题一起修改");

  const forbiddenManualInsertSelectors = [
    "#btn-formula",
    '[data-insert="formula"]',
    '[data-insert="smartart"]',
    '[data-control="insert.smartart"]',
    '[data-insert="icon"]',
    '[data-lib="icon"]',
    '[data-control="insert.icon"]',
  ];
  for (const selector of forbiddenManualInsertSelectors) {
    assert.equal(await page.locator(selector).count(), 0, `manual insert entry remains: ${selector}`);
  }
  record("manual-icon-smartart-formula-entries-removed", "No manual icon, SmartArt or formula insertion control remains in the editor DOM", {
    selectors: forbiddenManualInsertSelectors,
  });

  // The manual insertion affordances are gone, but native content that already
  // exists (or arrives through Agent-authored page content) must remain fully
  // supported by the canvas model, command history, persistence and inspector.
  await page.unroute("**/*", fakeRoute);
  fakeRoute = null;
  const command = async (payload) => page.evaluate(async (body) => {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }, payload);
  const okCommand = async (payload) => {
    const result = await command(payload);
    assert.equal(result.status, 200, `${payload.cmd} failed: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, true, `${payload.cmd} response`);
    return result.body.model;
  };
  const byId = (nextModel, id) => nextModel.elements.find((element) => element.id === id);

  let preservedModel = await okCommand({ cmd: "insert", kind: "icon", iconName: "fas:star" });
  const iconId = preservedModel.selection.elementId;
  assert.equal(byId(preservedModel, iconId)?.type, "icon");
  preservedModel = await okCommand({ cmd: "setIconName", iconName: "fas:heart" });
  assert.equal(byId(preservedModel, iconId)?.iconName, "fas:heart");
  preservedModel = await okCommand({ cmd: "undo" });
  assert.equal(byId(preservedModel, iconId)?.iconName, "fas:star", "one undo must restore the icon edit");
  preservedModel = await okCommand({ cmd: "redo" });
  assert.equal(byId(preservedModel, iconId)?.iconName, "fas:heart", "one redo must restore the icon edit");
  record("existing-icon-edit-undo-redo", "An existing native icon remained editable and one undo/redo restored its exact icon name", {
    elementId: iconId,
    before: "fas:star",
    after: "fas:heart",
  });

  preservedModel = await okCommand({
    cmd: "insert",
    kind: "smartart",
    layout: "process",
    labels: ["需求", "设计", "交付"],
  });
  const smartArtElementId = preservedModel.selection.elementId;
  const smartArtId = byId(preservedModel, smartArtElementId)?.smartArt?.id;
  assert.ok(smartArtId, "inserted SmartArt must retain native metadata");
  preservedModel = await okCommand({ cmd: "setSmartArtLayout", layout: "cycle" });
  assert.equal(byId(preservedModel, smartArtElementId)?.smartArt?.layout, "cycle");
  preservedModel = await okCommand({ cmd: "undo" });
  assert.equal(byId(preservedModel, smartArtElementId)?.smartArt?.layout, "process", "one undo must restore the SmartArt layout");
  preservedModel = await okCommand({ cmd: "redo" });
  assert.equal(byId(preservedModel, smartArtElementId)?.smartArt?.layout, "cycle", "one redo must restore the SmartArt layout");
  record("existing-smartart-edit-undo-redo", "Existing native SmartArt remained editable and one undo/redo restored its exact layout", {
    smartArtId,
    elementId: smartArtElementId,
    before: "process",
    after: "cycle",
  });

  const formulaBefore = "f(x) = x²";
  const formulaAfter = "f(x) = x² + 1";
  preservedModel = await okCommand({ cmd: "insert", kind: "text", text: formulaBefore });
  const formulaElementId = preservedModel.selection.elementId;
  assert.equal(byId(preservedModel, formulaElementId)?.type, "text");
  preservedModel = await okCommand({ cmd: "setText", text: formulaAfter });
  assert.match(String(byId(preservedModel, formulaElementId)?.text || ""), /x² \+ 1/);
  preservedModel = await okCommand({ cmd: "undo" });
  assert.match(String(byId(preservedModel, formulaElementId)?.text || ""), /x²$/u, "one undo must restore the formula text");
  preservedModel = await okCommand({ cmd: "redo" });
  assert.match(String(byId(preservedModel, formulaElementId)?.text || ""), /x² \+ 1/u, "one redo must restore the formula edit");
  record("existing-formula-text-edit-undo-redo", "Formula text remained ordinary editable native text and one undo/redo preserved the change", {
    elementId: formulaElementId,
    before: formulaBefore,
    after: formulaAfter,
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  const persistedModel = await page.evaluate(async () => (await (await fetch("/api/model")).json()).model);
  assert.equal(byId(persistedModel, iconId)?.iconName, "fas:heart");
  assert.equal(byId(persistedModel, smartArtElementId)?.smartArt?.layout, "cycle");
  assert.match(String(byId(persistedModel, formulaElementId)?.text || ""), /x² \+ 1/u);
  assert.ok(persistedModel.allowedControlIds.includes("insert.icon"), "native icon capability must remain registered for Agent-authored content");
  assert.ok(persistedModel.allowedControlIds.includes("insert.smartart"), "native SmartArt capability must remain registered for Agent-authored content");
  const smartArtVisibleLabelId = persistedModel.elements.find((element) =>
    element.smartArt?.id === smartArtId && element.smartArt?.role === "label")?.id;
  assert.ok(smartArtVisibleLabelId, "SmartArt must retain a visible selectable label");

  const selectAndInspect = async (elementId, section) => {
    await Promise.all([
      page.waitForResponse((response) => {
        if (!isApiCommandUrl(response.url())) return false;
        const body = response.request().postDataJSON();
        return body?.cmd === "select" && body?.elementId === elementId;
      }),
      page.locator(`#slide .el[data-id="${elementId}"]`).click(),
    ]);
    await page.locator(`#property-panel [data-inspector-section="${section}"]`).waitFor({ state: "visible" });
  };
  await selectAndInspect(iconId, "icon");
  await Promise.all([
    page.waitForResponse((response) => {
      if (!isApiCommandUrl(response.url())) return false;
      const body = response.request().postDataJSON();
      return body?.cmd === "select" && body?.elementId === smartArtVisibleLabelId;
    }),
    page.locator(`#slide .el[data-id="${smartArtVisibleLabelId}"]`).click(),
  ]);
  await page.locator('#property-panel[data-inspector-type="smartart"] [data-control="element.smartart.layout.set"]').first().waitFor({ state: "visible" });
  await selectAndInspect(formulaElementId, "text");
  record("existing-content-reload-and-inspectors", "Edited icon, SmartArt and formula text survived reload, rendered on canvas and reopened their native inspectors", {
    iconId,
    smartArtId,
    smartArtElementId,
    smartArtVisibleLabelId,
    formulaElementId,
    allowedAgentContentControls: ["insert.icon", "insert.smartart", "insert.text"],
  });

  await page.screenshot({ path: path.join(OUT, "scope-routing-final.png"), fullPage: true });
  assert.deepEqual(report.browserErrors, []);
  report.ok = true;
} catch (error) {
  fatal = error;
  report.ok = false;
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  if (page) await page.screenshot({ path: path.join(OUT, "scope-routing-failure.png"), fullPage: true }).catch(() => {});
} finally {
  if (page && fakeRoute) await page.unroute("**/*", fakeRoute).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
  report.finishedAt = new Date().toISOString();
  report.summary = {
    total: report.rows.length,
    passed: report.rows.filter((row) => row.status === "pass").length,
    failed: report.ok ? 0 : 1,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (fatal) throw fatal;
console.log(JSON.stringify({ ok: true, port: PORT, rows: report.rows.length, report: path.join(OUT, "report.json") }));
