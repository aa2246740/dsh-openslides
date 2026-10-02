import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeImageRebuildDeck,
  detectImageRebuildIntent,
  extractNodesFromText,
} from "./image-rebuild.js";

describe("detectImageRebuildIntent", () => {
  it("detects rebuild keywords + image ref", () => {
    assert.equal(
      detectImageRebuildIntent("Rebuild this image as editable slides", [
        { id: "1", name: "SMART_CONNECTIONS.png", mimeType: "image/png" },
      ]),
      true,
    );
  });

  it("detects image-only short prompt", () => {
    assert.equal(
      detectImageRebuildIntent("", [
        { id: "1", name: "diagram.png", mimeType: "image/png" },
      ]),
      true,
    );
  });

  it("ignores plain research prompt without images", () => {
    assert.equal(
      detectImageRebuildIntent("Write a 10-slide EV market briefing", [
        { id: "1", name: "brief.pdf", mimeType: "application/pdf" },
      ]),
      false,
    );
  });
});

describe("composeImageRebuildDeck", () => {
  it("emits portrait slides with shapes, text, connectors", () => {
    const deck = composeImageRebuildDeck({
      prompt: "Rebuild SMART CONNECTIONS as editable objects",
      references: [
        {
          id: "img1",
          name: "SMART_CONNECTIONS.png",
          mimeType: "image/png",
          text: "Sense\nRoute\nDecide\nAct\nLearn",
          kind: "image",
        },
      ],
    });
    assert.equal(deck.aspectRatio, "portrait");
    assert.ok(deck.slides.length >= 2);
    assert.equal(deck.slides[0]!.size.width, 1080);
    assert.equal(deck.slides[0]!.size.height, 1920);
    const kinds = new Set(deck.slides[0]!.elements.map((e) => e.kind));
    assert.ok(kinds.has("shape"));
    assert.ok(kinds.has("text"));
    assert.ok(kinds.has("connector"));
    assert.equal(deck.meta?.rebuild, "true");
  });

  it("extracts nodes from OCR-ish text", () => {
    const nodes = extractNodesFromText("Alpha\nBeta\nGamma\nDelta", []);
    assert.deepEqual(nodes, ["Alpha", "Beta", "Gamma", "Delta"]);
  });
});
