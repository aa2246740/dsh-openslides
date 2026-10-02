import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.screenshot({ path: "/workspace/screenshots/scene-0-intro.png", fullPage: false });
for (let i = 1; i <= 8; i++) {
  await page.getByRole("button", { name: "Next scene" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/workspace/screenshots/scene-${i}.png`, fullPage: false });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
// jump to editor scene (index 2)
for (let i = 0; i < 2; i++) {
  await page.getByRole("button", { name: "Next scene" }).click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: "/workspace/screenshots/mobile-editor.png", fullPage: false });
console.log(JSON.stringify({ errors, ok: errors.length === 0 }));
await browser.close();
