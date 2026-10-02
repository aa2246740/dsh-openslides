#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
async function randomPort() {
  const holder = net.createServer();
  await new Promise((resolve, reject) => {
    holder.once("error", reject);
    holder.listen(0, "127.0.0.1", resolve);
  });
  const address = holder.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => holder.close(resolve));
  assert.ok(port > 0, "random QA port must be assigned");
  return port;
}

const PORT = Number(process.env.QA_PORT || await randomPort());
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oss-toolbar-"));
const project = path.join(scratchRoot, "project");
const outDir = path.resolve(process.env.QA_OUT || path.join(scratchRoot, "evidence"));
fs.cpSync(SOURCE, project, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`native editor did not start\n${serverLog}`);
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(String(error)));

try {
  await waitForHealth();
  await page.goto(`${BASE}/index.html?project=${encodeURIComponent(project)}&page=0`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.evaluate(() => document.fonts?.ready);

  // Manual chart insertion is retired by design: decks get their charts from the
  // agent, and hand-editing belongs in PowerPoint. The command path still exists,
  // so this suite drives it directly and keeps asserting how an inserted chart
  // renders and how its inspector behaves.
  const inserted = await page.evaluate(async () => {
    const project = new URLSearchParams(location.search).get("project") || "";
    const res = await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "insert", kind: "chart" }),
    });
    const data = await res.json();
    return {
      status: res.status,
      error: data.error ?? null,
      types: (data.model?.elements || []).map((el) => el.type),
    };
  });
  assert.equal(inserted.status, 200, `chart insert command must succeed (${inserted.error})`);
  assert.ok(
    inserted.types.includes("chart"),
    `chart element must exist after insert: ${inserted.types.join(",")}`,
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  await page.evaluate(() => document.fonts?.ready);
  await page.locator("#slide .el.chart").first().click();
  await page.waitForTimeout(600);

  const chart = page.locator("#slide .el.chart.selected");
  await assert.doesNotReject(() => chart.waitFor({ state: "visible" }), "inserted chart must be selected");

  const facts = await chart.evaluate((node) => {
    const svg = node.querySelector("svg");
    const bars = [...svg.querySelectorAll("rect")]
      .map((rect) => ({
        x: Number(rect.getAttribute("x")),
        y: Number(rect.getAttribute("y")),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      }))
      .filter((rect) => rect.height > 20);
    const legendSwatches = [...svg.querySelectorAll("rect")]
      .map((rect) => ({
        x: Number(rect.getAttribute("x")),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      }))
      .filter((rect) => rect.width === 10 && rect.height === 10);
    const activeIcons = [...document.querySelectorAll('#property-panel [data-inspector-section="chart"] .ctx-icon.on')].map((button) => ({
      title: button.getAttribute("title") || button.getAttribute("aria-label") || "",
      background: getComputedStyle(button).backgroundColor,
      color: getComputedStyle(button).color,
    }));
    return {
      background: getComputedStyle(node).backgroundColor,
      bars,
      legendSwatches,
      activeIcons,
    };
  });

  const barRight = Math.max(...facts.bars.map((bar) => bar.x + bar.width));
  const legendLeft = Math.min(...facts.legendSwatches.map((swatch) => swatch.x));
  assert.ok(
    barRight + 8 <= legendLeft,
    `chart bars overlap legend: barRight=${barRight}, legendLeft=${legendLeft}`,
  );
  assert.notEqual(
    facts.background,
    "rgba(0, 0, 0, 0)",
    "new chart must have an opaque chart-area surface instead of exposing slide content",
  );
  assert.ok(facts.activeIcons.length >= 2, "chart labels and legend toggles should be visibly active");
  for (const icon of facts.activeIcons) {
    assert.ok(icon.title, "active icon button must have an accessible name");
    assert.notEqual(
      icon.background,
      "rgb(238, 242, 246)",
      `${icon.title} active state must not appear as a blank near-white square on a dark toolbar`,
    );
  }
  assert.deepEqual(browserErrors, [], `browser emitted errors: ${browserErrors.join(" | ")}`);

  const screenshot = path.join(outDir, "editor-toolbar-regression.png");
  await page.screenshot({ path: screenshot });
  console.log(JSON.stringify({ ok: true, facts, screenshot }));
} finally {
  await browser.close();
  server.kill("SIGKILL");
  if (!process.env.KEEP_QA_PROJECT) fs.rmSync(scratchRoot, { recursive: true, force: true });
}
