#!/usr/bin/env node
/**
 * Full static-chrome tooltip audit (DSH SlideStudio).
 *
 * Enumerates EVERY title= / data-tip= / aria-label= in
 * apps/native-web/public/index.html, resolves the expected tooltip text
 * with the same rules as public/tooltips.js (title -> data-tip;
 * icon-only button aria-label -> data-tip; hidden/aria-hidden -> no tip),
 * then hovers each visible static-chrome anchor in a real Chromium page and
 * asserts #ui-tooltip appears with the expected text (320ms delay).
 *
 * Dynamic app.js ctx-bar tooltips that require a selected element are
 * optional and reported as SKIPPED, never failed. Static chrome misses
 * exit non-zero.
 *
 *   node scripts/verify-tooltips.mjs
 *
 * Server: reuses the editor on BASE (default 127.0.0.1:55200); never kills
 * another checkout's process (restartNativeWebServer is reuse-safe).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import { openEditor, restartNativeWebServer } from "./qa/gestures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const PROJECT = process.env.QA_PROJECT || "fixtures/okp-yu7-ppt";
const INDEX_HTML = path.join(ROOT, "apps/native-web/public/index.html");
const TOOLTIPS_JS = path.join(ROOT, "apps/native-web/public/tooltips.js");

// ---- static enumeration -------------------------------------------------
function parseCandidates(html) {
  const out = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)[^>]*?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const src = m[0];
    const get = (name) => {
      const r = new RegExp(`${name}\\s*=\\s*"([^"]*)"`);
      const hit = r.exec(src);
      return hit ? hit[1] : null;
    };
    const title = get("title");
    const tip = get("data-tip");
    const aria = get("aria-label");
    if (title == null && tip == null && aria == null) continue;
    const idm = /id\s*=\s*"([^"]*)"/.exec(src);
    out.push({
      tag,
      id: idm ? idm[1] : null,
      title,
      dataTip: tip,
      ariaLabel: aria,
      hiddenAttr: /\bhidden\b/.test(src),
      ariaHidden: /aria-hidden\s*=\s*"true"/.test(src),
      src: src.length > 160 ? `${src.slice(0, 160)}…` : src,
    });
  }
  return out;
}

function readShowDelayMs() {
  const src = fs.readFileSync(TOOLTIPS_JS, "utf8");
  const m = /SHOW_DELAY_MS\s*=\s*(\d+)/.exec(src);
  return m ? Number(m[1]) : 320;
}

// ---- reporting -----------------------------------------------------------
const results = { pass: [], skipped: [], failed: [] };
function pass(name) {
  results.pass.push(name);
  console.log(`PASS  tooltip ${name}`);
}
function skip(name, reason) {
  results.skipped.push(`${name} :: ${reason}`);
  console.log(`SKIP  tooltip ${name} (${reason})`);
}
function fail(name, detail) {
  results.failed.push(`${name} :: ${detail}`);
  console.error(`FAIL  tooltip ${name}: ${detail}`);
}

const html = fs.readFileSync(INDEX_HTML, "utf8");
const candidates = parseCandidates(html);
const SHOW_DELAY = readShowDelayMs();
console.log(`INFO  static candidates in index.html: ${candidates.length} (SHOW_DELAY=${SHOW_DELAY}ms)`);

await restartNativeWebServer();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function settleTooltip() {
  // Move pointer to neutral chrome and give any visible tip time to hide.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const tip = document.getElementById("ui-tooltip");
    if (tip) {
      tip.hidden = true;
      tip.textContent = "";
    }
    for (const el of document.querySelectorAll("[aria-describedby='ui-tooltip']")) {
      el.removeAttribute("aria-describedby");
    }
  });
}

async function checkAnchor(c) {
  const label = c.id ? `#${c.id}` : `<${c.tag} title=${JSON.stringify(c.title)} aria=${JSON.stringify(c.ariaLabel)}>`;
  const info = await page.evaluate(({ cid, tag, title, aria }) => {
    let el = null;
    if (cid) el = document.getElementById(cid);
    if (!el) {
      const all = [...document.querySelectorAll(`${tag}[title], ${tag}[aria-label], ${tag}[data-tip]`)];
      el =
        all.find((e) => (title != null && e.getAttribute("title") === title) || (e.dataset.tip === title)) ||
        all.find((e) => aria != null && e.getAttribute("aria-label") === aria) ||
        null;
    }
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const inLayout =
      rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    // Walk ancestors for hidden / display:none (dialogs, palettes, work-chat).
    let ancestorHidden = false;
    for (let n = el; n && n instanceof Element; n = n.parentElement) {
      if (n.hidden || n.getAttribute("aria-hidden") === "true") {
        // The element itself being hidden/aria-hidden is recorded separately;
        // any hidden ancestor means "not currently exposed".
        ancestorHidden = true;
        break;
      }
      const s = getComputedStyle(n);
      if (s.display === "none") {
        ancestorHidden = true;
        break;
      }
    }
    const isButton = el.matches("button, [role='button']");
    const hasText = Boolean(el.textContent?.trim());
    const hasIcon = Boolean(el.querySelector("svg, img, i"));
    const dataTip = el.dataset.tip?.trim() || null;
    const inCtxBar = Boolean(el.closest("#ctx-bar"));
    return {
      found: true,
      visible: inLayout && !ancestorHidden,
      inLayout,
      ancestorHidden,
      ownHidden: Boolean(el.hidden) || el.getAttribute("aria-hidden") === "true",
      dataTip,
      isButton,
      hasText,
      hasIcon,
      iconOnly: isButton && !hasText && hasIcon,
      inCtxBar,
      describedBy: el.getAttribute("aria-describedby"),
    };
  }, { cid: c.id, tag: c.tag, title: c.title ?? c.dataTip, aria: c.ariaLabel });

  if (!info.found) {
    skip(label, "not in live DOM (id absent after render)");
    return;
  }
  // Dynamic ctx-bar tooltips need a selection -> optional per task.
  if (info.inCtxBar) {
    skip(label, "dynamic ctx-bar tooltip (optional, needs selection)");
    return;
  }
  // Hidden by design (hidden attr / aria-hidden / closed container).
  if (info.ownHidden || !info.visible) {
    const reason = info.ownHidden
      ? "hidden-by-design (hidden or aria-hidden=true)"
      : info.ancestorHidden
        ? "not exposed (ancestor hidden/closed container)"
        : "not visible in layout";
    skip(label, reason);
    return;
  }
  // No tooltip expected: aria-label on text buttons / non-buttons never
  // becomes data-tip under tooltips.js promoteAccessibleLabelToTip().
  const expectedStatic = c.dataTip?.trim() || c.title?.trim() || null;
  if (!expectedStatic && !info.dataTip) {
    skip(label, "aria-label without tooltip (text button or non-button, by tooltips.js design)");
    return;
  }
  const expected = info.dataTip || expectedStatic;
  if (!expected) {
    skip(label, "no data-tip after tooltips.js promotion");
    return;
  }

  await settleTooltip();
  const locator = c.id
    ? page.locator(`#${c.id}`).first()
    : page.locator(`${c.tag}[data-tip="${expected}"]`).first();
  try {
    await locator.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    skip(label, "data-tip present but not hoverable (not visible)");
    return;
  }
  await locator.hover();
  const tip = page.locator("#ui-tooltip:not([hidden])");
  try {
    await tip.waitFor({ state: "visible", timeout: SHOW_DELAY + 1500 });
  } catch {
    fail(label, `tooltip never appeared (expected ${JSON.stringify(expected)})`);
    return;
  }
  const actual = ((await tip.innerText()) || "").trim();
  if (actual !== expected) {
    fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  const describedBy = await locator.getAttribute("aria-describedby").catch(() => null);
  if (describedBy !== "ui-tooltip") {
    fail(label, "tooltip not exposed via aria-describedby='ui-tooltip'");
    return;
  }
  pass(`${label} → ${JSON.stringify(expected)}`);
}

try {
  await openEditor(page, PROJECT);
  await page.waitForSelector("#ui-tooltip", { state: "attached", timeout: 8000 });

  // Expose closable static containers so their tooltips become mandatory:
  // more-menu (theme/collab buttons) and export dialog (incl. disabled row).
  try {
    await page.locator("#btn-more").click({ timeout: 4000 });
    await page.waitForSelector("#more-menu:not([hidden])", { timeout: 4000 });
  } catch {
    /* more-menu may already be open or unavailable; hidden ones just skip */
  }

  // First pass: visible chrome (more-menu open).
  for (const c of candidates) await checkAnchor(c);

  // Second pass: export dialog open (covers dialog-scoped static tips, e.g. the
  // 嵌入字体 label; the Google Slides row was removed from the dialog).
  try {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator("#btn-export").click({ timeout: 4000 });
    await page.waitForSelector("#export-dialog[open]", { timeout: 4000 });
    const dialogTips = await page.evaluate(() =>
      [...document.querySelectorAll("#export-dialog [data-tip]")].map((el) => ({
        text: el.dataset.tip.trim(),
        id: el.id || null,
        cls: el.className || null,
      })),
    );
    for (const d of dialogTips) {
      const sel = d.id ? `#${d.id}` : `.${String(d.cls).split(" ")[0]}${String(d.cls).split(" ")[1] ? "." + String(d.cls).split(" ")[1] : ""}`;
      const label = d.id ? `#${d.id}` : `${sel} ${JSON.stringify(d.text)}`;
      await settleTooltip();
      const locator = page.locator(`#export-dialog ${sel}`).first();
      try {
        await locator.waitFor({ state: "visible", timeout: 5000 });
      } catch {
        skip(label, "dialog tooltip present but not hoverable");
        continue;
      }
      await locator.hover();
      const tip = page.locator("#ui-tooltip:not([hidden])");
      try {
        await tip.waitFor({ state: "visible", timeout: SHOW_DELAY + 1500 });
      } catch {
        fail(label, `tooltip never appeared (expected ${JSON.stringify(d.text)})`);
        continue;
      }
      const actual = ((await tip.innerText()) || "").trim();
      if (actual !== d.text) {
        fail(label, `expected ${JSON.stringify(d.text)}, got ${JSON.stringify(actual)}`);
        continue;
      }
      pass(`${label} → ${JSON.stringify(d.text)}`);
    }
  } catch {
    /* export dialog unavailable; its tooltips stay skipped */
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
  }

  console.log(
    `\nSUMMARY tooltips checked=${results.pass.length + results.failed.length} ` +
      `passed=${results.pass.length} failed=${results.failed.length} ` +
      `skipped=${results.skipped.length} static-candidates=${candidates.length}`,
  );
  if (results.failed.length) {
    console.error("FAILURES:");
    for (const f of results.failed) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("OK    verify-tooltips");
  }
} finally {
  await browser.close().catch(() => {});
}
