#!/usr/bin/env node
/**
 * Live, read-only Hub/Settings evidence with the pinned browser.
 * BASE=http://127.0.0.1:13080 node scripts/qa/hub-model-panel.mjs
 * Optional QA_LAUNCH_LOG uses the kernel's normal local launch link in memory
 * for its cookie exchange. It never records the link, cookie or credentials.
 * No login, logout, model call or provider-setting write is performed.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:13080";
const OUT = path.resolve(process.env.QA_OUT || "output/hub-model-panel");
const origin = new URL(BASE).origin;
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "local product only");
fs.mkdirSync(OUT, { recursive: true });
const report = { base: origin, checks: {}, pageErrors: [] };
const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (error) => report.pageErrors.push(error.name));

async function capture(name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `${name}: horizontal overflow`);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

try {
  let entry = `${origin}/`;
  if (process.env.QA_LAUNCH_LOG) {
    const log = fs.readFileSync(path.resolve(process.env.QA_LAUNCH_LOG), "utf8").replace(/\x1b\[[0-9;]*m/g, "");
    const candidates = [...log.matchAll(/https?:\/\/[^\s]+/g)].map((match) => {
      try { return new URL(match[0]); } catch { return null; }
    });
    const link = candidates.findLast((url) => url?.origin === origin && url.pathname === "/" && url.searchParams.has("token"));
    assert.ok(link, "local kernel launch link required");
    entry = link.href;
  }
  try { await page.goto(entry, { waitUntil: "networkidle" }); }
  catch { throw new Error("local product navigation failed"); }
  await page.waitForFunction(() => document.getElementById("pi-model")?.getAttribute("aria-disabled") === "false");
  const closedHeight = await page.locator(".prompt-card").evaluate((node) => node.getBoundingClientRect().height);
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll("#capability-row li").length === 4);
  const selection = await page.locator('#pi-model [aria-selected="true"]').getAttribute("data-model-key");
  const groups = await page.$$eval("#pi-model .model-group-label", (rows) => rows.map((row) => row.textContent));
  assert.ok(selection.includes("/") && groups.length > 0, "usable grouped selection required");
  assert.equal(await page.locator("#pi-panel select, #pi-provider, #pi-login-status").count(), 0);
  assert.equal(await page.locator(".prompt-card").evaluate((node) => node.getBoundingClientRect().height), closedHeight);
  report.checks.picker = { selection, groups };
  report.checks.capabilities = await page.$$eval("#capability-row li", (rows) =>
    rows.map((row) => ({ label: row.textContent, on: row.classList.contains("is-on"), hint: row.getAttribute("data-tip") || row.title })));
  report.checks.spacing = [];
  for (const theme of ["warm", "ink"]) {
    await page.evaluate(async (value) => (await import("./theme.js")).applyTheme(value), theme);
    for (const [width, height] of [[1440, 1000], [390, 1000], [320, 1000], [1440, 420]]) {
      if (await page.locator("#pi-panel").isVisible()) await page.click("#btn-model");
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const spacing = await page.evaluate(() => {
        const prompt = document.querySelector(".prompt-card").getBoundingClientRect();
        const projects = document.querySelector(".projects-panel").getBoundingClientRect();
        const first = document.querySelector("#project-list .proj-row")?.getBoundingClientRect();
        return {
          gap: projects.top - prompt.bottom,
          top: document.querySelector(".wordmark").getBoundingClientRect().top,
          firstRowVisible: first ? first.bottom <= innerHeight : null,
        };
      });
      assert.ok(spacing.gap >= 32 && spacing.gap <= 64, `${theme} ${width}: bounded project gap`);
      assert.ok(spacing.top >= 64 && spacing.top <= 128, `${theme} ${width}: bounded top whitespace`);
      if (height >= 640 && spacing.firstRowVisible !== null) assert.equal(spacing.firstRowVisible, true);
      report.checks.spacing.push({ theme, width, height, ...spacing });
      const size = height === 420 ? `${width}-short` : String(width);
      await capture(`home-${theme}-${size}`);
      const catalogRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/slides/models");
      const healthRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/slides/health");
      await page.click("#btn-model");
      await (await catalogRead).finished();
      await (await healthRead).finished();
      await page.waitForFunction(() => document.querySelectorAll("#capability-row li").length === 4);
      await page.waitForFunction(() => {
        const r = document.getElementById("pi-panel").getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      });
      await capture(`hub-${theme}-${size}`);
    }
  }
  await page.setViewportSize({ width: 320, height: 1000 });
  const metadata = await page.evaluate(async () => (await fetch("/slides/models")).json());
  const effortOffer = metadata.find((row) => Object.values(row.modelEfforts || {}).some((levels) => levels.length));
  if (effortOffer) {
    const model = Object.keys(effortOffer.modelEfforts).find((id) => effortOffer.modelEfforts[id].length);
    const key = `${effortOffer.providerId}/${model}`;
    if (key !== selection) {
      const selectedHealth = page.waitForResponse((response) => new URL(response.url()).pathname === "/slides/health");
      await page.getByRole("group", { name: effortOffer.providerName, exact: true })
        .getByRole("option", { name: effortOffer.models.find((row) => row.id === model).name, exact: true }).click();
      await (await selectedHealth).finished();
      const catalogRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/slides/models");
      const refreshedHealth = page.waitForResponse((response) => new URL(response.url()).pathname === "/slides/health");
      await page.click("#btn-model");
      await (await catalogRead).finished();
      await (await refreshedHealth).finished();
    }
    await page.waitForSelector('#pi-effort [role="radio"]');
    await page.waitForFunction(() => document.querySelectorAll("#capability-row li").length === 4);
    report.checks.effortModel = key;
    await capture("hub-ink-efforts-320");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click("#btn-settings");
  await page.waitForSelector("#pane-models:not([hidden])");
  assert.equal(await page.locator('[data-settings-pane="tools"]').isHidden(), true);
  assert.equal(await page.locator('.settings-nav button:visible').count(), 3);
  await capture("settings-models-1440");
  await page.click('[data-settings-pane="oauth"]');
  await page.waitForSelector("#provider-list .provider-row");
  report.checks.loginStatus = await page.evaluate(async () =>
    (await fetch("/plugins/dsh-oauth-login/auth/status")).status);
  if (process.env.QA_LAUNCH_LOG) assert.equal(report.checks.loginStatus, 200);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(`settings-login-${width}`);
  }
  await page.click("#btn-settings-back");
  await page.route("**/slides/models", (route) => route.fulfill({ json: [] }));
  report.checks.emptyState = "test double, not live catalog";
  for (const theme of ["warm", "ink"]) {
    await page.evaluate(async (theme) => (await import("./theme.js")).applyTheme(theme), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (await page.locator("#pi-panel").isVisible()) await page.click("#btn-model");
      await page.click("#btn-model");
      await page.waitForSelector("#pi-provider-note:not([hidden])");
      await capture(`hub-${theme}-empty-${width}`);
    }
  }
  assert.deepEqual(report.pageErrors, []);
  report.accepted = true;
  console.log("OK hub-model-panel");
} catch (error) {
  report.accepted = false;
  report.failure = String(error.message).replace(/token=[^\s]+/g, "token=[redacted]");
  process.exitCode = 1;
  console.error(`FAIL ${report.failure}`);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`evidence ${path.join(OUT, "evidence.json")}`);
}
