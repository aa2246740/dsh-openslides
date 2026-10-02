const TOOLTIP_ID = "ui-tooltip";
const SHOW_DELAY_MS = 320;
const EDGE_GAP = 8;

function moveTitleToDataTip(element) {
  if (!(element instanceof Element)) return;
  const title = element.getAttribute("title")?.trim();
  if (!title) return;
  element.dataset.tip = title;
  element.removeAttribute("title");
  if (!element.getAttribute("aria-label") && !element.textContent?.trim()) {
    element.setAttribute("aria-label", title);
  }
}

function promoteAccessibleLabelToTip(element) {
  if (!(element instanceof Element)) return;
  if (element.dataset.tip?.trim()) return;
  const label = element.getAttribute("aria-label")?.trim();
  if (!label) return;
  const iconOnly =
    element.matches("button, [role='button']") &&
    !element.textContent?.trim() &&
    Boolean(element.querySelector("svg, img, i"));
  if (iconOnly) element.dataset.tip = label;
}

function prepareTooltipAnchor(element) {
  moveTitleToDataTip(element);
  promoteAccessibleLabelToTip(element);
}

function scanTooltipAnchors(root) {
  if (root instanceof Element) prepareTooltipAnchor(root);
  root.querySelectorAll?.("[title], [aria-label]").forEach(prepareTooltipAnchor);
}

function tooltipAnchor(target) {
  return target instanceof Element ? target.closest("[data-tip]") : null;
}

/**
 * Install one Kimi-aligned tooltip layer for static and dynamically-created controls.
 * Native `title` bubbles are moved to `data-tip`, so all controls share the same
 * delay, paint, placement, focus behavior, and accessible description.
 */
export function installTooltips(root = document) {
  if (document.getElementById(TOOLTIP_ID)) return;

  const tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.className = "ui-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);

  let active = null;
  let timer = 0;
  const boundAnchors = new WeakSet();

  const hide = () => {
    window.clearTimeout(timer);
    timer = 0;
    if (active?.getAttribute("aria-describedby") === TOOLTIP_ID) {
      active.removeAttribute("aria-describedby");
    }
    active = null;
    tooltip.hidden = true;
    tooltip.textContent = "";
  };

  const place = (anchor) => {
    const anchorBox = anchor.getBoundingClientRect();
    const tipBox = tooltip.getBoundingClientRect();
    const prefersAbove = Boolean(anchor.closest(".insert-pill, .ctx-bar"));
    const roomAbove = anchorBox.top >= tipBox.height + 14;
    const roomBelow = innerHeight - anchorBox.bottom >= tipBox.height + 14;
    const side = prefersAbove && roomAbove ? "top" : !prefersAbove && roomBelow ? "bottom" : roomAbove ? "top" : "bottom";
    const center = anchorBox.left + anchorBox.width / 2;
    const left = Math.min(
      innerWidth - tipBox.width - EDGE_GAP,
      Math.max(EDGE_GAP, center - tipBox.width / 2),
    );
    const top = side === "top" ? anchorBox.top - tipBox.height - 10 : anchorBox.bottom + 10;
    const arrowX = Math.min(tipBox.width - 10, Math.max(10, center - left));
    tooltip.dataset.side = side;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.setProperty("--tooltip-arrow-x", `${Math.round(arrowX)}px`);
  };

  const show = (anchor, immediate = false) => {
    const text = anchor.dataset.tip?.trim();
    if (!text || anchor.hidden || anchor.getAttribute("aria-hidden") === "true") return;
    // A control whose own menu/dialog is open must not cover that popup.
    if (anchor.getAttribute("aria-expanded") === "true") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        if (!anchor.isConnected || anchor.getAttribute("aria-expanded") === "true") return;
        if (active && active !== anchor && active.getAttribute("aria-describedby") === TOOLTIP_ID) {
          active.removeAttribute("aria-describedby");
        }
        active = anchor;
        tooltip.textContent = text;
        tooltip.hidden = false;
        anchor.setAttribute("aria-describedby", TOOLTIP_ID);
        place(anchor);
      },
      immediate ? 0 : SHOW_DELAY_MS,
    );
  };

  const bindAnchor = (anchor) => {
    if (!(anchor instanceof Element) || boundAnchors.has(anchor)) return;
    boundAnchors.add(anchor);
    anchor.addEventListener("mouseenter", () => {
      if (anchor !== active) show(anchor, anchor.matches(".disabled-menu-option"));
    });
    anchor.addEventListener("mouseleave", hide);
  };

  const bindTree = (tree) => {
    if (tree instanceof Element && tree.matches("[data-tip]")) bindAnchor(tree);
    tree.querySelectorAll?.("[data-tip]").forEach(bindAnchor);
  };

  scanTooltipAnchors(root);
  bindTree(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        prepareTooltipAnchor(record.target);
        bindAnchor(record.target);
        // Send/stop changes can happen while the pointer remains on a control.
        if (record.target === active) show(active, true);
      }
      for (const node of record.addedNodes) {
        scanTooltipAnchors(node);
        bindTree(node);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title", "aria-label"],
  });

  root.addEventListener("pointerover", (event) => {
    const anchor = tooltipAnchor(event.target);
    if (!anchor || anchor === active) return;
    show(anchor, anchor.matches(".disabled-menu-option"));
  });
  root.addEventListener("pointerout", (event) => {
    const anchor = tooltipAnchor(event.target);
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    hide();
  });
  root.addEventListener("focusin", (event) => {
    const anchor = tooltipAnchor(event.target);
    // Keyboard focus shows the tip at once; the focus a click leaves behind does
    // not, otherwise the tip re-opens over the menu that click just opened.
    if (anchor && event.target instanceof Element && event.target.matches(":focus-visible")) show(anchor, true);
  });
  root.addEventListener("focusout", (event) => {
    const anchor = tooltipAnchor(event.target);
    if (anchor && !anchor.contains(event.relatedTarget)) hide();
  });
  root.addEventListener("pointerdown", hide, true);
  window.addEventListener(
    "scroll",
    () => {
      if (!active || tooltip.hidden) return;
      const box = active.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) {
        hide();
      } else {
        place(active);
      }
    },
    true,
  );
  window.addEventListener("resize", hide);
}
