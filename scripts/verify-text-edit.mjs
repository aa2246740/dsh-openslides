#!/usr/bin/env node
/**
 * Browser verification for native-web inline text edit.
 *   node scripts/verify-text-edit.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import { cleanupFixtures } from "./qa/gestures.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const URL = `${BASE}/index.html?project=fixtures/okp-yu7-ppt`;
const OUT = path.resolve("output/verify-text-edit.png");

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

async function waitReady(page) {
  await page.waitForSelector("#slide .el", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById("doc-title")?.textContent || "";
      return t && t !== "未加载";
    },
    null,
    { timeout: 15000 },
  );
}

async function assertEditing(page, timeout) {
  await page.waitForFunction(
    () => {
      const a = document.activeElement;
      return Boolean(a && a.isContentEditable && a.closest?.("#slide"));
    },
    null,
    { timeout },
  );
}

async function commitOutside(page) {
  await page.evaluate(() => {
    const slide = document.getElementById("slide");
    if (!slide) return;
    slide.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    slide.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () => !document.querySelector("#slide .el.is-editing"),
    null,
    { timeout: 4000 },
  );
  await page.waitForTimeout(250);
}

async function slideHasText(page, text) {
  return page.evaluate((needle) => {
    const slide = document.getElementById("slide");
    return Boolean(slide && slide.innerText.includes(needle));
  }, text);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
// This suite edits the fixture project in place, so snapshot it first and put it
// back afterwards instead of leaving residue for the next run.
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await waitReady(page);
  pass("editor loaded");

  await page.locator('[data-control="insert.text"]').click();
  await assertEditing(page, 4000);
  const insertEditable = await page.evaluate(() => {
    const a = document.activeElement;
    return Boolean(a && a.isContentEditable);
  });
  if (!insertEditable) fail("insert text did not enter contentEditable edit mode");
  pass("insert.text auto-enters edit mode");

  await page.keyboard.type("编辑成功了", { delay: 15 });
  await commitOutside(page);
  pass("insert text committed via click-outside");

  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  if (!(await slideHasText(page, "编辑成功了"))) {
    fail("inserted text '编辑成功了' not persisted after reload");
  }
  pass("inserted text persisted after reload");

  const existing = page.locator("#slide .el.text", { hasText: "编辑成功了" }).first();
  if (!(await existing.count())) fail("could not find persisted text element to double-click");
  await existing.dblclick();
  await assertEditing(page, 500);
  pass("dblclick activates contentEditable within 500ms");

  await page.keyboard.type("追加", { delay: 15 });
  await commitOutside(page);
  pass("dblclick edit committed via click-outside");

  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  if (!(await slideHasText(page, "追加"))) {
    fail("dblclick-typed '追加' not persisted after reload");
  }
  pass("dblclick text persisted after reload");

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`shot  ${OUT}`);
  console.log("OK    verify-text-edit");
} finally {
  await browser.close();
  cleanupFixtures();
}
