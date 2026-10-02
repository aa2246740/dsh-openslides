#!/usr/bin/env node
/**
 * Browser verification for table spreadsheet UX (edit, Tab, insert, fill).
 * User actions go through scripts/qa/gestures.mjs.
 *   node scripts/verify-table-tool.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickUi,
  pickTableSize,
  clickSlide,
  clickCell,
  dblclickCell,
  typeInto,
  shortcut,
  pickColor,
  readModel,
  assertPersisted,
  cleanupFixtures,
  restartNativeWebServer,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");
const COLOR = "#10b981";

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function lastTable(data) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === "table") || null;
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

async function waitEditingCell(page) {
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("td"));
    },
    null,
    { timeout: 5000 },
  );
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await openEditor(page, PROJECT);
  pass("editor loaded");

  await clickUi(page, '[data-control="insert.table"]');
  await pickTableSize(page, 2, 2);
  await waitSelectedType(page, "table");
  let data = await readModel(page);
  let table = lastTable(data);
  if (!table) fail("inserted table missing");
  const id = table.id;
  const headerFill = table.tableRows?.[0]?.[0]?.fill;
  if (!headerFill) fail(`header fill missing: ${JSON.stringify(table.tableRows?.[0])}`);
  pass("insert table with header fill");

  const beforeBounds = table.bounds.slice();
  await clickCell(page, id, 0, 1);
  await page.waitForTimeout(200);
  data = await readModel(page);
  table = (data.model?.elements || []).find((e) => e.id === id);
  if (JSON.stringify(table?.bounds) !== JSON.stringify(beforeBounds)) {
    fail(`clicking a cell dragged the table: ${JSON.stringify(table?.bounds)}`);
  }
  const marked = await page.evaluate((elId) => {
    const td = document.querySelector(`#slide .el[data-id="${elId}"] table`)?.rows?.[0]?.cells?.[1];
    return Boolean(td?.classList.contains("is-cell"));
  }, id);
  if (!marked) fail("clicked cell is not highlighted");
  pass("cell click selects without dragging");

  await dblclickCell(page, id, 0, 0);
  await waitEditingCell(page);
  await shortcut(page, "Control+a");
  await typeInto(page, "指标");
  await page.screenshot({ path: path.join(OUT_DIR, "qa-table-editing.png") });
  await clickSlide(page, 20, 20);
  await page.waitForFunction(
    () => !document.querySelector("#slide td.is-editing-cell, #slide td[contenteditable='true']"),
    null,
    { timeout: 5000 },
  );

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    const cur = (again.model?.elements || []).find((e) => e.id === id);
    const text = cur?.tableRows?.[0]?.[0]?.text || "";
    if (!text.includes("指标")) throw new Error(`cell(0,0) did not persist 指标: ${text}`);
  });
  pass("dblclick edit + outside commit persists");

  await clickCell(page, id, 0, 0);
  await page.waitForFunction(
    (elId) => {
      const selected = document.querySelector(`#slide .el.selected[data-id="${elId}"]`);
      const td = document.querySelector(`#slide .el[data-id="${elId}"] table`)?.rows?.[0]?.cells?.[0];
      return Boolean(selected && td?.classList.contains("is-cell"));
    },
    id,
    { timeout: 5000 },
  );
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    (elId) => {
      const td = document.querySelector(`#slide .el[data-id="${elId}"] table`)?.rows?.[0]?.cells?.[1];
      return Boolean(td?.classList.contains("is-cell"));
    },
    id,
    { timeout: 4000 },
  );
  await page.keyboard.press("Enter");
  await waitEditingCell(page);
  await shortcut(page, "Control+a");
  await typeInto(page, "数值");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  data = await readModel(page);
  table = (data.model?.elements || []).find((e) => e.id === id);
  if (!String(table?.tableRows?.[0]?.[1]?.text || "").includes("数值")) {
    fail(`Tab/Enter did not write 数值: ${JSON.stringify(table?.tableRows?.[0])}`);
  }
  pass("Tab then Enter edits the next cell");

  await clickCell(page, id, 0, 0);
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-table", { timeout: 8000 });
  if (!(await page.locator("#pop-table.open").count())) {
    await clickUi(page, "#pop-table > button");
    await page.waitForSelector("#pop-table.open", { timeout: 4000 });
  }
  await clickUi(page, "#pop-table .ctx-btn", { text: "+行" });
  await page.waitForTimeout(250);
  data = await readModel(page);
  table = (data.model?.elements || []).find((e) => e.id === id);
  if ((table?.tableRows || []).length < 3) {
    fail(`+行 expected ≥3 rows, got ${table?.tableRows?.length}`);
  }
  pass("+行 inserts after the current row");

  await clickCell(page, id, 1, 0);
  await page.waitForFunction(
    (elId) => {
      const td = document.querySelector(`#slide .el[data-id="${elId}"] table`)?.rows?.[1]?.cells?.[0];
      return Boolean(td?.classList.contains("is-cell"));
    },
    id,
    { timeout: 4000 },
  );
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-table", { timeout: 8000 });
  if (!(await page.locator("#pop-table.open").count())) {
    await clickUi(page, "#pop-table > button");
    await page.waitForSelector("#pop-table.open", { timeout: 4000 });
  }
  await page.waitForSelector("#ctx-table-fill", { state: "attached", timeout: 4000 });
  await pickColor(page, "#ctx-table-fill", COLOR);
  const deadline = Date.now() + 5000;
  let fill = "";
  while (Date.now() < deadline) {
    data = await readModel(page);
    table = (data.model?.elements || []).find((e) => e.id === id);
    fill = String(table?.tableRows?.[1]?.[0]?.fill || "").toLowerCase();
    if (fill === COLOR) break;
    await page.waitForTimeout(120);
  }
  if (fill !== COLOR) fail(`cell fill expected ${COLOR}, got ${fill}`);
  await page.screenshot({ path: path.join(OUT_DIR, "qa-table-fill.png") });
  pass("fill color picker paints the selected cell");

  console.log("OK    verify-table-tool");
} finally {
  await browser.close();
  cleanupFixtures();
}
