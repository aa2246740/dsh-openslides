import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.QA_PORT || 55487);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.QA_OUT ? path.resolve(process.env.QA_OUT) : null;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "oss-editor-transaction-faults-"));
let serverLog = "";
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start on ${BASE}\n${serverLog}`);
}

function copyProject(name) {
  const project = path.join(scratch, name);
  fs.cpSync(path.join(ROOT, "fixtures/okp-yu7-ppt"), project, { recursive: true });
  return project;
}

async function rawModel(page) {
  return page.evaluate(async () => (await fetch("/api/model")).json());
}

async function openProject(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(
    `${BASE}/index.html?project=${encodeURIComponent(copyProject(name))}&page=0`,
    { waitUntil: "networkidle" },
  );
  return page;
}

let browser;
const report = {};
try {
  await waitHealth();
  browser = await launchPinnedChromium({ headless: true });

  {
    const page = await openProject(browser, "text-save-failure");
    const commands = [];
    const pageErrors = [];
    let rejected = false;
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.route("**/api/command", async (route) => {
      const body = route.request().postDataJSON();
      commands.push(body.cmd);
      if (!rejected && body.cmd === "setRichText") {
        rejected = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"error":"INJECTED_SAVE_FAILURE"}',
        });
      } else {
        await route.continue();
      }
    });
    const text = page.locator("#slide .el.text").first();
    const textId = await text.getAttribute("data-id");
    assert.ok(textId, "edited text element must expose its model id");
    await text.dblclick();
    await page.keyboard.press("Meta+A");
    await page.keyboard.type("UNSAVED_SENTINEL");
    await page.locator("#rail .thumb").nth(1).click();
    await page.waitForTimeout(500);
    assert.equal((await rawModel(page)).model.pageIndex, 0, "failed text save must block navigation");
    assert.match(await text.innerText(), /UNSAVED_SENTINEL/, "failed text stays editable for retry");
    assert.equal(commands.includes("goToPage"), false, "blocked navigation must not reach the server");
    assert.deepEqual(pageErrors, [], "handled save failure must not become an unhandled page error");

    await page.locator("#rail .thumb").nth(1).click();
    await page.waitForTimeout(600);
    assert.equal((await rawModel(page)).model.pageIndex, 1, "second navigation retries and then proceeds");
    await page.locator("#rail .thumb").nth(0).click();
    await page.waitForTimeout(300);
    const saved = await rawModel(page);
    const retriedText = saved.model.elements.find((element) => element.id === textId)?.text;
    assert.equal(retriedText, "UNSAVED_SENTINEL");
    report.rejectedTextSave = { commands, pageErrors, retriedText };
    await page.close();
  }

  {
    const page = await openProject(browser, "notes-save-failure");
    const commands = [];
    const pageErrors = [];
    let rejected = false;
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.route("**/api/command", async (route) => {
      const body = route.request().postDataJSON();
      commands.push(body.cmd);
      if (!rejected && body.cmd === "setNotes") {
        rejected = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"error":"INJECTED_NOTES_FAILURE"}',
        });
      } else {
        await route.continue();
      }
    });
    await page.locator("#btn-notes-link").click();
    await page.locator("#notes-text").fill("UNSAVED_NOTES_SENTINEL");
    await page.locator("#rail .thumb").nth(1).click();
    await page.waitForTimeout(400);
    assert.equal((await rawModel(page)).model.pageIndex, 0, "failed notes save must block navigation");

    await page.locator("#rail .thumb").nth(1).click();
    await page.waitForTimeout(600);
    assert.equal((await rawModel(page)).model.pageIndex, 1, "second navigation retries notes then proceeds");
    await page.locator("#rail .thumb").nth(0).click();
    await page.waitForTimeout(300);
    const saved = await rawModel(page);
    assert.equal(saved.model.notes, "UNSAVED_NOTES_SENTINEL", "retry persists the retained notes buffer");
    assert.deepEqual(pageErrors, [], "handled notes failure must not become an unhandled page error");
    report.rejectedNotesSave = { commands, pageErrors, retriedNotes: saved.model.notes };
    await page.close();
  }

  {
    const page = await openProject(browser, "pending-navigation-target");
    const commands = [];
    let delayed = false;
    await page.route("**/api/command", async (route) => {
      const body = route.request().postDataJSON();
      commands.push({ cmd: body.cmd, pageIndex: body.pageIndex });
      if (!delayed && body.cmd === "goToPage") {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });
    await page.locator("#btn-notes-link").click();
    await page.locator("#rail .thumb").nth(1).click();
    await page.waitForTimeout(80);
    await page.locator("#notes-text").fill("PENDING_NAV_SENTINEL");
    await page.locator("#btn-export").click();
    await page.waitForTimeout(1000);
    const pageTwo = await rawModel(page);
    assert.notEqual(pageTwo.model.notes, "PENDING_NAV_SENTINEL", "captured page-0 notes must not land on page 1");
    await page.locator("#export-dialog").evaluate((dialog) => dialog.open && dialog.close());
    await page.locator("#rail .thumb").nth(0).click();
    await page.waitForTimeout(300);
    const pageOne = await rawModel(page);
    assert.equal(pageOne.model.notes, "PENDING_NAV_SENTINEL", "captured notes persist to their original page");
    assert.ok(
      commands.some((entry) => entry.cmd === "setNotes" && entry.pageIndex === 0),
      "setNotes must carry the capture-time page index",
    );
    report.pendingNavigationTarget = {
      commands,
      pageOneNotes: pageOne.model.notes,
      pageTwoNotes: pageTwo.model.notes,
    };
    await page.close();
  }

  report.ok = true;
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => undefined);
  server.kill("SIGTERM");
  fs.rmSync(scratch, { recursive: true, force: true });
}
