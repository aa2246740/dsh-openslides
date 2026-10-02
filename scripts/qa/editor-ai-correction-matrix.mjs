#!/usr/bin/env node
/**
 * Credentialed Agent correction matrix against the production review/lock/
 * session contracts. Creates a fictional two-page deck unless QA_SESSION_ID
 * names an already-created disposable session.
 *
 * This script never prints provider credentials or raw provider traffic.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadProject } from "../../packages/pptd-v2/dist/index.js";

const DSH_BASE = String(process.env.QA_DSH_BASE || "http://127.0.0.1:13080").replace(/\/+$/, "");
const EDITOR_BASE = String(process.env.QA_EDITOR_BASE || "http://127.0.0.1:55200").replace(/\/+$/, "");
const LIVE_ROOT = path.resolve(process.env.QA_LIVE_ROOT || "/Users/wu/orca/projects/openkimi-slides");
const DECOY_ROOT = path.join(LIVE_ROOT, "fixtures", "okp-yu7-ppt");
const PROVIDER = process.env.QA_PROVIDER || "amd";
const MODEL = process.env.QA_MODEL || "DeepSeek-V4-Flash";
const OUT = path.resolve(process.env.QA_OUT || path.join(os.tmpdir(), "oss-editor-ai-correction-matrix"));
const RUN_MARKER = String(process.env.QA_RUN_MARKER || new Date().toISOString().replace(/\D/g, "").slice(4, 14));
const RESUME_AFTER_REAL_EDITS = process.env.QA_RESUME_AFTER_REAL_EDITS === "1";
const PRIOR_LEDGER = String(process.env.QA_PRIOR_LEDGER || "").trim();
const CREATE_BRIEF = "创建一份严格只有2页的中文虚构测试演示《星屿邮局协作演练》。这是编辑器协作验收专用测试稿，不使用真实公司或用户数据。第1页介绍虚构的星屿邮局，包含明确标题、副标题和至少两个独立文本元素；第2页列出三条虚构的协作规则，包含明确标题和正文。全部使用可编辑原生文字与形状，页面ID稳定，完成结构检查并合稿。不要新增第3页，不需要图片，不需要导出。";
fs.mkdirSync(OUT, { recursive: true });

const ledger = {
  schemaVersion: "open-slidestudio.editor-ai-correction-matrix.v1",
  startedAt: new Date().toISOString(),
  endpoints: { dsh: DSH_BASE, editor: EDITOR_BASE },
  provider: { providerId: PROVIDER, modelId: MODEL },
  dataClassification: "fictional two-page QA deck; no user project content",
  rows: [],
  turns: [],
};

function record(id, assertion, evidence = {}) {
  ledger.rows.push({ id, assertion, ...evidence, status: "pass" });
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function requestJson(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

function post(base, pathname, body) {
  return requestJson(base, pathname, { method: "POST", body: JSON.stringify(body) });
}

function patch(base, pathname, body) {
  return requestJson(base, pathname, { method: "PATCH", body: JSON.stringify(body) });
}

function del(base, pathname, body) {
  return requestJson(base, pathname, { method: "DELETE", body: JSON.stringify(body) });
}

async function getState(sessionId) {
  const response = await requestJson(DSH_BASE, `/slides/state/${encodeURIComponent(sessionId)}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

function revisions(state) {
  return new Map((state?.inspection?.pages || []).map((page) => [page.pageId, {
    pageId: page.pageId,
    revision: page.revision,
    pageSha256: page.pageSha256,
  }]));
}

function revisionEvidence(state) {
  return [...revisions(state).values()];
}

function activityEvents(state) {
  return state?.inspection?.activity?.events || [];
}

function newToolNames(beforeIds, state) {
  return activityEvents(state)
    .filter((event) => !beforeIds.has(event.id) && event.type === "agent.tool")
    .map((event) => event.name)
    .filter(Boolean);
}

function changedPageIds(before, after) {
  const left = revisions(before);
  const right = revisions(after);
  return [...new Set([...left.keys(), ...right.keys()])].filter((pageId) => {
    const a = left.get(pageId);
    const b = right.get(pageId);
    return !a || !b || a.revision !== b.revision || a.pageSha256 !== b.pageSha256;
  });
}

async function waitForIdle(sessionId, {
  timeoutMs = 12 * 60_000,
  requirePages,
  lockToken,
  startedBusy = false,
  allowPaused = false,
  label = "turn",
} = {}) {
  const startedAt = Date.now();
  let sawBusy = startedBusy;
  let lastRenewAt = 0;
  let lastSignature = "";
  while (Date.now() - startedAt < timeoutMs) {
    if (lockToken && Date.now() - lastRenewAt > 20_000) {
      const renewed = await post(EDITOR_BASE, "/api/reviews/ai-lock/renew", { token: lockToken });
      assert.equal(renewed.status, 200, `${label}: lock renew failed ${JSON.stringify(renewed.body)}`);
      lastRenewAt = Date.now();
    }
    const state = await getState(sessionId);
    sawBusy ||= state.agentStatus === "busy";
    const signature = `${state.agentStatus}:${state.phase?.kind}:${state.inspection?.pages?.map((page) => `${page.pageId}:${page.revision}`).join(",")}`;
    if (signature !== lastSignature) {
      console.log(`PROGRESS ${label} ${signature}`);
      lastSignature = signature;
    }
    const pageCountReady = requirePages == null || state.inspection?.pages?.length === requirePages;
    if (requirePages != null && state.agentStatus === "idle" && pageCountReady) return state;
    if (state.phase?.kind === "failed" || (state.phase?.kind === "paused" && !allowPaused)) {
      throw new Error(`${label}: ${state.phase.kind}: ${state.phase?.error?.detail || state.phase?.detail || "unknown"}`);
    }
    const alreadyComplete = requirePages != null && state.phase?.kind === "complete";
    if ((sawBusy || alreadyComplete) && state.agentStatus === "idle" && pageCountReady) return state;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`${label}: timed out after ${Math.round(timeoutMs / 1000)}s`);
}

function resolveProjectRoot(created, state) {
  const inspected = state?.inspection?.projectRoot;
  if (inspected) return path.resolve(inspected);
  const bound = created?.projectPath || state?.binding?.projectRoot;
  assert.ok(bound, "session has no project binding");
  return path.isAbsolute(bound) ? path.resolve(bound) : path.resolve(LIVE_ROOT, bound);
}

function projectPage(projectRoot, pageIndex) {
  const project = loadProject(projectRoot);
  const entry = project.pages[pageIndex];
  assert.ok(entry, `project has no page ${pageIndex}`);
  return entry;
}

function pageIdFromPath(pagePath) {
  return path.basename(pagePath, path.extname(pagePath));
}

function pageFileSha(projectRoot, pagePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(projectRoot, pagePath))).digest("hex");
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pageSnapshot(projectRoot, pageIndex) {
  const entry = projectPage(projectRoot, pageIndex);
  return {
    pagePath: entry.path,
    pageId: pageIdFromPath(entry.path),
    fileSha256: pageFileSha(projectRoot, entry.path),
    page: structuredClone(entry.page),
  };
}

function textElements(projectRoot, pageIndex) {
  return projectPage(projectRoot, pageIndex).page.elements.filter((element) => element.elementType === "text");
}

async function createComment(projectRoot, pagePath, scope, text, id) {
  const response = await patch(EDITOR_BASE, "/api/reviews", {
    project: projectRoot,
    pagePath,
    comment: { id, text, author: "QA", x: 0.18, y: 0.2, scope },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.comment;
}

async function readComments(projectRoot, pagePath) {
  const query = `?project=${encodeURIComponent(projectRoot)}&pagePath=${encodeURIComponent(pagePath)}`;
  const response = await requestJson(EDITOR_BASE, `/api/reviews${query}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.comments || [];
}

async function acquireCommentLock(projectRoot, pagePath, comment) {
  const response = await post(EDITOR_BASE, "/api/reviews/ai-lock", {
    project: projectRoot,
    pagePath,
    commentId: comment.id,
    commentRevision: comment.revision,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.comment.aiStatus, "running");
  return response.body;
}

async function acquireWorkspaceLock(projectRoot, pagePath, workspaceEdit) {
  const response = await post(EDITOR_BASE, "/api/reviews/ai-lock", {
    project: projectRoot,
    pagePath,
    workspaceEdit,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function snapshotLock(lockToken, note) {
  const response = await post(EDITOR_BASE, "/api/versions", {
    lockToken,
    label: "AI 修改前",
    note,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.body.version?.id);
  return response.body;
}

async function releaseLock(token) {
  const response = await del(EDITOR_BASE, "/api/reviews/ai-lock", { token });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

async function stopSession(sessionId) {
  const response = await post(DSH_BASE, `/slides/sessions/${encodeURIComponent(sessionId)}/stop`, {});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.stopped, true);
  return response.body;
}

async function restoreSnapshot(versionId, lockToken) {
  const response = await post(EDITOR_BASE, "/api/versions/restore", { id: versionId, lockToken });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.reviewsPreserved, true);
  return response.body;
}

async function sendTurn(sessionId, payload) {
  const response = await post(DSH_BASE, `/slides/sessions/${encodeURIComponent(sessionId)}/turn`, payload);
  return response;
}

async function runCommentEdit({ sessionId, projectRoot, pageIndex, kind, elementIds = [], text, instruction }) {
  const beforeState = await getState(sessionId);
  const beforeIds = new Set(activityEvents(beforeState).map((event) => event.id));
  const beforePage = pageSnapshot(projectRoot, pageIndex);
  const otherPageIndex = pageIndex === 0 ? 1 : 0;
  const beforeOther = pageSnapshot(projectRoot, otherPageIndex);
  const id = `qa-${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const comment = await createComment(projectRoot, beforePage.pagePath, {
    kind,
    pageId: beforePage.pageId,
    elementIds,
  }, text, id);
  const acquired = await acquireCommentLock(projectRoot, beforePage.pagePath, comment);
  const token = acquired.lock.token;
  const runningRevision = acquired.comment.revision;
  const snapshot = await snapshotLock(token, `qa-comment:${id}`);
  let released = false;
  try {
    const started = await sendTurn(sessionId, {
      text: instruction,
      editorEdit: {
        authorizationId: `comment:${id}:${Date.now()}`,
        pageId: acquired.lock.scope.pageId,
        revision: acquired.lock.scope.pageRevision,
        pageSha256: acquired.lock.scope.pageSha256,
        reviewScope: {
          ...acquired.lock.scope,
          commentId: id,
          commentRevision: runningRevision,
        },
      },
    });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.editorEditAuthorized, true);
    assert.equal(started.body.reviewScopeAccepted, true);
    const afterState = await waitForIdle(sessionId, { lockToken: token, startedBusy: true, label: `comment-${kind}` });
    const storedBeforeVerify = (await readComments(projectRoot, beforePage.pagePath)).find((entry) => entry.id === id);
    assert.equal(storedBeforeVerify?.aiStatus, "running", "turn completion must not fake applied before verification");
    const verified = await post(EDITOR_BASE, "/api/reviews/ai-lock/verify", {
      token,
      accept: true,
      commentRevision: runningRevision,
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.comment?.aiStatus, "applied");
    assert.equal(verified.body.scopeViolation, false);
    await releaseLock(token);
    released = true;
    assert.equal(pageSnapshot(projectRoot, otherPageIndex).fileSha256, beforeOther.fileSha256, "non-target page changed");
    return {
      commentId: id,
      beforeState,
      afterState,
      beforePage,
      afterPage: pageSnapshot(projectRoot, pageIndex),
      changedPageIds: changedPageIds(beforeState, afterState),
      toolNames: newToolNames(beforeIds, afterState),
      verification: verified.body,
      snapshotId: snapshot.version.id,
    };
  } catch (error) {
    try { await stopSession(sessionId); } catch {}
    try { await restoreSnapshot(snapshot.version.id, token); } catch {}
    try {
      const restored = (await readComments(projectRoot, beforePage.pagePath)).find((entry) => entry.id === id);
      if (restored?.aiStatus === "running") {
        await patch(EDITOR_BASE, "/api/reviews", {
          project: projectRoot,
          pagePath: beforePage.pagePath,
          comment: {
            ...restored,
            revision: restored.revision,
            aiStatus: "failed",
            aiError: `QA correction was not applied: ${safeError(error)}`,
          },
        });
      }
    } catch {}
    if (!released) {
      try { await releaseLock(token); } catch {}
    }
    throw error;
  }
}

let created = {};
let sessionId = String(process.env.QA_SESSION_ID || "").trim();
let projectRoot = "";
let fatal = null;

try {
  const health = await requestJson(DSH_BASE, "/slides/health");
  assert.equal(health.status, 200, JSON.stringify(health.body));
  assert.equal(health.body.generateReady, true);
  const editorHealth = await requestJson(EDITOR_BASE, "/api/health");
  assert.equal(editorHealth.status, 200, JSON.stringify(editorHealth.body));
  record("preflight", "Live DSH and editor endpoints are ready", {
    provider: health.body.selection,
    checkoutRoot: editorHealth.body.checkoutRoot,
  });

  if (!sessionId) {
    const response = await post(DSH_BASE, "/slides/sessions", {
      brief: CREATE_BRIEF,
      provider: PROVIDER,
      model: MODEL,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    created = response.body;
    sessionId = response.body.sessionId;
    assert.ok(sessionId);
    console.log(`SESSION ${sessionId}`);
  }
  ledger.sessionId = sessionId;
  const initialState = await waitForIdle(sessionId, { timeoutMs: 15 * 60_000, requirePages: 2, label: "initial-two-page-generation" });
  projectRoot = resolveProjectRoot(created, initialState);
  ledger.projectRoot = projectRoot;
  assert.equal(initialState.inspection.pages.length, 2);
  assert.equal(loadProject(projectRoot).pages.length, 2);
  record("session.two-page", "A real provider created one independent fictional two-page project", {
    sessionId,
    projectRoot,
    pages: revisionEvidence(initialState),
    composed: initialState.inspection.composed,
  });

  if (RESUME_AFTER_REAL_EDITS) {
    assert.ok(PRIOR_LEDGER && fs.existsSync(PRIOR_LEDGER), "QA_PRIOR_LEDGER is required for a resumed matrix");
    const prior = JSON.parse(fs.readFileSync(PRIOR_LEDGER, "utf8"));
    for (const row of prior.rows || []) {
      if (["review.multi-elements.real", "review.page.real", "workspace.deck.real", "project.two-tab-boundary"].includes(row.id)) {
        ledger.rows.push({ ...row, carriedFrom: PRIOR_LEDGER });
      }
    }
    ledger.turns.push(...(prior.turns || []).map((turn) => ({ ...turn, carriedFrom: PRIOR_LEDGER })));
  }

  if (!RESUME_AFTER_REAL_EDITS) {
  const page1 = pageSnapshot(projectRoot, 0);
  const page1Texts = textElements(projectRoot, 0);
  assert.ok(page1Texts.length >= 2, "page 1 needs at least two text elements for multi-element review");
  const multiIds = page1Texts.slice(0, 2).map((element) => element.elementId);
  const beforeElements = new Map(page1.page.elements.map((element) => [element.elementId, digest(element)]));
  const multi = await runCommentEdit({
    sessionId,
    projectRoot,
    pageIndex: 0,
    kind: "elements",
    elementIds: multiIds,
    text: `只修改所选的两个文本对象：把 ${multiIds[0]} 的文字改为“星屿邮局 · 精确协作 ${RUN_MARKER}”，把 ${multiIds[1]} 的文字改为“两个对象均已完成校正 ${RUN_MARKER}”。保留两个对象的 ID、bounds、样式和所有非文字字段，不得修改其他对象。`,
    instruction: `处理一条多对象批注。必须先 read_page({pageId:"${page1.pageId}"})，随后只调用 edit_elements。目标集合必须恰好是 ${JSON.stringify(multiIds)}，不要调用 write_page。把第一个目标文本改为“星屿邮局 · 精确协作 ${RUN_MARKER}”，把第二个目标文本改为“两个对象均已完成校正 ${RUN_MARKER}”；保留这两个对象的 ID、bounds、样式和所有非文字字段，不得修改其他对象、页面元数据、顺序或其他页面。`,
  });
  assert.deepEqual(multi.changedPageIds, [page1.pageId]);
  assert.ok(multi.toolNames.includes("edit_elements"), `tools=${multi.toolNames.join(",")}`);
  assert.equal(multi.toolNames.includes("write_page"), false, `tools=${multi.toolNames.join(",")}`);
  const afterMulti = pageSnapshot(projectRoot, 0);
  const afterById = new Map(afterMulti.page.elements.map((element) => [element.elementId, element]));
  for (const [id, beforeDigest] of beforeElements) {
    if (multiIds.includes(id)) assert.notEqual(digest(afterById.get(id)), beforeDigest, `target ${id} did not change`);
    else assert.equal(digest(afterById.get(id)), beforeDigest, `out-of-scope element ${id} changed`);
  }
  assert.deepEqual(afterMulti.page.elements.map((element) => element.elementId), page1.page.elements.map((element) => element.elementId));
  const { elements: _beforeMultiElements, ...beforeMultiMeta } = page1.page;
  const { elements: _afterMultiElements, ...afterMultiMeta } = afterMulti.page;
  assert.equal(digest(afterMultiMeta), digest(beforeMultiMeta));
  record("review.multi-elements.real", "Real Agent used edit_elements and changed exactly the selected two-element set", {
    commentId: multi.commentId,
    elementIds: multiIds,
    toolNames: multi.toolNames,
    changedTargetElementIds: multi.verification.changedTargetElementIds,
    aiStatus: multi.verification.comment.aiStatus,
  });
  ledger.turns.push({ id: "multi-elements", toolNames: multi.toolNames, changedPageIds: multi.changedPageIds });

  const page2 = pageSnapshot(projectRoot, 1);
  const page2FirstText = textElements(projectRoot, 1)[0];
  assert.ok(page2FirstText, "page 2 needs a text element");
  const pageEdit = await runCommentEdit({
    sessionId,
    projectRoot,
    pageIndex: 1,
    kind: "page",
    text: "把本页改成淡蓝底，并明确标记页面批注已处理。",
    instruction: `处理整页批注。先 read_page({pageId:"${page2.pageId}"}) 读取权威页面，再用返回的 pageSha256 调用 write_page，保留全部原生元素和语义。把页面背景改为 #EAF4FF，并把文本元素 ${page2FirstText.elementId} 的文字末尾加上“ · 页面批注已处理”。只修改 ${page2.pageId}，不得修改另一页、文稿标题、主题或页面顺序。`,
  });
  assert.deepEqual(pageEdit.changedPageIds, [page2.pageId]);
  assert.ok(pageEdit.toolNames.includes("write_page"), `tools=${pageEdit.toolNames.join(",")}`);
  assert.equal(pageEdit.toolNames.includes("edit_elements"), false);
  record("review.page.real", "Real Agent changed one whole-page scope and left the other page unchanged", {
    commentId: pageEdit.commentId,
    pageId: page2.pageId,
    toolNames: pageEdit.toolNames,
    aiStatus: pageEdit.verification.comment.aiStatus,
  });
  ledger.turns.push({ id: "page", toolNames: pageEdit.toolNames, changedPageIds: pageEdit.changedPageIds });

  // Keep the editor's process-global project on a harmless fixture while a
  // lock, snapshot, model turn and verification target the explicit QA root.
  const decoyRoot = DECOY_ROOT;
  assert.ok(fs.existsSync(decoyRoot), `decoy fixture missing: ${decoyRoot}`);
  const decoyOpen = await post(EDITOR_BASE, "/api/open", { path: decoyRoot, page: 0 });
  assert.equal(decoyOpen.status, 200, JSON.stringify(decoyOpen.body));
  const beforeDeckState = await getState(sessionId);
  const deckTargetPages = revisionEvidence(beforeDeckState);
  assert.equal(deckTargetPages.length, 2);
  const page1Now = pageSnapshot(projectRoot, 0);
  const deckLock = await acquireWorkspaceLock(projectRoot, page1Now.pagePath, {
    authorizationId: `qa-deck-${Date.now()}`,
    kind: "deck",
    pageId: page1Now.pageId,
    elementIds: [],
    targetPages: deckTargetPages,
  });
  const deckToken = deckLock.lock.token;
  const deckSnapshot = await snapshotLock(deckToken, "qa-deck-two-tab-boundary");
  assert.equal(path.resolve(deckSnapshot.lockRoot), path.resolve(projectRoot));
  assert.equal(fs.existsSync(path.join(projectRoot, ".versions", deckSnapshot.version.id, "deck.pptd")), true);
  assert.equal(fs.existsSync(path.join(decoyRoot, ".versions", deckSnapshot.version.id, "deck.pptd")), false);
  const beforeDeckEventIds = new Set(activityEvents(beforeDeckState).map((event) => event.id));
  let deckReleased = false;
  try {
    const started = await sendTurn(sessionId, {
      text: `处理一次整稿协作修改。严格逐页 read_page，再分别使用各页刚读到的 pageSha256 调用 write_page。第1页第一个文本末尾加“ · 整稿校正A”，第2页第一个文本末尾加“ · 整稿校正B”。两页都必须产生可见写入；保留事实、其他内容、页面ID、页数、顺序、文稿标题和主题，不得新增或删除页面。`,
      editorEdit: { authorizationId: `qa-deck-turn-${Date.now()}`, pages: deckTargetPages },
    });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.editorEditAuthorized, true);
    const afterDeckState = await waitForIdle(sessionId, { lockToken: deckToken, startedBusy: true, label: "workspace-deck" });
    let deckChanged = changedPageIds(beforeDeckState, afterDeckState);
    if (deckChanged.length !== 2) {
      const missing = deckTargetPages.filter((page) => !deckChanged.includes(page.pageId));
      const correction = await sendTurn(sessionId, {
        text: `继续完成整稿修改。以下页面尚未产生可验证写入：${missing.map((page) => page.pageId).join("、")}。只处理这些页；逐页 read_page，并用最新 pageSha256 调用 write_page，在第一个文本末尾加“ · 整稿补齐”，不得改动已完成页。`,
        editorEdit: { authorizationId: `qa-deck-turn-retry-${Date.now()}`, pages: missing },
      });
      assert.equal(correction.status, 200, JSON.stringify(correction.body));
      const correctedState = await waitForIdle(sessionId, { lockToken: deckToken, startedBusy: true, label: "workspace-deck-correction" });
      deckChanged = changedPageIds(beforeDeckState, correctedState);
      assert.equal(deckChanged.length, 2, `changed=${deckChanged.join(",")}`);
    }
    const verify = await post(EDITOR_BASE, "/api/reviews/ai-lock/verify", { token: deckToken });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.equal(verify.body.scopeViolation, false);
    await releaseLock(deckToken);
    deckReleased = true;
    const healthAfter = await requestJson(EDITOR_BASE, "/api/health");
    const finalDeckState = await getState(sessionId);
    const tools = newToolNames(beforeDeckEventIds, finalDeckState);
    record("workspace.deck.real", "Real Agent changed both authorized pages through the deck workspace scope", {
      pageIds: deckChanged,
      toolNames: tools,
    });
    if (path.resolve(healthAfter.body.project) === path.resolve(decoyRoot)) {
      record("project.two-tab-boundary", "Lock, snapshot, model write and verification stayed bound to the explicit project while the global editor project was another tab", {
        lockRoot: deckSnapshot.lockRoot,
        globalProject: healthAfter.body.project,
        snapshotId: deckSnapshot.version.id,
      });
    } else {
      ledger.rows.push({
        id: "project.two-tab-boundary",
        assertion: "Background Agent rendering must not replace another tab's global editor project",
        status: "fail",
        expectedGlobalProject: decoyRoot,
        actualGlobalProject: healthAfter.body.project,
        lockRoot: deckSnapshot.lockRoot,
        snapshotId: deckSnapshot.version.id,
      });
    }
    ledger.turns.push({ id: "deck", toolNames: tools, changedPageIds: deckChanged });
  } catch (error) {
    try { await stopSession(sessionId); } catch {}
    try { await restoreSnapshot(deckSnapshot.version.id, deckToken); } catch {}
    if (!deckReleased) {
      try { await releaseLock(deckToken); } catch {}
    }
    throw error;
  }
  }

  // A real turn is dispatched, then stopped through the production endpoint.
  // The protected snapshot must restore both pages byte-for-byte.
  const beforeStopState = await getState(sessionId);
  const stopTargets = revisionEvidence(beforeStopState);
  const stopPage = pageSnapshot(projectRoot, 0);
  const stopOther = pageSnapshot(projectRoot, 1);
  const stopLock = await acquireWorkspaceLock(projectRoot, stopPage.pagePath, {
    authorizationId: `qa-stop-${Date.now()}`,
    kind: "page",
    pageId: stopPage.pageId,
    elementIds: [],
    targetPages: stopTargets,
  });
  const stopToken = stopLock.lock.token;
  const stopSnapshot = await snapshotLock(stopToken, "qa-stop-recovery");
  const stopTurn = await sendTurn(sessionId, {
    text: `修改 ${stopPage.pageId}：先 read_page，再把第一个文本末尾加“ · 这次修改将被停止”，用最新 pageSha256 调用 write_page。`,
    editorEdit: { authorizationId: `qa-stop-turn-${Date.now()}`, pages: [stopTargets.find((page) => page.pageId === stopPage.pageId)] },
  });
  assert.equal(stopTurn.status, 200, JSON.stringify(stopTurn.body));
  await stopSession(sessionId);
  await waitForIdle(sessionId, { lockToken: stopToken, startedBusy: true, allowPaused: true, timeoutMs: 2 * 60_000, label: "operator-stop" });
  await restoreSnapshot(stopSnapshot.version.id, stopToken);
  assert.equal(pageSnapshot(projectRoot, 0).fileSha256, stopPage.fileSha256);
  assert.equal(pageSnapshot(projectRoot, 1).fileSha256, stopOther.fileSha256);
  await releaseLock(stopToken);
  record("recovery.stop.real", "A dispatched real model turn was stopped, acknowledged, restored and unlocked without page drift", {
    snapshotId: stopSnapshot.version.id,
    pageShasRestored: true,
  });

  // Preflight failure follows the same protected snapshot/status lifecycle as
  // the browser: stop confirmation, restore, authoritative comment refresh,
  // failed status PATCH, then unlock. No model is allowed to start.
  const failurePage = pageSnapshot(projectRoot, 0);
  const failureState = await getState(sessionId);
  const failureRevision = revisions(failureState).get(failurePage.pageId);
  assert.ok(failureRevision);
  const failureComment = await createComment(projectRoot, failurePage.pagePath, {
    kind: "page", pageId: failurePage.pageId, elementIds: [],
  }, "故意制造过期授权，验证失败恢复。", `qa-failure-${Date.now()}`);
  const failureLock = await acquireCommentLock(projectRoot, failurePage.pagePath, failureComment);
  const failureToken = failureLock.lock.token;
  const failureSnapshot = await snapshotLock(failureToken, "qa-failure-recovery");
  const staleRevision = Math.max(0, failureRevision.revision - 1);
  const rejected = await sendTurn(sessionId, {
    text: "这条请求必须在授权预检失败，不能启动模型写入。",
    editorEdit: {
      authorizationId: `qa-stale-${Date.now()}`,
      pageId: failurePage.pageId,
      revision: staleRevision,
      pageSha256: failureRevision.pageSha256,
      reviewScope: {
        ...failureLock.lock.scope,
        pageRevision: staleRevision,
        commentId: failureComment.id,
        commentRevision: failureLock.comment.revision,
      },
    },
  });
  assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
  assert.equal(rejected.body.code, "stale_editor_edit");
  assert.equal((await getState(sessionId)).agentStatus, "idle");
  await stopSession(sessionId);
  await post(EDITOR_BASE, "/api/reviews/ai-lock/renew", { token: failureToken });
  await restoreSnapshot(failureSnapshot.version.id, failureToken);
  const refreshedFailure = (await readComments(projectRoot, failurePage.pagePath)).find((entry) => entry.id === failureComment.id);
  assert.equal(refreshedFailure.aiStatus, "running");
  const failedStatus = await patch(EDITOR_BASE, "/api/reviews", {
    project: projectRoot,
    pagePath: failurePage.pagePath,
    comment: {
      ...refreshedFailure,
      revision: refreshedFailure.revision,
      aiStatus: "failed",
      aiError: "stale_editor_edit；已自动恢复到 AI 修改前版本",
    },
  });
  assert.equal(failedStatus.status, 200, JSON.stringify(failedStatus.body));
  assert.equal(failedStatus.body.comment.aiStatus, "failed");
  await releaseLock(failureToken);
  assert.equal(pageSnapshot(projectRoot, 0).fileSha256, failurePage.fileSha256);
  record("recovery.failure", "A stale authorization failed before model start, restored its snapshot, recorded failed instead of applied, and unlocked", {
    code: rejected.body.code,
    finalStatus: failedStatus.body.comment.aiStatus,
  });

  // Negative comment targets are mutated only inside this disposable deck.
  // They must stay bound to their original IDs and show a recovery action.
  const openQa = await post(EDITOR_BASE, "/api/open", { path: projectRoot, page: 0 });
  assert.equal(openQa.status, 200, JSON.stringify(openQa.body));
  const staleTarget = textElements(projectRoot, 0)[0];
  const staleComment = await createComment(projectRoot, pageSnapshot(projectRoot, 0).pagePath, {
    kind: "elements", pageId: pageSnapshot(projectRoot, 0).pageId, elementIds: [staleTarget.elementId],
  }, "过期目标测试", `qa-stale-target-${Date.now()}`);
  assert.equal((await post(EDITOR_BASE, "/api/command", { cmd: "select", elementId: staleTarget.elementId })).status, 200);
  assert.equal((await post(EDITOR_BASE, "/api/command", { cmd: "setText", text: `${staleTarget.content?.text || ""} · 外部更新` })).status, 200);
  const staleLock = await post(EDITOR_BASE, "/api/reviews/ai-lock", {
    project: projectRoot,
    pagePath: pageSnapshot(projectRoot, 0).pagePath,
    commentId: staleComment.id,
    commentRevision: staleComment.revision,
  });
  assert.equal(staleLock.status, 409, JSON.stringify(staleLock.body));
  assert.equal(staleLock.body.code, "REVIEW_SCOPE_STALE");
  assert.match(staleLock.body.error, /select.*new review comment/i);
  record("review.stale-target", "A stale comment is rejected with an explicit reselect/new-comment recovery action", {
    code: staleLock.body.code,
  });

  assert.equal((await post(EDITOR_BASE, "/api/open", { path: projectRoot, page: 1 })).status, 200);
  const deletedTarget = textElements(projectRoot, 1).at(-1);
  assert.ok(deletedTarget);
  const deletedPage = pageSnapshot(projectRoot, 1);
  const deletedComment = await createComment(projectRoot, deletedPage.pagePath, {
    kind: "elements", pageId: deletedPage.pageId, elementIds: [deletedTarget.elementId],
  }, "删除目标测试", `qa-deleted-target-${Date.now()}`);
  assert.equal((await post(EDITOR_BASE, "/api/command", { cmd: "select", elementId: deletedTarget.elementId })).status, 200);
  assert.equal((await post(EDITOR_BASE, "/api/command", { cmd: "deleteSelected" })).status, 200);
  const deletedLock = await post(EDITOR_BASE, "/api/reviews/ai-lock", {
    project: projectRoot,
    pagePath: deletedPage.pagePath,
    commentId: deletedComment.id,
    commentRevision: deletedComment.revision,
  });
  assert.equal(deletedLock.status, 409, JSON.stringify(deletedLock.body));
  assert.equal(deletedLock.body.code, "REVIEW_TARGET_MISSING");
  assert.deepEqual(deletedLock.body.missingElementIds, [deletedTarget.elementId]);
  assert.match(deletedLock.body.error, /select.*new review comment/i);
  record("review.deleted-target", "A deleted comment target is rejected without rebinding and names the missing element", {
    code: deletedLock.body.code,
    missingElementIds: deletedLock.body.missingElementIds,
  });

  const finalState = await getState(sessionId);
  assert.equal(finalState.agentStatus, "idle");
  assert.equal(fs.existsSync(path.join(projectRoot, "_agent", "ai-review-lock.v1.json")), false);
  record("final.idle-unlocked", "The disposable session ends idle with no persisted AI review lock", {
    agentStatus: finalState.agentStatus,
  });
  const cleanupOpen = await post(EDITOR_BASE, "/api/open", { path: DECOY_ROOT, page: 0 });
  assert.equal(cleanupOpen.status, 200, JSON.stringify(cleanupOpen.body));
  record("final.shared-editor-restored", "The shared editor was returned to the harmless fixture after QA", {
    project: DECOY_ROOT,
  });
} catch (error) {
  fatal = error;
  ledger.rows.push({ id: "runtime.fatal", status: "fail", assertion: "Complete the real correction matrix", error: safeError(error) });
  if (sessionId) {
    try { await stopSession(sessionId); } catch {}
  }
} finally {
  ledger.finishedAt = new Date().toISOString();
  ledger.summary = {
    passed: ledger.rows.filter((row) => row.status === "pass").length,
    failed: ledger.rows.filter((row) => row.status === "fail").length,
    realModelTurns: ledger.turns.length,
    fatal: Boolean(fatal),
  };
  const file = path.join(OUT, "editor-ai-correction-matrix-ledger.json");
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ ok: !fatal, sessionId, projectRoot, file, summary: ledger.summary }));
}

if (fatal) process.exitCode = 1;
