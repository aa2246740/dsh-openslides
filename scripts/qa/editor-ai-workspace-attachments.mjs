#!/usr/bin/env node
/**
 * Editor Agent attachment acceptance.
 * Proves the composer uses its own text-data input, uploads real context,
 * paints a removable pending chip, survives refresh, and deletes exactly the
 * removed upload. It intentionally does not claim image/Office support.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { openEditor, BASE } from "./gestures.mjs";

const PROJECT = process.env.QA_PROJECT || "fixtures/okp-yu7-ppt";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-attachment-"));
const sample = path.join(scratch, "agent-facts.md");
fs.writeFileSync(sample, "# Agent facts\nRevenue: 42\n", "utf8");

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await openEditor(page, PROJECT);
  const plus = page.locator("#composer-plus");
  assert.match(await plus.getAttribute("aria-label"), /TXT.*Markdown.*CSV.*TSV.*JSON/);

  const input = page.locator("#agent-attachment-file");
  assert.equal(await input.count(), 1, "Agent must own a separate attachment input");
  assert.match(await input.getAttribute("accept"), /\.md/);
  assert.doesNotMatch(await input.getAttribute("accept"), /image/);
  assert.equal(await page.locator("#image-file").getAttribute("accept"), "image/*", "canvas image picker remains separate");

  await input.setInputFiles(sample);
  await page.waitForFunction(() => document.querySelectorAll("#agent-attachments .agent-attachment-chip").length === 1);
  const chip = page.locator("#agent-attachments .agent-attachment-chip");
  assert.match(await chip.innerText(), /agent-facts\.md/);
  const id = await chip.getAttribute("data-attachment-id");
  assert.ok(id);

  const context = await page.evaluate(async (attachmentId) => {
    const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}`);
    return { status: response.status, body: await response.json() };
  }, id);
  assert.equal(context.status, 200);
  assert.equal(context.body.parsed, true);
  assert.match(context.body.text, /Revenue: 42/);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("doc-title")?.textContent !== "未加载");
  assert.equal(await page.locator("#agent-attachments .agent-attachment-chip").count(), 1, "pending attachment survives refresh");

  await page.locator("#btn-sparkles").click();
  await page.locator("#agent-attachments .agent-attachment-chip button").click();
  await page.waitForFunction(() => document.querySelectorAll("#agent-attachments .agent-attachment-chip").length === 0);
  const deletedStatus = await page.evaluate(async (attachmentId) => (await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}`)).status, id);
  assert.equal(deletedStatus, 404);

  console.log("PASS composer label and accept list state supported text-data formats");
  console.log("PASS dedicated Agent input never reuses the canvas image picker");
  console.log("PASS upload context, pending chip, refresh restore, and exact deletion");
  console.log("OK    editor-ai-workspace-attachments");
} catch (error) {
  console.error(`FAIL editor-ai-workspace-attachments: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => undefined);
  fs.rmSync(scratch, { recursive: true, force: true });
  await fetch(`${BASE}/api/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: PROJECT, page: 0 }),
  }).catch(() => undefined);
}
