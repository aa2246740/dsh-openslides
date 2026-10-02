#!/usr/bin/env node
/**
 * QA shots: selection chrome, 177 gallery, animation timeline.
 * Uses only the repository wrapper around the globally pinned Chromium runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const OUT = path.resolve("docs/editor-oracle/runs/uiux-recreate");
fs.mkdirSync(OUT, { recursive: true });

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function openProject(project) {
  await page.goto(`${BASE}/?project=${encodeURIComponent(project)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () => {
      const title = document.getElementById("doc-title")?.textContent || "";
      return Boolean(document.querySelector("#slide .el")) && !/not found|未加载/.test(title);
    },
    null,
    { timeout: 10000 },
  );
}

async function shot(name, project, action) {
  await openProject(project);
  const result = action ? await page.evaluate(action) : null;
  if (result != null) console.log(`eval ${name}`, result);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log(`shot ${name}`);
}

try {
  await shot("10-selection-177.png", "syn-shapes-177", async () => {
    const el =
      document.querySelector('#slide .el.shape[data-id="sh-roundRect"]') ||
      document.querySelector("#slide .el.shape");
    if (!el) return "no-shape";
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    return document.querySelector("#slide .sel-box") ? `sel:${el.dataset.id}` : "no-sel";
  });

  await shot("11-shape-gallery-177.png", "syn-shapes-177", async () => {
    document.querySelector('[data-insert="shape"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      open: !document.getElementById("shape-palette")?.hidden,
      cells: document.querySelectorAll("#shape-grid .shape-cell").length,
      catalog: document.getElementById("shape-count")?.textContent,
    };
  });

  await shot("12-timeline-yu7.png", "okp-yu7-ppt", async () => {
    const el = document.querySelector("#slide .el");
    if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 450));
    document.getElementById("btn-timeline")?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    document.getElementById("tl-add")?.click();
    await new Promise((resolve) => setTimeout(resolve, 450));
    return !document.getElementById("timeline")?.hidden;
  });

  await shot("13-chart-edit-data.png", "okp-yu7-ppt", async () => {
    document.querySelector('[data-insert="chart"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const chart = document.querySelector("#slide .el.chart");
    if (chart) chart.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const edit = [...document.querySelectorAll(".ctx-btn,.ctx-icon")].find((button) =>
      /Edit data|数据/.test(
        `${button.textContent || ""}${button.getAttribute("data-tip") || ""}${button.title || ""}`,
      ),
    );
    edit?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return !document.getElementById("chart-overlay")?.hidden;
  });
} finally {
  await browser.close();
}
