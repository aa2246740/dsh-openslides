/**
 * Create → editor launch, shared by the Hub and the editor.
 *
 * The Hub validates the request and navigates at once; the editor shows the
 * user's message and runs the slow part here (the model's intent read, then
 * session creation) before binding itself to the live session in place. A
 * launch record lives in sessionStorage so a reload resumes instead of
 * creating a second session, and so a failure can hand the draft back.
 */

import { t } from "./i18n.js";

const STORE_PREFIX = "oss:launch:";
const VIEWED_PROJECTS_STORE = "oss.viewed.projects";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function editorHref(projectPath, extras = {}) {
  const q = new URLSearchParams({ project: projectPath });
  if (extras.workspace) q.set("workspace", "1");
  if (extras.sessionId) q.set("session", extras.sessionId);
  if (extras.live) q.set("live", "1");
  if (extras.present) {
    q.set("present", "1");
    q.set("page", extras.page != null ? String(extras.page) : "0");
  }
  if (extras.page != null && !extras.present) q.set("page", String(extras.page));
  try { const l = localStorage.getItem("oss.lang"); if (l) q.set("lang", l); } catch { /* storage optional */ }
  return `./index.html?${q.toString()}`;
}

export function launchHref(id) {
  const q = new URLSearchParams({ launch: id, workspace: "1", live: "1" });
  try { const l = localStorage.getItem("oss.lang"); if (l) q.set("lang", l); } catch { /* storage optional */ }
  return `./index.html?${q.toString()}`;
}

export function hubDraftHref(id) {
  return `./?${new URLSearchParams({ draft: id })}`;
}

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function pruneLaunches(store) {
  const now = Date.now();
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (!key?.startsWith(STORE_PREFIX)) continue;
    try {
      const record = JSON.parse(store.getItem(key) || "null");
      if (!record || now - Number(record.createdAt || 0) > MAX_AGE_MS) store.removeItem(key);
    } catch {
      store.removeItem(key);
    }
  }
}

/** Persist a validated request; returns its id, or "" when storage is unavailable. */
export function saveLaunch(request) {
  const store = storage();
  if (!store) return "";
  pruneLaunches(store);
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
    `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    store.setItem(STORE_PREFIX + id, JSON.stringify({ id, createdAt: Date.now(), state: "pending", request }));
    return id;
  } catch {
    return "";
  }
}

export function readLaunch(id) {
  try {
    const record = JSON.parse(storage()?.getItem(STORE_PREFIX + id) || "null");
    return record && record.request ? record : null;
  } catch {
    return null;
  }
}

function updateLaunch(id, patch) {
  const record = readLaunch(id);
  if (!record) return;
  try {
    storage()?.setItem(STORE_PREFIX + id, JSON.stringify({ ...record, ...patch }));
  } catch {
    /* the launch still proceeds; only reload recovery is lost */
  }
}

function markProjectViewed(path) {
  try {
    const viewed = new Set(JSON.parse(localStorage.getItem(VIEWED_PROJECTS_STORE) || "[]"));
    viewed.add(String(path));
    localStorage.setItem(VIEWED_PROJECTS_STORE, JSON.stringify([...viewed].slice(-200)));
  } catch {
    /* ignore */
  }
}

/**
 * Run the intent read and session creation for a stored launch.
 * `onStatus({ step, text, queue })` receives user-facing progress; `step` is
 * "intent" | "create". Resolves with the live session binding; rejects with a
 * readable Error and leaves no half state behind (a created session is
 * recorded before it is returned).
 *
 * Queue contract (server may adopt it when capacity is limited): answering
 * `POST /slides/sessions` with HTTP 202 `{ queued: true, position, retryAfterMs }`
 * keeps the launch waiting with its position shown; the client re-posts the
 * same body, including `clientRequestId`, so the server can keep one place.
 */
export async function performLaunch(id, { onStatus = () => {} } = {}) {
  const record = readLaunch(id);
  if (!record) throw new Error(t("这次创建的内容已失效，请回到首页重新发送。"));
  if (record.state === "created" && record.sessionId && record.projectPath) {
    return { sessionId: record.sessionId, projectPath: record.projectPath };
  }
  if (record.state === "creating") {
    throw new Error(t("上一次创建可能已经完成，请回到首页从“继续协作”中打开，避免重复生成。"));
  }
  const { request } = record;
  onStatus({ step: "intent", text: t("正在让模型理解你的需求…") });
  const intentResponse = await fetch("/slides/assistant-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: request.brief,
      hub: true,
      modelSelection: {
        provider: request.provider,
        model: request.model,
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
      },
    }),
  });
  const plan = await intentResponse.json().catch(() => ({}));
  if (!intentResponse.ok || !plan.ok) {
    throw new Error(plan.error || t("需求理解失败（HTTP {status}）", { status: intentResponse.status }));
  }
  const creating = plan.intent === "discuss" ? t("正在打开对话…") : t("正在建立可编辑文稿…");
  onStatus({ step: "create", text: creating, queue: null });
  updateLaunch(id, { state: "creating" });
  let created;
  try {
    const body = JSON.stringify({ ...request, clientRequestId: id, conversationMode: plan.intent === "discuss" ? "discuss" : "generate" });
    for (;;) {
      const response = await fetch("/slides/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      created = await response.json().catch(() => ({}));
      if (response.status === 202 && created.queued) {
        onStatus({ step: "create", text: t("工作区已满，已为你排队"), queue: { position: created.position } });
        await new Promise((resolve) => setTimeout(resolve, Math.min(15000, Math.max(1000, Number(created.retryAfterMs) || 3000))));
        continue;
      }
      if (!response.ok || !created.sessionId) {
        throw new Error(created.error || t("创建失败（HTTP {status}）", { status: response.status }));
      }
      break;
    }
  } catch (error) {
    // The server answered (or never received the request): nothing was bound.
    updateLaunch(id, { state: "pending" });
    throw error;
  }
  if (created.hostDirected) throw new Error(t("Host 不应代替模型生成内容"));
  if (!created.projectPath) throw new Error(t("会话已创建，但返回信息不足以打开编辑器"));
  updateLaunch(id, { state: "created", sessionId: created.sessionId, projectPath: created.projectPath });
  markProjectViewed(created.projectPath);
  return { sessionId: created.sessionId, projectPath: created.projectPath };
}

/**
 * Bind the current editor page to its live session without a reload: every
 * editor route reader consults location.search, so rewriting it is enough.
 */
export function handoffToLiveEditor({ sessionId, projectPath }) {
  if (!sessionId || !projectPath) return false;
  history.replaceState(null, "", editorHref(projectPath, { workspace: true, sessionId, live: true }));
  return true;
}
