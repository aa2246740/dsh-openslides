import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findPiSdkRoot } from "./pi-available.js";

describe("Pi SDK discovery", () => {
  it("resolves a symlinked Pi CLI back to its package root", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdk-"));
    const pkg = path.join(dir, "lib", "node_modules", "@earendil-works", "pi-coding-agent");
    const cli = path.join(pkg, "dist", "cli.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "#!/usr/bin/env node\n");
    fs.writeFileSync(path.join(pkg, "dist", "index.js"), "export {};\n");
    const bin = path.join(dir, "bin", "pi");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.symlinkSync(cli, bin);
    assert.equal(findPiSdkRoot({ SLIDESTUDIO_PI_BIN: bin }), fs.realpathSync(pkg));
  });
});
