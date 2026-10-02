import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { launchPinnedChromium } from "../../../scripts/lib/pinned-playwright.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

test("clicking the canvas beside the page clears the selection", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "openslides-blank-deselect-"));
  const project = path.join(scratch, "project");
  fs.mkdirSync(path.join(project, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(project, "deck.pptd"),
    JSON.stringify({
      version: "v2",
      title: "Blank deselect",
      size: [960, 540],
      theme: {},
      pages: ["pages/01.page"],
    }),
  );
  fs.writeFileSync(
    path.join(project, "pages/01.page"),
    JSON.stringify({
      pageType: "cover",
      background: { type: "solid", color: "#FFFFFF" },
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [80, 80, 400, 80],
          content: { text: "选中后点灰底应取消", fontSize: 32 },
        },
      ],
    }),
  );
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      OPEN_SLIDESTUDIO_PROJECT: project,
      SLIDESTUDIO_RETENTION_DAYS: "0",
    },
    stdio: "ignore",
  });
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {
        if (i === 79) throw new Error("Test server failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await launchPinnedChromium({ headless: true });
    const page = await browser.newPage({locale:'zh-CN', viewport: { width: 1440, height: 900 } });
    await page.goto(`${base}/index.html?project=${encodeURIComponent(project)}&workspace=0`, {
      waitUntil: "domcontentloaded",
    });
    const title = page.locator("#slide .el[data-id='title']");
    await title.click();
    await page.waitForFunction(() => document.querySelector("#slide .el.selected"));
    const beside = await page.evaluate(() => {
      const view = document.querySelector("#viewport").getBoundingClientRect();
      const card = document.querySelector(".slide-card").getBoundingClientRect();
      const y = card.bottom + 24;
      if (y >= view.bottom - 4) throw new Error("no grey canvas below the page");
      return { x: (card.left + card.right) / 2, y };
    });
    await page.mouse.click(beside.x, beside.y);
    await page.waitForFunction(() => !document.querySelector("#slide .el.selected"));
    await title.click();
    await page.waitForFunction(() => document.querySelector("#slide .el.selected"));
    const onCard = await page.evaluate(() => {
      const card = document.querySelector(".slide-card").getBoundingClientRect();
      const slide = document.querySelector("#slide").getBoundingClientRect();
      return { x: card.left + 4, y: (slide.top + slide.bottom) / 2 };
    });
    await page.mouse.click(onCard.x, onCard.y);
    await page.waitForFunction(() => !document.querySelector("#slide .el.selected"));
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const done = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await done;
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
