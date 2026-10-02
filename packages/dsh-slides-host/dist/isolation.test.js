import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertIsolatedDshHome, assertNotOauthIsolationFile, DshHomeIsolationError, isPathInside, SLIDES_DSH_PORT_DEFAULT, userDshHome, } from "./isolation.js";
describe("dsh home isolation", () => {
    it("keeps the product Hub off DSH.app's default port", () => {
        assert.equal(SLIDES_DSH_PORT_DEFAULT, 13080);
    });
    it("refuses ~/.dsh and any path inside it", () => {
        const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "user-home-"));
        const userDsh = path.join(fakeHome, ".dsh");
        fs.mkdirSync(userDsh, { recursive: true });
        assert.equal(userDshHome(fakeHome), path.resolve(userDsh));
        assert.throws(() => assertIsolatedDshHome(userDsh, { userDshHome: userDsh }), DshHomeIsolationError);
        assert.throws(() => assertIsolatedDshHome(path.join(userDsh, "home"), { userDshHome: userDsh }), /collides with the local DSH App home/);
    });
    it("allows a repo-local slides home", () => {
        const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "user-home-"));
        const userDsh = path.join(fakeHome, ".dsh");
        const slides = fs.mkdtempSync(path.join(os.tmpdir(), "slides-home-"));
        const resolved = assertIsolatedDshHome(slides, { userDshHome: userDsh });
        assert.equal(resolved, path.resolve(slides));
        assert.equal(isPathInside(userDsh, slides), false);
    });
    it("refuses to copy OAuth grant filenames", () => {
        assert.throws(() => assertNotOauthIsolationFile(".dsh-oauth-auth.json"), /OAuth grants stay/);
        assert.throws(() => assertNotOauthIsolationFile("/tmp/.dsh-antigravity-oauth.json"), /OAuth/);
        assert.doesNotThrow(() => assertNotOauthIsolationFile("settings.yaml"));
    });
});
//# sourceMappingURL=isolation.test.js.map