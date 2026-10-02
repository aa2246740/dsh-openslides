#!/usr/bin/env node
/** Capture unique-root, Hub, editor, and page raster for the latest MiniMax run. */
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3080";
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const artifacts = process.env.EVIDENCE_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(artifacts, { recursive: true });

const markerPath = path.resolve("output/real-generation.json");
if (!fs.existsSync(markerPath)) {
  throw new Error("missing output/real-generation.json");
}
const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
const sessionId = marker.sessionId;
const projectRoot = marker.projectRoot;
if (!sessionId) throw new Error("marker has no sessionId");

const health = await fetch(`${BASE}/slides/health`).then((res) => res.json());
if (health.product !== "DSH SlideStudio") {
  throw new Error(`not DSH SlideStudio: ${JSON.stringify(health)}`);
}
const snap = await fetch(`${BASE}/slides/state/${sessionId}`).then((res) => res.json());
const absProject = projectRoot ? path.resolve(projectRoot) : "";
const rasterDir = absProject ? path.join(absProject, "_agent", "rasters") : "";
const written = [];
const rasterFiles =
  rasterDir && fs.existsSync(rasterDir)
    ? fs.readdirSync(rasterDir).filter((name) => name.toLowerCase().endsWith(".png")).sort()
    : [];
for (const name of rasterFiles.slice(0, 3)) {
  const pageId = name.replace(/\.png$/i, "");
  const rasterRes = await fetch(`${BASE}/slides/raster/${sessionId}/${pageId}`);
  const dest = path.join(artifacts, `page-raster-${stamp}-${pageId}-minimax-m3.png`);
  if (rasterRes.ok) {
    const buf = Buffer.from(await rasterRes.arrayBuffer());
    fs.writeFileSync(dest, buf);
    written.push({ pageId, file: dest, bytes: buf.length, source: "slides-raster" });
    continue;
  }
  const disk = path.join(rasterDir, name);
  const buf = fs.readFileSync(disk);
  fs.writeFileSync(dest, buf);
  written.push({ pageId, file: dest, bytes: buf.length, source: "disk" });
}

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
try {
  await page.goto(`${BASE}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const uniqueText = await page.locator("body").innerText();
  if (!/DSH SlideStudio/.test(uniqueText)) throw new Error("unique-root missing DSH SlideStudio");
  if (/DeepSeek Harness|AppFrame|dsh-web-app/i.test(uniqueText)) {
    throw new Error("DSH default chrome visible on unique-root");
  }
  await page.screenshot({
    path: path.join(artifacts, `unique-root-${stamp}-minimax-m3.png`),
    fullPage: false,
  });

  await page.goto(`${BASE}/app/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#brief");
  const title = await page.title();
  if (!/DSH SlideStudio/.test(title)) throw new Error(`hub title ${title}`);
  await page.screenshot({
    path: path.join(artifacts, `hub-${stamp}-minimax-m3.png`),
    fullPage: false,
  });

  if (projectRoot) {
    const href = `${BASE}/app/index.html?workspace=1&project=${encodeURIComponent(projectRoot)}`;
    await page.goto(href, { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({
      path: path.join(artifacts, `editor-${stamp}-minimax-m3.png`),
      fullPage: false,
    });
  }
} finally {
  await browser.close();
}

const audit = {
  provider: marker.provider,
  model: marker.model,
  sessionId,
  pageCount: snap.project?.pageCount ?? marker.pageCount,
  whoDirected: marker.whoDirected,
  hostDirected: snap.hostDirected === true,
  design: snap.binding?.design,
  receipts: snap.inspection?.receipts ?? [],
  visualReviewMissing: snap.inspection?.visualReviewMissing,
  rasters: written,
  stamp,
};
fs.writeFileSync(path.join(artifacts, `audit-${stamp}.json`), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, ...audit, artifacts }, null, 2));
