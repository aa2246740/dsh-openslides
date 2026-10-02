#!/usr/bin/env node
/**
 * Dev-only: A/B official neo-ppt iframe vs native for generated direction decks.
 * Requires compare host: npm run oracle:compare
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";

const OUT = path.resolve("docs/editor-oracle/runs/iframe-compare/ab-generate");
const HOST = process.env.ORACLE_COMPARE_URL || "http://127.0.0.1:55180";
const PROJECTS = [
  { id: "ab-consulting", pages: [0, 3] },
  { id: "ab-academic", pages: [0, 3] },
  { id: "ab-promo", pages: [0, 3] },
  { id: "ab-work", pages: [0, 3] },
];
fs.mkdirSync(OUT, { recursive: true });

const health = await fetch(`${HOST}/api/health`)
  .then((response) => response.text())
  .catch(() => "");
if (!/oracle-compare/.test(health)) throw new Error(`compare host not up at ${HOST}`);

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  const summary = [];
  for (const project of PROJECTS) {
    await page.goto(`${HOST}/?project=${project.id}`, { waitUntil: "domcontentloaded" });
    const connected = await page.waitForFunction(
      () => {
        const status = document.getElementById("status")?.textContent || "";
        if (/官方已连接|已对照/.test(status)) return { ok: true, status };
        if (/官方连接失败|无法连接/.test(status)) return { ok: false, status };
        return null;
      },
      null,
      { timeout: 45000 },
    );
    const connectedValue = await connected.jsonValue();
    if (!connectedValue?.ok) throw new Error(`${project.id}: ${connectedValue?.status || "not connected"}`);
    console.log("connect", project.id, connectedValue);
    await page.waitForTimeout(3500);

    for (const pageIndex of project.pages) {
      if (pageIndex > 0) {
        await page.evaluate((index) => window.oracleCompare.loadPage(index), pageIndex);
        await page.waitForTimeout(3500);
      }
      const stem = `${project.id}-p${pageIndex + 1}`;
      await page.screenshot({ path: path.join(OUT, `${stem}-full.png`), fullPage: false });
      await page
        .locator('.pane[data-side="official"] .stage')
        .screenshot({ path: path.join(OUT, `${stem}-official.png`) });
      await page
        .locator('.pane[data-side="native"] .stage')
        .screenshot({ path: path.join(OUT, `${stem}-native.png`) });

      const status = await page.evaluate(() => ({
        status: document.getElementById("status")?.textContent || "",
        overlay: document.getElementById("official-overlay")?.textContent || "",
        hidden: document.getElementById("official-overlay")?.classList.contains("is-hidden"),
        compare: window.oracleCompare?.getStatus?.() || null,
      }));
      console.log("shot", stem, "parent-stage", status);
      summary.push({
        project: project.id,
        page: pageIndex + 1,
        officialSource: "parent-stage",
        status: status.status,
        overlay: status.overlay,
        overlayHidden: status.hidden,
        compare: status.compare,
      });
    }
  }

  fs.writeFileSync(path.join(OUT, "capture-log.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const py = `
from pathlib import Path
from PIL import Image
import json
root = Path(${JSON.stringify(OUT)})
rows = []
for stem in [
    "ab-consulting-p1", "ab-consulting-p4",
    "ab-academic-p1", "ab-academic-p4",
    "ab-promo-p1", "ab-promo-p4",
    "ab-work-p1", "ab-work-p4",
]:
    a_path = root / f"{stem}-official.png"
    b_path = root / f"{stem}-native.png"
    if not a_path.exists() or not b_path.exists():
        rows.append({"stem": stem, "silhouette": None, "reason": "missing"})
        continue
    a = Image.open(a_path).convert("L").resize((240, 135))
    b = Image.open(b_path).convert("L").resize((240, 135))
    pa, pb = list(a.getdata()), list(b.getdata())
    ta = [1 if p < 245 else 0 for p in pa]
    tb = [1 if p < 245 else 0 for p in pb]
    score = sum(1 for x, y in zip(ta, tb) if x == y) / len(ta)
    oa = Image.open(a_path).convert("RGB")
    ob = Image.open(b_path).convert("RGB")
    h = 360
    oa = oa.resize((int(oa.width * h / oa.height), h))
    ob = ob.resize((int(ob.width * h / ob.height), h))
    canvas = Image.new("RGB", (oa.width + ob.width + 16, h), (238, 243, 239))
    canvas.paste(oa, (0, 0))
    canvas.paste(ob, (oa.width + 16, 0))
    canvas.save(root / f"{stem}-ab.png")
    rows.append({"stem": stem, "silhouette": round(score, 4), "official": a_path.name, "native": b_path.name})
valid = [r["silhouette"] for r in rows if r.get("silhouette") is not None]
print(json.dumps({"pages": rows, "mean": round(sum(valid)/len(valid), 4) if valid else None}, indent=2))
`;
  const result = spawnSync("python3", ["-c", py], {
    encoding: "utf8",
    cwd: path.resolve("."),
  });
  if (result.status !== 0) {
    console.warn("silhouette skipped:", (result.stderr || result.stdout || "").trim());
    for (const stem of [
      "ab-consulting-p1",
      "ab-consulting-p4",
      "ab-academic-p1",
      "ab-academic-p4",
      "ab-promo-p1",
      "ab-promo-p4",
      "ab-work-p1",
      "ab-work-p4",
    ]) {
      const full = path.join(OUT, `${stem}-full.png`);
      const ab = path.join(OUT, `${stem}-ab.png`);
      if (fs.existsSync(full)) fs.copyFileSync(full, ab);
    }
  } else {
    const metric = result.stdout.trim();
    console.log(metric);
    fs.writeFileSync(path.join(OUT, "silhouette.json"), `${metric}\n`);
  }
} finally {
  await browser.close();
}
