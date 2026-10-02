#!/usr/bin/env node
/**
 * End-to-end user journey — Interaction QA Charter §四.
 * User actions go through scripts/qa/gestures.mjs only.
 *   node scripts/verify-user-journeys.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickEl,
  clickUi,
  pickTableSize,
  insertViaCommand,
  clickSlide,
  clickCell,
  dblclickCell,
  dragEl,
  marquee,
  typeInto,
  shortcut,
  pickColor,
  readModel,
  assertPersisted,
  cleanupFixtures,
  fixtureSnapshotMatches,
  restartNativeWebServer,
  waitEditorReady,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");
const TITLE = "季度复盘：三个判断";
const COMMENT = "这里要放数据来源";

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS ${name}`);
}

function lastOfType(data, type) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === type) || null;
}

function hexEq(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

async function goToLastPage(page) {
  const thumbs = page.locator("#rail .thumb");
  const n = await thumbs.count();
  if (n < 1) throw new Error("rail has no thumbs");
  await thumbs.nth(n - 1).scrollIntoViewIfNeeded();
  const box = await thumbs.nth(n - 1).boundingBox();
  if (!box) throw new Error("last rail thumb has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
}

async function waitSelectedType(page, type, timeout = 8000) {
  await page.waitForFunction(
    (want) => {
      const node = document.querySelector(`#slide .el.${want}.selected`);
      return Boolean(node);
    },
    type,
    { timeout },
  );
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));

let stepName = "boot";

async function fail(msg) {
  const shot = path.join(OUT_DIR, `qa-journey-fail-${stepName.replace(/\s+/g, "-")}.png`);
  try {
    await page.screenshot({ path: shot, fullPage: false });
    console.error(`shot  ${shot}`);
  } catch {
    /* page may already be closed */
  }
  console.error(`FAIL ${stepName}: ${msg}`);
  throw new Error(msg);
}

try {
  await openEditor(page, PROJECT);
  const boot = await readModel(page);
  const pageCount0 = boot.model?.pageCount ?? 0;
  if (pageCount0 < 8) await fail(`expected ≥8 pages, got ${pageCount0}`);

  // --- 1. 新建页 ---
  stepName = "新建页";
  const railHidden = await page.locator("#rail").isHidden();
  if (railHidden) await clickUi(page, "#btn-rail");
  await page.waitForSelector(".rail-add", { timeout: 5000 });
  await clickUi(page, ".rail-add");
  await page.waitForFunction(
    (prev) => {
      const t = document.getElementById("page-count")?.textContent || "";
      const m = /\/\s*(\d+)/.exec(t);
      return m && Number(m[1]) === prev + 1;
    },
    pageCount0,
    { timeout: 8000 },
  );
  const afterAdd = await readModel(page);
  if ((afterAdd.model?.pageCount ?? 0) !== pageCount0 + 1) {
    await fail(`pageCount ${afterAdd.model?.pageCount} !== ${pageCount0 + 1}`);
  }
  pass(stepName);

  // --- 2. 插入标题文本 ---
  stepName = "插入标题文本";
  await clickUi(page, '#insert-toolbar [data-control="insert.text"]');
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("#slide"));
    },
    null,
    { timeout: 6000 },
  );
  await typeInto(page, TITLE);
  await clickSlide(page, 20, 20);
  await page.waitForFunction(
    () => !document.querySelector("#slide .el.is-editing"),
    null,
    { timeout: 5000 },
  );
  const afterText = await readModel(page);
  const textEl = lastOfType(afterText, "text");
  if (!textEl || !String(textEl.text || "").includes(TITLE)) {
    await fail(`model missing title text: ${JSON.stringify(textEl?.text)}`);
  }
  await assertPersisted(page, async () => {
    await goToLastPage(page);
    const again = await readModel(page);
    const el = (again.model?.elements || []).find((e) => String(e.text || "").includes(TITLE));
    if (!el) throw new Error("title text missing after reload");
  });
  pass(stepName);

  // --- 3. 插入形状、拖动、换色 ---
  stepName = "插入形状拖动换色";
  await clickUi(page, '#insert-toolbar [data-control="insert.shape"]');
  await page.waitForSelector("#shape-palette:not([hidden]) #shape-grid .shape-cell", { timeout: 8000 });
  await clickUi(page, "#shape-grid .shape-cell");
  await waitSelectedType(page, "shape");
  const afterShape = await readModel(page);
  const shape = lastOfType(afterShape, "shape");
  if (!shape) await fail("inserted shape missing from model");
  let sawGuide = false;
  await dragEl(page, shape.id, 120, 60, {
    onMid: async () => {
      sawGuide = (await page.locator("#slide .guide-line").count()) > 0;
      await page.screenshot({ path: path.join(OUT_DIR, "qa-journey-drag-mid.png"), fullPage: false });
    },
  });
  if (!sawGuide) await fail(".guide-line did not appear mid-drag");
  await clickEl(page, shape.id);
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-fill", { timeout: 5000 });
  await clickUi(page, "#pop-fill > button");
  await page.waitForSelector("#ctx-fill-color", { timeout: 4000 });
  await pickColor(page, "#ctx-fill-color", "#10B981");
  await page.waitForTimeout(300);
  const afterFill = await readModel(page);
  const filled = (afterFill.model?.elements || []).find((e) => e.id === shape.id);
  if (!hexEq(filled?.fillCss, "#10B981")) {
    await fail(`shape fill expected #10B981, got ${filled?.fillCss}`);
  }
  pass(stepName);

  // --- 4. 插入表格 ---
  stepName = "插入表格";
  await clickUi(page, '#insert-toolbar [data-control="insert.table"]');
  await pickTableSize(page, 2, 2);
  await waitSelectedType(page, "table");
  const afterTable = await readModel(page);
  const table = lastOfType(afterTable, "table");
  if (!table) await fail("inserted table missing from model");
  await dblclickCell(page, table.id, 0, 0);
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("td"));
    },
    null,
    { timeout: 4000 },
  );
  await shortcut(page, "Control+a");
  await typeInto(page, "指标");
  await clickSlide(page, 20, 20);
  await page.waitForTimeout(350);
  await clickCell(page, table.id, 0, 0);
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-table", { timeout: 8000 });
  await clickUi(page, "#pop-table > button");
  await clickUi(page, "#pop-table .ctx-btn", { text: "+行" });
  await page.waitForTimeout(300);
  const afterRow = await readModel(page);
  const table2 = (afterRow.model?.elements || []).find((e) => e.id === table.id);
  const rows = table2?.tableRows || [];
  const cols = rows[0]?.length || 0;
  if (rows.length < 3 || cols < 2) {
    await fail(`tableRows dims expected ≥3×2, got ${rows.length}×${cols}`);
  }
  const cell00 = rows[0]?.[0]?.text || "";
  if (!cell00.includes("指标")) await fail(`cell(0,0) expected 指标, got ${JSON.stringify(cell00)}`);
  pass(stepName);

  // --- 5. 插入图表 ---
  stepName = "插入图表";
  // Chart insertion has no editor affordance by design (decks get charts from the
  // agent), so the journey seeds one through the command path, then drives the
  // rest of the chart flow through the real UI.
  await insertViaCommand(page, "chart");
  await clickEl(page, lastOfType(await readModel(page), "chart")?.id);
  await waitSelectedType(page, "chart");
  await page.waitForSelector('#ctx-bar [data-control="element.chart.data.set"]', { timeout: 8000 });
  await clickUi(page, '#ctx-bar [data-control="element.chart.data.set"]');
  await page.waitForSelector("#chart-overlay:not([hidden])", { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT_DIR, "qa-journey-chart-overlay.png"), fullPage: false });
  const seriesHeader = page.locator("#chart-grid th.s1 input").first();
  await seriesHeader.waitFor({ timeout: 4000 });
  const hb = await seriesHeader.boundingBox();
  if (!hb) await fail("series header has no box");
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await shortcut(page, "Control+a");
  await typeInto(page, "营收");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  const valueCell = page.locator("#chart-grid tr:not(.add-row) td input").nth(1);
  const vb = await valueCell.boundingBox();
  if (!vb) await fail("value cell has no box");
  const svgBefore = await page.evaluate(() => {
    const node = document.querySelector("#slide .el.chart svg");
    return node ? node.innerHTML : "";
  });
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await shortcut(page, "Control+a");
  await typeInto(page, "12");
  await page.waitForFunction(
    (prev) => {
      const node = document.querySelector("#slide .el.chart svg");
      const html = node ? node.innerHTML : "";
      return html && html !== prev;
    },
    svgBefore,
    { timeout: 5000 },
  );
  await clickSlide(page, 20, 500);
  await page.waitForFunction(() => document.getElementById("chart-overlay")?.hidden, null, { timeout: 4000 });
  const chartModel = await readModel(page);
  const chart = lastOfType(chartModel, "chart") || (chartModel.model?.elements || []).find((e) => e.type === "chart");
  if (!chart) await fail("chart missing after data edit");
  await clickEl(page, chart.id);
  await page.waitForSelector("#ctx-bar:not([hidden]) #pop-chart-type", { timeout: 5000 });
  await clickUi(page, "#pop-chart-type > button");
  await clickUi(page, "#pop-chart-type .ctx-btn", { text: "折线" });
  await page.waitForTimeout(400);
  const afterType = await readModel(page);
  const chart2 = (afterType.model?.elements || []).find((e) => e.id === chart.id);
  if (chart2?.chartType !== "line") {
    await fail(`chart type expected line, got ${chart2?.chartType}`);
  }
  pass(stepName);

  // --- 6. 框选对齐 ---
  stepName = "框选对齐";
  const alignModel = await readModel(page);
  const shapeNow = (alignModel.model?.elements || []).find((e) => e.id === shape.id);
  const chartNow = (alignModel.model?.elements || []).find((e) => e.id === chart.id);
  if (!shapeNow || !chartNow) await fail("shape/chart missing before marquee");
  const x0 = Math.min(shapeNow.bounds[0], chartNow.bounds[0]) - 16;
  const y0 = Math.min(shapeNow.bounds[1], chartNow.bounds[1]) - 16;
  const x1 = Math.max(shapeNow.bounds[0] + shapeNow.bounds[2], chartNow.bounds[0] + chartNow.bounds[2]) + 16;
  const y1 = Math.max(shapeNow.bounds[1] + shapeNow.bounds[3], chartNow.bounds[1] + chartNow.bounds[3]) + 16;
  await clickSlide(page, 20, 20);
  await page.waitForTimeout(150);
  await marquee(page, x0, y0, x1, y1);
  await page.waitForTimeout(300);
  const sel = await readModel(page);
  const selKind = sel.model?.selection?.kind;
  const selIds = sel.model?.selection?.elementIds || (sel.model?.selection?.elementId ? [sel.model.selection.elementId] : []);
  if (!selIds.includes(shape.id) || !selIds.includes(chart.id)) {
    await fail(`marquee did not select shape+chart: ${JSON.stringify(sel.model?.selection)}`);
  }
  if (selKind === "multi") {
    await page.waitForSelector("#ctx-bar:not([hidden]) #pop-align", { timeout: 5000 });
    await clickUi(page, "#pop-align > button");
    await clickUi(page, "#pop-align .ctx-btn", { text: "左齐" });
  } else {
    await page.waitForSelector("#ctx-bar:not([hidden]) #pop-align-el", { timeout: 5000 });
    await clickUi(page, "#pop-align-el > button");
    await clickUi(page, "#pop-align-el .ctx-btn", { text: "左齐" });
  }
  await page.waitForTimeout(300);
  const aligned = await readModel(page);
  const sA = (aligned.model?.elements || []).find((e) => e.id === shape.id);
  const cA = (aligned.model?.elements || []).find((e) => e.id === chart.id);
  if (sA.bounds[0] !== cA.bounds[0]) {
    await fail(`左齐 failed: shape.x=${sA.bounds[0]} chart.x=${cA.bounds[0]}`);
  }
  pass(stepName);

  // --- 7. 复制粘贴 ---
  stepName = "复制粘贴";
  await clickEl(page, chart.id);
  await page.waitForTimeout(200);
  const beforeCopy = await readModel(page);
  const count0 = (beforeCopy.model?.elements || []).length;
  const src = (beforeCopy.model?.elements || []).find((e) => e.id === chart.id);
  if (!src) await fail("chart missing before copy");
  await shortcut(page, "Control+c");
  await page.waitForTimeout(150);
  await shortcut(page, "Control+v");
  await page.waitForTimeout(400);
  const afterCopy = await readModel(page);
  const count1 = (afterCopy.model?.elements || []).length;
  if (count1 !== count0 + 1) await fail(`element count ${count0} → ${count1}, expected +1`);
  const copy = (afterCopy.model?.elements || []).find(
    (e) => e.type === "chart" && e.id !== chart.id && Math.abs(e.bounds[0] - (src.bounds[0] + 24)) <= 1,
  );
  if (!copy) {
    await fail(
      `offset copy not found; charts=${JSON.stringify(
        (afterCopy.model?.elements || []).filter((e) => e.type === "chart").map((e) => [e.id, e.bounds]),
      )}`,
    );
  }
  pass(stepName);

  // --- 8. 评论 ---
  stepName = "评论";
  for (let i = 0; i < 16; i++) {
    const cur = await readModel(page);
    const sel = cur.model?.selection;
    const ids = sel?.kind === "multi" ? sel.elementIds || [] : sel?.elementId ? [sel.elementId] : [];
    if (ids.length === 1 && ids[0] === shape.id) break;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    if (i === 15) await fail(`could not Tab-select shape ${shape.id}`);
  }
  // Comment mode is panel-driven now: the retired bottom pill opened a pin-card
  // from a raw canvas click; today the panel composes an element-scoped draft.
  await clickUi(page, "#btn-comments");
  try {
    await page.waitForSelector("#comment-panel:not([hidden])", { timeout: 4000 });
    await page.waitForSelector("#comment-layer:not([hidden])", { timeout: 4000 });
  } catch {
    await fail("comment panel/layer did not open");
  }
  const scopePressed = await page.locator('[data-comment-scope="elements"]').getAttribute("aria-pressed");
  if (scopePressed !== "true") await fail(`element scope should be active for one selected element, got ${scopePressed}`);
  await clickUi(page, "#comment-draft");
  await typeInto(page, COMMENT);
  await clickUi(page, "#comment-add");
  try {
    await page.waitForSelector(`.pin[data-element-id="${shape.id}"]`, { timeout: 4000 });
  } catch {
    await fail("submitted comment did not drop a pin on the selected shape");
  }
  await page.screenshot({ path: path.join(OUT_DIR, "qa-journey-comment-pin.png"), fullPage: false });
  const countText = (await page.locator("#comment-count").innerText()).trim();
  if (countText !== "1") await fail(`comment count after submit expected 1, got ${JSON.stringify(countText)}`);
  // The card renders its text inside a textarea, so read the stored record
  // instead of the list's innerText.
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("oss.comments:"));
    return key ? JSON.parse(localStorage.getItem(key) || "[]") : [];
  });
  const mine = stored.filter((r) => r.elementId === shape.id);
  if (!mine.some((r) => String(r.text || "").includes(COMMENT))) {
    await fail(`stored comment for ${shape.id} missing the draft text: ${JSON.stringify(stored.map((r) => ({ id: r.elementId, text: r.text })))}`);
  }
  await clickUi(page, '#comment-list .comment-card [data-act="del"]');
  try {
    await page.waitForFunction(
      () => (document.getElementById("comment-count")?.textContent || "").trim() === "0",
      null,
      { timeout: 4000 },
    );
  } catch {
    await fail("comment count did not return to 0 after 解决");
  }
  await clickUi(page, "#comment-panel-close");
  try {
    await page.waitForFunction(() => document.getElementById("comment-layer")?.hidden, null, { timeout: 4000 });
  } catch {
    await fail("comment layer stayed open after closing the panel");
  }
  pass(stepName);

  // --- 9. 版本 ---
  stepName = "版本";
  const ver0 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    const d = await r.json();
    return (d.versions || []).length;
  });
  await clickUi(page, "#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 4000 });
  await clickUi(page, "#version-save");
  await page.waitForTimeout(400);
  await clickUi(page, "#version-save");
  await page.waitForTimeout(400);
  const ver1 = await page.evaluate(async () => {
    const r = await fetch("/api/versions");
    const d = await r.json();
    return d.versions || [];
  });
  if (ver1.length <= ver0) await fail(`version list did not grow (${ver0} → ${ver1.length})`);
  const menuHidden = await page.locator("#version-menu").isHidden();
  if (menuHidden) await clickUi(page, "#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 4000 });
  const v1row = page
    .locator("#versions-list .version-row")
    .filter({ hasText: "V1" })
    .filter({ hasNotText: "最新" })
    .first();
  if ((await v1row.count()) < 1) {
    const txt = await page.locator("#versions-list").innerText();
    await fail(`V1 preview row missing: ${txt}`);
  }
  // Click through the locator: the menu re-renders after the snapshots above, so
  // a pre-measured mouse click can land on stale coordinates.
  await v1row.waitFor({ state: "visible", timeout: 4000 });
  await v1row.click();
  await page.waitForSelector("#history-bar:not([hidden]) #history-readonly", { timeout: 5000 });
  const badge = await page.locator("#history-readonly").isVisible();
  if (!badge) await fail("只读 badge not visible in V1 preview");
  await clickUi(page, "#history-back");
  await page.waitForFunction(() => document.getElementById("history-bar")?.hidden, null, { timeout: 4000 });
  pass(stepName);

  // --- 10. 播放进出 ---
  stepName = "播放进出";
  await clickUi(page, "#btn-play");
  await page.waitForSelector("#present:not([hidden])", { timeout: 4000 });
  const pillHidden = await page.locator("#insert-toolbar").isHidden();
  if (!pillHidden) await fail("bottom toolbar still visible in present mode");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("present")?.hidden, null, { timeout: 4000 });
  const pillBack = await page.locator("#insert-toolbar").isVisible();
  if (!pillBack) await fail("bottom toolbar not visible after Escape");
  pass(stepName);

  // --- 11. 导出 PPTX ---
  stepName = "导出PPTX";
  await clickUi(page, "#btn-export");
  await page.waitForSelector("#export-dialog[open]", { timeout: 4000 });
  await clickUi(page, "#export-pptx");
  // A format button only marks the choice; 下载 starts the export and shows the
  // progress/result states.
  await clickUi(page, "#export-download");
  await page.waitForSelector("#export-result:not([hidden])", { timeout: 30000 });
  const resultText = await page.locator("#export-result").innerText();
  if (!resultText.includes("页")) await fail(`export result missing 页: ${resultText}`);
  if (!/\d+(?:\.\d+)?\s*(KB|MB)/.test(resultText)) await fail(`export result missing size: ${resultText}`);
  pass(stepName);

  console.log("OK    verify-user-journeys");
} catch (err) {
  if (!String(err?.message || "").startsWith("FAIL") && stepName) {
    const shot = path.join(OUT_DIR, `qa-journey-fail-${stepName.replace(/\s+/g, "-")}.png`);
    try {
      await page.screenshot({ path: shot, fullPage: false });
      console.error(`shot  ${shot}`);
    } catch {
      /* ignore */
    }
    console.error(`FAIL ${stepName}: ${err?.message || err}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  cleanupFixtures();
  if (!fixtureSnapshotMatches()) {
    console.error("FAIL cleanupFixtures did not restore the pre-QA fixture snapshot");
    process.exitCode = 1;
  }
}
