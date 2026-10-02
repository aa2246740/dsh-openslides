import { t } from "./i18n.js";

export function clipChromeText(text, max = 88) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function briefChipLabel(text) {
  return clipChromeText(text, 36) || t("任务说明");
}

export function mountBriefChip(container, text, options = {}) {
  const chip = document.createElement("details");
  chip.className = "brief-chip";
  chip.open = Boolean(options.open);
  const summary = document.createElement("summary");
  summary.className = "brief-chip-summary";
  summary.textContent = options.label ?? briefChipLabel(text);
  const body = document.createElement("pre");
  body.className = "brief-chip-body";
  body.textContent = String(text ?? "");
  chip.append(summary, body);
  container.replaceChildren(chip);
  return chip;
}

export function appendBriefChip(parent, text, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "brief-chip-wrap";
  mountBriefChip(wrap, text, options);
  parent.append(wrap);
  return wrap;
}
