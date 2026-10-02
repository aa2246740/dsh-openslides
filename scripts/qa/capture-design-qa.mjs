#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const PROJECT = process.env.QA_PROJECT || "fixtures/okp-yu7-ppt";
const LABEL = (process.env.QA_LABEL || "current").replace(/[^a-z0-9_-]+/gi, "-");
const OUT = path.resolve(process.env.QA_OUT || "docs/design-qa/2026-08-20");
const VIEWPORT = { width: 1576, height: 892 };

fs.mkdirSync(OUT, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

try {
  await page.addInitScript(() => {
    localStorage.setItem("oss.railView", "thumbs");
  });
  const url = `${BASE}/index.html?project=${encodeURIComponent(PROJECT)}&page=0`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const title = document.getElementById("doc-title")?.textContent || "";
    return title && title !== "未加载";
  });
  await page.evaluate(() => document.fonts?.ready);

  const rail = page.locator("#rail");
  if (!(await rail.isVisible())) await page.locator("#btn-rail").click();
  await page.locator("#btn-mode-comment").click();
  const dismiss = page.locator("#annot-tip-try");
  if (await dismiss.isVisible()) await dismiss.click();
  await page.waitForTimeout(250);

  const screenshot = path.join(OUT, `${LABEL}-editor-comment.png`);
  await page.screenshot({ path: screenshot });

  const facts = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      };
    };
    const viewportEl = document.getElementById("viewport");
    const viewportStyle = viewportEl ? getComputedStyle(viewportEl) : null;
    const overlayGradient = document.querySelector('#slide .el[data-id="overlay"] linearGradient');
    const textLineCount = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top * 10) / 10));
      return tops.size;
    };
    return {
      viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      boxes: {
        titlebar: box(".titlebar"),
        docTitle: box("#doc-title"),
        exportButton: box("#btn-export"),
        playButton: box("#btn-play"),
        fullscreenButton: box("#btn-fs"),
        toolbar: box(".toolbar"),
        railViewButton: box("#btn-rail-view"),
        railToggleButton: box("#btn-rail"),
        undoButton: box("#btn-undo"),
        redoButton: box("#btn-redo"),
        zoomOutButton: box("#btn-zoom-out"),
        zoomInButton: box("#btn-zoom-in"),
        rail: box("#rail"),
        firstThumb: box("#rail .thumb"),
        stage: box(".stage-wrap"),
        stageViewport: box("#viewport"),
        slide: box("#slide"),
        insertPill: box("#insert-toolbar"),
      },
      layout: viewportEl && viewportStyle ? {
        viewportClientWidth: viewportEl.clientWidth,
        viewportClientHeight: viewportEl.clientHeight,
        paddingTop: viewportStyle.paddingTop,
        paddingRight: viewportStyle.paddingRight,
        paddingBottom: viewportStyle.paddingBottom,
        paddingLeft: viewportStyle.paddingLeft,
      } : null,
      labels: {
        pageCount: document.getElementById("page-count")?.textContent?.trim(),
        zoom: document.getElementById("zoom-label")?.textContent?.trim(),
        title: document.getElementById("doc-title")?.textContent?.trim(),
      },
      text: {
        descriptionLineCount: textLineCount('#slide .el[data-id="desc"]'),
      },
      paint: {
        slideBackgroundImage: getComputedStyle(document.getElementById("slide")).backgroundImage,
        overlayFill: document.querySelector('#slide .el[data-id="overlay"] svg path')?.getAttribute("fill"),
        overlayGradient: overlayGradient ? {
          x1: overlayGradient.getAttribute("x1"),
          y1: overlayGradient.getAttribute("y1"),
          x2: overlayGradient.getAttribute("x2"),
          y2: overlayGradient.getAttribute("y2"),
        } : null,
        imageResources: performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => /bg_cover|\/media\//.test(name)),
      },
    };
  });
  const factsPath = path.join(OUT, `${LABEL}-facts.json`);
  fs.writeFileSync(factsPath, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, screenshot, factsPath, facts }));
} finally {
  await browser.close();
}
