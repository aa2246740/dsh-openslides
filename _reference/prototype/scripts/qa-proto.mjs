import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.screenshot({ path: "/workspace/screenshots/proto-create.png" });
await page.getByRole("button", { name: "Generate" }).click();
await page.waitForTimeout(5500);
await page.screenshot({ path: "/workspace/screenshots/proto-agent-or-editor.png" });
// if still agent, wait more for auto open editor
await page.waitForTimeout(2000);
await page.screenshot({ path: "/workspace/screenshots/proto-editor.png" });
// open version via top nav
await page.getByRole("button", { name: "版本" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/proto-version.png" });
console.log(JSON.stringify({ errors, ok: errors.length === 0 }));
await browser.close();
