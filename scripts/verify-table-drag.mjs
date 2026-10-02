#!/usr/bin/env node
/**
 * Table grab-to-move: click keeps the table still; drag past threshold moves it.
 *   node scripts/verify-table-drag.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickUi,
  pickTableSize,
  clickCell,
  dragEl,
  readModel,
  assertPersisted,
  cleanupFixtures,
  restartNativeWebServer,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");

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

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await openEditor(page, PROJECT);
  await clickUi(page, '[data-control="insert.table"]');
  await pickTableSize(page, 2, 2);
  await page.waitForFunction(() => document.querySelector("#slide .el.selected.table"), null, {
    timeout: 8000,
  });
  let data = await readModel(page);
  const table = lastTable(data);
  if (!table) fail("inserted table missing");
  const id = table.id;
  const origin = table.bounds.slice();

  await clickCell(page, id, 0, 0);
  await page.waitForTimeout(200);
  data = await readModel(page);
  const afterClick = (data.model?.elements || []).find((e) => e.id === id);
  if (JSON.stringify(afterClick?.bounds) !== JSON.stringify(origin)) {
    fail(`cell click moved the table: ${JSON.stringify(afterClick?.bounds)}`);
  }
  pass("cell click does not move the table");

  await dragEl(page, id, 48, 28, {
    onMid: async () => {
      await page.screenshot({ path: path.join(OUT_DIR, "qa-table-dragging.png") });
    },
  });
  await page.waitForFunction(
    ({ elId, x, y }) => {
      const node = document.querySelector(`#slide .el[data-id="${elId}"]`);
      if (!node) return false;
      const left = parseFloat(node.style.left) || 0;
      const top = parseFloat(node.style.top) || 0;
      return Math.abs(left - x) > 20 && Math.abs(top - y) > 10;
    },
    { elId: id, x: origin[0], y: origin[1] },
    { timeout: 5000 },
  );
  data = await readModel(page);
  const moved = (data.model?.elements || []).find((e) => e.id === id);
  const dx = (moved?.bounds?.[0] ?? origin[0]) - origin[0];
  const dy = (moved?.bounds?.[1] ?? origin[1]) - origin[1];
  if (dx < 20 || dy < 10) {
    fail(`table drag did not persist bounds dx=${dx} dy=${dy} from ${JSON.stringify(origin)} to ${JSON.stringify(moved?.bounds)}`);
  }
  pass(`drag from a cell moves the table (dx=${Math.round(dx)} dy=${Math.round(dy)})`);

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    const cur = (again.model?.elements || []).find((e) => e.id === id);
    const pdx = (cur?.bounds?.[0] ?? 0) - origin[0];
    const pdy = (cur?.bounds?.[1] ?? 0) - origin[1];
    if (pdx < 20 || pdy < 10) {
      throw new Error(`table move did not persist: ${JSON.stringify(cur?.bounds)}`);
    }
  });
  pass("table move persists after reload");

  console.log("OK    verify-table-drag");
} finally {
  await browser.close();
  cleanupFixtures();
}
