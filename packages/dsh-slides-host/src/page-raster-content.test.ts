import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pageRasterModelContent, renderPageToolContent, shouldAttachPageRaster } from "./page-raster-content.js";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

describe("Grok review_page raster image parts", () => {
  it("attaches a PNG image part for grok-4.6 main-model vision, not JSON-only", () => {
    const json = { ok: true, payload: { pageId: "1_cover", rasterSha256: "ab".repeat(32) } };
    const parts = pageRasterModelContent({ json, pngBytes: PNG, visionMode: "main-model" });
    assert.equal(shouldAttachPageRaster({ visionMode: "main-model", pngBytes: PNG }), true);
    assert.equal(parts.some((part) => part.type === "image"), true);
    const image = parts.find((part) => part.type === "image");
    assert.ok(image);
    assert.equal(image.type, "image");
    if (image.type === "image") {
      assert.equal(image.mediaType, "image/png");
      assert.equal(image.data, PNG.toString("base64"));
    }
  });

  it("stays JSON-only when vision is none or the raster is missing", () => {
    const json = { ok: true, payload: { pageId: "1_cover" } };
    const none = pageRasterModelContent({ json, pngBytes: PNG, visionMode: "none" });
    const missing = pageRasterModelContent({ json, visionMode: "main-model" });
    assert.deepEqual(
      none.map((part) => part.type),
      ["text"],
    );
    assert.deepEqual(
      missing.map((part) => part.type),
      ["text"],
    );
    assert.equal(shouldAttachPageRaster({ visionMode: "main-model" }), false);
  });

  it("review_page projects the same raster image part onto the Grok request", () => {
    const json = {
      ok: true,
      summary: "1_cover pass",
      payload: { pageId: "1_cover", verdict: "pass" },
      image: {
        attachmentId: "sha256:review-raster",
        mediaType: "image/png",
        bytes: PNG.length,
        name: "1_cover.png",
      },
    };
    const blocks = renderPageToolContent(json);
    assert.equal(blocks.some((block) => block.type === "image"), true);
    const image = blocks.find((block) => block.type === "image");
    assert.ok(image && image.type === "image" && "attachment" in image);
    assert.equal(image.attachment.attachmentId, "sha256:review-raster");
    const text = blocks[0] && blocks[0].type === "text" ? blocks[0].text : "";
    assert.match(text, /1_cover/);
    assert.doesNotMatch(text, /sha256:review-raster/);
  });

  it("projects a saved DSH attachment onto the Grok-facing tool result", () => {
    const blocks = renderPageToolContent({
      ok: true,
      payload: { pageId: "1_cover" },
      image: {
        attachmentId: "sha256:deadbeef",
        mediaType: "image/png",
        bytes: 128,
        width: 960,
        height: 540,
        name: "1_cover.png",
      },
    });
    assert.equal(blocks[0]?.type, "text");
    assert.equal(blocks[1]?.type, "image");
    if (blocks[1]?.type === "image") {
      assert.equal(blocks[1].attachment.attachmentId, "sha256:deadbeef");
      assert.equal(blocks[1].attachment.mediaType, "image/png");
    }
    assert.doesNotMatch(blocks[0] && blocks[0].type === "text" ? blocks[0].text : "", /attachmentId/);
  });
});
