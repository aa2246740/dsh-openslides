#!/usr/bin/env node
/**
 * qa:all — run every local-only scripts/verify-*.mjs in order, then oracle:validate.
 * Reuses/starts native-web at BASE and restores an exact pre-QA fixture
 * snapshot between suites. Existing fixture edits are preserved.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupFixtures, restartNativeWebServer } from "./gestures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
}

const scriptsDir = path.join(ROOT, "scripts");
const externalModelVerify = new Set([
  "verify-generate-flow.mjs",
  "verify-generate-qa.mjs",
]);
const verify = fs
  .readdirSync(scriptsDir)
  .filter((n) => n.startsWith("verify-") && n.endsWith(".mjs"))
  .filter((n) => !externalModelVerify.has(n))
  .sort()
  .map((n) => path.join(scriptsDir, n));

if (!verify.length) {
  console.error("FAIL  no scripts/verify-*.mjs found");
  process.exit(1);
}

console.log(`qa:all  prepare native-web, then ${verify.length} local verify scripts + oracle:validate`);
console.log(`qa:all  external-model scripts excluded: ${[...externalModelVerify].join(", ")}`);
cleanupFixtures();
await restartNativeWebServer();

for (const script of verify) {
  const name = path.basename(script);
  console.log(`\n── ${name} ──`);
  cleanupFixtures();
  const code = await run(process.execPath, [script]);
  if (code !== 0) {
    cleanupFixtures();
    console.error(`FAIL  qa:all stopped at ${name} (exit ${code})`);
    process.exit(code);
  }
}

cleanupFixtures();
console.log("\n── oracle:validate ──");
const oracle = await run("npm", ["run", "oracle:validate"]);
if (oracle !== 0) {
  console.error("FAIL  qa:all oracle:validate");
  process.exit(oracle);
}

console.log("\nOK    qa:all");
