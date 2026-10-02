import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  openOrCreateProject,
  snapshotVersion,
  recordAssistantVersionOutcome,
  listVersions,
  restoreVersion,
  loadVersion,
  loadProject,
  save,
  versionDir,
} from "./index.js";
import { listComposedPage, titleOnlyCoverPage } from "@open-slidestudio/pptd-v2";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pstore-"));
}

function holdProjectWriter(
  root: string,
  text: string,
  holdMs = 300,
): { locked: Promise<void>; done: Promise<void> } {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { loadProject, saveProject, withProjectWriteLock } from "@open-slidestudio/pptd-v2";
        const [root, text, holdMs] = process.argv.slice(1);
        withProjectWriteLock(root, () => {
          process.stdout.write("locked\\n");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(holdMs));
          const project = loadProject(root);
          project.pages[0].page.elements[0].content.text = text;
          saveProject(project);
        });
      `,
      root,
      text,
      String(holdMs),
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const locked = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`writer did not lock: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("locked")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`writer failed (${code}): ${stderr}`));
    });
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`writer failed (${code}): ${stderr}`)));
  });
  return { locked, done };
}

function coverText(root: string): string {
  const project = loadProject(root);
  return (project.pages[0]!.page.elements[0] as { content: { text: string } }).content.text;
}

describe("project-store versions", () => {
  it("snapshots and restores", () => {
    const dir = tmp();
    const p = openOrCreateProject(dir, { title: "V1 标题" });
    listComposedPage(p, "pages/cover.page", titleOnlyCoverPage("V1 标题"));
    save(p);
    const v1 = snapshotVersion(dir, { label: "V1" });
    assert.equal(v1.id, "v1");

    const el = p.pages[0]!.page.elements[0] as {
      content: { text: string };
    };
    el.content.text = "V2 标题";
    save(p);
    snapshotVersion(dir, { label: "V2" });

    assert.equal(listVersions(dir).length, 2);
    restoreVersion(dir, "v1");
    const back = loadProject(dir);
    const t = back.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(t.content.text, "V1 标题");
  });

  it("loadVersion previews a snapshot without wiping the live tree", () => {
    const dir = tmp();
    const p = openOrCreateProject(dir, { title: "Live" });
    listComposedPage(p, "pages/cover.page", titleOnlyCoverPage("Live"));
    save(p);
    snapshotVersion(dir, { label: "V1" });
    const el = p.pages[0]!.page.elements[0] as { content: { text: string } };
    el.content.text = "Live now";
    save(p);
    snapshotVersion(dir, { label: "V2" });

    const preview = loadVersion(dir, "v1");
    const old = preview.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(old.content.text, "Live");

    const live = loadProject(dir);
    const now = live.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(now.content.text, "Live now");
    assert.equal(listVersions(dir).length, 2);
  });

  it("rejects traversal-like version ids before resolving or restoring a snapshot", () => {
    const dir = tmp();
    const p = openOrCreateProject(dir, { title: "Live" });
    listComposedPage(p, "pages/cover.page", titleOnlyCoverPage("Live"));
    save(p);
    snapshotVersion(dir, { label: "V1" });

    for (const id of ["../outside", "nested/v1", "nested\\v1", ".", "", "manifest.json", "v0", "v01"]) {
      assert.throws(() => versionDir(dir, id), /invalid version id/);
      assert.throws(() => loadVersion(dir, id), /invalid version id/);
      assert.throws(() => restoreVersion(dir, id), /invalid version id/);
    }

    const live = loadProject(dir);
    const text = live.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(text.content.text, "Live", "a rejected restore must not mutate the live project");
  });

  it("validates a snapshot before replacing the live project", () => {
    const dir = tmp();
    const p = openOrCreateProject(dir, { title: "Live" });
    listComposedPage(p, "pages/cover.page", titleOnlyCoverPage("Snapshot"));
    save(p);
    snapshotVersion(dir, { label: "V1" });

    const liveText = p.pages[0]!.page.elements[0] as { content: { text: string } };
    liveText.content.text = "Live now";
    save(p);
    fs.writeFileSync(path.join(versionDir(dir, "v1"), "project.pptd"), "not valid pptd", "utf8");

    assert.throws(() => restoreVersion(dir, "v1"));
    const live = loadProject(dir);
    const text = live.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(text.content.text, "Live now", "an invalid snapshot must not mutate the live project");
  });

  it("rejects snapshot symlinks before replacing the live project", () => {
    const dir = tmp();
    const p = openOrCreateProject(dir, { title: "Live" });
    listComposedPage(p, "pages/cover.page", titleOnlyCoverPage("Snapshot"));
    save(p);
    snapshotVersion(dir, { label: "V1" });
    const liveText = p.pages[0]!.page.elements[0] as { content: { text: string } };
    liveText.content.text = "Live now";
    save(p);
    fs.symlinkSync(path.join(dir, "deck.pptd"), path.join(versionDir(dir, "v1"), "outside-link.pptd"));

    assert.throws(() => loadVersion(dir, "v1"), /symbolic links/);
    assert.throws(() => restoreVersion(dir, "v1"), /symbolic links/);
    const live = loadProject(dir);
    const text = live.pages[0]!.page.elements[0] as { content: { text: string } };
    assert.equal(text.content.text, "Live now");
  });

  it("waits for a cross-process writer, preserves complete data, and never snapshots the live lock", async () => {
    const dir = tmp();
    const project = openOrCreateProject(dir, { title: "Snapshot source" });
    listComposedPage(project, "pages/cover.page", titleOnlyCoverPage("Snapshot source"));
    save(project);
    snapshotVersion(dir, { label: "V1" });

    const writer = holdProjectWriter(dir, "Writer finished snapshot");
    await writer.locked;
    const started = Date.now();
    const v2 = snapshotVersion(dir, { label: "V2" });
    const waitedForSnapshotWriter = Date.now() - started;
    await writer.done;
    assert.ok(waitedForSnapshotWriter >= 100, `snapshot bypassed writer in ${waitedForSnapshotWriter}ms`);
    assert.equal(coverText(versionDir(dir, v2.id)), "Writer finished snapshot");
    assert.ok(!fs.existsSync(path.join(versionDir(dir, v2.id), ".pptd-write.lock")));

    const restoreWriter = holdProjectWriter(dir, "Writer before restore");
    await restoreWriter.locked;
    const restoreStarted = Date.now();
    restoreVersion(dir, "v1");
    const waitedForRestoreWriter = Date.now() - restoreStarted;
    await restoreWriter.done;
    assert.ok(waitedForRestoreWriter >= 100, `restore bypassed writer in ${waitedForRestoreWriter}ms`);
    assert.equal(coverText(dir), "Snapshot source");
    assert.ok(!fs.existsSync(path.join(dir, ".pptd-write.lock")));
  });
});


it("persists a turn artifact only when the edit transaction is closed", () => {
  const dir = tmp();
  try {
    openOrCreateProject(dir);
    const requestId = "12345678-1234-1234-1234-123456789abc";
    const snapshot = snapshotVersion(dir, { assistantRequestId: requestId });
    assert.equal(listVersions(dir)[0]?.assistantRequestId, requestId);
    assert.equal(listVersions(dir)[0]?.assistantOutcome, undefined);
    recordAssistantVersionOutcome(dir, snapshot.id, "applied");
    assert.equal(listVersions(dir)[0]?.assistantOutcome, "applied");
    restoreVersion(dir, snapshot.id);
    assert.equal(listVersions(dir)[0]?.assistantOutcome, "applied", "restoring slide contents keeps the artifact relationship");
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
