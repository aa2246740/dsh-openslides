import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PATTERNS,
  SECRET_ENV_VARS,
  collectSecretHits,
  findSecretHits,
  secretsFromEnv,
} from "./scan-secrets.mjs";

// Fixture secrets are built at runtime so this tracked file cannot trip the
// scanner itself (the literals below never form a complete secret shape).
const FAKE_SK = "sk-" + "a1".repeat(15);
const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "." + "dozjgNryP4J3jVmNHl0w5turpQ";
const FAKE_ENV_VALUE = "mmzk" + "f0".repeat(12);

test("env-derived secret values are detected in file text", () => {
  const hits = findSecretHits(`prefix ${FAKE_ENV_VALUE} suffix`, [FAKE_ENV_VALUE]);
  assert.ok(hits.includes("env secret value"), JSON.stringify(hits));
});

test("secret-shaped literals are caught even with no env configured", () => {
  const hits = findSecretHits(`const k = "${FAKE_SK}";`, []);
  assert.ok(hits.includes("sk- API key"), JSON.stringify(hits));
  const jwtHits = findSecretHits(`Authorization: Bearer ${FAKE_JWT}`, []);
  assert.ok(jwtHits.includes("JWT"), JSON.stringify(jwtHits));
});

test("hardcoded credential assignments are flagged", () => {
  const text = 'cfg = { OPENROUTER_API_KEY: "' + "z9".repeat(15) + '" }';
  const hits = findSecretHits(text, []);
  assert.ok(hits.includes("hardcoded credential assignment"), JSON.stringify(hits));
});

test("deliberately-fake placeholders are not flagged", () => {
  assert.deepEqual(findSecretHits('const k = "sk-or-test-not-a-live-key";', []), []);
  assert.deepEqual(findSecretHits('const id = "task-stale-browser-pointer";', []), []);
  assert.deepEqual(findSecretHits("OPENAI_API_KEY=<your-key-here>", []), []);
});

test("clean text produces no hits", () => {
  assert.deepEqual(findSecretHits('export const ok = true;\nconst port = 55200;\n', []), []);
});

test("coverage is never zero: patterns exist and env list covers actual vars", () => {
  assert.ok(PATTERNS.length > 0, "pattern checks must always be configured");
  for (const name of [
    "MINIMAX_CN_API_KEY",
    "OPENROUTER_API_KEY",
    "SLIDESTUDIO_LLM_API_KEY",
    "SLIDESTUDIO_IMAGE_API_KEY",
    "SLIDESTUDIO_RESEARCH_API_KEY",
  ]) {
    assert.ok(SECRET_ENV_VARS.includes(name), `missing env coverage: ${name}`);
  }
  const secrets = secretsFromEnv({ MINIMAX_API_KEY: FAKE_ENV_VALUE, OTHER: "x".repeat(20) });
  assert.deepEqual(secrets, [FAKE_ENV_VALUE]);
});

test("collectSecretHits fails on a repo containing a tracked secret", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-secrets-"));
  execSync("git init -q", { cwd: root });
  fs.writeFileSync(path.join(root, "clean.js"), "export const ok = true;\n");
  execSync("git add clean.js", { cwd: root });
  assert.deepEqual(collectSecretHits(root, {}).hits, []);

  fs.writeFileSync(path.join(root, "leak.js"), `export const key = "${FAKE_SK}";\n`);
  execSync("git add leak.js", { cwd: root });
  const { hits } = collectSecretHits(root, {});
  assert.ok(
    hits.some((h) => h.includes("leak.js") && h.includes("sk- API key")),
    JSON.stringify(hits),
  );
});
