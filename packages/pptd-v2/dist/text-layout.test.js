import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, listComposedPage, loadProject, saveProject } from "./parse.js";
import { DEFAULT_TEXT_LINE_HEIGHT, TEXT_LAYOUT_CONTRACT_V1, effectiveLayoutRole, footerZoneTopForSlide, } from "./text-layout.js";
import { resolveTextStyle } from "./theme.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
describe("PPTD text layout contract", () => {
    it("uses preserved paragraphs, zero inset, and a 1.2 default line height", () => {
        assert.equal(TEXT_LAYOUT_CONTRACT_V1.paragraphBreaks, "preserve");
        assert.equal(TEXT_LAYOUT_CONTRACT_V1.whiteSpace, "pre-wrap");
        assert.equal(TEXT_LAYOUT_CONTRACT_V1.contentInsetPx, 0);
        assert.equal(DEFAULT_TEXT_LINE_HEIGHT, 1.2);
        assert.equal(resolveTextStyle({ text: "一行\n二行" }).lineHeight, 1.2);
    });
    it("scales the footer reserve with the slide height", () => {
        assert.equal(footerZoneTopForSlide(540), 500);
        assert.equal(footerZoneTopForSlide(1080), 1000);
    });
    it("keeps explicit roles and recognizes only clearly named legacy footers", () => {
        assert.equal(effectiveLayoutRole({
            elementId: "body",
            elementType: "text",
            bounds: [40, 100, 880, 300],
            layoutRole: "content",
        }), "content");
        assert.equal(effectiveLayoutRole({
            elementId: "foot",
            elementType: "text",
            bounds: [40, 512, 880, 18],
        }), "footer");
        assert.equal(effectiveLayoutRole({
            elementId: "disc",
            elementType: "text",
            bounds: [80, 500, 800, 20],
        }), "footer");
        assert.equal(effectiveLayoutRole({
            elementId: "body",
            elementType: "text",
            bounds: [40, 490, 880, 40],
        }), undefined);
    });
    it("round-trips the optional layout role without changing text line feeds", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pptd-layout-role-"));
        const project = createEmptyProject(dir);
        listComposedPage(project, "pages/cover.page", {
            pageType: "cover",
            background: { type: "solid", color: "#FFFFFF" },
            elements: [
                {
                    elementId: "footer",
                    elementType: "text",
                    bounds: [640, 508, 280, 20],
                    layoutRole: "footer",
                    content: { text: "来源\n02" },
                },
            ],
        });
        saveProject(project);
        const loaded = loadProject(dir);
        const text = loaded.pages[0].page.elements[0];
        assert.equal(text.layoutRole, "footer");
        assert.equal(text.content.text, "来源\n02");
    });
});
//# sourceMappingURL=text-layout.test.js.map