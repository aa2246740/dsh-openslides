#!/usr/bin/env node
/**
 * Prove a 经营月报 follows fake attachment data — not a stamped 6-page lesson.
 * Screenshots + video. Does not print secrets.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { restartNativeWebServer, openEditor } from "./gestures.mjs";
import { requireExternalModelConsent } from "./external-model-consent.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF =
  "根据附件写华北零售 7 月经营月报。只引用附件里标了虚构演示的数字，不要另编人均或同比。页数跟材料走，不要为了凑 6 页灌水。";
const OUT = process.env.QA_OUT || "/opt/cursor/artifacts/qa-monthly-report";
const VIDEO_DIR = path.join(OUT, "playwright-video");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "demo-ops-monthly");
const ATTACH_FILES = [
  path.join(FIXTURE_DIR, "2026-07-经营月报-虚构演示.md"),
  path.join(FIXTURE_DIR, "2026-07-渠道区域库存-虚构演示.csv"),
];
const modelConsent = requireExternalModelConsent({
  script: "record-monthly-report",
  brief: BRIEF,
  attachments: ATTACH_FILES,
});

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  brief: BRIEF,
  startedAt: new Date().toISOString(),
  intentExpected: "report",
  attachments: ATTACH_FILES.map((p) => path.basename(p)),
  hubChips: [],
  toolLabels: [],
  toolRows: [],
  writeTodoSummary: null,
  pageCount: null,
  composeSource: null,
  quotedDemoNumbers: [],
  inventedRisk: [],
  errors: [],
  modelConsent,
};

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).then(() => name);
}

async function snapshotTools(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#tool-card .tool-row")].map((r) => ({
      label: r.querySelector(".tool-main span")?.textContent?.trim() || "",
      summary: r.querySelector("small")?.textContent?.trim() || "",
      detail: r.querySelector(".tool-detail")?.textContent?.trim()?.slice(0, 800) || "",
    })),
  );
}

async function waitGenerate(page, ms) {
  const deadline = Date.now() + ms;
  let lastShot = 0;
  let n = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      result: Boolean(document.getElementById("btn-open-result")),
      retry: Boolean(document.getElementById("btn-retry-now")),
      say: document.getElementById("agent-complete")?.innerText?.slice(0, 400) || "",
    }));
    notes.toolRows = await snapshotTools(page);
    notes.toolLabels = notes.toolRows.map((t) => t.label);
    const todo = notes.toolRows.find((t) => t.label === "Write Todo");
    if (todo) notes.writeTodoSummary = todo.summary;
    if (Date.now() - lastShot > 14000) {
      lastShot = Date.now();
      n += 1;
      await page.locator("#tool-card .tool-row").last().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, `gen-${String(n).padStart(2, "0")}`);
    }
    if (state.result) return { kind: "done", ...state };
    if (state.retry) return { kind: "paused", ...state };
    await page.waitForTimeout(1500);
  }
  return { kind: "timeout" };
}

const DEMO_MARKERS = ["1840", "92%", "160", "31.2", "620", "540", "214", "虚构演示"];
const FORBIDDEN = ["人均", "NPS", "市场份额", "Gartner"];

await restartNativeWebServer();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
const authSnapshot = await fetch(`${BASE}/api/pi/auth`).then((r) => r.json());
const provider =
  process.env.QA_PI_PROVIDER ||
  authSnapshot.auth?.provider ||
  authSnapshot.stored?.[0]?.providerId ||
  "";
notes.provider = provider;
notes.health = {
  kimiRuntime: health.kimiRuntime,
  piAvailable: health.piAvailable,
};
if (health.kimiRuntime) notes.errors.push("kimiRuntime must be false");
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

try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  if (!provider || !authSnapshot.stored?.some((row) => row.providerId === provider)) {
    throw new Error(`selected supplier is not logged in: ${provider || "(none)"}`);
  }
  await page.selectOption("#pi-provider", provider);
  if (process.env.QA_PI_MODEL) await page.fill("#pi-model", process.env.QA_PI_MODEL);
  await page.click("#btn-model");
  notes.hubChips = await page.evaluate(() =>
    [...document.querySelectorAll("#capability-list li")].map((li) => li.textContent.trim()),
  );
  await page.click("#btn-attach");
  await page.waitForSelector("#attach-modal:not([hidden])");
  await page.setInputFiles("#attach-file", ATTACH_FILES);
  await page.waitForFunction(() => {
    const chips = [...document.querySelectorAll(".reference-chip")];
    return chips.filter((c) => c.classList.contains("is-parsed")).length >= 2;
  }, null, { timeout: 15000 });
  notes.attachChips = await page.evaluate(() =>
    [...document.querySelectorAll("#attach-row .reference-chip, #attach-modal-list .reference-chip")].map((c) => ({
      name: c.querySelector("b")?.textContent?.trim() || "",
      status: c.className,
      text: c.innerText.slice(0, 160),
    })),
  );
  await shot(page, "01-hub-attachments");
  await page.click("#btn-attach-close");

  if (!health.piAvailable) {
    notes.errors.push("Pi unavailable — cannot live-generate 月报");
  } else {
    await page.fill("#brief", BRIEF);
    await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
    await shot(page, "02-hub-ready");
    await page.click("#btn-send");
    await page.waitForSelector("#agent-screen:not([hidden])");
    const outcome = await waitGenerate(page, 8 * 60 * 1000);
    notes.generateOutcome = outcome.kind;
    notes.generateSay = outcome.say || "";
    await page.locator("#tool-card .tool-row").last().scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "03-generate-end");
    if (outcome.kind !== "done") {
      notes.errors.push(`generate did not finish: ${outcome.kind}`);
    } else {
      const say = await page.locator("#agent-complete .agent-say").innerText().catch(() => "");
      notes.composeSource = (say.match(/·\s*(agent|playbook|pi-rpc|paused|llm)/i) || [])[1] || null;
      await page.click("#btn-open-result");
      await page.waitForSelector("#slide .el", { timeout: 20000 });
      const model = await fetch(`${BASE}/api/model`).then((r) => r.json());
      notes.projectPath = (await fetch(`${BASE}/api/health`).then((r) => r.json())).project;
      notes.pageCount = model.model?.pageCount ?? null;
      notes.pageTitles = [];
      for (let i = 0; i < (model.model?.pageCount || 0); i++) {
        const thumb = page.locator("#rail .thumb").nth(i);
        if (await thumb.count()) await thumb.click();
        await page.waitForTimeout(400);
        await page.locator("#slide").screenshot({
          path: path.join(OUT, `editor-slide-${String(i + 1).padStart(2, "0")}.png`),
        });
        const copy = await page.locator("#slide").innerText();
        notes.pageTitles.push((copy.split("\n").find((l) => l.trim()) || "").slice(0, 80));
        notes.pages = notes.pages || [];
        notes.pages.push({ index: i, elements: await page.locator("#slide .el").count(), copy: copy.slice(0, 400) });
      }
      const allCopy = (notes.pages || []).map((p) => p.copy).join("\n");
      notes.quotedDemoNumbers = DEMO_MARKERS.filter((m) => allCopy.includes(m));
      notes.inventedRisk = FORBIDDEN.filter((m) => allCopy.includes(m));
      const titles = (notes.pageTitles || []).join(" ");
      if (/今天要搞懂|带走什么|课堂例子|勾股/.test(titles)) {
        notes.errors.push(`lesson-path titles on a 月报: ${titles}`);
      }
      if (notes.pageCount === 6) {
        notes.stampRisk = "still 6 pages after removing the 5–8 lesson mandate — model chose 6; attachment had 8+ exhibits";
      }
      if (notes.quotedDemoNumbers.length < 3) {
        notes.errors.push(`few attachment numbers on slides: ${notes.quotedDemoNumbers.join(",")}`);
      }
      await shot(page, "04-editor");
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
    const dest = path.join(OUT, "monthly-report.webm");
    try {
      fs.copyFileSync(vpath, dest);
      notes.video = dest;
    } catch {
      notes.video = vpath;
    }
    fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  }
  console.log(
    JSON.stringify(
      {
        errors: notes.errors,
        composeSource: notes.composeSource,
        pageCount: notes.pageCount,
        stampRisk: notes.stampRisk || null,
        writeTodoSummary: notes.writeTodoSummary,
        quotedDemoNumbers: notes.quotedDemoNumbers,
        inventedRisk: notes.inventedRisk,
        out: OUT,
      },
      null,
      2,
    ),
  );
  if (notes.errors.length) process.exitCode = 1;
}
