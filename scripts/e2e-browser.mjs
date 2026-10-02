#!/usr/bin/env node
/**
 * Production browser smoke: Create → Generate → Workspace → Export PPTX.
 * Requires: the Codex global pinned browser runtime and a built web app.
 *
 *   npm run build
 *   node scripts/e2e-browser.mjs
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "apps/web/dist");

if (!existsSync(join(dist, "index.html"))) {
  console.error("Missing apps/web/dist — run npm run build first");
  process.exit(1);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function serveStatic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let rel = urlPath === "/" ? "/index.html" : urlPath;
      let file = normalize(join(dist, rel));
      if (!file.startsWith(dist)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        file = join(dist, "index.html");
      }
      try {
        const body = readFileSync(file);
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

const { server, base } = await serveStatic();

let browser;
try {
  browser = await launchPinnedChromium({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });

  // Create hub
  await page.waitForSelector(".create-hub, [data-testid='create-hub'], textarea", {
    timeout: 15000,
  });
  const ta = page.locator("textarea").first();
  await ta.fill(
    "Production e2e: build a short research briefing on battery recycling with charts and a timeline.",
  );

  await page.getByRole("button", { name: /generate deck/i }).click();

  // Wait for workspace (auto-open after mock agent)
  await page.waitForSelector(".workspace", { timeout: 120000 });
  await page.waitForSelector(".slide-frame", { timeout: 30000 });

  // Export
  const exportBtn = page.getByRole("button", { name: /export/i }).first();
  await exportBtn.click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: /PowerPoint/i }).click(),
  ]);
  const name = download.suggestedFilename();
  if (!name.toLowerCase().endsWith(".pptx")) {
    throw new Error(`expected .pptx download, got ${name}`);
  }
  const path = await download.path();
  if (!path) throw new Error("download path missing");
  const buf = readFileSync(path);
  if (buf.length < 1000) throw new Error(`pptx too small: ${buf.length}`);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("not a ZIP/PPTX");

  // Canvas has real elements
  const elCount = await page.locator(".slide-el, .slide-element, [data-element-id]").count();
  const anyNodes = await page.locator(".slide-frame__inner *").count();
  if (anyNodes < 3) throw new Error("slide canvas looks empty");

  if (errors.length) {
    console.warn("page errors (non-fatal):", errors.slice(0, 3));
  }

  console.log("E2E PASSED");
  console.log(`  download: ${name} (${buf.length} bytes)`);
  console.log(`  canvas child nodes: ${anyNodes} (element markers: ${elCount})`);
  process.exitCode = 0;
} catch (err) {
  console.error("E2E FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
