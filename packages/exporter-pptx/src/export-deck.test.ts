import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportDeckToPptx, exportDeckToArrayBuffer } from "./export-deck.js";
import { createSampleDeck, TINY_PNG_DATA_URL } from "./sample-deck.js";
import type { Deck } from "./types.js";
import { normalizeHexColor } from "./style.js";
import { pxBoxToInches, buildSlideLayout } from "./geometry.js";
import { createSampleResearchDeck } from "@open-slidestudio/pptd";

describe("normalizeHexColor", () => {
  it("accepts #RGB and #RRGGBB", () => {
    assert.equal(normalizeHexColor("#abc"), "AABBCC");
    assert.equal(normalizeHexColor("#4D9CFF"), "4D9CFF");
    assert.equal(normalizeHexColor("111"), "111111");
  });

  it("parses rgb()", () => {
    assert.equal(normalizeHexColor("rgb(77, 156, 255)"), "4D9CFF");
  });
});

describe("geometry", () => {
  it("maps 1920×1080 box to 16:9 inches", () => {
    const deck = createSampleDeck();
    const slide = deck.slides[0]!;
    const layout = buildSlideLayout(slide, deck);
    const box = pxBoxToInches(
      { x: 0, y: 0, width: 1920, height: 1080 },
      layout,
    );
    assert.ok(Math.abs(box.w - 10) < 0.001);
    assert.ok(Math.abs(box.h - 5.625) < 0.001);
  });
});

describe("exportDeckToPptx", () => {
  it("exports sample deck to arraybuffer with report", async () => {
    const deck = createSampleDeck();
    const result = await exportDeckToArrayBuffer(deck);

    assert.equal(
      result.mimeType,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    assert.match(result.filename, /\.pptx$/i);
    assert.equal(result.outputType, "arraybuffer");
    assert.ok(result.data instanceof ArrayBuffer);
    assert.ok((result.data as ArrayBuffer).byteLength > 1000);

    const bytes = new Uint8Array(result.data as ArrayBuffer);
    assert.equal(bytes[0], 0x50); // P
    assert.equal(bytes[1], 0x4b); // K — ZIP

    assert.equal(result.report.deckId, deck.id);
    assert.equal(result.report.slideCount, 3);
    assert.ok(result.report.elementCounts.text >= 1);
    assert.ok(result.report.elementCounts.shape >= 1);
    assert.ok(result.report.elementCounts.table >= 1);
    assert.ok(result.report.elementCounts.chart >= 1);
    assert.ok(result.report.elementCounts.image >= 1);
    assert.ok(result.report.elementCounts.smartArt >= 1);

    const missing = result.report.degradations.find(
      (d) => d.kind === "missing-image",
    );
    assert.ok(missing, "expected missing-image degradation");

    const smart = result.report.degradations.find(
      (d) => d.kind === "smartart-as-shapes",
    );
    assert.ok(smart, "expected smartart-as-shapes degradation");
  });

  it("throws on invalid deck", async () => {
    await assert.rejects(
      async () => exportDeckToPptx(null as unknown as Deck),
      /deck is required/,
    );
    await assert.rejects(
      async () =>
        exportDeckToPptx({ id: "x", title: "t" } as unknown as Deck),
      /slides/,
    );
  });

  it("handles empty slides list", async () => {
    const base = createSampleDeck();
    const deck: Deck = {
      ...base,
      id: "empty",
      title: "Empty",
      slides: [],
    };
    const result = await exportDeckToPptx(deck, { output: "arraybuffer" });
    assert.ok(result.data instanceof ArrayBuffer);
    assert.equal(result.report.slideCount, 1);
    assert.ok(result.report.warnings.some((w) => /no slides/i.test(w)));
  });

  it("exports multi-slide research deck with object coverage report (Gate1 PPTX)", async () => {
    const deck = createSampleResearchDeck("Q3 区域增长决策材料");
    const result = await exportDeckToArrayBuffer(deck);
    assert.ok((result.data as ArrayBuffer).byteLength > 2000);
    assert.ok(result.report.slideCount >= 5);
    assert.ok(result.report.nativeCoverage > 0);
    assert.ok(result.report.elementCounts.text >= 1);
    assert.ok(result.report.elementCounts.chart >= 1);
    // Fidelity report surfaces degradations rather than silent success
    assert.ok(Array.isArray(result.report.degradations));
    assert.ok(Array.isArray(result.report.warnings));
  });

  it("exports image with data URL successfully", async () => {
    const base = createSampleDeck();
    const deck: Deck = {
      ...base,
      id: "img-only",
      title: "Img",
      slides: [
        {
          id: "s1",
          order: 0,
          size: { width: 1920, height: 1080 },
          background: { type: "solid", color: "#FFFFFF" },
          elements: [
            {
              id: "i1",
              kind: "image",
              x: 100,
              y: 100,
              width: 400,
              height: 300,
              rotation: 0,
              opacity: 1,
              zIndex: 0,
              src: TINY_PNG_DATA_URL,
            },
          ],
        },
      ],
    };
    const result = await exportDeckToPptx(deck, { output: "uint8array" });
    assert.equal(result.report.elementCounts.image, 1);
    assert.equal(
      result.report.degradations.filter((d) => d.kind === "missing-image")
        .length,
      0,
    );
    assert.ok(result.data instanceof Uint8Array);
  });
});
