import { t } from "./i18n.js";

/** Reader-owned scrolling. DOM growth/clamping must never impersonate a user scroll. */
export function createConversationScroll(list, onFollowing) {
  let following = true, observedTop = list.scrollTop, anchor = null, context = "", saved = null;
  const watched = new Set();
  const floor = () => Math.max(0, list.scrollHeight - list.clientHeight);
  const offset = node => node.getBoundingClientRect().top - list.getBoundingClientRect().top;
  const row = key => [...list.children].find(node => node.dataset.processKey === key);
  const position = () => {
    const bounds = list.getBoundingClientRect();
    const node = [...list.children].find(node => node.dataset.processKey && node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().bottom > bounds.top + 1);
    return node ? { key: node.dataset.processKey, top: offset(node), scrollTop: list.scrollTop } : null;
  };
  const remember = () => {
    if (!context || !list.clientHeight) return;
    try { sessionStorage.setItem(`slides-chat-scroll:${context}`, JSON.stringify(following ? { following: true } : { following: false, ...anchor })); } catch { /* storage is optional */ }
  };
  const write = top => { list.scrollTop = top; observedTop = list.scrollTop; };
  const sample = () => {
    const expected = Math.min(observedTop, floor());
    if (Math.abs(list.scrollTop - expected) > 1) {
      following = floor() - list.scrollTop <= 24;
      anchor = following ? null : position();
      observedTop = list.scrollTop;
      saved = null;
      onFollowing(following);
      remember();
    }
  };
  list.addEventListener("scroll", sample, { passive: true });
  const settle = () => {
    if (!list.clientHeight) return;
    if (saved?.key) {
      const target = row(saved.key);
      if (!target || !target.getBoundingClientRect().height) return;
      write(list.scrollTop + offset(target) - saved.top);
      anchor = position(); saved = null;
    } else if (following) {
      if (Math.abs(list.scrollTop - floor()) > 1) write(floor());
    } else if (anchor) {
      const target = row(anchor.key);
      if (target?.getBoundingClientRect().height) write(list.scrollTop + offset(target) - anchor.top);
      else write(Math.min(anchor.scrollTop, floor()));
      anchor = position();
    }
    observedTop = list.scrollTop;
    onFollowing(following);
    remember();
  };
  const observer = new ResizeObserver(() => { sample(); settle(); });
  observer.observe(list);
  return {
    useContext(value) {
      if (context === value) return;
      context = value;
      try { saved = JSON.parse(sessionStorage.getItem(`slides-chat-scroll:${context}`)); } catch { saved = null; }
      following = saved?.following !== false;
      anchor = saved?.key ? saved : null;
      observedTop = list.scrollTop;
      onFollowing(following);
    },
    beforeUpdate() { sample(); if (!following && !saved) anchor = position(); return { following, anchor }; },
    afterUpdate() {
      for (const node of watched) if (node.parentElement !== list) { observer.unobserve(node); watched.delete(node); }
      for (const node of list.children) if (!watched.has(node)) { observer.observe(node); watched.add(node); }
      settle();
    },
    toLatest() { saved = null; anchor = null; following = true; write(floor()); onFollowing(true); remember(); },
  };
}

const isReasoning = row => row.kind === "thought" || row.kind === "reasoning";
const isProcess = row => isReasoning(row) || row.kind === "tool" || row.inProcess;

/** Counted summary of folded steps, in the dsh-better-display wording. */
export function processSummary(rows) {
  let reasoning = 0, body = 0, tool = 0;
  for (const row of rows) {
    if (isReasoning(row)) reasoning += 1;
    else if (row.kind === "tool") tool += row.repeat || 1;
    else if (row.kind === "message") body += 1;
  }
  const parts = [];
  if (reasoning) parts.push(`${t("思考")}×${reasoning}`);
  if (body) parts.push(`${t("输出")}×${body}`);
  if (tool) parts.push(`${t("工具")}×${tool}`);
  return parts.join(" · ") || t("此前步骤");
}

/**
 * Process disclosures belong to a turn, never to the whole transcript.
 *
 * A finished turn folds its whole process behind one counted row and keeps the
 * answer. The live turn follows dsh-better-display: once a newer reasoning step
 * arrives, everything before it in the turn folds into that row, so only the
 * current step stays open. A manual open/close choice always wins.
 */
export function conversationProcessRows(rows, active, choices = new Map()) {
  const groups = [];
  let group;
  for (const row of rows) {
    if (row.kind === "user" || !group || (Number.isFinite(row.turn) && group.turn !== undefined && row.turn !== group.turn)) {
      group = { key: row.kind === "user" ? row.key : `turn:${row.turn ?? row.key}`, rows: [], turn: undefined };
      groups.push(group);
    }
    if (Number.isFinite(row.turn)) group.turn = row.turn;
    group.rows.push(row);
  }
  return groups.flatMap((group, index) => {
    const process = group.rows.filter(isProcess);
    if (!process.length) return group.rows;
    let covered = process;
    let defaultOpen = false;
    if (active && index === groups.length - 1) {
      const latest = group.rows.findLastIndex(isReasoning);
      const earlier = latest < 0 ? [] : group.rows.slice(0, latest).filter(row => isProcess(row) || row.kind === "message");
      if (earlier.some(row => isProcess(row) || row.kind === "message")) covered = earlier;
      else defaultOpen = true;
    }
    const open = choices.get(group.key) ?? defaultOpen;
    const head = { key: `process:${group.key}`, groupKey: group.key, kind: "process-head", open, count: covered.length, summary: processSummary(covered) };
    return group.rows.flatMap(row => [
      ...(row === covered[0] ? [head] : []),
      { ...row, processGroup: group.key, processOpen: open, processHidden: covered.includes(row) && !open },
    ]);
  });
}
