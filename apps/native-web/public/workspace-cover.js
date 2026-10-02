/**
 * Full-screen workspace cover. It is part of the static editor markup, so it
 * hides the page from the first frame; it lifts only once the editor layout is
 * stable (fonts loaded, first render done, slide size unchanged across frames),
 * which removes the visible size jump on entry. Launches reuse it to show real
 * progress, queue position when the server reports one, and failure recovery.
 */
import { t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

export const LAUNCH_STEPS = Object.freeze([
  { id: "intent", label: "理解需求" },
  { id: "create", label: "建立文稿" },
  { id: "workspace", label: "准备工作区" },
]);

function cover() {
  return $("workspace-cover");
}

function setText(id, text) {
  const node = $(id);
  if (!node) return;
  node.textContent = text || "";
  node.hidden = !text;
}

/**
 * @param {{ title?: string, detail?: string, brief?: string, step?: string,
 *   steps?: readonly {id: string, label: string}[], queue?: { position?: number } | null }} state
 */
export function setCover(state = {}) {
  const root = cover();
  if (!root) return;
  root.hidden = false;
  root.classList.remove("is-leaving", "is-failed");
  root.setAttribute("role", "status");
  if (state.title !== undefined) setText("workspace-cover-title", state.title);
  if (state.detail !== undefined) setText("workspace-cover-detail", state.detail);
  if (state.brief !== undefined) setText("workspace-cover-brief", state.brief);
  if (state.steps) {
    const list = $("workspace-cover-steps");
    list.replaceChildren(...state.steps.map((step) => {
      const item = document.createElement("li");
      item.dataset.step = step.id;
      item.textContent = t(step.label);
      return item;
    }));
    list.hidden = false;
  }
  if (state.step) {
    const items = [...($("workspace-cover-steps")?.children || [])];
    const at = items.findIndex((item) => item.dataset.step === state.step);
    items.forEach((item, index) => {
      item.dataset.state = index < at ? "done" : index === at ? "active" : "pending";
      if (index === at) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }
  if (state.queue !== undefined) {
    const position = Number(state.queue?.position);
    setText("workspace-cover-queue", Number.isFinite(position) && position > 0 ? t("排队中 · 前面还有 {position} 个任务", { position }) : "");
  }
  $("workspace-cover-actions")?.replaceChildren();
  const actions = $("workspace-cover-actions");
  if (actions) actions.hidden = true;
}

/**
 * Keep the cover up with the cause and recovery actions.
 * @param {string} message
 * @param {{ label: string, onClick?: () => void, href?: string, primary?: boolean, className?: string }[]} actions
 */
export function coverFailure(message, actions = []) {
  const root = cover();
  if (!root) return;
  root.hidden = false;
  root.classList.add("is-failed");
  root.setAttribute("role", "alert");
  setText("workspace-cover-title", t("没能打开工作区"));
  setText("workspace-cover-detail", message);
  setText("workspace-cover-queue", "");
  const box = $("workspace-cover-actions");
  box.replaceChildren(...actions.map((action) => {
    const control = document.createElement(action.href ? "a" : "button");
    if (action.href) control.href = action.href;
    else {
      control.type = "button";
      control.addEventListener("click", () => action.onClick?.());
    }
    control.className = `${action.className || ""}${action.primary ? " is-primary" : ""}`.trim();
    control.textContent = action.label;
    return control;
  }));
  box.hidden = actions.length === 0;
  box.querySelector("button, a")?.focus({ preventScroll: true });
}

function frame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

let revealing = null;

/** Lift the cover once the canvas stops changing size (bounded wait). */
export function revealWorkspace({ maxWaitMs = 1600 } = {}) {
  const root = cover();
  if (!root || root.hidden || root.classList.contains("is-failed")) return Promise.resolve();
  if (revealing) return revealing;
  revealing = (async () => {
    const deadline = performance.now() + maxWaitMs;
    try {
      await Promise.race([document.fonts?.ready, new Promise((resolve) => setTimeout(resolve, maxWaitMs / 2))]);
    } catch {
      /* fonts are best effort */
    }
    let last = "";
    let steady = 0;
    while (performance.now() < deadline && steady < 3) {
      await frame();
      const box = document.querySelector(".slide-card")?.getBoundingClientRect();
      const key = box ? [box.left, box.top, box.width, box.height].map(Math.round).join(",") : "none";
      steady = key === last && key !== "none" && box.width > 0 ? steady + 1 : 0;
      last = key;
    }
    if (root.classList.contains("is-failed")) return;
    if (reducedMotion()) {
      root.hidden = true;
      return;
    }
    root.classList.add("is-leaving");
    await new Promise((resolve) => {
      const done = () => resolve();
      root.addEventListener("transitionend", done, { once: true });
      setTimeout(done, 400);
    });
    if (root.classList.contains("is-leaving")) root.hidden = true;
  })().finally(() => {
    revealing = null;
  });
  return revealing;
}
