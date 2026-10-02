import { t } from "./i18n.js";

/** Shared Think / Plan / Compose row painter — patches text instead of wiping the row. */

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createStepPainter(card, opts = {}) {
  const rowEls = new Map();
  const iconOf = opts.iconOf || ((s) => (s.status === "running" ? "◉" : "✎"));
  const still = opts.still || (() => true);

  return function paintStep(s, index) {
    if (!card || !still()) return;
    let row = rowEls.get(index);
    if (!row) {
      row = document.createElement("div");
      row.className = "tool-row";
      row.innerHTML = `<div class="tool-main"><b></b><span></span><small hidden></small><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"/></svg></div><pre class="tool-detail"></pre>`;
      row.addEventListener("click", () => {
        if (!row.querySelector(".tool-detail")?.textContent) return;
        row.classList.toggle("is-open");
        row.dataset.userToggle = "1";
      });
      card.append(row);
      rowEls.set(index, row);
    }
    const hasDetail = Boolean(s.detail);
    const streaming = s.status === "running" && hasDetail;
    const open = row.dataset.userToggle ? row.classList.contains("is-open") : hasDetail;
    row.classList.toggle("is-running", s.status === "running");
    row.classList.toggle("is-streaming", streaming);
    row.classList.toggle("is-expandable", hasDetail);
    row.classList.toggle("is-open", open);
    row.dataset.tool = String(s.tool || "");

    let dot = row.querySelector(".running-dot");
    if (s.status === "running") {
      if (!dot) {
        dot = document.createElement("i");
        dot.className = "running-dot";
        row.prepend(dot);
      }
    } else {
      dot?.remove();
    }

    row.querySelector("b").textContent = iconOf(s);
    row.querySelector(".tool-main span").textContent = s.label || s.tool;
    const small = row.querySelector("small");
    if (s.summary) {
      small.hidden = false;
      small.textContent = s.summary;
    } else {
      small.hidden = true;
      small.textContent = "";
    }
    const pre = row.querySelector(".tool-detail");
    if (pre.textContent !== (s.detail || "")) {
      pre.textContent = s.detail || "";
      pre.scrollTop = pre.scrollHeight;
    }
  };
}

export function paintWaitingRow(card, ev) {
  if (!card) return;
  let row = card.querySelector("[data-wait-row]");
  if (!row) {
    row = document.createElement("div");
    row.className = "tool-row is-running";
    row.dataset.waitRow = "1";
    row.innerHTML = `<i class="running-dot"></i><div class="tool-main"><b>◌</b><span>Waiting</span><small></small></div>`;
    card.append(row);
  }
  const small = row.querySelector("small");
  if (small) {
    small.hidden = false;
    small.textContent = ev.message || t("正在等待后重试");
  }
}

export function clearWaitingRow(card) {
  card?.querySelector("[data-wait-row]")?.remove();
}

/** Success Hub result must not leave a rate-limit pause as the stranger's hero. */
export function wipeRateLimitHero(root) {
  if (!root) return;
  root.querySelector("[data-wait-row]")?.remove();
  for (const row of [...root.querySelectorAll(".tool-row, .waiting-row, .pause-box, .pause-actions")]) {
    if (/429|限流|用量超|马上重试/.test(row.textContent || "")) row.remove();
  }
  for (const el of [...root.querySelectorAll("small, p, .agent-say")]) {
    if (/429|限流|用量超/.test(el.textContent || "")) el.remove();
  }
}

export async function typewriteInto(el, text, paceMs = 16) {
  if (!el) return;
  el.classList.add("is-streaming");
  if (!paceMs || prefersReducedMotion()) {
    el.textContent = text;
    el.classList.remove("is-streaming");
    return;
  }
  el.textContent = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i += 2) {
    el.textContent += chars.slice(i, i + 2).join("");
    await new Promise((r) => setTimeout(r, paceMs));
  }
  el.classList.remove("is-streaming");
}
