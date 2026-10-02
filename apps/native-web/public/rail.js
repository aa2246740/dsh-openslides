import { t } from "./i18n.js";

const paintedContent = new WeakMap();
const eventHandlers = new WeakMap();

export function railPageKey(page) {
  const index = page.pageIndex;
  const pagePath = page.pagePaths?.[index];
  if (!Number.isSafeInteger(index) || index < 0 || typeof pagePath !== "string" || !pagePath) {
    throw new Error("Rail requires a native pageIndex and pagePaths entry");
  }
  return JSON.stringify([page.rootDir, pagePath]);
}

function pageFingerprint(page) {
  const { size, background, backgroundCss, themeColors, elements, animations } = page;
  return JSON.stringify({ size, background, backgroundCss, themeColors, elements, animations });
}

function captureAnchor(rail, buttons) {
  const top = rail.getBoundingClientRect().top;
  const first = buttons.find((button) => button.getBoundingClientRect().bottom > top);
  return {
    scrollTop: rail.scrollTop,
    key: first?.dataset.pageKey,
    offset: first ? first.getBoundingClientRect().top - top : 0,
  };
}

function restoreAnchor(rail, anchor, buttons) {
  const button = buttons.find((item) => item.dataset.pageKey === anchor.key);
  if (button) {
    rail.scrollTop += button.getBoundingClientRect().top - rail.getBoundingClientRect().top - anchor.offset;
  } else {
    rail.scrollTop = anchor.scrollTop;
  }
}

function revealNearest(rail, button) {
  const viewport = rail.getBoundingClientRect();
  const item = button.getBoundingClientRect();
  if (item.top < viewport.top + 8) rail.scrollTop += item.top - viewport.top - 8;
  else if (item.bottom > viewport.bottom - 8) rail.scrollTop += item.bottom - viewport.bottom + 8;
}

function createThumb(document) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "thumb";
  const gutter = document.createElement("span");
  gutter.className = "thumb-gutter";
  const number = document.createElement("span");
  number.className = "n";
  gutter.append(number);
  button.append(gutter);
  for (const [event, handler] of [["click", "onClick"], ["pointerdown", "onPointerDown"], ["contextmenu", "onContextMenu"]]) {
    button.addEventListener(event, (value) => eventHandlers.get(button)?.[handler]?.(value, button));
  }
  return button;
}

function updateThumb(button, page, key, activeIndex, mode, width, paintSlide, callbacks) {
  const active = page.pageIndex === activeIndex;
  button.classList.toggle("active", active);
  if (active) button.setAttribute("aria-current", "page");
  else button.removeAttribute("aria-current");
  button.setAttribute("aria-label", `${t("第 {page} 页", { page: page.pageIndex + 1 })}${active ? t("，当前页") : ""}`);
  button.dataset.pageIndex = String(page.pageIndex);
  button.dataset.pageKey = key;
  eventHandlers.set(button, callbacks);
  const number = String(page.pageIndex + 1).padStart(2, "0");
  const label = button.querySelector(".n");
  if (label.textContent !== number) label.textContent = number;

  let frame = button.querySelector(".thumb-frame");
  if (mode !== "thumbs") {
    frame?.remove();
    paintedContent.delete(button);
    return;
  }
  const document = button.ownerDocument;
  if (!frame) {
    frame = document.createElement("span");
    frame.className = "thumb-frame";
    const mini = document.createElement("div");
    mini.className = "thumb-mini";
    frame.append(mini);
    button.append(frame);
  }
  const mini = frame.querySelector(".thumb-mini");
  const fingerprint = pageFingerprint(page);
  if (paintedContent.get(button) !== fingerprint) {
    mini.replaceChildren();
    paintSlide(mini, page, { interactive: false });
    paintedContent.set(button, fingerprint);
  }
  const [slideWidth, slideHeight] = page.size;
  frame.style.width = `${width}px`;
  frame.style.height = `${Math.round(width * slideHeight / slideWidth)}px`;
  mini.style.width = `${slideWidth}px`;
  mini.style.height = `${slideHeight}px`;
  mini.style.transform = `scale(${width / slideWidth})`;
}

export function renderRailView({
  rail, pages, activeIndex = 0, railView = "thumbs", thumbFrameWidth = 140,
  paintSlide, callbacks, createAddButton,
}) {
  const keys = pages.map(railPageKey);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate native rail page key");
  const document = rail.ownerDocument;
  const before = [...rail.querySelectorAll(".thumb")];
  const structuralChange = before.length !== keys.length || before.some((button, index) => button.dataset.pageKey !== keys[index]);
  const anchor = structuralChange ? captureAnchor(rail, before) : null;
  const focused = before.find((button) => button === document.activeElement || button.contains(document.activeElement));
  const byKey = new Map(before.map((button) => [button.dataset.pageKey, button]));
  let add = rail.querySelector(".rail-add");
  if (!add && createAddButton) {
    add = createAddButton();
    rail.append(add);
  }
  const buttons = pages.map((page, index) => {
    const key = keys[index];
    const button = byKey.get(key) ?? createThumb(document);
    byKey.delete(key);
    updateThumb(button, page, key, activeIndex, railView, thumbFrameWidth, paintSlide, callbacks);
    if (structuralChange) rail.insertBefore(button, add);
    return button;
  });
  for (const unused of byKey.values()) unused.remove();
  if (anchor) restoreAnchor(rail, anchor, buttons);
  const active = buttons.find((button) => Number(button.dataset.pageIndex) === activeIndex);
  if (focused) {
    const retained = buttons.find((button) => button.dataset.pageKey === focused.dataset.pageKey) ?? active;
    retained?.focus({ preventScroll: true });
  }
  if (active && rail.dataset.activeKey !== active.dataset.pageKey) revealNearest(rail, active);
  rail.dataset.activeKey = active?.dataset.pageKey ?? "";
  rail.dataset.railView = railView;
}
