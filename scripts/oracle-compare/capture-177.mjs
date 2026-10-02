import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const out = path.resolve("docs/editor-oracle/runs/iframe-compare");
fs.mkdirSync(out, { recursive: true });

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:55180/?project=syn-shapes-177", { waitUntil: "networkidle" });
await page.waitForSelector("#pager button");
try {
  await page.waitForFunction(
    () => /官方已连接|已连接/.test(document.getElementById("status")?.textContent || ""),
    { timeout: 25000 },
  );
} catch {
  console.log("status", await page.locator("#status").textContent());
}
await page.waitForTimeout(4000);

const scores = [];
for (let i = 0; i < 9; i++) {
  await page.locator("#pager button").nth(i).click();
  await page.waitForTimeout(3500);
  const name = `177-p${i + 1}-synced.png`;
  await page.screenshot({ path: path.join(out, name), fullPage: false });
  const official = path.join(out, `177-p${i + 1}-official.png`);
  const native = path.join(out, `177-p${i + 1}-native.png`);
  await page.locator('.pane[data-side="official"] .stage').screenshot({ path: official });
  await page.locator('.pane[data-side="native"] .stage').screenshot({ path: native });
  console.log("shot", name);
}

await browser.close();

const py = `
from pathlib import Path
from PIL import Image
import json
root = Path("docs/editor-oracle/runs/iframe-compare")
rows = []
for i in range(1,10):
    a = Image.open(root/f"177-p{i}-official.png").convert("L").resize((240,135))
    b = Image.open(root/f"177-p{i}-native.png").convert("L").resize((240,135))
    pa, pb = list(a.getdata()), list(b.getdata())
    # silhouette: ink vs paper
    ta = [1 if p < 245 else 0 for p in pa]
    tb = [1 if p < 245 else 0 for p in pb]
    same = sum(1 for x,y in zip(ta,tb) if x==y)
    score = same / len(ta)
    rows.append({"page": i, "silhouette": round(score, 4)})
print(json.dumps({"pages": rows, "mean": round(sum(r["silhouette"] for r in rows)/len(rows), 4)}, indent=2))
`
const r = spawnSync("python3", ["-c", py], { encoding: "utf8", cwd: path.resolve(".") });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(r.status || 1);
}
const metric = r.stdout.trim();
console.log(metric);
fs.writeFileSync(path.join(out, "177-silhouette.json"), metric + "\n");
