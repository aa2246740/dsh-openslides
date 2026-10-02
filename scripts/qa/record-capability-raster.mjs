#!/usr/bin/env node
/**
 * Prove capability card + native #slide raster. Screenshots + video.
 * Does not print secrets.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { restartNativeWebServer, openEditor } from "./gestures.mjs";
import { externalModelConsentGranted } from "./external-model-consent.mjs";

const require = createRequire(import.meta.url);
const { PNG } = (() => {
  try {
    return { PNG: require("pngjs").PNG };
  } catch {
    return { PNG: null };
  }
})();

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "东京三日旅游攻略，不要编造人均消费。用路线文字和形状，不必配图。";
const OUT = process.env.QA_OUT || "/opt/cursor/artifacts/qa-capability-raster";
const VIDEO_DIR = path.join(OUT, "playwright-video");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  brief: BRIEF,
  startedAt: new Date().toISOString(),
  health: null,
  capability: null,
  hubChips: [],
  providerPanel: null,
  toolLabels: [],
  toolRows: [],
  hasRenderRow: false,
  writePageCount: 0,
  composeSource: null,
  projectPath: null,
  raster: null,
  pages: [],
  errors: [],
};

function shot(page, name) {
  const dest = path.join(OUT, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: false }).then(() => dest);
}

function uniqueColors(buf) {
  if (!buf || buf.length < 24) return 0;
  if (PNG) {
    try {
      const img = PNG.sync.read(buf);
      const seen = new Set();
      for (let i = 0; i < img.data.length; i += 16) {
        seen.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
        if (seen.size > 80) return seen.size;
      }
      return seen.size;
    } catch {
      /* fall through */
    }
  }
  const seen = new Set();
  for (let i = 16; i < buf.length; i += 32) seen.add(buf[i]);
  return seen.size;
}

async function snapshotTools(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#tool-card .tool-row")].map((r) => ({
      label: r.querySelector(".tool-main span")?.textContent?.trim() || "",
      summary: r.querySelector("small")?.textContent?.trim() || "",
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
      rows: document.querySelectorAll("#tool-card .tool-row").length,
    }));
    notes.toolRows = await snapshotTools(page);
    notes.toolLabels = notes.toolRows.map((t) => t.label);
    notes.hasRenderRow = notes.toolLabels.includes("Render");
    notes.writePageCount = notes.toolLabels.filter((l) => l === "Write Page").length;
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

await restartNativeWebServer();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
const authSnapshot = await fetch(`${BASE}/api/pi/auth`).then((r) => r.json());
const provider =
  process.env.QA_PI_PROVIDER ||
  authSnapshot.auth?.provider ||
  authSnapshot.stored?.[0]?.providerId ||
  "";
const providerLoggedIn = Boolean(
  provider && authSnapshot.stored?.some((row) => row.providerId === provider),
);
notes.provider = provider;
notes.health = {
  kimiRuntime: health.kimiRuntime,
  imageConfigured: health.imageConfigured,
  imageSearchConfigured: health.imageSearchConfigured,
  piAvailable: health.piAvailable,
  piNote: health.piNote,
};
notes.capability = health.capability;
if (health.kimiRuntime) notes.errors.push("kimiRuntime must be false");
if (!health.capability) notes.errors.push("health.capability missing");

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
  await page.waitForSelector("#capability-card:not([hidden])", { timeout: 8000 }).catch(() => {
    notes.errors.push("capability card hidden or missing");
  });
  notes.hubChips = await page.evaluate(() =>
    [...document.querySelectorAll("#capability-list li")].map((li) => li.textContent.trim()),
  );
  await shot(page, "01-hub-capability");
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  if (provider) await page.selectOption("#pi-provider", provider);
  notes.providerPanel = await page.evaluate(() => ({
    selected: document.getElementById("pi-provider")?.value || "",
    providers: [...(document.getElementById("pi-provider")?.options || [])].map(
      (option) => option.value,
    ),
    status: document.getElementById("pi-login-status")?.textContent?.trim() || "",
  }));
  await shot(page, "02-provider-panel");
  await page.click("#btn-model");

  if (!externalModelConsentGranted()) {
    notes.liveGenerateSkipped = "QA_ALLOW_EXTERNAL_MODEL is not set; fixture raster only";
  } else if (!providerLoggedIn || !health.piAvailable) {
    notes.errors.push(
      `cannot live-generate: provider=${provider || "(none)"} loggedIn=${providerLoggedIn} piAvailable=${health.piAvailable}`,
    );
  } else {
    await page.fill("#brief", BRIEF);
    await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
    await page.click("#btn-send");
    await page.waitForSelector("#agent-screen:not([hidden])");
    const outcome = await waitGenerate(page, 8 * 60 * 1000);
    notes.generateOutcome = outcome.kind;
    notes.generateSay = outcome.say || "";
    const renderRow = page.locator("#tool-card .tool-row", { hasText: "Render" }).first();
    if (await renderRow.count()) {
      await renderRow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await shot(page, "03b-render-rows");
    }
    await page.locator("#tool-card .tool-row").last().scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "03-generate-end");
    if (outcome.kind === "done") {
      const result = await page.locator("#result-wrap").evaluate((element) => ({ ...element.dataset }));
      notes.composeSource = result.composeSource || null;
      notes.authentic = result.authentic === "1";
      if (!notes.authentic || notes.composeSource !== "pi-rpc") {
        notes.errors.push(`result is not provenance-verified Pi output: ${JSON.stringify(result)}`);
      }
      if (notes.writePageCount > 0 && health.capability?.pageRaster?.mode === "native-slide" && !notes.hasRenderRow) {
        notes.errors.push("write_page ran but host did not auto-render #slide (no Render row)");
      }
      if (notes.writePageCount === 0) {
        notes.errors.push("model skipped write_page — visual loop did not run (compose-only)");
      }
      await page.click("#btn-open-result");
      await page.waitForSelector("#slide .el", { timeout: 20000 });
      const model = await fetch(`${BASE}/api/model`).then((r) => r.json());
      notes.projectPath = (await fetch(`${BASE}/api/health`).then((r) => r.json())).project;
      notes.pageCount = model.model?.pageCount;
      const rasterDir = notes.projectPath
        ? path.join(notes.projectPath, "_agent", "rasters")
        : "";
      if (rasterDir && fs.existsSync(rasterDir)) {
        notes.hostRasters = fs.readdirSync(rasterDir).filter((n) => n.endsWith(".png"));
        for (const name of notes.hostRasters) {
          fs.copyFileSync(path.join(rasterDir, name), path.join(OUT, `host-raster-${name}`));
        }
      }
      for (let i = 0; i < (model.model?.pageCount || 0); i++) {
        const thumb = page.locator("#rail .thumb").nth(i);
        if (await thumb.count()) await thumb.click();
        await page.waitForTimeout(400);
        await page.locator("#slide").screenshot({
          path: path.join(OUT, `editor-slide-${String(i + 1).padStart(2, "0")}.png`),
        });
        const els = await page.locator("#slide .el").count();
        notes.pages.push({ index: i, elements: els });
      }
      await shot(page, "04-editor");
    } else {
      notes.errors.push(`generate did not finish: ${outcome.kind}`);
    }
  }

  const fixture = path.join(ROOT, "fixtures", "okp-yu7-ppt");
  const rasterTarget = notes.projectPath && fs.existsSync(path.join(notes.projectPath, "deck.pptd"))
    ? notes.projectPath
    : fixture;
  await openEditor(page, rasterTarget);
  await page.waitForSelector("#slide .el", { timeout: 20000 });
  const slidePng = path.join(OUT, "live-slide-raster.png");
  await page.locator("#slide").screenshot({ path: slidePng });
  const slideBytes = fs.readFileSync(slidePng);
  const colors = uniqueColors(slideBytes);
  notes.raster = {
    target: rasterTarget,
    bytes: slideBytes.length,
    uniqueColors: colors,
    notBackgroundOnly: colors >= 8 && slideBytes.length > 8000,
  };
  if (!notes.raster.notBackgroundOnly) {
    notes.errors.push(`slide raster looks empty/solid (colors=${colors} bytes=${slideBytes.length})`);
  }
  await shot(page, "05-live-raster-editor");
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
    const dest = path.join(OUT, "capability-raster.webm");
    try {
      fs.copyFileSync(vpath, dest);
      notes.video = dest;
    } catch {
      notes.video = vpath;
    }
    fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    errors: notes.errors,
    chips: notes.hubChips,
    providerPanel: notes.providerPanel,
    composeSource: notes.composeSource,
    hasRenderRow: notes.hasRenderRow,
    writePageCount: notes.writePageCount,
    raster: notes.raster,
    out: OUT,
  }, null, 2));
  if (notes.errors.length) process.exitCode = 1;
}
