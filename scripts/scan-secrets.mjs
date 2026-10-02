#!/usr/bin/env node
/** Fail if provider keys or other secrets appear in git-tracked files or recent logs. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Credential-bearing env vars actually read by this repo (see .env.example).
 *  When a var is set, its literal value must appear nowhere in tracked files. */
export const SECRET_ENV_VARS = [
  "MINIMAX_CN_API_KEY",
  "MINIMAXCN_API_KEY",
  "MINIMAX_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_ONLYUSE_FREEMODEL_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "AMD_API_KEY",
  "OP_CUSTOM_API_KEY",
  "MIMO_DESKTOP_API_KEY",
  "SLIDESTUDIO_LLM_API_KEY",
  "SLIDESTUDIO_IMAGE_SEARCH_KEY",
  "SLIDESTUDIO_IMAGE_API_KEY",
  "SLIDESTUDIO_RESEARCH_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "PROBE_API_KEY",
  "ACME_API_KEY",
  "SLIDES_FINISH_TEST_KEY",
];

/** Secret-shaped literals caught even when no matching env var is set, so the
 *  scan never degenerates into a zero-check pass on a bare CI runner. */
export const PATTERNS = [
  { re: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{18,}/g, label: "sk- API key" },
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, label: "JWT" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: "PEM private key" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: "Google API key" },
  { re: /\bxai-[A-Za-z0-9]{20,}\b/g, label: "xAI API key" },
  {
    re: /(?:api[_-]?key|api[_-]?secret|access[_-]?token|secret[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_+/=-]{20,})["']/gi,
    label: "hardcoded credential assignment",
  },
];

/** Deliberately-fake fixtures (e.g. `sk-or-test-not-a-live-key`,
 *  `xai-token-not-minimax`, `secret-never-in-argv`) are not leaks. Real keys are
 *  high-entropy and never carry these English markers. */
const PLACEHOLDER =
  /test|example|sample|dummy|fake|placeholder|invalid|never|not-|probe|mock|fixture|your-|xxx|redact|change-me|replace|insert|<|\*|\$/i;

/** Binary blobs are not greppable; scanning them as utf8 only yields noise. */
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|mp4|woff2?|ttf|otf|eot|ico|zip|pptx|pdf|wasm)$/i;

export function secretsFromEnv(env = process.env) {
  return SECRET_ENV_VARS.map((name) => (env[name] || "").trim()).filter(
    (value) => value.length >= 8,
  );
}

/** Returns labels of every real-looking secret found in `text`. */
export function findSecretHits(text, secrets) {
  const hits = [];
  for (const secret of secrets) {
    if (secret && text.includes(secret)) hits.push("env secret value");
  }
  for (const rule of PATTERNS) {
    for (const match of text.matchAll(rule.re)) {
      const candidate = match[1] ?? match[0];
      if (!PLACEHOLDER.test(candidate)) {
        hits.push(rule.label);
        break;
      }
    }
  }
  return [...new Set(hits)];
}

export function collectSecretHits(root, env = process.env) {
  const secrets = secretsFromEnv(env);
  const checks = secrets.length + PATTERNS.length;
  const hits = [];
  if (checks === 0) {
    hits.push("scan-secrets: 0 checks configured (no env secrets and no patterns)");
    return { hits, secrets, checks };
  }

  const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  for (const rel of tracked) {
    if (rel.endsWith(".lock") || rel.includes("node_modules/") || BINARY_EXT.test(rel)) {
      continue;
    }
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
    const text = fs.readFileSync(abs, "utf8");
    for (const label of findSecretHits(text, secrets)) {
      hits.push(`${rel}: ${label}`);
    }
  }

  const logDirs = [path.join(root, "output"), "/opt/cursor/artifacts"];
  for (const dir of logDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile() || BINARY_EXT.test(abs)) continue;
      const text = fs.readFileSync(abs, "utf8");
      for (const label of findSecretHits(text, secrets)) {
        hits.push(`${path.relative(root, abs) || abs}: ${label}`);
      }
    }
  }
  return { hits, secrets, checks };
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const { hits, secrets, checks } = collectSecretHits(ROOT);
  if (hits.length) {
    console.error(JSON.stringify({ ok: false, hits: [...new Set(hits)] }, null, 2));
    process.exit(1);
  }
  const trackedCount = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean).length;
  console.log(
    JSON.stringify(
      {
        ok: true,
        scannedTracked: trackedCount,
        secretsChecked: secrets.length,
        patternsChecked: PATTERNS.length,
        checks,
      },
      null,
      2,
    ),
  );
}
