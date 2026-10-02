#!/usr/bin/env node
/**
 * Browser verification for hub attachments + kind/layout honesty.
 *   node scripts/verify-attachments.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { restartNativeWebServer, waitHealth } from "./qa/gestures.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:55200";
const URL = `${BASE}/hub.html`;
const TMP_MD = "/tmp/oss-attach-2mb.md";
const TMP_PDF = "/tmp/oss-attach-tiny.pdf";

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function writeTmpUploads() {
  const header = "# 大附件进度核验\n松绿主色行\n";
  const need = 2 * 1024 * 1024;
  const pad = "abcdefgh\n".repeat(Math.ceil((need - header.length) / 9));
  fs.writeFileSync(TMP_MD, header + pad.slice(0, need - header.length));
  if (fs.statSync(TMP_MD).size < 1.8 * 1024 * 1024) {
    fail(`2MB fixture too small: ${fs.statSync(TMP_MD).size}`);
  }
  fs.writeFileSync(TMP_PDF, "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
}

function rmTmpUploads() {
  for (const p of [TMP_MD, TMP_PDF]) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* already gone */
    }
  }
}

async function waitChips(page, pred, timeout = 20000) {
  try {
    await page.waitForFunction(pred, null, { timeout });
  } catch (error) {
    const text = await page.locator("#attach-row").innerText().catch(() => "<no attach-row>");
    fail(`${error.message}\nchips: ${JSON.stringify(text)}`);
  }
}

await restartNativeWebServer();
await waitHealth();
writeTmpUploads();
fs.mkdirSync("output", { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#brief");
  await page.click("#btn-attach");
  await page.waitForSelector("#attach-modal:not([hidden])");
  await page.screenshot({ path: "output/qa-attach-modal.png" });
  await page.click("#btn-demo-ref");
  await waitChips(
    page,
    () => {
      const chips = [...document.querySelectorAll("#attach-row .reference-chip")];
      const parsed = chips.filter((c) => /已解析\s*\((\d+)\)/.test(c.textContent || ""));
      if (parsed.length < 2) return false;
      return parsed.every((c) => {
        const m = /已解析\s*\((\d+)\)/.exec(c.textContent || "");
        return m && Number(m[1]) > 10;
      });
    },
  );
  const demoText = await page.locator("#attach-row").innerText();
  if (!/brand-voice\.md/.test(demoText) || !/brand-palette\.md/.test(demoText)) {
    fail(`demo chips missing brand files: ${demoText}`);
  }
  pass("demo brand kit → two 已解析 chips with real char counts");

  await page.click("#btn-attach");
  await page.waitForSelector("#attach-modal:not([hidden])");
  const sawUpload = page.waitForFunction(
    () =>
      [...document.querySelectorAll(".reference-chip")].some((c) => {
        if (/上传中/.test(c.textContent || "")) return true;
        return [...c.querySelectorAll(".chip-progress-bar")].some((b) => {
          const w = parseFloat(String(b.style.width || "0"));
          return Number.isFinite(w) && w >= 0 && w < 100;
        });
      }),
    null,
    { timeout: 8000 },
  );
  await page.setInputFiles("#attach-file", TMP_MD);
  await sawUpload;
  await page.screenshot({ path: "output/qa-attach-uploading.png" });
  pass("2MB .md showed 上传中 / progress width mid-upload");
  // Attachments are parsed only up to ATTACHMENT_TEXT_LIMIT (48 000 chars); a
  // 2MB markdown file is refused with honest copy and a retry, never silently
  // truncated or reported as 已解析.
  await waitChips(
    page,
    () =>
      [...document.querySelectorAll("#attach-row .reference-chip")].some((c) =>
        /oss-attach-2mb\.md/.test(c.textContent || "")
        && /资料超过 48000 字符/.test(c.textContent || "")
        && !/已解析/.test(c.textContent || ""),
      ),
    30000,
  );
  pass("2MB .md refused over the 48k parse limit with honest copy");

  await page.setInputFiles("#attach-file", TMP_PDF);
  // Non-text attachments are refused with the current honest copy: only UTF-8
  // txt / md / csv / tsv / json can be read in full.
  await waitChips(
    page,
    () =>
      [...document.querySelectorAll("#attach-row .reference-chip")].some((c) =>
        /\.pdf/.test(c.textContent || "")
        && /仅能完整读取 UTF-8/.test(c.textContent || "")
        && !/已解析/.test(c.textContent || ""),
      ),
  );
  pass("tiny .pdf refused with the UTF-8-only copy");
  const pdfChip = page.locator("#attach-modal-list .reference-chip", { hasText: ".pdf" }).first();
  await pdfChip.locator("button", { hasText: "×" }).click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("#attach-row .reference-chip")].some((c) =>
        /\.pdf/.test(c.textContent || ""),
      ),
  );
  pass("pdf chip remove works");

  const mdChip = page.locator("#attach-modal-list .reference-chip", { hasText: "oss-attach-2mb.md" }).first();
  await mdChip.locator("button", { hasText: "×" }).click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("#attach-row .reference-chip")].some((c) =>
        /oss-attach-2mb/.test(c.textContent || ""),
      ),
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("attach-modal")?.hidden, null, {
    timeout: 5000,
  });
  const kept = await page.locator("#attach-row .reference-chip").count();
  if (kept < 2) fail(`Esc close dropped completed chips (left ${kept})`);
  pass("Esc close keeps completed chips");

  const retained = await page.locator("#attach-row .reference-chip").allInnerTexts();
  if (!retained.some((text) => /brand-voice\.md/.test(text))) fail("brand voice chip was not retained");
  if (!retained.some((text) => /brand-palette\.md/.test(text))) fail("brand palette chip was not retained");
  pass("parsed attachment chips remain ready for the real Pi request");

  // The 产出类型 selector (#btn-kind) is permanently hidden in the markup: Slides
  // is the only output kind, so the kind / layout menu entry checks were retired
  // with it.

  console.log("OK    verify-attachments");
} finally {
  rmTmpUploads();
  await browser.close();
}
