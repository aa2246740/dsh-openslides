#!/usr/bin/env node
/**
 * Interaction QA on a *generated* deck (not fixtures/okp-yu7-ppt).
 * Copies the source project first. Does NOT call cleanupFixtures().
 * Gestures only from scripts/qa/gestures.mjs.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  openEditor,
  clickEl,
  clickUi,
  pickTableSize,
  clickSlide,
  clickCell,
  dblclickCell,
  dblclickEl,
  dragEl,
  typeInto,
  shortcut,
  pickColor,
  chooseImageFile,
  readModel,
  assertPersisted,
  restartNativeWebServer,
} from "./gestures.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const OUT =
  process.env.QA_GENERATED_EDITOR_OUT || path.join(ROOT, "output", "qa-generated-editor");
const ART = "/opt/cursor/artifacts/qa-generated-editor";
const VIDEO_DIR = path.join(OUT, "playwright-video");
const SRC =
  process.env.QA_GENERATED_PROJECT ||
  path.join(ROOT, "output", "hub-1787049969199-根据附件写华北零售-7-月经营月报-只引用附件里");
const SANDBOX = path.join(ROOT, "output", "qa-generated-editor-sandbox");
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  startedAt: new Date().toISOString(),
  source: SRC,
  sandbox: SANDBOX,
  steps: [],
  failures: [],
  pageCount: null,
  exported: null,
};

function pass(name, extra) {
  notes.steps.push({ name, ok: true, ...extra });
  console.log(`PASS ${name}`);
}

function fail(name, msg, severity = "P1") {
  notes.failures.push({ name, severity, msg });
  notes.steps.push({ name, ok: false, severity, msg });
  console.error(`FAIL ${severity} ${name}: ${msg}`);
}

function lastOfType(data, type) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === type) || null;
}

function hexEq(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

async function waitSelectedType(page, type, timeout = 8000) {
  await page.waitForFunction(
    (want) => Boolean(document.querySelector(`#slide .el.${want}.selected`)),
    type,
    { timeout },
  );
}

function copySandbox() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`generated project missing: ${SRC}`);
  }
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.cpSync(SRC, SANDBOX, { recursive: true });
}

copySandbox();
await restartNativeWebServer();

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-position=40,40", "--window-size=1440,900"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("dialog", (d) => d.dismiss().catch(() => {}));

let step = "boot";

try {
  await openEditor(page, SANDBOX);
  const boot = await readModel(page);
  notes.pageCount = boot.model?.pageCount ?? null;
  if (!notes.pageCount) fail("boot", "generated deck has no pages", "P0");
  else pass("boot", { pageCount: notes.pageCount, title: boot.model?.title || null });

  // --- 1. rail: every generated page ---
  step = "rail-navigate";
  try {
    const railHidden = await page.locator("#rail").isHidden();
    if (railHidden) await clickUi(page, "#btn-rail");
    const thumbs = page.locator("#rail .thumb");
    const n = await thumbs.count();
    if (n !== notes.pageCount) {
      fail(step, `rail thumbs ${n} !== pageCount ${notes.pageCount}`, "P1");
    }
    for (let i = 0; i < n; i++) {
      await thumbs.nth(i).scrollIntoViewIfNeeded();
      const box = await thumbs.nth(i).boundingBox();
      if (!box) throw new Error(`thumb ${i} has no box`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `page-${String(i + 1).padStart(2, "0")}.png`) });
    }
    pass(step, { thumbs: n });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-rail.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }

  // Work on the last generated page so inserts do not cover the cover.
  step = "goto-last";
  try {
    const thumbs = page.locator("#rail .thumb");
    const n = await thumbs.count();
    await thumbs.nth(n - 1).scrollIntoViewIfNeeded();
    const box = await thumbs.nth(n - 1).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    pass(step);
  } catch (err) {
    fail(step, err.message, "P1");
  }

  // --- 2. edit existing generated text + persist + undo ---
  step = "edit-generated-text";
  let editedId = null;
  let originalText = "";
  try {
    const model = await readModel(page);
    const textEl = (model.model?.elements || []).find((e) => e.type === "text" && String(e.text || "").trim());
    if (!textEl) throw new Error("no generated text on last page");
    editedId = textEl.id;
    originalText = String(textEl.text || "");
    await dblclickEl(page, editedId);
    await page.waitForFunction(
      () => Boolean(document.activeElement?.isContentEditable && document.activeElement.closest?.("#slide")),
      null,
      { timeout: 6000 },
    );
    await page.screenshot({ path: path.join(OUT, "edit-active.png") });
    await typeInto(page, "·测");
    await clickSlide(page, 20, 20);
    await page.waitForFunction(() => !document.querySelector("#slide .el.is-editing"), null, { timeout: 5000 });
    const after = await readModel(page);
    const now = (after.model?.elements || []).find((e) => e.id === editedId);
    if (!String(now?.text || "").includes("·测")) {
      throw new Error(`edit did not land: ${JSON.stringify(now?.text)}`);
    }
    // Undo before reload — persist/reload wipes the in-memory undo stack.
    await shortcut(page, "Control+z");
    await page.waitForTimeout(300);
    const undone = await readModel(page);
    const u = (undone.model?.elements || []).find((e) => e.id === editedId);
    const undoneOk = String(u?.text || "") === originalText || !String(u?.text || "").includes("·测");
    if (!undoneOk) fail("undo", `text still ${JSON.stringify(u?.text)}`, "P1");
    else pass("undo");
    await dblclickEl(page, editedId);
    await page.waitForFunction(
      () => Boolean(document.activeElement?.isContentEditable && document.activeElement.closest?.("#slide")),
      null,
      { timeout: 6000 },
    );
    await typeInto(page, "·测");
    await clickSlide(page, 20, 20);
    await page.waitForFunction(() => !document.querySelector("#slide .el.is-editing"), null, { timeout: 5000 });
    await assertPersisted(page, async () => {
      const thumbs = page.locator("#rail .thumb");
      const n = await thumbs.count();
      await thumbs.nth(n - 1).scrollIntoViewIfNeeded();
      const box = await thumbs.nth(n - 1).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(250);
      const again = await readModel(page);
      const el = (again.model?.elements || []).find((e) => e.id === editedId);
      if (!String(el?.text || "").includes("·测")) throw new Error("edit lost after reload");
    });
    pass(step, { id: editedId });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-edit-text.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }

  // --- 3. shape insert + drag + fill ---
  step = "insert-shape";
  let shape = null;
  try {
    await clickUi(page, '[data-control="insert.shape"]');
    await page.waitForSelector("#shape-palette:not([hidden]) #shape-grid .shape-cell", { timeout: 8000 });
    await clickUi(page, "#shape-grid .shape-cell");
    await waitSelectedType(page, "shape");
    shape = lastOfType(await readModel(page), "shape");
    if (!shape) throw new Error("inserted shape missing");
    let sawGuide = false;
    await dragEl(page, shape.id, 80, 40, {
      onMid: async () => {
        sawGuide = (await page.locator("#slide .guide-line").count()) > 0;
        await page.screenshot({ path: path.join(OUT, "shape-drag-mid.png") });
      },
    });
    if (!sawGuide) fail(`${step}-guide`, ".guide-line did not appear mid-drag", "P2");
    await clickEl(page, shape.id);
    await page.waitForSelector("#ctx-bar:not([hidden]) #pop-fill", { timeout: 5000 });
    await clickUi(page, "#pop-fill > button");
    await page.waitForSelector("#ctx-fill-color", { timeout: 4000 });
    await pickColor(page, "#ctx-fill-color", "#10B981");
    await page.waitForTimeout(300);
    const filled = (await readModel(page)).model?.elements?.find((e) => e.id === shape.id);
    if (!hexEq(filled?.fillCss, "#10B981")) {
      throw new Error(`fill expected #10B981 got ${filled?.fillCss}`);
    }
    pass(step, { id: shape.id });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-shape.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }

  // --- 4. table ---
  step = "insert-table";
  try {
    await clickUi(page, '[data-control="insert.table"]');
    await pickTableSize(page, 2, 2);
    await waitSelectedType(page, "table");
    const table = lastOfType(await readModel(page), "table");
    if (!table) throw new Error("inserted table missing");
    await dblclickCell(page, table.id, 0, 0);
    await page.waitForFunction(
      () => Boolean(document.activeElement?.isContentEditable && document.activeElement.closest?.("td")),
      null,
      { timeout: 4000 },
    );
    await shortcut(page, "Control+a");
    await typeInto(page, "指标");
    await clickSlide(page, 20, 20);
    await page.waitForTimeout(300);
    const rows = (await readModel(page)).model?.elements?.find((e) => e.id === table.id)?.tableRows || [];
    if (!String(rows[0]?.[0]?.text || "").includes("指标")) {
      throw new Error(`cell(0,0) ${JSON.stringify(rows[0]?.[0]?.text)}`);
    }
    pass(step, { id: table.id });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-table.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }

  // --- 5. chart ---
  step = "insert-chart";
  try {
    await clickUi(page, '[data-control="insert.chart"]');
    await waitSelectedType(page, "chart");
    await page.waitForSelector('#ctx-bar [data-control="element.chart.data.set"]', { timeout: 8000 });
    await clickUi(page, '#ctx-bar [data-control="element.chart.data.set"]');
    await page.waitForSelector("#chart-overlay:not([hidden])", { timeout: 5000 });
    await page.screenshot({ path: path.join(OUT, "chart-overlay.png") });
    const seriesHeader = page.locator("#chart-grid th.s1 input").first();
    await seriesHeader.waitFor({ timeout: 4000 });
    const hb = await seriesHeader.boundingBox();
    await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await shortcut(page, "Control+a");
    await typeInto(page, "营收");
    const valueCell = page.locator("#chart-grid tr:not(.add-row) td input").nth(1);
    const vb = await valueCell.boundingBox();
    const svgBefore = await page.evaluate(() => document.querySelector("#slide .el.chart svg")?.innerHTML || "");
    await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
    await shortcut(page, "Control+a");
    await typeInto(page, "12");
    await page.waitForFunction(
      (prev) => {
        const html = document.querySelector("#slide .el.chart svg")?.innerHTML || "";
        return html && html !== prev;
      },
      svgBefore,
      { timeout: 5000 },
    );
    await clickSlide(page, 20, 500);
    const chart = lastOfType(await readModel(page), "chart");
    await clickEl(page, chart.id);
    await page.waitForSelector("#ctx-bar:not([hidden]) #pop-chart-type", { timeout: 5000 });
    await clickUi(page, "#pop-chart-type > button");
    await clickUi(page, "#pop-chart-type .ctx-btn", { text: "折线" });
    await page.waitForTimeout(300);
    const chart2 = (await readModel(page)).model?.elements?.find((e) => e.id === chart.id);
    if (chart2?.chartType !== "line") throw new Error(`chartType ${chart2?.chartType}`);
    pass(step, { id: chart.id });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-chart.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }

  // --- 6. image ---
  step = "insert-image";
  try {
    const imgPath = path.join(OUT, "insert.png");
    fs.writeFileSync(imgPath, PNG_1x1);
    await chooseImageFile(page, imgPath);
    await waitSelectedType(page, "image");
    const image = lastOfType(await readModel(page), "image");
    if (!image) throw new Error("inserted image missing");
    pass(step, { id: image.id });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-image.png") }).catch(() => {});
    fail(step, err.message, "P1");
  }

  // --- 7. SmartArt ---
  step = "insert-smartart";
  try {
    await clickUi(page, "#btn-more");
    await page.waitForSelector("#more-menu:not([hidden])", { timeout: 4000 });
    await clickUi(page, '#more-menu [data-control="insert.smartart"]');
    await page.waitForSelector("#smartart-palette:not([hidden])", { timeout: 5000 });
    await clickUi(page, "#smartart-palette button[data-layout=process]");
    await page.waitForTimeout(400);
    const model = await readModel(page);
    const art = (model.model?.elements || []).find((e) => e.type === "smartart" || e.smartArt);
    if (!art) throw new Error("smartart missing from model");
    pass(step, { id: art.id });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-smartart.png") }).catch(() => {});
    fail(step, err.message, "P1");
  }

  // --- 8. zoom ---
  step = "zoom";
  try {
    const before = await page.locator("#zoom-label").innerText();
    await clickUi(page, "#btn-zoom-in");
    await page.waitForTimeout(200);
    const mid = await page.locator("#zoom-label").innerText();
    await page.screenshot({ path: path.join(OUT, "zoom-in.png") });
    await clickUi(page, "#btn-zoom-out");
    await clickUi(page, "#zoom-label");
    const after = await page.locator("#zoom-label").innerText();
    if (mid === before) fail(step, `zoom label stuck at ${before}`, "P1");
    else pass(step, { before, mid, after });
  } catch (err) {
    fail(step, err.message, "P1");
  }

  // --- 9. play ---
  step = "play";
  try {
    await clickUi(page, "#btn-play");
    await page.waitForSelector("#present:not([hidden])", { timeout: 4000 });
    const pillHidden = await page.locator("#insert-toolbar").isHidden();
    await page.screenshot({ path: path.join(OUT, "present.png") });
    if (!pillHidden) throw new Error("insert pill still visible in present");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("present")?.hidden, null, { timeout: 4000 });
    pass(step);
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-play.png") }).catch(() => {});
    fail(step, err.message, "P1");
  }

  // --- 9b. comment pin on generated shape or last selected ---
  step = "comment";
  try {
    await clickUi(page, "#btn-mode-comment");
    await page.waitForSelector("#comment-layer:not([hidden]) .comment-catcher", { timeout: 4000 });
    const catcher = page.locator("#comment-layer .comment-catcher");
    const cb = await catcher.boundingBox();
    if (!cb) throw new Error("comment catcher has no box");
    await page.mouse.click(cb.x + cb.width / 2, cb.y + Math.min(80, cb.height / 3));
    await page.waitForSelector(".pin-card textarea", { timeout: 4000 });
    await page.screenshot({ path: path.join(OUT, "comment-pin.png") });
    const ta = page.locator(".pin-card textarea");
    const tb = await ta.boundingBox();
    await page.mouse.click(tb.x + tb.width / 2, tb.y + 12);
    await typeInto(page, "生成页批注测试");
    await clickUi(page, ".pin-card [data-act=save]");
    await page.waitForTimeout(200);
    const railText = await page.locator("#comment-rail").innerText().catch(() => "");
    if (!railText.includes("批注")) throw new Error(`rail ${JSON.stringify(railText)}`);
    await clickUi(page, "#btn-mode-edit");
    await page.waitForFunction(() => document.getElementById("comment-layer")?.hidden, null, { timeout: 4000 });
    pass(step);
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-comment.png") }).catch(() => {});
    fail(step, err.message, "P1");
    await clickUi(page, "#btn-mode-edit").catch(() => {});
  }

  // --- 9c. version snapshot ---
  step = "version";
  try {
    await clickUi(page, "#btn-versions");
    await page.waitForSelector("#version-menu:not([hidden])", { timeout: 4000 });
    await clickUi(page, "#version-save");
    await page.waitForTimeout(400);
    const versions = await page.evaluate(async () => {
      const r = await fetch("/api/versions");
      const d = await r.json();
      return (d.versions || []).length;
    });
    await page.screenshot({ path: path.join(OUT, "versions.png") });
    if (versions < 1) throw new Error("no versions after save");
    pass(step, { versions });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-version.png") }).catch(() => {});
    fail(step, err.message, "P1");
  }

  // --- 10. export PPTX ---
  step = "export-pptx";
  try {
    await clickUi(page, "#btn-export");
    await page.waitForSelector("#export-dialog[open]", { timeout: 4000 });
    await clickUi(page, "#export-pptx");
    await page.waitForSelector("#export-result:not([hidden])", { timeout: 30000 });
    const resultText = await page.locator("#export-result").innerText();
    await page.screenshot({ path: path.join(OUT, "export.png") });
    notes.exported = resultText.slice(0, 400);
    if (!resultText.includes("页")) throw new Error(`missing 页: ${resultText}`);
    if (!/\d+(?:\.\d+)?\s*(KB|MB)/.test(resultText)) throw new Error(`missing size: ${resultText}`);
    pass(step);
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "fail-export.png") }).catch(() => {});
    fail(step, err.message, "P0");
  }
} catch (err) {
  await page.screenshot({ path: path.join(OUT, `fail-${step}.png`) }).catch(() => {});
  fail(step, err.message, "P0");
} finally {
  const video = page.video();
  await page.close().catch(() => {});
  if (video) {
    const raw = await video.path().catch(() => "");
    if (raw && fs.existsSync(raw)) {
      const dest = path.join(OUT, "generated-editor.webm");
      try {
        fs.renameSync(raw, dest);
      } catch {
        fs.copyFileSync(raw, dest);
      }
    }
  }
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  notes.finishedAt = new Date().toISOString();
  notes.ok = notes.failures.filter((f) => f.severity === "P0").length === 0;
  fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  try {
    fs.mkdirSync(ART, { recursive: true });
    fs.cpSync(OUT, ART, { recursive: true });
  } catch (err) {
    notes.errors = notes.errors || [];
    notes.errors.push(`copy artifacts: ${err.message}`);
  }
  console.log(JSON.stringify({ ok: notes.ok, failures: notes.failures, out: OUT, art: ART }, null, 2));
}

process.exit(notes.failures.some((f) => f.severity === "P0") ? 1 : 0);
