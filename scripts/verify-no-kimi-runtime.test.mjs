import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectKimiRuntimeHits } from "./verify-no-kimi-runtime.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-runtime-"));
  const write = (rel, text) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  return { root, write };
}

test("clean repo has no Kimi runtime references", () => {
  assert.deepEqual(collectKimiRuntimeHits(REPO_ROOT), []);
});

test("flags kimi.com / statics.moonshot.cn / statics.kimi.ai in js, ts, and yaml", () => {
  const { root, write } = makeRoot();
  write("apps/native-web/public/hub.js", 'const url = "https://kimi.com/slides";\n');
  write("apps/native-web/src/theme.ts", 'const css = "https://statics.moonshot.cn/x.css";\n');
  write("apps/native-web/src/fonts.yaml", 'font: "https://statics.kimi.ai/f.woff2"\n');
  write("packages/dsh-slides-client/lib/client.js", "export const ok = true;\n");
  const hits = collectKimiRuntimeHits(root);
  assert.equal(hits.length, 3, JSON.stringify(hits));
});

test("docs/history/fixture evidence dirs inside scanned trees are skipped", () => {
  const { root, write } = makeRoot();
  write("apps/native-web/public/app.js", "export {};\n");
  write("apps/native-web/src/index.mjs", "export {};\n");
  write("packages/dsh-slides-client/lib/client.js", "export {};\n");
  write("apps/native-web/src/fixtures/evidence.js", 'const u = "https://kimi.com";\n');
  write("apps/native-web/public/docs/notes.js", 'const u = "https://statics.kimi.ai";\n');
  assert.deepEqual(collectKimiRuntimeHits(root), []);
});

test("a missing scanned dir is a hit, not a silent pass", () => {
  const { root } = makeRoot();
  const hits = collectKimiRuntimeHits(root);
  assert.equal(hits.length, 3, JSON.stringify(hits));
});
