import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, listComposedPage, saveProject } from "@open-slidestudio/pptd-v2";
import { canonicalPageId, canonicalPagePath, validatePlanPageIds, resolveProjectPageIdentities, resolvePagePathForMutation, } from "./page-identity.js";
function tempProjectRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "page-identity-test-"));
}
describe("page identity module", () => {
    it("canonicalizes page ids across prefixes and extensions", () => {
        assert.equal(canonicalPageId("01_cover"), "1_cover");
        assert.equal(canonicalPageId("pages/01_cover.page"), "1_cover");
        assert.equal(canonicalPageId("1_cover.page"), "1_cover");
        assert.equal(canonicalPageId("1_cover"), "1_cover");
        assert.equal(canonicalPagePath("1_cover"), "pages/1_cover.page");
        assert.equal(canonicalPagePath("01_cover"), "pages/1_cover.page");
    });
    it("detects collisions in new plan page ids", () => {
        const valid = validatePlanPageIds(["1_cover", "2_agenda", "3_summary"]);
        assert.equal(valid.ok, true);
        if (valid.ok) {
            assert.deepEqual(valid.canonicalIds, ["1_cover", "2_agenda", "3_summary"]);
        }
        const collision = validatePlanPageIds(["01_cover", "1_cover", "2_agenda"]);
        assert.equal(collision.ok, false);
        if (!collision.ok) {
            assert.equal(collision.conflicts.length, 1);
            assert.equal(collision.conflicts[0]?.key, "1_cover");
            assert.deepEqual(collision.conflicts[0]?.rawIds, ["01_cover", "1_cover"]);
            assert.match(collision.reason, /duplicate canonical page ids/);
        }
    });
    it("resolves project page paths and preserves legacy filenames without rewriting them", () => {
        const root = tempProjectRoot();
        const project = createEmptyProject(root, { title: "Test Deck" });
        listComposedPage(project, "pages/01_cover.page", {
            pageType: "cover",
            elements: [],
        });
        listComposedPage(project, "pages/02_agenda.page", {
            pageType: "content",
            elements: [],
        });
        saveProject(project);
        const resolution = resolveProjectPageIdentities(root);
        assert.equal(resolution.kind, "resolved");
        if (resolution.kind === "resolved") {
            assert.equal(resolution.pages.get("1_cover"), "pages/01_cover.page");
            assert.equal(resolution.pages.get("2_agenda"), "pages/02_agenda.page");
        }
        const mutationPath = resolvePagePathForMutation(root, "1_cover");
        assert.equal(mutationPath.ok, true);
        if (mutationPath.ok) {
            assert.equal(mutationPath.pagePath, "pages/01_cover.page");
            assert.equal(mutationPath.canonicalId, "1_cover");
        }
    });
    it("detects collisions on disk when two paths map to the same canonical id and refuses mutations", () => {
        const root = tempProjectRoot();
        const project = createEmptyProject(root, { title: "Collision Deck" });
        listComposedPage(project, "pages/01_cover.page", {
            pageType: "cover",
            elements: [],
        });
        listComposedPage(project, "pages/1_cover.page", {
            pageType: "cover",
            elements: [],
        });
        saveProject(project);
        const resolution = resolveProjectPageIdentities(root);
        assert.equal(resolution.kind, "collision");
        if (resolution.kind === "collision") {
            assert.equal(resolution.conflicts.length, 1);
            assert.equal(resolution.conflicts[0]?.key, "1_cover");
            assert.deepEqual(resolution.conflicts[0]?.paths, [
                "pages/01_cover.page",
                "pages/1_cover.page",
            ]);
        }
        const mutationResult = resolvePagePathForMutation(root, "1_cover");
        assert.equal(mutationResult.ok, false);
        if (!mutationResult.ok) {
            assert.equal(mutationResult.code, "PAGE_ID_COLLISION");
            assert.match(mutationResult.reason, /conflicting paths exist/);
        }
    });
});
//# sourceMappingURL=page-identity.test.js.map