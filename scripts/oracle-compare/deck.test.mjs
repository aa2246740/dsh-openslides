import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildDeckPayload,
  indexProjectFiles,
  loadVendorLib,
  resolveIndexedPath,
  resolveProject,
} from "./deck.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("YU7 fixture becomes a setPPTD payload", async () => {
  const lib = await loadVendorLib(ROOT);
  const project = resolveProject(ROOT, "yu7");
  const payload = buildDeckPayload(project.full, lib, project.id);
  assert.equal(payload.id, "yu7");
  assert.match(payload.title, /YU7|小米/);
  assert.equal(payload.pageCount, 8);
  assert.equal(payload.pages[0].path, "pages/1_cover.page");
  assert.match(payload.pages[2].content, /1:3/);
  assert.match(payload.pages[2].content, /<span style=/);
  assert.equal(payload.missing.length, 0);
});

test("Pi generate deck is also a valid payload", async (t) => {
  const full = path.join(ROOT, "output/pi-rpc-demo");
  if (!fs.existsSync(full)) {
    t.skip("output/pi-rpc-demo is local-only (gitignored)");
    return;
  }
  const lib = await loadVendorLib(ROOT);
  const project = resolveProject(ROOT, "pi-rpc");
  const payload = buildDeckPayload(project.full, lib, project.id);
  assert.equal(payload.pageCount, 6);
  assert.ok(payload.manifestContent.includes("pages/01_cover.page"));
});

test("generated direction decks become setPPTD payloads", async () => {
  const lib = await loadVendorLib(ROOT);
  const expected = {
    "ab-consulting": /华北区域渠道增长复盘/,
    "ab-academic": /Transformer/,
    "ab-promo": /夏季限定系列发布/,
    "ab-work": /边缘推理平台路线图/,
  };
  for (const [id, title] of Object.entries(expected)) {
    const project = resolveProject(ROOT, id);
    const payload = buildDeckPayload(project.full, lib, project.id);
    assert.equal(payload.id, id);
    assert.match(payload.title, title);
    assert.equal(payload.pageCount, 5);
    assert.equal(payload.missing.length, 0);
    assert.match(payload.pages[0].content, /pageType:\s*cover/);
    assert.match(payload.pages[3].content, /elementType:\s*chart/);
  }
});

test("image paths resolve inside the project tree", () => {
  const project = resolveProject(ROOT, "fixtures/okp-yu7-ppt");
  const index = indexProjectFiles(project.full);
  assert.equal(resolveIndexedPath(index, "media/bg_exterior.jpg"), "media/bg_exterior.jpg");
  assert.equal(
    resolveIndexedPath(index, "./media/bg_cover.jpg"),
    "media/bg_cover.jpg",
  );
  assert.equal(resolveIndexedPath(index, "missing.png"), null);
});
