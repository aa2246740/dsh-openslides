#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PI_PACKAGE = "@earendil-works/pi-coding-agent";
const OUT = path.join(ROOT, "docs/architecture/phase0-freeze.json");
const EXPECTED = Object.freeze({
  sourceFiles: 76,
  visualFiles: 44,
  clickableNodeCount: 125,
  tooltipCount: 5,
});

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function asRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  return value;
}

function asArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  return value;
}

function asString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} is not a non-empty string`);
  }
  return value;
}

function asFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} is not a number`);
  }
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} drifted: got ${actual}, expected ${expected}`);
}

const sourceManifest = asRecord(
  readJson(path.join(ROOT, "packages/agent-harness/reference/openkimi-source-manifest.v1.json")),
  "openkimi source manifest",
);
const visualManifest = asRecord(
  readJson(path.join(ROOT, "packages/agent-harness/reference/openkimi-visual-manifest.v1.json")),
  "openkimi visual manifest",
);
const editorManifest = asRecord(
  readJson(path.join(ROOT, "docs/editor-oracle/baselines/kimi-v1-2026-08-20/manifest.json")),
  "editor baseline manifest",
);
const harnessPkg = asRecord(
  readJson(path.join(ROOT, "packages/agent-harness/package.json")),
  "agent-harness package.json",
);
const kernelVersion = asString(
  asRecord(harnessPkg.dependencies, "agent-harness dependencies")[PI_PACKAGE],
  `dependencies[${PI_PACKAGE}]`,
);

const actual = {
  sourceFiles: asArray(sourceManifest.files, "openkimi source files").length,
  visualFiles: asArray(visualManifest.files, "openkimi visual files").length,
  clickableNodeCount: asFiniteNumber(
    asRecord(editorManifest.capture, "editor capture").clickableNodeCount,
    "capture.clickableNodeCount",
  ),
  tooltipCount: asArray(editorManifest.hoverTooltips, "hoverTooltips").length,
};

for (const [key, expected] of Object.entries(EXPECTED)) {
  assertEqual(actual[key], expected, key);
}

const baseline = spawnSync(process.execPath, [path.join(ROOT, "scripts/verify-editor-baseline.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
});
if (baseline.status !== 0) {
  fail(`oracle baseline failed:\n${baseline.stdout}${baseline.stderr}`);
}

const freeze = {
  schema: "phase0-freeze-v1",
  gitSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
  capturedAt: new Date().toISOString(),
  kernel: {
    name: "pi",
    package: PI_PACKAGE,
    version: kernelVersion,
  },
  openkimi: {
    sourceFiles: actual.sourceFiles,
    visualFiles: actual.visualFiles,
  },
  editor: {
    clickableNodeCount: actual.clickableNodeCount,
    tooltipCount: actual.tooltipCount,
  },
};

if (fs.existsSync(OUT)) {
  const previous = asRecord(readJson(OUT), "phase0-freeze.json");
  freeze.gitSha = asString(previous.gitSha, "frozen gitSha");
  freeze.capturedAt = asString(previous.capturedAt, "frozen capturedAt");
  assertEqual(asString(asRecord(previous.kernel, "frozen kernel").version, "frozen kernel.version"), kernelVersion, "kernel.version");
  assertEqual(
    asFiniteNumber(asRecord(previous.openkimi, "frozen openkimi").sourceFiles, "frozen sourceFiles"),
    actual.sourceFiles,
    "frozen sourceFiles",
  );
  assertEqual(
    asFiniteNumber(asRecord(previous.openkimi, "frozen openkimi").visualFiles, "frozen visualFiles"),
    actual.visualFiles,
    "frozen visualFiles",
  );
  assertEqual(
    asFiniteNumber(asRecord(previous.editor, "frozen editor").clickableNodeCount, "frozen clickableNodeCount"),
    actual.clickableNodeCount,
    "frozen clickableNodeCount",
  );
  assertEqual(
    asFiniteNumber(asRecord(previous.editor, "frozen editor").tooltipCount, "frozen tooltipCount"),
    actual.tooltipCount,
    "frozen tooltipCount",
  );
}

const text = `${JSON.stringify(freeze, null, 2)}\n`;
if (!fs.existsSync(OUT)) {
  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, OUT);
}

if (baseline.stdout) process.stdout.write(baseline.stdout);
process.stdout.write(text);
