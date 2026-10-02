#!/usr/bin/env node
/**
 * Click-through QA for generate → editor.
 * Covers Cola's four bugs plus the leftover generate-after path
 * (workspace Think/Plan, every page, edit, present, comment, insert, versions).
 *
 *   node scripts/verify-generate-qa.mjs
 */
import { execFileSync } from "node:child_process";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPersisted,
  clickCell,
  clickEl,
  clickSlide,
  clickUi,
  dblclickEl,
  readModel,
  restartNativeWebServer,
  shortcut,
  typeInto,
  waitHealth,
} from "./qa/gestures.mjs";
import { requireExternalModelConsent } from "./qa/external-model-consent.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "介绍一下勾股定理，面向小学生";
const OUT_DIR = path.resolve(ROOT, "output/verify-generate-qa");
requireExternalModelConsent({ script: "verify-generate-qa", brief: BRIEF });

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function clickToggle(page, row, label) {
  const before = await row.evaluate((el) => el.classList.contains("is-open"));
  await row.click();
  await page.waitForFunction(
    ([sel, text, was]) => {
      const el = [...document.querySelectorAll(sel)].find((r) => r.innerText.includes(text));
      return Boolean(el && el.classList.contains("is-open") !== was);
    },
    ["#tool-card .tool-row, #work-thread .tool-row", label, before],
    { timeout: 4000 },
  );
  const after = await row.evaluate((el) => ({
    open: el.classList.contains("is-open"),
    detailVisible: getComputedStyle(el.querySelector(".tool-detail") || document.body).display !== "none",
  }));
  if (after.open === before) fail(`${label} click did not toggle open`);
  if (after.open && !after.detailVisible) fail(`${label} open but detail still display:none`);
  return after.open;
}

async function readStep(page, rootSel, re) {
  return page.evaluate(
    ([sel, source]) => {
      const rows = [...document.querySelectorAll(sel)];
      const row = rows.find((r) => new RegExp(source).test(r.innerText));
      if (!row) return null;
      const detail = row.querySelector(".tool-detail");
      return {
        text: row.innerText.replace(/\s+/g, " ").trim(),
        summary: row.querySelector("small")?.textContent?.trim() || "",
        hasDetail: Boolean(detail),
        detail: detail?.textContent || "",
        expandable: row.classList.contains("is-expandable"),
      };
    },
    [rootSel, re.source],
  );
}

async function goToThumb(page, index) {
  await page.locator("#rail .thumb").nth(index).click();
  await page.waitForFunction(
    (i) => document.querySelectorAll("#rail .thumb")[i]?.classList.contains("active"),
    index,
    { timeout: 8000 },
  );
}

async function assertRailOpen(page, where) {
  const state = await page.evaluate(() => {
    const rail = document.getElementById("rail");
    return {
      hidden: Boolean(rail?.hidden),
      display: rail ? getComputedStyle(rail).display : "missing",
      thumbs: rail?.querySelectorAll(".thumb").length ?? 0,
    };
  });
  if (state.hidden || state.display === "none") {
    fail(`left rail hidden ${where}: ${JSON.stringify(state)}`);
  }
  if (state.thumbs < 2) fail(`rail emptied ${where}: ${JSON.stringify(state)}`);
  return state;
}

async function closeExportDialog(page) {
  const open = await page.evaluate(() => {
    const dlg = document.getElementById("export-dialog");
    return Boolean(dlg && dlg instanceof HTMLDialogElement && dlg.open);
  });
  if (!open) return;
  await page.locator("#export-dialog menu button[value=cancel]").click();
  await page.waitForFunction(() => {
    const dlg = document.getElementById("export-dialog");
    return !(dlg instanceof HTMLDialogElement && dlg.open);
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });

if (!process.env.SKIP_RESTART) {
  await restartNativeWebServer();
} else {
  await waitHealth();
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));

try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("oss.llm"));
  await page.waitForSelector("#brief");
  await page.fill("#brief", BRIEF);
  await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
  await page.click("#btn-send");
  await page.waitForSelector("#agent-screen:not([hidden])", { timeout: 15000 });
  await page.waitForSelector("#tool-card .tool-row", { timeout: 30000 });
  pass("hub send → agent screen + tool rows");

  const thinkLen1 = await page.waitForFunction(
    () => {
      const row = [...document.querySelectorAll("#tool-card .tool-row")].find((r) => /Think/i.test(r.innerText));
      const n = row?.querySelector(".tool-detail")?.textContent?.length || 0;
      const streaming = Boolean(row?.classList.contains("is-streaming") || row?.classList.contains("is-running"));
      return n > 4 && streaming ? n : false;
    },
    null,
    { timeout: 20000 },
  );
  const n1 = await thinkLen1.jsonValue();
  await page.waitForFunction(
    (prev) => {
      const row = [...document.querySelectorAll("#tool-card .tool-row")].find((r) => /Think/i.test(r.innerText));
      return (row?.querySelector(".tool-detail")?.textContent?.length || 0) > prev;
    },
    n1,
    { timeout: 8000 },
  );
  pass(`Think body streamed while running (grew past ${n1} chars)`);

  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll("#tool-card .tool-row")];
      const think = rows.find((r) => /Think/i.test(r.innerText));
      const plan = rows.find((r) => /Plan/i.test(r.innerText));
      return Boolean(think && plan && !think.classList.contains("is-running") && !plan.classList.contains("is-running"));
    },
    null,
    { timeout: 60000 },
  );

  const stepState = {
    think: await readStep(page, "#tool-card .tool-row", /Think/i),
    plan: await readStep(page, "#tool-card .tool-row", /Plan/i),
  };
  if (!stepState.think) fail("Think row missing");
  if (!stepState.plan) fail("Plan row missing");
  if (stepState.think.summary === "ok") fail(`Think still fake ok: ${stepState.think.text}`);
  if (stepState.plan.summary === "ok") fail(`Plan still fake ok: ${stepState.plan.text}`);
  if (!stepState.think.hasDetail || stepState.think.detail.length < 20) {
    fail(`Think has no readable body: ${JSON.stringify(stepState.think)}`);
  }
  if (!stepState.plan.hasDetail || !/cover|content|页/.test(stepState.plan.detail)) {
    fail(`Plan has no page outline: ${JSON.stringify(stepState.plan)}`);
  }
  if (/下周动作|四个支撑面|证据位：待补/.test(stepState.plan.detail)) {
    fail(`勾股课堂 still used consulting skeleton: ${stepState.plan.detail.slice(0, 240)}`);
  }
  if (!/课堂|带走|勾股/.test(stepState.plan.detail)) {
    fail(`Plan is not a lesson outline: ${stepState.plan.detail.slice(0, 240)}`);
  }
  pass(`Think summary=${JSON.stringify(stepState.think.summary)} detail=${stepState.think.detail.length} chars`);
  pass(`Plan summary=${JSON.stringify(stepState.plan.summary)} detail=${stepState.plan.detail.length} chars`);

  const thinkRow = page.locator("#tool-card .tool-row", { hasText: "Think" }).first();
  const planRow = page.locator("#tool-card .tool-row", { hasText: "Plan" }).first();
  await clickToggle(page, thinkRow, "Think");
  const thinkOpen = await clickToggle(page, thinkRow, "Think");
  if (!thinkOpen) await thinkRow.click();
  await clickToggle(page, planRow, "Plan");
  const planOpen = await clickToggle(page, planRow, "Plan");
  if (!planOpen) await planRow.click();
  await shot(page, "01-think-plan-open");
  pass("Think / Plan rows toggle and show body text");

  await page.waitForSelector("#btn-open-result", { timeout: 90000 });
  const say = (await page.locator("#agent-complete .agent-say").innerText().catch(() => "")).trim();
  if (!/生成可编辑/.test(say)) fail(`agent closing line missing or not streamed: ${JSON.stringify(say)}`);
  pass(`agent say: ${say.slice(0, 48)}`);
  const fakeOk = await page.evaluate(() =>
    [...document.querySelectorAll("#tool-card .tool-row")]
      .map((r) => ({
        text: r.innerText.replace(/\s+/g, " ").trim(),
        summary: r.querySelector("small")?.textContent?.trim() || "",
      }))
      .filter((r) => r.summary === "ok"),
  );
  if (fakeOk.length) fail(`Hub steps still say ok: ${JSON.stringify(fakeOk)}`);
  pass("Validate / Version / Compose summaries are not fake ok");

  await page.click("#react-up");
  const liked = await page.locator("#react-up").evaluate((el) => el.classList.contains("is-on"));
  if (!liked) fail("Hub 有用 did not toggle");
  await page.click("#react-down");
  const down = await page.evaluate(() => ({
    up: document.getElementById("react-up")?.classList.contains("is-on"),
    down: document.getElementById("react-down")?.classList.contains("is-on"),
  }));
  if (!down.down || down.up) fail(`Hub 无用 did not take over: ${JSON.stringify(down)}`);
  pass("Hub reaction buttons toggle");
  await shot(page, "02-result-card");

  await page.click("#btn-open-result");
  await page.waitForSelector("#slide .el", { timeout: 20000 });
  await page.waitForSelector("#rail .thumb", { timeout: 10000 });
  pass("打开编辑 → slide + rail thumbs");

  await page.waitForSelector("#work-chat:not([hidden])", { timeout: 8000 });
  const workspace = await page.evaluate(() => {
    const thread = document.getElementById("work-thread");
    const rows = [...(thread?.querySelectorAll(".tool-row") || [])];
    const read = (re) => {
      const row = rows.find((r) => re.test(r.innerText));
      if (!row) return null;
      const detail = row.querySelector(".tool-detail");
      return {
        summary: row.querySelector("small")?.textContent?.trim() || "",
        detail: detail?.textContent || "",
        expandable: row.classList.contains("is-expandable"),
      };
    };
    return {
      compact: Boolean(thread?.querySelector(".compact-tools")),
      fakeThink: /思考/.test(thread?.innerText || "") && !/Think|Plan/.test(thread?.innerText || ""),
      brief: thread?.querySelector(".bubble")?.textContent || "",
      think: read(/Think/i),
      plan: read(/Plan/i),
    };
  });
  if (workspace.compact) fail("workspace still has the dead compact-tools 思考 row");
  if (workspace.fakeThink) fail("workspace still shows a dead 思考 chevron");
  if (!workspace.think || workspace.think.summary === "ok" || workspace.think.detail.length < 20) {
    fail(`workspace Think missing after 编辑: ${JSON.stringify(workspace.think)}`);
  }
  if (!workspace.plan || !/cover|content|页/.test(workspace.plan.detail)) {
    fail(`workspace Plan missing after 编辑: ${JSON.stringify(workspace.plan)}`);
  }
  if (workspace.brief && !workspace.brief.includes("勾股")) {
    fail(`workspace brief bubble wrong: ${workspace.brief}`);
  }
  const wsThink = page.locator("#work-thread .tool-row", { hasText: "Think" }).first();
  const wsPlan = page.locator("#work-thread .tool-row", { hasText: "Plan" }).first();
  await clickToggle(page, wsThink, "Think");
  await clickToggle(page, wsThink, "Think");
  await clickToggle(page, wsPlan, "Plan");
  pass("workspace kept expandable Think / Plan (no dead 思考)");

  const railProbe = await page.evaluate(() => {
    const rail = document.getElementById("rail");
    const chip = document.getElementById("comment-rail");
    const thumb = rail?.querySelector(".thumb");
    const chipBox = chip && !chip.hidden ? chip.getBoundingClientRect() : null;
    const thumbBox = thumb?.getBoundingClientRect();
    const overlap =
      chipBox &&
      thumbBox &&
      !(chipBox.right < thumbBox.left || chipBox.left > thumbBox.right || chipBox.bottom < thumbBox.top || chipBox.top > thumbBox.bottom);
    return {
      railHidden: Boolean(rail?.hidden),
      thumbCount: rail?.querySelectorAll(".thumb").length ?? 0,
      chipInsideRail: Boolean(rail && chip && rail.contains(chip)),
      chipHidden: Boolean(chip?.hidden),
      chipText: chip?.textContent || "",
      chipDisplay: chip ? getComputedStyle(chip).display : "missing",
      overlap: Boolean(overlap),
    };
  });
  if (railProbe.railHidden) fail("left rail hidden right after generate");
  if (railProbe.thumbCount < 2) fail(`expected ≥2 thumbs, got ${railProbe.thumbCount}`);
  if (railProbe.chipInsideRail) fail("comment-rail is still a child of #rail");
  if (!railProbe.chipHidden || railProbe.chipDisplay !== "none") {
    fail(`comment chip visible on idle editor: ${JSON.stringify(railProbe)}`);
  }
  if (railProbe.overlap) fail("comment chip overlaps thumb 01");
  const thumb0 = page.locator("#rail .thumb").first();
  await thumb0.screenshot({ path: path.join(OUT_DIR, "thumb-01-crop.png") });
  const thumbPaint = await page.evaluate(() => {
    const thumb = document.querySelector("#rail .thumb");
    const mini = thumb?.querySelector(".thumb-mini");
    const band = mini?.querySelector('.el[data-id="band"]');
    const chip = document.getElementById("comment-rail");
    const thumbBox = thumb.getBoundingClientRect();
    const sampleX = thumbBox.left + 18;
    const sampleY = thumbBox.top + 16;
    const hit = document.elementFromPoint(sampleX, sampleY);
    return {
      band: Boolean(band),
      hitId: hit?.id || hit?.className || "",
      hitInChip: Boolean(chip && hit && chip.contains(hit)),
      leftEls: [...(mini?.querySelectorAll(".el") || [])]
        .filter((el) => parseFloat(el.style.left || "0") < 40)
        .map((el) => el.dataset.id),
    };
  });
  if (!thumbPaint.band) fail("cover thumb 01 missing the left color band");
  if (thumbPaint.hitInChip) fail("elementFromPoint on thumb 01 hit the comment chip");
  if (!thumbPaint.leftEls.includes("band")) fail(`thumb 01 left edge els=${thumbPaint.leftEls}`);
  await shot(page, "03-editor-rail");
  pass("thumb 01 has no white comment chip");

  await goToThumb(page, 1);
  const afterSecond = await assertRailOpen(page, "after page 02");
  await shot(page, "04-after-page-02");
  pass(`page 02 click kept rail open (${afterSecond.thumbs} thumbs)`);

  const pageCount = afterSecond.thumbs;
  let chartPage = -1;
  let tablePage = -1;
  for (let i = 0; i < pageCount; i++) {
    await goToThumb(page, i);
    await assertRailOpen(page, `while walking page ${i + 1}`);
    const kinds = await page.evaluate(() => ({
      chart: Boolean(document.querySelector("#slide .el.chart")),
      table: Boolean(document.querySelector("#slide .el.table, #slide table")),
    }));
    if (kinds.chart && chartPage < 0) chartPage = i;
    if (kinds.table && tablePage < 0) tablePage = i;
  }
  if (chartPage < 0) fail("generated deck has no chart page to compare export");
  pass(`walked ${pageCount} pages; chart=${chartPage + 1} table=${tablePage >= 0 ? tablePage + 1 : "none"}`);

  await goToThumb(page, chartPage);
  const canvasChart = await page.evaluate(() => {
    const svg = document.querySelector("#slide .el.chart svg");
    if (!svg) return null;
    const fills = [...svg.querySelectorAll("rect[fill]")]
      .filter((r) => Number(r.getAttribute("width")) > 8)
      .map((r) => String(r.getAttribute("fill") || "").toUpperCase());
    const labels = [...svg.querySelectorAll("text")].map((t) => t.textContent || "");
    return { fills, labels, html: svg.innerHTML.slice(0, 400) };
  });
  if (!canvasChart?.fills?.length) fail("canvas chart has no bar fills");
  await shot(page, "05-canvas-chart");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    (async () => {
      await page.click("#btn-export");
      await page.waitForSelector("#export-dialog[open], #export-dialog:not([hidden])", { timeout: 5000 }).catch(() => {});
      const dlg = page.locator("#export-dialog");
      if (await dlg.evaluate((el) => el instanceof HTMLDialogElement && !el.open).catch(() => false)) {
        await page.evaluate(() => document.getElementById("export-dialog")?.showModal?.());
      }
      await page.click("#export-pptx");
    })(),
  ]);
  const pptxPath = path.join(OUT_DIR, download.suggestedFilename() || "deck.pptx");
  await download.saveAs(pptxPath);
  await shot(page, "06-export-dialog");
  pass(`downloaded ${path.basename(pptxPath)}`);

  const zipList = execFileSync("unzip", ["-Z", "-1", pptxPath], { encoding: "utf8" });
  const chartName = zipList.split("\n").find((n) => n.startsWith("ppt/charts/chart"));
  if (!chartName) fail("exported pptx has no ppt/charts/chart* part");
  const xml = execFileSync("unzip", ["-p", pptxPath, chartName], { encoding: "utf8" });
  const exportColors = [...xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => `#${m[1].toUpperCase()}`);
  const uniqueExport = [...new Set(exportColors.filter((c) => !["#000000", "#888888", "#FFFFFF"].includes(c)))];
  const canvasUnique = [...new Set(canvasChart.fills.filter((c) => /^#[0-9A-F]{6}$/.test(c)))];
  const missing = canvasUnique.filter((c) => !uniqueExport.includes(c));
  if (missing.length) {
    fail(`export missing canvas bar colors ${missing.join(", ")}; export has ${uniqueExport.join(", ")}`);
  }
  const maxMatch = /<c:max val="([^"]+)"\/>/.exec(xml);
  if (!maxMatch) fail("export chart has no locked <c:max>");
  const exportMax = Number(maxMatch[1]);
  const model = await readModel(page);
  const el = (model.model?.elements || []).find((e) => e.chart);
  const rows = el?.chartData?.rows || [];
  const canvasMax = Math.max(1, ...rows.flatMap((row) => row.slice(1).map((n) => Number(n) || 0)));
  if (exportMax !== canvasMax) {
    fail(`export Y-max ${exportMax} !== canvas data max ${canvasMax}`);
  }
  if (/<c:barDir val="bar"\/>/.test(xml)) fail("export used horizontal barDir=bar; canvas is vertical");
  pass(`export colors ${uniqueExport.join(" ")} Y-max=${exportMax} match canvas`);

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click("#export-png"),
  ]);
  const pngPath = path.join(OUT_DIR, pngDownload.suggestedFilename() || "page.png");
  await pngDownload.saveAs(pngPath);
  if (!fs.existsSync(pngPath) || fs.statSync(pngPath).size < 1000) {
    fail(`PNG export too small or missing: ${pngPath}`);
  }
  pass(`exported PNG ${path.basename(pngPath)} ${fs.statSync(pngPath).size} bytes`);
  await closeExportDialog(page);

  await goToThumb(page, 0);
  const cover = await readModel(page);
  const titleEl =
    (cover.model?.elements || []).find((e) => e.id === "title") ||
    (cover.model?.elements || []).find((e) => e.type === "text" && e.bold);
  if (!titleEl?.id) fail("cover has no title text to edit");
  await dblclickEl(page, titleEl.id);
  await page.waitForSelector(`#slide .el[data-id="${titleEl.id}"].is-editing`, { timeout: 5000 });
  await shortcut(page, "Control+A");
  await typeInto(page, "勾股小课堂");
  await clickUi(page, "#page-count");
  await page.waitForFunction(() => !document.querySelector("#slide .el.is-editing"), null, { timeout: 5000 });
  const afterEdit = await readModel(page);
  const edited = (afterEdit.model?.elements || []).find((e) => e.id === titleEl.id);
  if (!String(edited?.text || "").includes("勾股小课堂")) {
    fail(`title edit did not persist to model: ${edited?.text}`);
  }
  await assertPersisted(page, async (p) => {
    const again = await readModel(p);
    const t = (again.model?.elements || []).find((e) => e.id === titleEl.id);
    if (!String(t?.text || "").includes("勾股小课堂")) {
      fail(`title edit lost after reload: ${t?.text}`);
    }
    const probe = await p.evaluate(() => ({
      thread: document.getElementById("work-thread")?.innerText || "",
      compact: Boolean(document.querySelector(".compact-tools")),
    }));
    if (!/Think/i.test(probe.thread) || !/Plan/i.test(probe.thread)) {
      fail(`Think/Plan vanished after reload: ${probe.thread.slice(0, 200)}`);
    }
    if (probe.compact) fail("compact-tools came back after reload");
  });
  pass("title edit persisted; Think/Plan still in workspace after reload");

  await goToThumb(page, chartPage);
  await page.waitForSelector("#slide .el.chart", { timeout: 5000 });
  await clickEl(page, "chart");
  const chartCtl = "#ctx-bar [data-control='element.chart.data.set']";
  if ((await page.locator(chartCtl).count()) < 1) {
    await page.locator("#slide .el.chart").click();
  }
  await page.waitForSelector(chartCtl, { timeout: 5000 });
  await clickUi(page, chartCtl);
  await page.waitForSelector("#chart-overlay:not([hidden])", { timeout: 5000 });
  pass("chart click opens data overlay");
  await clickSlide(page, 40, 40);
  await page.waitForFunction(() => document.getElementById("chart-overlay")?.hidden, null, { timeout: 4000 });

  if (tablePage >= 0) {
    await goToThumb(page, tablePage);
    const tableId = await page.evaluate(() => document.querySelector("#slide .el.table")?.dataset.id || "tbl");
    await clickCell(page, tableId, 1, 0);
    await page.waitForFunction(
      (id) => document.querySelector(`#slide .el[data-id="${id}"]`)?.classList.contains("selected"),
      tableId,
      { timeout: 5000 },
    );
    pass(`table click selected ${tableId}`);
  }

  await clickUi(page, "#btn-play");
  await page.waitForSelector("#present:not([hidden])", { timeout: 4000 });
  const pillHidden = await page.locator("#insert-toolbar").isHidden();
  if (!pillHidden) fail("bottom toolbar still visible in present mode");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("present")?.hidden, null, { timeout: 4000 });
  if (!(await page.locator("#insert-toolbar").isVisible())) fail("bottom toolbar not visible after Escape");
  pass("present + Esc restores chrome");

  await goToThumb(page, 0);
  await clickEl(page, titleEl.id);
  await clickUi(page, "#btn-mode-comment");
  await page.waitForSelector("#comment-layer:not([hidden])", { timeout: 4000 });
  await clickEl(page, titleEl.id);
  await page.waitForSelector(".pin-card textarea", { timeout: 4000 });
  const ta = page.locator(".pin-card textarea");
  const tb = await ta.boundingBox();
  if (!tb) fail("pin-card textarea has no box");
  await page.mouse.click(tb.x + tb.width / 2, tb.y + 12);
  await typeInto(page, "给小学生看的例子");
  await clickUi(page, ".pin-card [data-act=save]");
  const railText = await page.locator("#comment-rail").innerText();
  if (!railText.includes("1") || !railText.includes("评论")) {
    fail(`comment rail after save: ${JSON.stringify(railText)}`);
  }
  await clickUi(page, "#comment-layer .pin");
  await page.waitForSelector(".pin-card [data-act=del]", { timeout: 4000 });
  await clickUi(page, ".pin-card [data-act=del]");
  const railAfter = await page.evaluate(() => {
    const r = document.getElementById("comment-rail");
    return { hidden: Boolean(r?.hidden), text: r?.textContent || "" };
  });
  if (!railAfter.hidden && railAfter.text.includes("1")) {
    fail(`comment rail still open after resolve: ${JSON.stringify(railAfter)}`);
  }
  await clickUi(page, "#btn-mode-edit");
  await page.waitForFunction(() => document.getElementById("comment-layer")?.hidden, null, { timeout: 4000 });
  pass("comment pin → save → resolve");

  const beforeInsert = await readModel(page);
  const beforeCount = (beforeInsert.model?.elements || []).length;
  await clickUi(page, '[data-insert="shape"]');
  await page.waitForSelector("#shape-palette:not([hidden]) .shape-cell", { timeout: 4000 });
  await clickUi(page, ".shape-cell");
  await page.waitForFunction(
    (n) => document.querySelectorAll("#slide .el").length > n,
    beforeCount,
    { timeout: 8000 },
  );
  const afterInsert = await readModel(page);
  if ((afterInsert.model?.elements || []).length <= beforeCount) {
    fail(`insert shape did not add an element (${beforeCount} → ${(afterInsert.model?.elements || []).length})`);
  }
  await clickUi(page, "#btn-undo");
  await page.waitForFunction(
    (n) => document.querySelectorAll("#slide .el").length <= n,
    beforeCount,
    { timeout: 8000 },
  );
  const afterUndo = await readModel(page);
  if ((afterUndo.model?.elements || []).length !== beforeCount) {
    fail(`undo did not remove inserted shape (${beforeCount} → ${(afterUndo.model?.elements || []).length})`);
  }
  pass("insert shape + undo");

  if (await page.locator("#btn-share, #share-dialog").count()) fail("intranet editor must not offer sharing");
  await clickUi(page, "#btn-more");
  await clickUi(page, "#btn-messages");
  await page.waitForSelector("#messages-pop:not([hidden])", { timeout: 4000 });
  await page.mouse.click(800, 12);
  pass("no share entry; messages chrome opens");

  await clickUi(page, "#btn-versions");
  await page.waitForSelector("#version-menu:not([hidden])", { timeout: 4000 });
  const verText = await page.locator("#versions-list").innerText();
  if (!/V1|最新/.test(verText)) fail(`versions menu empty after generate: ${verText}`);
  await clickUi(page, "#btn-versions");
  pass("versions menu lists generate snapshot");

  await clickUi(page, "#btn-rail");
  await page.waitForFunction(() => document.getElementById("rail")?.hidden, null, { timeout: 4000 });
  const closed = await readModel(page);
  if (closed.model?.pageRailOpen) fail("pageRailOpen still true after hiding the rail");
  await clickUi(page, "#btn-rail");
  await page.waitForFunction(() => !document.getElementById("rail")?.hidden, null, { timeout: 4000 });
  const opened = await readModel(page);
  if (!opened.model?.pageRailOpen) fail("pageRailOpen still false after showing the rail");
  await assertRailOpen(page, "after rail toggle back on");
  pass("rail toggle hides then restores");

  await goToThumb(page, 0);
  await page.fill("#work-brief", "标题改成「课堂小结」");
  await clickUi(page, "#work-form .composer-send");
  await page.waitForSelector("#work-thread .refine-card", { timeout: 15000 });
  const refineRow = await readStep(page, "#work-thread .tool-row", /Refine/i);
  if (!refineRow || refineRow.summary === "ok") fail(`Refine still fake: ${JSON.stringify(refineRow)}`);
  const refined = await readModel(page);
  const refinedTitle = (refined.model?.elements || []).find((e) => e.id === titleEl.id);
  if (!String(refinedTitle?.text || "").includes("课堂小结")) {
    fail(`refine did not change title: ${refinedTitle?.text}`);
  }
  pass("workspace refine changed the cover title");
  await shot(page, "07-after-walk");

  if (pageErrors.length) fail(`page errors during walk: ${pageErrors.join(" | ")}`);
  pass("no pageerror during generate → editor walk");

  console.log(`shot  ${OUT_DIR}`);
  console.log("OK    verify-generate-qa");
} catch (e) {
  try {
    await shot(page, "fail");
  } catch {
    /* page may be gone */
  }
  throw e;
} finally {
  await browser.close();
}
