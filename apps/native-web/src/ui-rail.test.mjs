import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { renderRailView, railPageKey } from "../public/rail.js";

const { JSDOM } = createRequire(import.meta.url)("jsdom");

function models(paths, rootDir = "/project") {
  return paths.map((_, pageIndex) => ({
    rootDir, pagePaths: paths, pageIndex, size: [960, 540],
    background: { type: "solid", color: "#ffffff" },
    backgroundCss: "#ffffff", themeColors: {},
    elements: [{ id: "shape", type: "shape", bounds: [20, 20, 100, 40], pathD: "M0 0 L10 10", opacity: 1 }],
  }));
}

function fixture() {
  const dom = new JSDOM('<main><div id="rail"></div></main>');
  const { document, HTMLElement } = dom.window;
  const rail = document.getElementById("rail");
  globalThis.document = document;
  globalThis.CSS = { escape: String };
  let scroll = 0;
  Object.defineProperty(rail, "scrollTop", {
    get: () => scroll,
    set: (value) => { scroll = Math.max(0, Math.min(value, rail.querySelectorAll(".thumb").length * 80 - 240)); },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rail) return { top: 100, bottom: 340, height: 240 };
    const index = [...rail.querySelectorAll(".thumb")].indexOf(this);
    const top = 100 + index * 80 - scroll;
    return { top, bottom: top + 80, height: 80 };
  };
  let paints = 0;
  const render = (pages, options = {}) => renderRailView({
    rail, pages, activeIndex: 0, thumbFrameWidth: 160,
    paintSlide: (node, page) => { paints++; node.textContent = JSON.stringify(page.elements); },
    ...options,
  });
  return { document, rail, render, paints: () => paints, buttons: () => [...rail.querySelectorAll(".thumb")] };
}

test("navigation preserves native page nodes and does not repaint unchanged content", () => {
  const f = fixture();
  const pages = models(["one.page", "two.page", "three.page"]);
  f.render(pages);
  const before = f.buttons();
  f.render(structuredClone(pages), { activeIndex: 1 });
  assert.deepEqual(f.buttons(), before);
  assert.equal(f.paints(), 3);
  assert.equal(before[0].getAttribute("aria-current"), null);
  assert.equal(before[1].getAttribute("aria-current"), "page");
});

test("same-count nested shape and background changes repaint only changed pages", () => {
  const f = fixture();
  const pages = models(["one.page", "two.page"]);
  f.render(pages);
  const next = structuredClone(pages);
  next[0].elements[0].pathD = "M0 0 L20 30";
  next[0].elements[0].opacity = 0.5;
  f.render(next);
  assert.equal(f.paints(), 3);
  next[1].background = { type: "solid", color: "#123456" };
  f.render(next);
  assert.equal(f.paints(), 4);
});

test("an unchanged active page does not pull a manually scrolled rail back", () => {
  const f = fixture();
  const pages = models(Array.from({ length: 20 }, (_, i) => `p${i}.page`));
  f.render(pages);
  f.rail.scrollTop = 480;
  f.render(structuredClone(pages));
  assert.equal(f.rail.scrollTop, 480);
});

test("insertion preserves the visible anchor and focused native page", () => {
  const f = fixture();
  const paths = Array.from({ length: 20 }, (_, i) => `p${i}.page`);
  f.render(models(paths));
  const focused = f.buttons()[7];
  focused.focus();
  f.rail.scrollTop = 480;
  f.render(models(["inserted.page", ...paths]), { activeIndex: 1 });
  assert.equal(f.rail.scrollTop, 560);
  assert.equal(f.document.activeElement, focused);
});

test("reorder and deletion preserve surviving identities and current click handlers", () => {
  const f = fixture();
  const events = [];
  f.render(models(["a.page", "b.page", "c.page"]), { callbacks: { onClick: () => events.push("old") } });
  const [a, b, c] = f.buttons();
  f.render(models(["c.page", "a.page"]), { activeIndex: 1, callbacks: { onClick: (_, node) => events.push(node.dataset.pageIndex) } });
  assert.deepEqual(f.buttons(), [c, a]);
  assert.equal(b.isConnected, false);
  c.click();
  assert.deepEqual(events, ["0"]);
});

test("resize changes frame geometry without repainting identical slide content", () => {
  const f = fixture();
  const pages = models(["a.page"]);
  f.render(pages);
  f.render(pages, { thumbFrameWidth: 240 });
  assert.equal(f.rail.querySelector(".thumb-frame").style.height, "135px");
  assert.equal(f.rail.querySelector(".thumb-mini").style.transform, "scale(0.25)");
  assert.equal(f.paints(), 1);
});

test("project and version changes cannot reuse another document's stale paint", () => {
  const f = fixture();
  const first = models(["a.page"], "/first");
  f.render(first);
  const button = f.buttons()[0];
  const second = models(["a.page"], "/second");
  f.render(second);
  assert.notEqual(railPageKey(first[0]), railPageKey(second[0]));
  assert.notEqual(f.buttons()[0], button);
  second[0].elements[0].pathD = "historical-version";
  f.render(second);
  assert.equal(f.paints(), 3);
});

test("duplicate native page paths reject before mutating the rail", () => {
  const f = fixture();
  f.render(models(["a.page"]));
  const before = f.buttons();
  assert.throws(() => f.render(models(["same.page", "same.page"])), /Duplicate/);
  assert.deepEqual(f.buttons(), before);
});

test("three-digit page numbers remain outside the slide frame", () => {
  const f = fixture();
  const pages = models(Array.from({ length: 101 }, (_, i) => `p${i}.page`));
  f.render(pages, { activeIndex: 100 });
  assert.equal(f.buttons()[100].querySelector(".thumb-gutter .n").textContent, "101");
  assert.equal(f.buttons()[100].querySelector(".thumb-frame .n"), null);
});
