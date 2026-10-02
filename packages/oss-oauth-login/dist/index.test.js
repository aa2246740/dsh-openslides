import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OSS_OAUTH_AUTH_FILENAME, OSS_OAUTH_PLUGIN_ID, name } from "./index.js";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/index.ts");
describe("oss oauth wrapper", () => {
    it("uses a product-owned plugin id and credential filename", () => {
        assert.equal(name, "oss-oauth-login");
        assert.equal(OSS_OAUTH_PLUGIN_ID, "oss-oauth-login");
        assert.equal(OSS_OAUTH_AUTH_FILENAME, ".oss-oauth-auth.json");
        const source = fs.readFileSync(SRC, "utf8");
        assert.match(source, /\.oss-oauth-auth\.json/);
        assert.doesNotMatch(source, /new PiLoginCredentialStore\(\)/);
        assert.match(source, /open-slidestudio\/oss-oauth-login/);
        assert.doesNotMatch(source, /google-antigravity/);
        assert.match(source, /ctx\.inject\(\["webServer", "connection"\]/);
    });
});
//# sourceMappingURL=index.test.js.map