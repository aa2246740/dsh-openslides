#!/usr/bin/env node
/** Verify the repository-owned Pi dependency. Never installs or edits user auth. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = "0.80.10";
const packageFile = path.join(
  ROOT,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "package.json",
);
const bin = path.join(path.dirname(packageFile), "dist", "cli.js");
const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split(".").map(Number);
const nodeReady = major > 22 || (major === 22 && minor >= 19);
let installed = "";
try {
  installed = JSON.parse(fs.readFileSync(packageFile, "utf8")).version || "";
} catch {
  installed = "";
}
const versionProbe = fs.existsSync(bin)
  ? spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 })
  : undefined;
const ok = Boolean(
  nodeReady &&
    installed === EXPECTED &&
    versionProbe?.status === 0 &&
    String(versionProbe.stdout || versionProbe.stderr).includes(EXPECTED),
);
const report = {
  ok,
  expectedVersion: EXPECTED,
  installedVersion: installed || null,
  binary: fs.existsSync(bin) ? bin : null,
  binaryVersion: String(versionProbe?.stdout || versionProbe?.stderr || "").trim() || null,
  nodeVersion,
  nodeReady,
  authTouched: false,
  networkUsed: false,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = ok ? 0 : 1;
