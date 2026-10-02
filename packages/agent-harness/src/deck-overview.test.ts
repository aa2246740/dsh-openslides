import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { renderDeckOverview, type DeckOverviewPage } from "./deck-overview.js";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function sha(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oss-deck-overview-"));
  const rasterDir = path.join(projectRoot, "_agent", "rasters");
  fs.mkdirSync(rasterDir, { recursive: true });
  const pages: DeckOverviewPage[] = ["page-01", "page-02"].map((pageId, index) => {
    const rasterSrc = `_agent/rasters/${pageId}.png`;
    fs.writeFileSync(path.join(projectRoot, rasterSrc), tinyPng);
    return {
      pageId,
      revision: 1,
      pageSha256: sha(Buffer.from(`${pageId}-page`)),
      rasterSha256: sha(tinyPng),
      rasterSrc,
    };
  });
  return { projectRoot, pages };
}

describe("deck overview", () => {
  it("builds one neutral, ordered contact sheet and replays the same snapshot", async () => {
    const { projectRoot, pages } = fixture();
    let seenHtml = "";
    const renderer = async ({ html }: { html: string }) => {
      seenHtml = html;
      return { bytes: tinyPng, width: 1480, height: 540 };
    };
    const deckSnapshotSha256 = "c".repeat(64);
    const first = await renderDeckOverview({ projectRoot, pages, deckSnapshotSha256, renderer });
    const second = await renderDeckOverview({ projectRoot, pages, deckSnapshotSha256, renderer });
    assert.equal(first.sha256, second.sha256);
    assert.match(seenHtml, /P1/);
    assert.match(seenHtml, /P2/);
    assert.ok(seenHtml.indexOf("page-01") < seenHtml.indexOf("page-02"));
    assert.ok(fs.existsSync(path.join(projectRoot, first.src)));
  });

  it("rejects stale raster bytes and has no browser fallback when the pin is missing", async () => {
    const { projectRoot, pages } = fixture();
    const stale = [{ ...pages[0]!, rasterSha256: "d".repeat(64) }, pages[1]!];
    await assert.rejects(
      () =>
        renderDeckOverview({
          projectRoot,
          pages: stale,
          deckSnapshotSha256: "e".repeat(64),
          renderer: async () => ({ bytes: tinyPng, width: 1480, height: 540 }),
        }),
      /raster hash mismatch/,
    );
    await assert.rejects(
      () =>
        renderDeckOverview({
          projectRoot,
          pages,
          deckSnapshotSha256: "f".repeat(64),
          pinnedRuntimePath: path.join(projectRoot, "missing-runtime.mjs"),
        }),
      /Pinned Playwright runtime is missing/,
    );
  });
});
