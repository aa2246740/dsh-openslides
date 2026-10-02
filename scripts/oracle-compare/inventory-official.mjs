#!/usr/bin/env node
/**
 * Dev oracle: walk the official neo-ppt iframe after Penpal setPPTD.
 * No Kimi login. Compare host injects local YAML.
 *
 *   npm run oracle:compare   # already up
 *   node scripts/oracle-compare/inventory-official.mjs
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.ORACLE_COMPARE_URL || "http://127.0.0.1:55180";
const PROJECT = process.env.ORACLE_PROJECT || "yu7";
const OUT = path.resolve(
  process.env.ORACLE_OUT || "docs/editor-oracle/runs/iframe-compare/official-walk",
);
fs.mkdirSync(OUT, { recursive: true });

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function warn(msg) {
  console.warn(`WARN  ${msg}`);
}

async function waitConnected(page) {
  await page.waitForFunction(
    () => /官方已连接/.test(document.getElementById("status")?.textContent || ""),
    null,
    { timeout: 45000 },
  );
}

async function officialFrame(page) {
  const frame = page.frames().find((f) => /kimi\.com\/neo-ppt/.test(f.url()));
  if (!frame) throw new Error("official neo-ppt frame not found");
  return frame;
}

async function dumpTree(frame) {
  return frame.evaluate(() => {
    const clickable = [...document.querySelectorAll("*")].filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (getComputedStyle(el).visibility === "hidden") return false;
      const role = el.getAttribute("role") || "";
      const cursor = getComputedStyle(el).cursor;
      return (
        el.tagName === "BUTTON" ||
        el.tagName === "A" ||
        el.tagName === "INPUT" ||
        el.tagName === "SELECT" ||
        role === "button" ||
        role === "tab" ||
        cursor === "pointer"
      );
    });
    const seen = new Set();
    const items = [];
    for (const el of clickable) {
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.width)}:${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = String(el.innerText || el.getAttribute("aria-label") || el.title || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      items.push({
        tag: el.tagName.toLowerCase(),
        text,
        title: el.title || "",
        aria: el.getAttribute("aria-label") || "",
        cls: String(el.className || "").slice(0, 80),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
    return {
      title: document.title,
      bodyText: String(document.body?.innerText || "")
        .replace(/\n{2,}/g, "\n")
        .slice(0, 4000),
      items,
    };
  });
}

async function shot(page, name) {
  await page.locator("#kimi").screenshot({ path: path.join(OUT, name) });
  pass(`shot ${name}`);
}

async function visibleHints(frame) {
  return frame.evaluate(() => {
    const selectors = [
      '[role="tooltip"]',
      '[class*="tooltip"]',
      '[class*="tool-tip"]',
      '[class*="popover"]',
      '[class*="toast"]',
    ];
    const rows = [];
    for (const el of document.querySelectorAll(selectors.join(","))) {
      if (!(el instanceof HTMLElement)) continue;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (
        box.width < 2 ||
        box.height < 2 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity || 1) === 0
      ) continue;
      const text = String(el.innerText || el.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      if (text) rows.push(text);
    }
    return [...new Set(rows)];
  });
}

async function probeHoverTooltips(page, frame) {
  const candidates = frame.locator(
    'button, a, input, select, [role="button"], [role="tab"], .toggle-menu',
  );
  const rows = [];
  const seen = new Set();
  const count = Math.min(await candidates.count(), 90);
  let shotCount = 0;
  for (let index = 0; index < count; index += 1) {
    const target = candidates.nth(index);
    const box = await target.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    const key = [box.x, box.y, box.width, box.height].map((n) => Math.round(n)).join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = await target
      .evaluate((el) => ({
        tag: el.tagName.toLowerCase(),
        text: String(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
        title: el.getAttribute("title") || "",
        aria: el.getAttribute("aria-label") || "",
        cls: String(el.className || "").slice(0, 100),
      }))
      .catch(() => null);
    if (!meta) continue;
    const before = await visibleHints(frame);
    try {
      await target.hover({ force: true, timeout: 1200 });
      await page.waitForTimeout(450);
    } catch {
      continue;
    }
    const after = await visibleHints(frame);
    const revealed = after.filter((text) => !before.includes(text));
    if (meta.title || meta.aria || revealed.length) {
      const rec = {
        ...meta,
        rect: Object.fromEntries(
          Object.entries(box).map(([name, value]) => [name, Math.round(value)]),
        ),
        revealed,
      };
      rows.push(rec);
      if (revealed.length && shotCount < 6) {
        shotCount += 1;
        await shot(page, `hover-${String(shotCount).padStart(2, "0")}.png`);
      }
    }
    await page.mouse.move(800, 420);
    await page.waitForTimeout(60);
  }
  return rows;
}

const browser = await launchPinnedChromium({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const report = {
  date: new Date().toISOString(),
  host: `${HOST}/?project=${PROJECT}&view=official`,
  loginRequired: false,
  connected: false,
  clicks: [],
};

try {
  await page.goto(`${HOST}/?project=${PROJECT}&view=official`, { waitUntil: "domcontentloaded" });
  await waitConnected(page);
  report.connected = true;
  report.status = await page.locator("#status").innerText();
  report.remoteMethods = await page.evaluate(() => window.oracleCompare?.getStatus?.()?.remoteMethods || []);
  pass(`connected ${report.status}`);

  const frame = await officialFrame(page);
  await page.waitForTimeout(1500);
  await shot(page, "01-idle.png");

  const tree = await dumpTree(frame);
  report.bodyText = tree.bodyText;
  report.controls = tree.items;
  fs.writeFileSync(path.join(OUT, "controls.json"), JSON.stringify(tree.items, null, 2));
  fs.writeFileSync(path.join(OUT, "body-text.txt"), tree.bodyText);
  pass(`dumped ${tree.items.length} clickable nodes`);

  const labels = `${tree.bodyText}\n${tree.items.map((c) => c.text).join("\n")}`;
  for (const lab of ["导出", "分享", "编辑", "批注", "新建页面", "V1"]) {
    if (labels.includes(lab)) pass(`saw ${lab}`);
    else warn(`did not see ${lab}`);
  }

  const clickText = async (name, file, exact = false) => {
    const loc = exact ? frame.getByText(name, { exact: true }) : frame.getByText(name);
    const n = await loc.count();
    if (!n) {
      report.clicks.push({ name, ok: false, reason: "not found" });
      warn(`skip ${name}`);
      return false;
    }
    try {
      await loc.first().click({ timeout: 4000 });
      await page.waitForTimeout(800);
      await shot(page, file);
      report.clicks.push({ name, ok: true, file });
      pass(`clicked ${name}`);
      return true;
    } catch (error) {
      report.clicks.push({ name, ok: false, reason: error.message });
      warn(`click ${name}: ${error.message}`);
      return false;
    }
  };

  await clickText("去试试", "02-dismiss-annot.png", true);
  report.hoverTooltips = await probeHoverTooltips(page, frame);
  fs.writeFileSync(
    path.join(OUT, "hover-tooltips.json"),
    JSON.stringify(report.hoverTooltips, null, 2),
  );
  pass(`recorded ${report.hoverTooltips.length} tooltip/label probes`);
  await clickText("导出", "03-export.png", true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await clickText("分享", "04-share.png", true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await clickText("新建页面", "05-add-page.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await clickText("批注", "06-annot.png", true);
  await clickText("编辑", "07-edit.png", true);

  const box = await frame.locator("body").boundingBox();
  if (box) {
    await frame.locator("body").click({ position: { x: box.width * 0.55, y: box.height * 0.42 } });
    await page.waitForTimeout(700);
    await shot(page, "08-canvas-click.png");
    report.controlsAfterCanvas = (await dumpTree(frame)).items;
  }

  report.notes = [
    "No Kimi account. Parent Penpal setPPTD loads local YAML.",
    "Playwright Frame.getByText / evaluate talks to the cross-origin neo-ppt child.",
  ];
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(`OK    official inventory → ${OUT}`);
} catch (error) {
  report.error = error.message;
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => undefined);
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
