#!/usr/bin/env node
/** Normal product UI -> pinned Pi -> new PPTD -> editable canvas. */
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { requireExternalModelConsent } from "./external-model-consent.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55201";
const PROVIDER = process.env.QA_PI_PROVIDER || "xai-auth";
const MODEL = process.env.QA_PI_MODEL || "grok-4.5";
const OUT = path.resolve(
  process.env.QA_AUTHENTIC_GENERATE_OUT || "output/qa-authentic-product-generate",
);
const BRIEF_FILE = process.env.QA_AUTHENTIC_BRIEF_FILE?.trim();
const BRIEF =
  process.env.QA_AUTHENTIC_BRIEF ||
  (BRIEF_FILE ? fs.readFileSync(path.resolve(BRIEF_FILE), "utf8") : "") ||
  "生成一份4页中文演示，主题是『从想法到可编辑PPT：DSH SlideStudio工作流』。第1页封面；第2页用流程图表现Agent规划与工具链；第3页用对比图解释PPTD可编辑对象与PPTX导出；第4页给出三项下一步行动。每页采用不同构图，使用简洁现代的蓝紫色科技视觉；不要套用完整页面模板。";
const EXPECTED_PAGES = Number(process.env.QA_AUTHENTIC_EXPECTED_PAGES || 0);
const TIMEOUT_MS = Number(process.env.QA_AUTHENTIC_TIMEOUT_MS || 20 * 60_000);
const modelConsent = requireExternalModelConsent({
  script: "verify-authentic-product-generate",
  brief: BRIEF,
});

fs.mkdirSync(OUT, { recursive: true });
const notes = {
  startedAt: new Date().toISOString(),
  base: BASE,
  provider: PROVIDER,
  requestedModel: MODEL,
  briefFile: BRIEF_FILE ? path.resolve(BRIEF_FILE) : null,
  expectedPages: EXPECTED_PAGES || null,
  brief: BRIEF,
  runtimeRows: [],
  provenance: null,
  projectPath: null,
  editorPageCount: null,
  errors: [],
  modelConsent,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

const health = await json(`${BASE}/api/health`);
assert(health.piAvailable === true, `Pi unavailable: ${health.piNote || "unknown"}`);
assert(health.kimiRuntime === false, "production shell unexpectedly uses Kimi runtime");
const auth = await json(`${BASE}/api/pi/auth`);
assert(
  auth.stored?.some((row) => row.providerId === PROVIDER),
  `selected provider is not logged in: ${PROVIDER}`,
);

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  assert((await page.locator("#model-menu").count()) === 0, "legacy model menu is still shipped");
  assert((await page.locator("#llm-panel").count()) === 0, "legacy direct-LLM panel is still shipped");
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  await page.selectOption("#pi-provider", PROVIDER);
  await page.fill("#pi-model", MODEL);
  const loginText = await page.locator("#pi-login-status").innerText();
  assert(/已登录/.test(loginText), `provider panel is not logged in: ${loginText}`);
  await page.screenshot({ path: path.join(OUT, "01-create-provider.png"), fullPage: false });
  await page.click("#btn-model");
  await page.fill("#brief", BRIEF);
  await page.waitForFunction(() => !document.getElementById("btn-send")?.disabled);
  await page.screenshot({ path: path.join(OUT, "02-create-ready.png"), fullPage: false });
  await page.click("#btn-send");
  await page.waitForSelector("#agent-screen:not([hidden])");

  const deadline = Date.now() + TIMEOUT_MS;
  let lastLog = 0;
  for (;;) {
    const state = await page.evaluate(() => ({
      authentic: document.getElementById("result-wrap")?.dataset.authentic || "",
      retry: Boolean(document.getElementById("btn-retry-now")),
      text: document.getElementById("agent-complete")?.textContent?.trim().slice(0, 500) || "",
      rows: [...document.querySelectorAll("#tool-card .tool-row")].map((row) => ({
        tool: row.dataset.tool || "",
        label: row.querySelector(".tool-main span")?.textContent?.trim() || "",
        summary: row.querySelector("small")?.textContent?.trim() || "",
        running: row.classList.contains("is-running"),
      })),
    }));
    notes.runtimeRows = state.rows;
    if (state.authentic === "1") break;
    if (state.retry) throw new Error(`generation paused or failed: ${state.text}`);
    if (Date.now() >= deadline) throw new Error(`generation timeout: ${state.text}`);
    if (Date.now() - lastLog >= 20_000) {
      lastLog = Date.now();
      const latest = state.rows.slice(-3).map((row) => `${row.label}:${row.summary}`).join(" | ");
      console.log(`progress ${state.rows.length} rows ${latest}`);
      await page.screenshot({
        path: path.join(OUT, `progress-${String(state.rows.length).padStart(2, "0")}.png`),
        fullPage: false,
      });
    }
    await page.waitForTimeout(1_500);
  }

  const result = await page.locator("#result-wrap").evaluate((el) => ({ ...el.dataset }));
  notes.projectPath = result.path;
  assert(result.authentic === "1", "UI result lacks authentic-generation mark");
  assert(result.usedPi === "1", "UI result does not identify Pi");
  assert(result.composeSource === "pi-rpc", `unexpected compose source: ${result.composeSource}`);
  assert(result.provider === PROVIDER, `unexpected provider: ${result.provider}`);
  notes.provenance = await json(
    `${BASE}/api/generate-status?path=${encodeURIComponent(result.path || "")}`,
  );
  assert(notes.provenance.ready === true, `strict provenance failed: ${notes.provenance.reason}`);
  assert(Boolean(notes.provenance.sessionId), "strict provenance has no Pi session id");
  if (EXPECTED_PAGES > 0) {
    assert(
      notes.provenance.pageCount === EXPECTED_PAGES,
      `expected ${EXPECTED_PAGES} pages, got ${notes.provenance.pageCount}`,
    );
    assert(
      notes.provenance.todoCount === EXPECTED_PAGES,
      `expected ${EXPECTED_PAGES} planned pages, got ${notes.provenance.todoCount}`,
    );
    assert(
      notes.provenance.writtenPageCount === EXPECTED_PAGES,
      `expected ${EXPECTED_PAGES} agent-written pages, got ${notes.provenance.writtenPageCount}`,
    );
  }
  assert(notes.provenance.writtenPageCount >= 3, "agent wrote fewer than three pages");
  assert(
    notes.provenance.renderCount >= notes.provenance.writtenPageCount,
    "not every agent-written page has a native raster",
  );
  assert(
    notes.runtimeRows.some((row) => row.tool === "write_page"),
    "visible timeline never showed a real write_page tool",
  );
  await page.screenshot({ path: path.join(OUT, "03-authentic-result.png"), fullPage: false });

  await page.click("#btn-result-edit");
  await page.waitForSelector("#slide .el", { timeout: 30_000 });
  const model = await json(`${BASE}/api/model`);
  notes.editorPageCount = model.model?.pageCount || 0;
  assert(notes.editorPageCount === notes.provenance.pageCount, "editor pages differ from proven PPTD");
  await page.screenshot({ path: path.join(OUT, "04-editable-canvas.png"), fullPage: false });
} catch (error) {
  notes.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  notes.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

console.log(JSON.stringify(notes, null, 2));
process.exitCode = notes.errors.length ? 1 : 0;
