#!/usr/bin/env node
/**
 * Screenshot the product-owned Pi supplier login panel and runtime capability.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { ROOT, restartNativeWebServer } from "./gestures.mjs";
import { loadRootEnv } from "./load-env.mjs";

loadRootEnv();

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const OUT = process.env.QA_PI_HUB_OUT || path.join(ROOT, "output", "qa-pi-hub");
const ART = "/opt/cursor/artifacts/qa-pi-hub";
const VIDEO_DIR = path.join(OUT, "playwright-video");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const notes = {
  startedAt: new Date().toISOString(),
  health: null,
  hubChips: [],
  providerPanel: null,
  errors: [],
};

await restartNativeWebServer();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
notes.health = {
  llmConfigured: health.llmConfigured,
  kimiRuntime: health.kimiRuntime,
  piAvailable: health.piAvailable,
  piNote: health.piNote,
  vision: health.capability?.vision?.mode || null,
  imageSearch: health.imageSearchConfigured,
  imageGenerate: health.imageConfigured,
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
try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  notes.hubChips = await page.evaluate(() =>
    [...document.querySelectorAll("#capability-list li")].map((li) => li.textContent.trim()),
  );
  await page.screenshot({ path: path.join(OUT, "01-hub.png") });
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])", { timeout: 4000 });
  notes.providerPanel = await page.evaluate(() => {
    const select = document.getElementById("pi-provider");
    return {
      present: Boolean(document.getElementById("pi-panel")),
      providers: [...(select?.options || [])].map((option) => ({
        id: option.value,
        name: option.textContent?.trim() || "",
      })),
      selected: select?.value || "",
      status: document.getElementById("pi-login-status")?.textContent?.trim() || "",
      models: [...(document.getElementById("pi-model")?.options || [])].map(
        (option) => option.value,
      ),
      settingsEntry: Boolean(document.getElementById("btn-pi-settings")),
      credentialForm: Boolean(document.getElementById("pi-key")),
    };
  });
  await page.screenshot({ path: path.join(OUT, "02-provider-login.png") });
  if (!notes.providerPanel.present || !notes.providerPanel.providers.length) {
    notes.errors.push("Hub model panel has no providers");
  }
  if (notes.providerPanel.credentialForm) {
    notes.errors.push("Hub model panel must not carry a credential form");
  }
} finally {
  const video = page.video();
  await page.close();
  if (video) {
    const raw = await video.path();
    const dest = path.join(OUT, "pi-hub.webm");
    try {
      fs.renameSync(raw, dest);
    } catch {
      fs.copyFileSync(raw, dest);
    }
  }
  await context.close();
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
try {
  fs.mkdirSync(ART, { recursive: true });
  fs.cpSync(OUT, ART, { recursive: true });
} catch {
  /* store may be read-only */
}
console.log(JSON.stringify(notes, null, 2));
process.exit(notes.errors.length ? 1 : 0);
