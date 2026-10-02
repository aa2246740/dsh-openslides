import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openslides-retention-"));

function writeProject(relativeRoot, manifest = "deck.pptd") {
  const projectRoot = path.join(workspaceRoot, relativeRoot);
  fs.mkdirSync(projectRoot, { recursive: true });
  const manifestPath = path.join(projectRoot, manifest);
  fs.writeFileSync(manifestPath, "version: v2\npages: []\n");
  fs.writeFileSync(path.join(projectRoot, "export.pptx"), "fake-pptx");
  return { projectRoot, manifestPath };
}

function ageAll(projectRoot, days) {
  const at = new Date(now - days * DAY_MS);
  for (const name of fs.readdirSync(projectRoot)) {
    fs.utimesSync(path.join(projectRoot, name), at, at);
  }
  fs.utimesSync(projectRoot, at, at);
}

const oldGen = writeProject("output/old-deck");
const freshGen = writeProject("output/fresh-deck");
const oldSlice = writeProject("output/dsh-slices/old-slice");
const oldFixture = writeProject("fixtures/old-fixture");
const noManifest = path.join(workspaceRoot, "output", "no-manifest");
fs.mkdirSync(noManifest, { recursive: true });
ageAll(oldGen.projectRoot, 10);
ageAll(oldSlice.projectRoot, 30);
ageAll(oldFixture.projectRoot, 60);
ageAll(noManifest, 60);

const outside = fs.mkdtempSync(path.join(os.tmpdir(), "openslides-retention-outside-"));
fs.writeFileSync(path.join(outside, "deck.pptx"), "x");
const linked = path.join(workspaceRoot, "output", "linked-dir");
fs.symlinkSync(outside, linked);

const { retentionDaysFromEnv, sweepStaleProjects } = await import("./server.mjs");

after(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("stale project retention", () => {
  it("parses the retention window from env", () => {
    assert.equal(retentionDaysFromEnv({}), 0);
    assert.equal(retentionDaysFromEnv({ SLIDESTUDIO_RETENTION_DAYS: "" }), 0);
    assert.equal(retentionDaysFromEnv({ SLIDESTUDIO_RETENTION_DAYS: "3" }), 3);
    assert.equal(retentionDaysFromEnv({ SLIDESTUDIO_RETENTION_DAYS: "0" }), 0);
    assert.throws(() => retentionDaysFromEnv({ SLIDESTUDIO_RETENTION_DAYS: "-1" }), /non-negative/);
    assert.throws(() => retentionDaysFromEnv({ SLIDESTUDIO_RETENTION_DAYS: "soon" }), /non-negative/);
  });

  it("deletes only stale generated projects, never fixtures or symlinks", () => {
    const result = sweepStaleProjects(workspaceRoot, { days: 7, now });
    assert.equal(result.skipped, false);
    assert.deepEqual([...result.deleted].sort(), ["old-deck", "old-slice"]);
    assert.deepEqual(result.errors, []);
    assert.equal(fs.existsSync(oldGen.projectRoot), false);
    assert.equal(fs.existsSync(oldSlice.projectRoot), false);
    assert.equal(fs.existsSync(freshGen.projectRoot), true);
    assert.equal(fs.existsSync(oldFixture.projectRoot), true);
    assert.equal(fs.existsSync(noManifest), true);
    assert.equal(fs.existsSync(linked), true);
  });

  it("does nothing when retention is disabled", () => {
    const result = sweepStaleProjects(workspaceRoot, { days: 0, now });
    assert.equal(result.skipped, true);
    assert.deepEqual(result.deleted, []);
    assert.equal(fs.existsSync(freshGen.projectRoot), true);
  });
});
