import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, listComposedPage, saveProject, titleOnlyCoverPage } from "@open-slidestudio/pptd-v2";
import { exportPageToPng } from "./export-png.js";
describe("export-png", () => {
    it("writes a valid PNG of the project slide size", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "png-"));
        const project = createEmptyProject(dir, { title: "PNG页" });
        listComposedPage(project, "pages/cover.page", titleOnlyCoverPage("PNG页"));
        saveProject(project);
        const result = exportPageToPng(project, 0);
        assert.equal(result.data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(result.width, 960);
        assert.equal(result.height, 540);
        assert.ok(result.data.length > 32);
        assert.match(result.filename, /\.png$/);
        assert.equal(result.kind, "background-only");
    });
});
//# sourceMappingURL=export-png.test.js.map