#!/usr/bin/env node
/** Production UI must not load a Kimi iframe, CDN, or official runtime. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["apps/native-web/public", "apps/native-web/src", "packages/dsh-slides-client/lib"];
/** Docs/history/fixture evidence may legitimately quote Kimi URLs — only product
 *  runtime files are scanned, so evidence dirs inside scanned trees are skipped. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "docs",
  "doc",
  "history",
  "evidence",
  "fixtures",
  "fixture",
  "__fixtures__",
  "oracle",
]);
const SCAN_EXTENSIONS = /\.(?:js|mjs|ts|html|css|ya?ml)$/i;
const FORBIDDEN = [
  /kimi\.moonshot\.cn/i,
  /kimi\.com/i,
  /statics\.moonshot\.cn/i,
  /statics\.kimi\.ai/i,
  /iframe[^>]+kimi/i,
  /kimi-cdn/i,
  /moonshot\.cn\/cdn/i,
];

export function collectKimiRuntimeHits(root, dirs = DIRS) {
  const hits = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const next = path.join(dir, name);
      if (fs.statSync(next).isDirectory()) {
        if (!EXCLUDED_DIRS.has(name)) walk(next);
        continue;
      }
      if (!SCAN_EXTENSIONS.test(name)) continue;
      const text = fs.readFileSync(next, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(text)) hits.push(`${path.relative(root, next)}: ${re}`);
      }
    }
  }
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) {
      hits.push(`${dir}: scanned dir missing`);
      continue;
    }
    walk(abs);
  }
  return hits;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const hits = collectKimiRuntimeHits(ROOT);
  if (hits.length) {
    console.error(JSON.stringify({ ok: false, hits }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify({ ok: true, kimiRuntime: false, scanned: DIRS.length }, null, 2),
  );
}
