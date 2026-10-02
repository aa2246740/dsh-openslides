#!/usr/bin/env node
/**
 * Browser verification for shape live preview (fill + adj remorph).
 * User actions go through scripts/qa/gestures.mjs.
 *   node scripts/verify-shape-tool.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickUi,
  clickEl,
  dragAdjHandle,
  pickColor,
  setRange,
  readModel,
  assertPersisted,
  cleanupFixtures,
  restartNativeWebServer,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");
const COLOR = "#10B981";

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function hexEq(a, b) {
  return String(a || "").replace(/^#/, "").toLowerCase() === String(b || "").replace(/^#/, "").toLowerCase();
}

function lastOfType(data, type) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === type) || null;
}

async function waitSelectedType(page, type) {
  await page.waitForFunction(
    (want) => {
      const el = document.querySelector("#slide .el.selected");
      return Boolean(el && el.classList.contains(want));
    },
    type,
    { timeout: 8000 },
  );
}

async function pathD(page, id) {
  return page.evaluate((elId) => {
    const p = document.querySelector(`#slide .el[data-id="${elId}"] svg path[fill]:not([fill="none"])`);
    return p?.getAttribute("d") || "";
  }, id);
}

async function pathFill(page, id) {
  return page.evaluate((elId) => {
    const p = document.querySelector(`#slide .el[data-id="${elId}"] svg path[fill]:not([fill="none"])`);
    return p?.getAttribute("fill") || "";
  }, id);
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await openEditor(page, PROJECT);
  pass("editor loaded");

  const geo = await page.evaluate(async () => {
    const res = await fetch("/api/shape-geometry?name=roundRect&adj=80000");
    return res.json();
  });
  if (!geo?.pathD) fail("shape-geometry API missing pathD");
  pass("shape-geometry API");

  await clickUi(page, '[data-control="insert.shape"]');
  await page.waitForSelector("#shape-palette:not([hidden]) #shape-grid .shape-cell", { timeout: 8000 });
  await clickUi(page, "#shape-grid .shape-cell", { text: "Rounded rectangle" });
  await waitSelectedType(page, "shape");
  let data = await readModel(page);
  const shape = lastOfType(data, "shape");
  if (!shape) fail("inserted rounded rectangle missing");
  const id = shape.id;
  const startPath = await pathD(page, id);
  if (!startPath) fail("inserted shape has no SVG path");
  pass("insert rounded rectangle");

  await clickEl(page, id);
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-fill", { timeout: 5000 });
  await clickUi(page, "#pop-fill > button");
  await page.waitForSelector("#ctx-fill-color", { timeout: 4000 });
  await page.evaluate((hex) => {
    const el = document.querySelector("#ctx-fill-color");
    if (!el) throw new Error("fill input missing");
    el.value = hex;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, COLOR);
  const liveFill = await pathFill(page, id);
  if (!hexEq(liveFill, COLOR)) fail(`fill input did not remorph SVG: ${liveFill}`);
  await page.screenshot({ path: path.join(OUT_DIR, "qa-shape-fill-live.png") });
  await pickColor(page, "#ctx-fill-color", COLOR);
  await page.waitForTimeout(250);
  data = await readModel(page);
  const filled = (data.model?.elements || []).find((e) => e.id === id);
  if (!hexEq(filled?.fillCss, COLOR)) fail(`shape fill persist expected ${COLOR}, got ${filled?.fillCss}`);
  pass("fill input previews SVG then persists");

  await clickUi(page, "#pop-adj > button");
  await page.waitForSelector('#pop-adj input[type="range"]', { timeout: 4000 });
  const sliderMax = await page.evaluate(() => {
    const sl = document.querySelector('#pop-adj input[type="range"]');
    if (!sl) throw new Error("adj slider missing");
    return Number(sl.max) || 100000;
  });
  const sliderValue = Math.round(Math.min(sliderMax, 25000));
  await page.evaluate((value) => {
    const sl = document.querySelector('#pop-adj input[type="range"]');
    if (!sl) throw new Error("adj slider missing");
    sl.value = String(value);
    sl.dispatchEvent(new Event("input", { bubbles: true }));
  }, sliderValue);
  await page.waitForTimeout(80);
  const livePath = await pathD(page, id);
  if (!livePath || livePath === startPath) fail("adj slider input did not remorph pathD");
  await page.screenshot({ path: path.join(OUT_DIR, "qa-shape-adj-live.png") });
  await setRange(page, '#pop-adj input[type="range"]', sliderValue);
  await page.waitForTimeout(250);
  data = await readModel(page);
  const adjusted = (data.model?.elements || []).find((e) => e.id === id);
  if (!adjusted?.adjustments?.length) fail("adjustments missing after slider change");
  if (Number(adjusted.adjustments[0]) !== sliderValue) {
    fail(`adj[0] expected ${sliderValue}, got ${adjusted.adjustments[0]}`);
  }
  pass("adj slider remorphs then persists");

  await clickUi(page, "#pop-adj > button");
  await page.waitForFunction(
    () => !document.querySelector("#pop-adj")?.classList.contains("open"),
    null,
    { timeout: 3000 },
  );
  await page.waitForSelector(`#slide .el[data-id="${id}"] [data-handle="adj:0"]`, { timeout: 5000 });

  const beforeDrag = await pathD(page, id);
  let midPath = beforeDrag;
  await dragAdjHandle(page, id, 0, 48, 16, {
    onMid: async () => {
      await page.waitForFunction(
        ({ elId, before }) => {
          const p = document.querySelector(`#slide .el[data-id="${elId}"] svg path[fill]:not([fill="none"])`);
          return Boolean(p && p.getAttribute("d") && p.getAttribute("d") !== before);
        },
        { elId: id, before: beforeDrag },
        { timeout: 2000 },
      );
      midPath = await pathD(page, id);
      await page.screenshot({ path: path.join(OUT_DIR, "qa-shape-adj-drag.png") });
    },
  });
  if (!midPath || midPath === beforeDrag) fail("adj handle drag did not remorph mid-gesture");
  await page.waitForTimeout(250);
  data = await readModel(page);
  const afterDrag = (data.model?.elements || []).find((e) => e.id === id);
  if (!afterDrag?.adjustments?.length) fail("adjustments missing after adj drag");
  pass("adj handle drag remorphs live");

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    const cur = (again.model?.elements || []).find((e) => e.id === id);
    if (!hexEq(cur?.fillCss, COLOR)) throw new Error(`fill lost after reload: ${cur?.fillCss}`);
    if (!cur?.adjustments?.length) throw new Error("adjustments lost after reload");
  });
  pass("fill + adjustments persist after reload");
} finally {
  await browser.close();
  cleanupFixtures();
}
