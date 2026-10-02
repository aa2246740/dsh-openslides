#!/usr/bin/env node
/**
 * Regenerate the checked reference manifest after the skill text changes.
 *
 * The manifest pins every reference file's bytes and chunk sha256, so any edit
 * under vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt must be followed by
 * this script; the provenance tests then compare the vendor files against it.
 *
 *   node scripts/build-openkimi-source-manifest.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { createOpenKimiSourceManifest } from "../packages/presentation-run/dist/domain/openkimi-source-pack.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt");
const MANIFEST = path.join(ROOT, "packages/agent-harness/reference/openkimi-source-manifest.v1.json");

const next = `${JSON.stringify(createOpenKimiSourceManifest(SOURCE), null, 2)}\n`;
const current = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8") : "";
if (process.argv.includes("--check")) {
  if (current !== next) {
    console.error("reference manifest is stale: run node scripts/build-openkimi-source-manifest.mjs");
    process.exit(1);
  }
  console.log("reference manifest is current");
} else {
  fs.writeFileSync(MANIFEST, next);
  console.log(`wrote ${path.relative(ROOT, MANIFEST)} (${JSON.parse(next).files.length} files)`);
}
