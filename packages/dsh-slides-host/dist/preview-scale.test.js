import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jpegDimensions, PREVIEW_MAX_DIMENSION, MAX_DESIGN_PREVIEW_ATTACHMENTS, designPreviewAttachmentPlan, designPreviewTileCount, } from "./preview-scale.js";
function withSof(width, height, marker = 0xc0) {
    const buf = Buffer.from([
        0xff, 0xd8, // SOI
        0xff, marker,
        0x00, 0x11, // segment length 17
        0x08, // precision
        (height >> 8) & 0xff, height & 0xff,
        (width >> 8) & 0xff, width & 0xff,
        0x01, 0x22, 0x00, // components
        0xff, 0xda, 0x00, 0x04, 0x00, 0x00, // SOS stub
    ]);
    return buf;
}
describe("design preview scaling helpers", () => {
    it("reads JPEG dimensions from SOF0 and progressive SOF2 markers", () => {
        assert.deepEqual(jpegDimensions(withSof(1920, 8640)), { width: 1920, height: 8640 });
        assert.deepEqual(jpegDimensions(withSof(640, 480, 0xc2)), { width: 640, height: 480 });
        assert.equal(jpegDimensions(Buffer.from("not a jpeg")), undefined);
        assert.equal(jpegDimensions(Buffer.alloc(0)), undefined);
    });
    it("walks the fallback ladder down to a 720 long edge", () => {
        assert.equal(PREVIEW_MAX_DIMENSION, 720);
    });
    it("counts extra/xuan-paper-annual as nine strip tiles but attaches one", () => {
        const xuan = { width: 1920, height: 8724 };
        assert.equal(designPreviewTileCount(xuan), 9);
        assert.deepEqual(designPreviewAttachmentPlan(xuan), {
            stripTiles: 9,
            attachCount: 1,
            longEdge: 720,
        });
        assert.equal(MAX_DESIGN_PREVIEW_ATTACHMENTS, 1);
    });
    it("does not treat a landscape page as a strip", () => {
        assert.equal(designPreviewTileCount({ width: 1920, height: 1080 }), 1);
        assert.equal(designPreviewAttachmentPlan({ width: 1920, height: 1080 }).attachCount, 1);
    });
});
//# sourceMappingURL=preview-scale.test.js.map