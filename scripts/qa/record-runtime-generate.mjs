#!/usr/bin/env node
/**
 * Headed Hub → agent runtime generate → editor walk.
 * Writes screenshots + notes. Does not print secrets.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { restartNativeWebServer } from "./gestures.mjs";
import { requireExternalModelConsent } from "./external-model-consent.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "介绍一下勾股定理，面向小学生";
const OUT = process.env.QA_OUT || "/opt/cursor/artifacts/compose-body-after";
const VIDEO_DIR = path.join(OUT, "playwright-video");
const modelConsent = requireExternalModelConsent({
  script: "record-runtime-generate",
  brief: BRIEF,
});

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  brief: BRIEF,
  startedAt: new Date().toISOString(),
  healthBefore: null,
  toolLabels: [],
  waitingSeen: false,
  paused: false,
  retried: false,
  composeSource: null,
  fallbackReason: null,
  projectPath: null,
  pages: [],
  editor: {},
  errors: [],
  modelConsent,
};

function shot(page, name) {
  const dest = path.join(OUT, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: false }).then(() => dest);
}

async function snapshotTools(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#tool-card .tool-row")].map((r) => ({
      label: r.querySelector(".tool-main span")?.textContent?.trim() || "",
      summary: r.querySelector("small")?.textContent?.trim() || "",
      running: r.classList.contains("is-running"),
      detail: (r.querySelector(".tool-detail")?.textContent || "").slice(0, 240),
    })),
  );
}

async function waitGenerate(page, ms) {
  const deadline = Date.now() + ms;
  let lastShot = 0;
  let n = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const complete = document.getElementById("agent-complete");
      return {
        result: Boolean(document.getElementById("btn-open-result")),
        retry: Boolean(document.getElementById("btn-retry-now")),
        later: Boolean(document.getElementById("btn-retry-later")),
        waiting: Boolean(document.querySelector("[data-wait-row]")),
        say: complete?.innerText?.slice(0, 400) || "",
        rows: document.querySelectorAll("#tool-card .tool-row").length,
      };
    });
    notes.toolLabels = (await snapshotTools(page)).map((t) => t.label);
    if (state.waiting) notes.waitingSeen = true;
    if (Date.now() - lastShot > 12000) {
      lastShot = Date.now();
      n += 1;
      await shot(page, `gen-${String(n).padStart(2, "0")}`);
    }
    if (state.result) return { kind: "done", ...state };
    if (state.retry) return { kind: "paused", ...state };
    if (/生成未|出错|failed|Error/i.test(state.say) && state.rows > 0 && !state.result) {
      const stillRunning = await page.evaluate(() =>
        Boolean(document.querySelector("#tool-card .tool-row.is-running, [data-wait-row]")),
      );
      if (!stillRunning && state.say && !state.retry) return { kind: "error", ...state };
    }
    await page.waitForTimeout(1500);
  }
  return { kind: "timeout" };
}

await restartNativeWebServer();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
const authSnapshot = await fetch(`${BASE}/api/pi/auth`).then((r) => r.json());
const provider =
  process.env.QA_PI_PROVIDER ||
  authSnapshot.auth?.provider ||
  authSnapshot.stored?.[0]?.providerId ||
  "";
notes.provider = provider;
notes.healthBefore = {
  agentRuntime: health.agentRuntime,
  kimiRuntime: health.kimiRuntime,
  piAvailable: health.piAvailable,
};
if (!health.piAvailable) {
  notes.errors.push(`Pi unavailable: ${health.piNote || "unknown"}`);
}
if (!provider || !authSnapshot.stored?.some((row) => row.providerId === provider)) {
  notes.errors.push(`selected supplier is not logged in: ${provider || "(none)"}`);
}

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-position=40,40", "--window-size=1440,900"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (err) => notes.errors.push(`pageerror: ${err.message}`));

try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => sessionStorage.removeItem("oss.generate.resume"));
  await page.waitForSelector("#brief");
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  if (!provider || !authSnapshot.stored?.some((row) => row.providerId === provider)) {
    throw new Error(`selected supplier is not logged in: ${provider || "(none)"}`);
  }
  await page.selectOption("#pi-provider", provider);
  if (process.env.QA_PI_MODEL) await page.fill("#pi-model", process.env.QA_PI_MODEL);
  await page.click("#btn-model");
  await shot(page, "01-hub");
  await page.fill("#brief", BRIEF);
  await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
  await page.waitForTimeout(400);
  await page.click("#btn-send");
  await page.waitForSelector("#agent-screen:not([hidden])", { timeout: 15000 });
  await page.waitForSelector("#tool-card .tool-row", { timeout: 45000 });
  await shot(page, "02-first-tools");

  let outcome = await waitGenerate(page, 9 * 60 * 1000);
  notes.paused = outcome.kind === "paused";
  if (outcome.kind === "paused") {
    await shot(page, "03-paused");
    notes.retried = true;
    await page.click("#btn-retry-now");
    outcome = await waitGenerate(page, 8 * 60 * 1000);
  }
  notes.generateOutcome = outcome.kind;
  notes.generateSay = outcome.say || "";
  notes.toolRows = await snapshotTools(page);
  await shot(page, "04-generate-end");

  if (outcome.kind !== "done") {
    notes.errors.push(`generate did not finish: ${outcome.kind}`);
    const healthAfter = await fetch(`${BASE}/api/health`).then((r) => r.json());
    notes.projectPath = healthAfter.project;
    notes.composeSource = "unfinished";
  } else {
    const say = await page.locator("#agent-complete .agent-say").innerText().catch(() => "");
    notes.generateSay = say;
    const m = say.match(/·\s*(agent|playbook|paused|llm|mock)/i);
    notes.composeSource = m ? m[1].toLowerCase() : null;
    await page.click("#btn-open-result");
    await page.waitForSelector("#slide", { timeout: 20000 });
    await page.waitForFunction(
      () => (document.getElementById("doc-title")?.textContent || "") !== "未加载",
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(800);
    const model = await fetch(`${BASE}/api/model`).then((r) => r.json());
    notes.projectPath = (await fetch(`${BASE}/api/health`).then((r) => r.json())).project;
    notes.editor.title = model.model?.title;
    notes.editor.pageCount = model.model?.pageCount;
    notes.editor.size = model.model?.size;
    notes.editor.railHidden = await page.evaluate(() => Boolean(document.getElementById("rail")?.hidden));
    notes.editor.thumbCount = await page.locator("#rail .thumb").count();

    const thumbs = model.thumbs || [];
    for (let i = 0; i < (model.model?.pageCount || 0); i++) {
      const thumb = page.locator("#rail .thumb").nth(i);
      if (await thumb.count()) {
        await thumb.click();
        await page.waitForTimeout(500);
      }
      const live = await fetch(`${BASE}/api/model`).then((r) => r.json());
      const pageModel = live.model || {};
      const els = pageModel.elements || [];
      const titleEl = els.find((e) => e.id === "title" || (e.type === "text" && e.bold));
      const texts = els
        .filter((e) => e.type === "text" && String(e.text || "").trim())
        .map((e) => String(e.text).trim());
      const bodyTexts = texts.filter((t) => t !== (titleEl?.text || "").trim() && !/^\d{1,2}$/.test(t));
      const rec = {
        index: i,
        type: pageModel.pageType,
        title: titleEl?.text || thumbs[i]?.title || "",
        elementCount: els.length,
        types: els.map((e) => e.type),
        texts,
        bodyTexts,
        bodyChars: bodyTexts.join("").length,
        thumbTitle: thumbs[i]?.title || "",
      };
      notes.pages.push(rec);
      await shot(page, `page-${String(i + 1).padStart(2, "0")}`);
    }

    // Cover title edit
    if (notes.editor.thumbCount > 0) {
      await page.locator("#rail .thumb").nth(0).click();
      await page.waitForTimeout(400);
    }
    const titleBox = page.locator('#slide .el[data-id="title"]').first();
    if (await titleBox.count()) {
      await titleBox.dblclick();
      const editing = await page
        .waitForSelector("#slide .el.is-editing, [contenteditable=true]", { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      notes.editor.titleEditEntered = editing;
      await shot(page, "05-title-edit");
      if (editing) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    } else {
      notes.editor.titleEditEntered = false;
      notes.errors.push("cover has no #title element");
    }

    // Present chrome
    const presentBtn = page.locator("#btn-present, [data-control*='present']").first();
    if (await presentBtn.count()) {
      await presentBtn.click();
      await page.waitForTimeout(600);
      notes.editor.presentOpen = await page.evaluate(() =>
        Boolean(document.body.classList.contains("is-presenting") || document.getElementById("present-layer")),
      );
      await shot(page, "06-present");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    notes.editor.afterWalk = {
      railHidden: await page.evaluate(() => Boolean(document.getElementById("rail")?.hidden)),
      thumbs: await page.locator("#rail .thumb").count(),
    };
    await shot(page, "07-editor-end");
  }

  if (notes.projectPath && fs.existsSync(notes.projectPath)) {
    const reasonFile = path.join(notes.projectPath, "generate-reason.json");
    const cpFile = path.join(notes.projectPath, "generate-checkpoint.json");
    if (fs.existsSync(reasonFile)) {
      notes.reason = JSON.parse(fs.readFileSync(reasonFile, "utf8"));
    }
    notes.hasCheckpoint = fs.existsSync(cpFile);
    const deck = path.join(notes.projectPath, "deck.pptd");
    if (fs.existsSync(deck)) notes.deckPptd = fs.readFileSync(deck, "utf8").slice(0, 1200);
    const pagesDir = path.join(notes.projectPath, "pages");
    if (fs.existsSync(pagesDir)) {
      notes.diskBodies = fs.readdirSync(pagesDir).filter((n) => n.endsWith(".page")).sort().map((name) => {
        const raw = fs.readFileSync(path.join(pagesDir, name), "utf8");
        const texts = [...raw.matchAll(/text:\s*(.+)/g)].map((m) => String(m[1]).replace(/^["']|["']$/g, "").trim()).filter(Boolean);
        return { file: name, texts, chars: texts.join("").length };
      });
    }
    const empty = (notes.pages || []).filter((p, i) => i > 0 && (p.bodyChars || 0) < 24);
    if (empty.length) {
      notes.errors.push(`title-only pages remain: ${empty.map((p) => p.index + 1).join(",")}`);
    }
  }
} catch (e) {
  notes.errors.push(e instanceof Error ? e.message : String(e));
  await shot(page, "99-crash").catch(() => {});
} finally {
  notes.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const vpath = await video.path();
    const dest = path.join(OUT, "playwright.webm");
    try {
      fs.copyFileSync(vpath, dest);
      notes.playwrightVideo = dest;
    } catch {
      notes.playwrightVideo = vpath;
    }
    fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    outcome: notes.generateOutcome,
    composeSource: notes.composeSource,
    tools: notes.toolLabels,
    pages: notes.editor.pageCount,
    title: notes.editor.title,
    errors: notes.errors,
    out: OUT,
  }, null, 2));
}
