#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(
  ROOT,
  "docs/editor-oracle/baselines/kimi-v1-2026-08-20",
);
const MANIFEST = path.join(BASELINE, "manifest.json");

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const manifest = readJson(MANIFEST);
if (manifest.baselineId !== "kimi-slides-editor-v1-2026-08-20") {
  fail(`unexpected baseline id: ${manifest.baselineId}`);
}
if (!manifest.source?.connected || manifest.source?.accountRequired !== false) {
  fail("baseline does not record a connected, no-account official oracle");
}

for (const item of manifest.files || []) {
  const file = path.resolve(BASELINE, String(item.path || ""));
  if (!file.startsWith(`${BASELINE}${path.sep}`)) fail(`path escapes baseline: ${item.path}`);
  if (!fs.existsSync(file)) fail(`baseline file missing: ${item.path}`);
  const actual = sha256(file);
  if (actual !== item.sha256) fail(`hash mismatch ${item.path}: ${actual}`);
}

const report = readJson(path.join(BASELINE, "editor-live/REPORT.json"));
const controls = readJson(path.join(BASELINE, "editor-live/controls.json"));
const hovers = readJson(path.join(BASELINE, "editor-live/hover-tooltips.json"));
if (report.connected !== true) fail("official report is not connected");
if (controls.length !== manifest.capture.clickableNodeCount) {
  fail(`control count mismatch: ${controls.length}`);
}
const revealed = new Set(hovers.flatMap((row) => row.revealed || []));
for (const label of manifest.hoverTooltips || []) {
  if (!revealed.has(label)) fail(`live tooltip evidence missing: ${label}`);
}

console.log(
  `OK    ${manifest.baselineId} · ${manifest.files.length} hashes · ${controls.length} controls · ${revealed.size} tooltips`,
);
