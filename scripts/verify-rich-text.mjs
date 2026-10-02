#!/usr/bin/env node
/**
 * Browser verification for partial-selection rich text (B/I/U, color, persist).
 * User actions go through scripts/qa/gestures.mjs. Range select is evaluate-only
 * (task-specified), same class of exception as pickColor.
 *   node scripts/verify-rich-text.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickUi,
  clickSlide,
  clickEl,
  dblclickEl,
  typeInto,
  pickColor,
  readModel,
  assertPersisted,
  cleanupFixtures,
  restartNativeWebServer,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");
const SAMPLE = "季度复盘三个判断";
const EXTRA = "附加";
const RANGE = { start: 2, end: 4 };
const COLOR = "#ff6900";

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function lastText(data) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === "text") || null;
}

function runSlice(el, start, end) {
  const hits = [];
  let cursor = 0;
  for (const run of el?.runs || []) {
    const rs = cursor;
    const re = cursor + String(run.text || "").length;
    cursor = re;
    const lo = Math.max(start, rs);
    const hi = Math.min(end, re);
    if (lo < hi) hits.push({ ...run, from: lo, to: hi });
  }
  return hits;
}

function outsideRuns(el, start, end) {
  const hits = [];
  let cursor = 0;
  for (const run of el?.runs || []) {
    const rs = cursor;
    const re = cursor + String(run.text || "").length;
    cursor = re;
    if (rs < start) hits.push({ ...run, from: rs, to: Math.min(re, start) });
    if (re > end) hits.push({ ...run, from: Math.max(rs, end), to: re });
  }
  return hits;
}

function hexEq(a, b) {
  return String(a || "").replace(/^#/, "").toLowerCase() === String(b || "").replace(/^#/, "").toLowerCase();
}

function colorOn(run) {
  const c = String(run.color || "");
  return hexEq(c, COLOR) || c.toLowerCase().includes("255, 105, 0") || c.toLowerCase().includes("255,105,0");
}

async function waitEditing(page) {
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("#slide"));
    },
    null,
    { timeout: 8000 },
  );
}

async function commitEdit(page) {
  await clickSlide(page, 20, 20);
  await page.waitForFunction(
    () => !document.querySelector("#slide .el.is-editing"),
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(200);
}

async function selectPlainRange(page, start, end) {
  const ok = await page.evaluate(
    ([lo, hi]) => {
      const node = document.querySelector("#slide .el.is-editing");
      if (!node) return false;
      const points = [];
      const walk = (n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = n.nodeValue || "";
          for (let i = 0; i < t.length; i++) points.push({ node: n, offset: i });
          return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        if (n.tagName === "BR") {
          points.push({ node: n, offset: 0, br: true });
          return;
        }
        for (const child of n.childNodes) walk(child);
      };
      walk(node);
      const a = points[lo];
      const b = points[hi] || points[points.length - 1];
      if (!a || !b) return false;
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      if (b.br) range.setEnd(b.node, 0);
      else if (points[hi]) range.setEnd(b.node, b.offset);
      else range.setEnd(b.node, (b.node.nodeValue || "").length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return !sel.isCollapsed && sel.toString().length > 0;
    },
    [start, end],
  );
  if (!ok) fail(`could not select plain offsets ${start}..${end}`);
}

async function clickBold(page) {
  // The text-type popover (#pop-type) was retired with the coherent inspector:
  // the bold toggle now lives in the property panel's text section.
  const bold = page.locator('[data-control="element.text.toolbar.bold.toggle"]').first();
  await bold.waitFor({ state: "visible", timeout: 5000 });
  await bold.click();
}

async function waitRuns(page, id, pred, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    const data = await readModel(page);
    const el = (data.model?.elements || []).find((e) => e.id === id) || lastText(data);
    last = el;
    if (el && pred(el)) return el;
    await page.waitForTimeout(120);
  }
  fail(`${label}: ${JSON.stringify(last?.runs || last)}`);
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await openEditor(page, PROJECT);
  pass("editor loaded");

  await clickUi(page, '[data-control="insert.text"]');
  await waitEditing(page);
  await typeInto(page, SAMPLE);
  await page.screenshot({ path: path.join(OUT_DIR, "qa-rich-text-editing.png") });
  await selectPlainRange(page, RANGE.start, RANGE.end);
  await clickBold(page);
  let el = await waitRuns(
    page,
    null,
    (cur) => {
      const mid = runSlice(cur, RANGE.start, RANGE.end);
      const out = outsideRuns(cur, RANGE.start, RANGE.end);
      return (
        String(cur.text || "").includes(SAMPLE) &&
        mid.length &&
        mid.every((r) => r.bold) &&
        out.every((r) => !r.bold)
      );
    },
    "range bold before first commit",
  );
  const id = el.id;
  pass("B applies to in-progress typed range (no prior commit)");
  await commitEdit(page);

  let data = await readModel(page);
  el = (data.model?.elements || []).find((e) => e.id === id) || lastText(data);
  if (!el || !String(el.text || "").includes(SAMPLE)) {
    fail(`inserted text missing: ${JSON.stringify(el?.text)}`);
  }
  {
    const mid = runSlice(el, RANGE.start, RANGE.end);
    const out = outsideRuns(el, RANGE.start, RANGE.end);
    if (!mid.length || mid.some((r) => !r.bold) || out.some((r) => r.bold)) {
      fail(`commit wiped in-progress range bold: ${JSON.stringify(el.runs)}`);
    }
  }
  pass("insert + type + range style + commit keeps runs");

  await dblclickEl(page, id);
  await waitEditing(page);
  await selectPlainRange(page, RANGE.start, RANGE.end);
  el = await waitRuns(
    page,
    id,
    (cur) => {
      const mid = runSlice(cur, RANGE.start, RANGE.end);
      const out = outsideRuns(cur, RANGE.start, RANGE.end);
      return mid.length && mid.every((r) => r.bold) && out.every((r) => !r.bold);
    },
    "range bold still live after re-enter",
  );
  await page.screenshot({ path: path.join(OUT_DIR, "qa-rich-text-bold.png") });
  pass("B applies bold only to offsets 2..4");

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    const cur = (again.model?.elements || []).find((e) => e.id === id);
    if (!cur) throw new Error("element missing after reload");
    const mid = runSlice(cur, RANGE.start, RANGE.end);
    const out = outsideRuns(cur, RANGE.start, RANGE.end);
    if (!mid.length || mid.some((r) => !r.bold) || out.some((r) => r.bold)) {
      throw new Error(`bold did not persist: ${JSON.stringify(cur.runs)}`);
    }
    if (!mid.some((r) => /复盘/.test(r.text || ""))) {
      throw new Error(`styled span text missing 复盘: ${JSON.stringify(cur.runs)}`);
    }
  });
  pass("bold persists after reload (YAML runs)");

  await clickEl(page, id);
  await page.waitForSelector("#ctx-text-color", { timeout: 5000 });
  await dblclickEl(page, id);
  await waitEditing(page);
  await selectPlainRange(page, RANGE.start, RANGE.end);
  await pickColor(page, "#ctx-text-color", COLOR);
  el = await waitRuns(
    page,
    id,
    (cur) => {
      const mid = runSlice(cur, RANGE.start, RANGE.end);
      const out = outsideRuns(cur, RANGE.start, RANGE.end);
      return mid.length && mid.every(colorOn) && out.every((r) => !colorOn(r));
    },
    "range color",
  );
  await page.screenshot({ path: path.join(OUT_DIR, "qa-rich-text-color.png") });
  pass("color applies only to offsets 2..4");

  await clickBold(page);
  el = await waitRuns(
    page,
    id,
    (cur) => {
      const mid = runSlice(cur, RANGE.start, RANGE.end);
      return mid.length && mid.every((r) => !r.bold) && mid.every(colorOn);
    },
    "bold toggle off",
  );
  pass("B on fully-bold range clears bold");

  await commitEdit(page);
  await clickEl(page, id);
  await dblclickEl(page, id);
  await waitEditing(page);
  await page.evaluate(() => {
    const node = document.querySelector("#slide .el.is-editing");
    if (!node) return;
    node.focus();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) last = walker.currentNode;
    const sel = window.getSelection();
    const range = document.createRange();
    if (last) {
      range.setStart(last, last.nodeValue.length);
      range.collapse(true);
    } else {
      range.selectNodeContents(node);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await typeInto(page, EXTRA);
  await page.waitForFunction(
    (extra) => {
      const node = document.querySelector("#slide .el.is-editing");
      return Boolean(node && (node.innerText || "").includes(extra));
    },
    EXTRA,
    { timeout: 4000 },
  );
  await commitEdit(page);
  el = await waitRuns(
    page,
    id,
    (cur) => {
      const text = String(cur.text || "");
      if (!text.endsWith(EXTRA) || !text.includes(SAMPLE)) return false;
      const mid = runSlice(cur, RANGE.start, RANGE.end);
      const extraStart = text.length - EXTRA.length;
      const extra = runSlice(cur, extraStart, text.length);
      return mid.every(colorOn) && extra.every((r) => !colorOn(r) && !r.bold);
    },
    "runs survive append",
  );
  pass("append keeps prior range style; new chars unstyled");

  console.log("OK    verify-rich-text");
} finally {
  await browser.close();
  cleanupFixtures();
}
