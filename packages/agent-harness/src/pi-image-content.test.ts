import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPiImageContent, buildPiRenderedPageContent } from "./pi-image-content.js";

describe("Pi rendered page image content", () => {
  it("returns the checked PNG as a real image block with the causal token in text", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-image-content-"));
    const src = "_agent/rasters/page-01.png";
    const bytes = Buffer.from("real-png-bytes-for-tool-result");
    fs.mkdirSync(path.dirname(path.join(root, src)), { recursive: true });
    fs.writeFileSync(path.join(root, src), bytes);
    const rasterSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const result = buildPiRenderedPageContent(root, "native slide", {
      src,
      rasterSha256,
      deliveryToken: "delivery-123",
      pageId: "page-01",
      pageRevision: 2,
    });

    assert.equal(result.content[0].type, "text");
    assert.match(result.content[0].text, /DELIVERY_TOKEN: delivery-123/);
    assert.equal(result.content[1].type, "image");
    assert.equal(result.content[1].mimeType, "image/png");
    assert.deepEqual(Buffer.from(result.content[1].data, "base64"), bytes);
  });

  it("rejects a changed raster or a path outside the project", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-image-content-bad-"));
    const src = "_agent/rasters/page-01.png";
    fs.mkdirSync(path.dirname(path.join(root, src)), { recursive: true });
    fs.writeFileSync(path.join(root, src), "changed");
    assert.throws(
      () =>
        buildPiRenderedPageContent(root, "native slide", {
          src,
          rasterSha256: "0".repeat(64),
          deliveryToken: "delivery-123",
          pageId: "page-01",
          pageRevision: 1,
        }),
      /hash mismatch/,
    );
    assert.throws(
      () =>
        buildPiRenderedPageContent(root, "native slide", {
          src: "../outside.png",
          rasterSha256: "0".repeat(64),
          deliveryToken: "delivery-123",
          pageId: "page-01",
          pageRevision: 1,
        }),
      /outside the project/,
    );
  });

  it("uses the same checked image adapter for the selected preview and deck overview", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-image-content-general-"));
    for (const imageKind of ["design-reference", "deck-overview"] as const) {
      const extension = imageKind === "design-reference" ? "jpg" : "png";
      const mimeType = imageKind === "design-reference" ? "image/jpeg" : "image/png";
      const src = `_agent/references/${imageKind}.${extension}`;
      const bytes = Buffer.from(`${imageKind}-checked-bytes`);
      fs.mkdirSync(path.dirname(path.join(root, src)), { recursive: true });
      fs.writeFileSync(path.join(root, src), bytes);
      const result = buildPiImageContent(root, imageKind, {
        imageKind,
        src,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        deliveryToken: `token-${imageKind}`,
        subjectId: imageKind,
        mimeType,
      });
      assert.equal(result.payload.imageKind, imageKind);
      assert.equal(result.content[1].mimeType, mimeType);
      assert.match(result.content[0].text, new RegExp(`DELIVERY_TOKEN: token-${imageKind}`));
      assert.deepEqual(Buffer.from(result.content[1].data, "base64"), bytes);
    }
  });
});
