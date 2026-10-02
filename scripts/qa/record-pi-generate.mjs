#!/usr/bin/env node
/**
 * Live Hub generate with the Pi chip selected. Does not claim usedPi
 * unless composeSource is pi-rpc and _agent/pi-trace.json says so.
 * Does not print secrets. Does not call cleanupFixtures().
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { ROOT, restartNativeWebServer, openEditor } from "./gestures.mjs";
import { loadRootEnv } from "./load-env.mjs";
import { requireExternalModelConsent } from "./external-model-consent.mjs";

loadRootEnv();

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF =
  "根据附件写华北零售 7 月经营月报。只引用附件里标了虚构演示的数字，不要另编人均或同比。页数跟材料走，不要为了凑 6 页灌水。";
const OUT = process.env.QA_PI_GENERATE_OUT || path.join(ROOT, "output", "qa-pi-generate");
const ART = process.env.QA_PI_GENERATE_ART || "/opt/cursor/artifacts/qa-pi-generate";
const VIDEO_DIR = path.join(OUT, "playwright-video");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "demo-ops-monthly");
const ATTACH_FILES = [
  path.join(FIXTURE_DIR, "2026-07-经营月报-虚构演示.md"),
  path.join(FIXTURE_DIR, "2026-07-渠道区域库存-虚构演示.csv"),
];
const DEMO_MARKERS = ["1840", "92%", "160", "31.2", "620", "540", "214", "虚构演示"];
const FORBIDDEN = ["人均", "NPS", "市场份额", "Gartner"];

const modelConsent = requireExternalModelConsent({
  script: "record-pi-generate",
  brief: BRIEF,
  attachments: ATTACH_FILES,
});

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  brief: BRIEF,
  startedAt: new Date().toISOString(),
  health: null,
  hubChips: [],
  modelLabel: null,
  generateOutcome: null,
  composeSource: null,
  generateSay: null,
  projectPath: null,
  pageCount: null,
  usedPi: null,
  produce: null,
  produceKind: null,
  fallbackReason: null,
  quotedDemoNumbers: [],
  inventedRisk: [],
  errors: [],
  modelConsent,
  provider: null,
};

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).then(() => name);
}

function copyArt() {
  try {
    fs.mkdirSync(ART, { recursive: true });
    fs.cpSync(OUT, ART, { recursive: true });
  } catch {
    /* store may ignore new dirs */
  }
}

function inspectProject(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) return;
  const agent = path.join(projectPath, "_agent");
  const traceFile = path.join(agent, "pi-trace.json");
  const skillFile = path.join(agent, "skill-deck.json");
  const composeFile = path.join(agent, "compose-deck.json");
  const attachFile = path.join(agent, "attachments.md");
  notes.wroteAttachments = fs.existsSync(attachFile);
  if (fs.existsSync(traceFile)) {
    try {
      notes.piTrace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
      notes.usedPi = Boolean(notes.piTrace.usedPi);
      notes.produce = notes.piTrace.produce || null;
      notes.fallbackReason = notes.piTrace.error || notes.piTrace.fallbackReason || null;
      notes.assistantPreview = notes.piTrace.assistantPreview || null;
    } catch (err) {
      notes.errors.push(`pi-trace parse: ${err.message}`);
    }
  }
  if (fs.existsSync(skillFile)) {
    try {
      const skill = JSON.parse(fs.readFileSync(skillFile, "utf8"));
      const pages = Array.isArray(skill.pages) ? skill.pages : [];
      const withEls = pages.filter((p) => Array.isArray(p.elements) && p.elements.length);
      notes.produceKind = withEls.length >= 2 ? "skill-elements" : "skill-thin";
      notes.skillPageCount = pages.length;
    } catch {
      notes.produceKind = "skill-unreadable";
    }
  } else if (fs.existsSync(composeFile)) {
    notes.produceKind = "compose-ir-stamp";
  } else {
    notes.produceKind = "no-pi-output-file";
  }
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
      say: document.getElementById("agent-complete")?.innerText?.slice(0, 600) || "",
    }));
    notes.toolRows = await snapshotTools(page);
    notes.toolLabels = notes.toolRows.map((t) => t.label);
    if (Date.now() - lastShot > 20000) {
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
  llmConfigured: health.llmConfigured,
  kimiRuntime: health.kimiRuntime,
  piAvailable: health.piAvailable,
  piNote: health.piNote,
};
if (health.kimiRuntime) notes.errors.push("kimiRuntime must be false");
if (!health.piAvailable) notes.errors.push(`piAvailable=false: ${health.piNote}`);

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
  await page.waitForSelector("#capability-list li", { timeout: 8000 });
  notes.hubChips = await page.evaluate(() =>
    [...document.querySelectorAll("#capability-list li")].map((li) => li.textContent.trim()),
  );
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])", { timeout: 4000 });
  if (provider) await page.selectOption("#pi-provider", provider);
  if (process.env.QA_PI_MODEL) await page.fill("#pi-model", process.env.QA_PI_MODEL);
  const loggedIn = Boolean(
    provider && authSnapshot.stored?.some((row) => row.providerId === provider),
  );
  if (!loggedIn) {
    notes.errors.push(`selected supplier is not logged in: ${provider || "(none)"}`);
    await shot(page, "01-provider-not-logged-in");
  } else {
    await page.waitForFunction(
      () => /已登录/.test(document.getElementById("pi-login-status")?.textContent || ""),
      null,
      { timeout: 4000 },
    );
    notes.modelLabel = await page.locator("#model-label").innerText();
    await shot(page, "01-hub-provider");
    await page.click("#btn-model");

    await page.click("#btn-attach");
    await page.waitForSelector("#attach-modal:not([hidden])");
    await page.setInputFiles("#attach-file", ATTACH_FILES);
    await page.waitForFunction(() => {
      const chips = [...document.querySelectorAll(".reference-chip")];
      return chips.filter((c) => c.classList.contains("is-parsed")).length >= 2;
    }, null, { timeout: 15000 });
    await shot(page, "02-hub-attachments");
    await page.click("#btn-attach-close");

    await page.fill("#brief", BRIEF);
    await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
    await shot(page, "03-hub-ready");
    await page.click("#btn-send");
    await page.waitForSelector("#agent-screen:not([hidden])");
    const outcome = await waitGenerate(page, 25 * 60 * 1000);
    notes.generateOutcome = outcome.kind;
    notes.generateSay = outcome.say || "";
    await page.locator("#tool-card .tool-row").last().scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "04-generate-end");
    if (outcome.kind !== "done") {
      notes.errors.push(`generate did not finish: ${outcome.kind}`);
    } else {
      const say = await page.locator("#agent-complete .agent-say").innerText().catch(() => "");
      notes.composeSource =
        (say.match(/·\s*(agent|playbook|pi-rpc|paused|llm|fallback)/i) || [])[1] || null;
      notes.projectPath = (await fetch(`${BASE}/api/health`).then((r) => r.json())).project;
      inspectProject(notes.projectPath);
      if (notes.composeSource !== "pi-rpc" || notes.usedPi !== true) {
        notes.errors.push(
          `Pi did not produce the deck: composeSource=${notes.composeSource} usedPi=${notes.usedPi} produceKind=${notes.produceKind} fallback=${notes.fallbackReason || notes.generateSay}`,
        );
      }
      await page.click("#btn-open-result");
      await page.waitForSelector("#slide .el", { timeout: 20000 });
      const model = await fetch(`${BASE}/api/model`).then((r) => r.json());
      notes.pageCount = model.model?.pageCount ?? null;
      notes.pageTitles = [];
      notes.pages = [];
      for (let i = 0; i < (model.model?.pageCount || 0); i++) {
        const thumb = page.locator("#rail .thumb").nth(i);
        if (await thumb.count()) {
          await thumb.scrollIntoViewIfNeeded();
          const box = await thumb.boundingBox();
          if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        await page.waitForTimeout(400);
        await page.locator("#slide").screenshot({
          path: path.join(OUT, `editor-slide-${String(i + 1).padStart(2, "0")}.png`),
        });
        const copy = await page.locator("#slide").innerText();
        notes.pageTitles.push((copy.split("\n").find((l) => l.trim()) || "").slice(0, 80));
        notes.pages.push({
          index: i,
          elements: await page.locator("#slide .el").count(),
          copy: copy.slice(0, 500),
        });
      }
      const allCopy = notes.pages.map((p) => p.copy).join("\n");
      notes.quotedDemoNumbers = DEMO_MARKERS.filter((m) => allCopy.includes(m));
      notes.inventedRisk = FORBIDDEN.filter((m) => allCopy.includes(m));
      if (/今天要搞懂|带走什么|课堂例子|勾股/.test(notes.pageTitles.join(" "))) {
        notes.errors.push(`lesson-path titles on a 月报: ${notes.pageTitles.join(" | ")}`);
      }
      await shot(page, "05-editor");
      await openEditor(page, notes.projectPath);
      await shot(page, "06-editor-reload");
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
    const dest = path.join(OUT, "pi-generate.webm");
    try {
      fs.copyFileSync(vpath, dest);
      notes.video = dest;
    } catch {
      notes.video = vpath;
    }
    fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  }
  copyArt();
  console.log(
    JSON.stringify(
      {
        errors: notes.errors,
        composeSource: notes.composeSource,
        usedPi: notes.usedPi,
        produce: notes.produce,
        produceKind: notes.produceKind,
        pageCount: notes.pageCount,
        quotedDemoNumbers: notes.quotedDemoNumbers,
        inventedRisk: notes.inventedRisk,
        fallbackReason: notes.fallbackReason,
        wroteAttachments: notes.wroteAttachments,
        out: OUT,
      },
      null,
      2,
    ),
  );
  if (notes.errors.length) process.exitCode = 1;
}
