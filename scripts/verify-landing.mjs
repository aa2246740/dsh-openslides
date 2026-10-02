#!/usr/bin/env node
/**
 * Browser verification: `/` is Create Hub; `/index.html` stays the editor.
 *   node scripts/verify-landing.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const OUT = path.resolve("output/verify-landing.png");

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

async function waitHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`dev server not healthy at ${BASE}/api/health`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await waitHealth();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  const hub = await page.evaluate(() => ({
    title: document.title,
    kind: document.getElementById("kind-label")?.textContent?.trim(),
    model: document.getElementById("model-label")?.textContent?.trim(),
    workspace: document.querySelector("#btn-upgrade")?.textContent?.trim(),
    hasSlide: Boolean(document.getElementById("slide")),
  }));
  if (!/创建/.test(hub.title)) fail(`GET / title should be 创建, got ${JSON.stringify(hub.title)}`);
  if (hub.kind !== "幻灯片") fail(`GET / kind label should be 幻灯片, got ${JSON.stringify(hub.kind)}`);
  // The hub label renders the selected model id (e.g. DeepSeek-V4-Flash) instead
  // of a hard-coded provider brand list, so assert it is a real, populated label.
  if (!hub.model || hub.model.length < 2) {
    fail(`GET / should show the selected Agent model, got ${JSON.stringify(hub.model)}`);
  }
  if (!/本地工作台/.test(hub.workspace || "")) {
    fail(`GET / should show 本地工作台, got ${JSON.stringify(hub.workspace)}`);
  }
  if (hub.hasSlide) fail("GET / served the editor instead of Hub");
  pass("GET / is Create Hub (中文皮)");

  await page.goto(`${BASE}/?project=fixtures/okp-yu7-ppt`, { waitUntil: "networkidle" });
  await page.waitForSelector("#slide");
  const deep = await page.evaluate(() => ({
    hasBrief: Boolean(document.getElementById("brief")),
    hasSlide: Boolean(document.getElementById("slide")),
  }));
  if (deep.hasBrief || !deep.hasSlide) fail("GET /?project= should keep the editor deep link");
  pass("GET /?project= still opens the editor");

  await page.goto(`${BASE}/hub`, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  pass("GET /hub also serves Create Hub");

  await page.goto(`${BASE}/index.html?project=fixtures/okp-yu7-ppt`, { waitUntil: "networkidle" });
  await page.waitForSelector("#slide");
  const editor = await page.evaluate(() => ({
    title: document.title,
    play: document.getElementById("btn-play")?.textContent?.replace(/\s+/g, " ").trim(),
    playAria: document.getElementById("btn-play")?.getAttribute("aria-label"),
    hasShare: Boolean(document.getElementById("btn-share")),
    hasBrief: Boolean(document.getElementById("brief")),
  }));
  if (!/编辑器/.test(editor.title)) fail(`editor title missing 编辑器: ${JSON.stringify(editor.title)}`);
  if (editor.play || editor.playAria !== "播放") {
    fail(`Play chrome should be an accessible icon-only control, got ${JSON.stringify(editor)}`);
  }
  if (editor.hasShare) fail("Intranet editor must not expose a share button");
  if (editor.hasBrief) fail("/index.html served Hub instead of the editor");
  pass("GET /index.html is the editor (中文皮)");

  // The bottom bar's 消息 entry and its edit/comment mode pill are retired by
  // design; the surviving collaboration entry is the comment action.
  await page.click("#btn-comments");
  await page.locator("#comment-panel").waitFor({ state: "visible", timeout: 4000 });
  pass("批注 opens a real panel (not a dead button)");

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`shot  ${OUT}`);
  console.log("OK    verify-landing");
} finally {
  await browser.close();
}
