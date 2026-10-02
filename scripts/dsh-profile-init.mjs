#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSlidesProfile } from "../packages/dsh-slides-bundle/dist/index.js";
import { ensureSlidesProfileCurrent } from "./lib/dsh-profile-sync.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(ROOT, ".dsh", "home");

fs.mkdirSync(HOME, { recursive: true });
const dir = writeSlidesProfile(HOME, ROOT);
fs.rmSync(path.join(dir, "node_modules", "@open-slidestudio"), {
  recursive: true,
  force: true,
});
execFileSync(
  "npm",
  ["install", "--install-links", "--legacy-peer-deps", "--no-fund", "--no-audit"],
  {
    cwd: dir,
    stdio: "inherit",
  },
);
console.log(`slides profile ready at ${dir}`);
ensureSlidesProfileCurrent(ROOT, HOME);
