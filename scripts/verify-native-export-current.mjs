#!/usr/bin/env node
/**
 * Regression: native-web must export the current PPTD files, not a session
 * that was opened before another writer (for example the DSH generator)
 * updated the deck on disk.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(ROOT, "fixtures/okp-yu7-ppt");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "native-export-current-"));
const project = path.join(scratch, "project");
const persistBarrier = path.join(scratch, "persist-barrier");
const restoreBarrier = path.join(scratch, "restore-barrier");
fs.cpSync(fixture, project, { recursive: true });

async function waitForFile(file, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object", "port probe must bind a TCP port");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await reservePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    NATIVE_WEB_PERSIST_BARRIER_DIR: persistBarrier,
    NATIVE_WEB_RESTORE_BARRIER_DIR: restoreBarrier,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`native-web exited before health check\n${serverLog}`);
    }
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`native-web did not start\n${serverLog}`);
}

async function waitForServerExit(timeoutMs) {
  if (server.exitCode !== null || server.signalCode !== null) return true;
  return await new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      server.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    timer.unref();
    server.once("exit", onExit);
  });
}

try {
  await waitForHealth();
  const opened = await fetch(`${base}/api/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: project }),
  });
  const initial = await opened.json();
  assert.ok(opened.ok && initial.model?.pageCount > 0, "server must hold an initial editor session");

  const snapshot = await fetch(`${base}/api/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "before traversal probe" }),
  });
  const snapshotData = await snapshot.json();
  assert.ok(snapshot.ok && snapshotData.versions?.length === 1, "fixture must have one known snapshot");
  const traversal = await fetch(`${base}/api/versions/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "../outside" }),
  });
  const traversalData = await traversal.json();
  assert.equal(traversal.status, 400, "traversal-like restore ids must be rejected by the API");
  assert.match(String(traversalData.error), /invalid version id/);
  const versionsAfterTraversal = await fetch(`${base}/api/versions`);
  const versionsData = await versionsAfterTraversal.json();
  assert.equal(
    versionsData.versions?.length,
    1,
    "a rejected restore must not create the automatic pre-restore snapshot",
  );

  // Model a separate DSH writer updating the disk after the editor opened it.
  const pptd = await import(pathToFileURL(path.join(ROOT, "packages/pptd-v2/dist/index.js")).href);
  const diskProject = pptd.loadProject(project);
  const firstPage = diskProject.pages[0];
  assert.ok(firstPage, "fixture must contain a page to copy");
  const copiedPage = structuredClone(firstPage.page);
  copiedPage.pageId = "export-current-regression";
  pptd.listComposedPage(diskProject, "pages/export-current-regression.page", copiedPage);
  pptd.saveProject(diskProject);
  const expectedSlideCount = initial.model.pageCount + 1;

  const exported = await fetch(`${base}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "pptx" }),
  });
  assert.equal(exported.status, 200, "PPTX export must succeed");
  const rawReport = exported.headers.get("X-Export-Report");
  assert.ok(rawReport, "PPTX export must report its source slide count");
  const report = JSON.parse(Buffer.from(rawReport, "base64url").toString("utf8"));
  assert.equal(
    report.slideCount,
    expectedSlideCount,
    "export must reopen the latest on-disk PPTD revision, not use the stale editor session",
  );

  // Fault-injection regression: pause the editor exactly after its on-disk
  // revision check. A DSH-style writer must not slip between that check and
  // persist; it waits for the same PPTD project lock, reloads inside it, and
  // then preserves both changes.
  fs.mkdirSync(persistBarrier, { recursive: true });
  fs.writeFileSync(path.join(persistBarrier, "arm"), "go\n", "utf8");
  const editRequest = fetch(`${base}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "addPage" }),
  });
  await waitForFile(path.join(persistBarrier, "checked"));
  let writerLog = "";
  const writer = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const pptd = await import(process.env.PPTD_MODULE);\n` +
        `const root = process.env.PPTD_PROJECT;\n` +
        `const { persistWrittenPages } = await import(process.env.DSH_AGENT_TOOLS);\n` +
        `const { loadPlaybook } = await import(process.env.DSH_PLAYBOOK);\n` +
        `persistWrittenPages({\n` +
        `  brief: '并发 DSH 写入',\n` +
        `  playbook: loadPlaybook({ hostDefaults: false }),\n` +
        `  todos: [], researchNotes: [], projectRoot: root,\n` +
        `  writtenPages: [{ id: 'persist-toctou-writer', pageType: 'content', elements: [{\n` +
        `    elementId: 'persist-toctou-text', elementType: 'text', bounds: [80, 120, 760, 80],\n` +
        `    content: { text: 'DSH writer after editor check', style: '$body' }\n` +
        `  }] }]\n` +
        `});\n`,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PPTD_MODULE: pathToFileURL(path.join(ROOT, "packages/pptd-v2/dist/index.js")).href,
        PPTD_PROJECT: project,
        DSH_AGENT_TOOLS: pathToFileURL(path.join(ROOT, "packages/presentation-run/dist/domain/agent-tools.js")).href,
        DSH_PLAYBOOK: pathToFileURL(path.join(ROOT, "packages/presentation-run/dist/domain/playbook.js")).href,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  writer.stderr.on("data", (chunk) => { writerLog += chunk; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(writer.exitCode, null, "external writer must wait for the editor project lock");
  fs.writeFileSync(path.join(persistBarrier, "release"), "go\n", "utf8");
  const edited = await editRequest;
  assert.equal(edited.status, 200, "an edit after export must succeed on the refreshed live session");
  const writerStatus = await new Promise((resolve, reject) => {
    writer.once("error", reject);
    writer.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(
    writerStatus,
    { code: 0, signal: null },
    `external DSH writer must finish after editor persist\n${writerLog}`,
  );
  const afterEdit = pptd.loadProject(project);
  assert.ok(
    afterEdit.pages.some((page) => page.page.pageId === "export-current-regression"),
    "editing after export must not overwrite the externally generated page",
  );
  assert.ok(
    afterEdit.pages.some((page) => page.path === "pages/persist-toctou-writer.page"),
    "the writer that arrived after the editor revision check must not be overwritten",
  );
  assert.equal(afterEdit.pages.length, expectedSlideCount + 2, "both serialized edits must survive");

  // Reader-side regression: leave a deliberately mixed manifest/page state
  // while an external writer owns the project lock. Opening the native editor
  // must wait for that writer instead of binding a session to the half-save.
  const readBarrier = path.join(scratch, "read-barrier");
  let heldWriterLog = "";
  const heldWriter = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const fs = await import('node:fs');\n` +
        `const path = await import('node:path');\n` +
        `const YAML = (await import('yaml')).default;\n` +
        `const pptd = await import(process.env.PPTD_MODULE);\n` +
        `const root = process.env.PPTD_PROJECT;\n` +
        `const barrier = process.env.READ_BARRIER;\n` +
        `pptd.withProjectWriteLock(root, () => {\n` +
        `  const project = pptd.loadProject(root);\n` +
        `  const first = project.pages[0];\n` +
        `  if (!first) throw new Error('fixture has no first page');\n` +
        `  const page = structuredClone(first.page);\n` +
        `  pptd.listComposedPage(project, 'pages/reader-lock-snapshot.page', page);\n` +
        `  fs.writeFileSync(project.manifestPath, YAML.stringify({ ...project.presentation, pages: project.pages.map((p) => p.path) }), 'utf8');\n` +
        `  fs.mkdirSync(barrier, { recursive: true });\n` +
        `  fs.writeFileSync(path.join(barrier, 'held'), 'ready\\n', 'utf8');\n` +
        `  const release = path.join(barrier, 'release');\n` +
        `  const deadline = Date.now() + 10_000;\n` +
        `  while (!fs.existsSync(release)) {\n` +
        `    if (Date.now() >= deadline) throw new Error('reader lock barrier timed out');\n` +
        `    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);\n` +
        `  }\n` +
        `  pptd.saveProject(project);\n` +
        `});\n`,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PPTD_MODULE: pathToFileURL(path.join(ROOT, "packages/pptd-v2/dist/index.js")).href,
        PPTD_PROJECT: project,
        READ_BARRIER: readBarrier,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  heldWriter.stderr.on("data", (chunk) => { heldWriterLog += chunk; });
  await waitForFile(path.join(readBarrier, "held"));
  let openSettled = false;
  const reopen = fetch(`${base}/api/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: project }),
  }).then(async (response) => {
    openSettled = true;
    return { response, body: await response.json() };
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(openSettled, false, "native open must wait for a writer-held project lock");
  fs.writeFileSync(path.join(readBarrier, "release"), "go\n", "utf8");
  const heldWriterStatus = await new Promise((resolve, reject) => {
    heldWriter.once("error", reject);
    heldWriter.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(
    heldWriterStatus,
    { code: 0, signal: null },
    `writer-held reader regression writer failed\n${heldWriterLog}`,
  );
  const reopened = await reopen;
  assert.equal(reopened.response.status, 200, "native open must resume after the complete save");
  assert.equal(reopened.body.model?.pageCount, afterEdit.pages.length + 1, "native session must bind the completed snapshot");
  const afterReaderLock = pptd.loadProject(project);
  assert.ok(
    afterReaderLock.pages.some((page) => page.path === "pages/reader-lock-snapshot.page"),
    "the completed mixed writer page must be preserved for the native reader",
  );

  // Restore is destructive, so its editor persist, automatic pre-restore
  // backup, restore, post-restore snapshot, and session reopen must share one
  // lock. Pause after the backup, then prove a DSH writer cannot enter until
  // the whole transaction is done. The backup keeps the pre-restore page;
  // the final live project keeps the writer that arrived afterwards.
  fs.mkdirSync(restoreBarrier, { recursive: true });
  fs.writeFileSync(path.join(restoreBarrier, "arm"), "go\n", "utf8");
  const restoreRequest = fetch(`${base}/api/versions/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "v1" }),
  });
  await waitForFile(path.join(restoreBarrier, "pre-snapshot"));
  const restoreWriterAttempt = path.join(restoreBarrier, "writer-attempt");
  let restoreWriterLog = "";
  const restoreWriter = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const fs = await import('node:fs');\n` +
        `const pptd = await import(process.env.PPTD_MODULE);\n` +
        `const root = process.env.PPTD_PROJECT;\n` +
        `const { persistWrittenPages } = await import(process.env.DSH_AGENT_TOOLS);\n` +
        `const { loadPlaybook } = await import(process.env.DSH_PLAYBOOK);\n` +
        `fs.writeFileSync(process.env.RESTORE_WRITER_ATTEMPT, 'attempted\\n');\n` +
        `persistWrittenPages({\n` +
        `  brief: 'restore transaction writer',\n` +
        `  playbook: loadPlaybook({ hostDefaults: false }),\n` +
        `  todos: [], researchNotes: [], projectRoot: root,\n` +
        `  writtenPages: [{ id: 'restore-transaction-writer', pageType: 'content', elements: [{\n` +
        `    elementId: 'restore-transaction-text', elementType: 'text', bounds: [80, 120, 760, 80],\n` +
        `    content: { text: 'DSH writer after restore transaction', style: '$body' }\n` +
        `  }] }]\n` +
        `});\n`,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PPTD_MODULE: pathToFileURL(path.join(ROOT, "packages/pptd-v2/dist/index.js")).href,
        PPTD_PROJECT: project,
        DSH_AGENT_TOOLS: pathToFileURL(path.join(ROOT, "packages/presentation-run/dist/domain/agent-tools.js")).href,
        DSH_PLAYBOOK: pathToFileURL(path.join(ROOT, "packages/presentation-run/dist/domain/playbook.js")).href,
        RESTORE_WRITER_ATTEMPT: restoreWriterAttempt,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  restoreWriter.stderr.on("data", (chunk) => { restoreWriterLog += chunk; });
  await waitForFile(restoreWriterAttempt);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(restoreWriter.exitCode, null, "DSH writer must wait for the complete restore transaction");
  fs.writeFileSync(path.join(restoreBarrier, "release"), "go\n", "utf8");
  const restoredResponse = await restoreRequest;
  const restoredData = await restoredResponse.json();
  assert.equal(restoredResponse.status, 200, "restore transaction must complete");
  const restoreWriterStatus = await new Promise((resolve, reject) => {
    restoreWriter.once("error", reject);
    restoreWriter.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(
    restoreWriterStatus,
    { code: 0, signal: null },
    `writer after restore transaction must finish\n${restoreWriterLog}`,
  );
  const preRestore = restoredData.versions.find((version) => version.label === "恢复前");
  const restoredSnapshot = restoredData.versions.find((version) => version.label === "从 v1 恢复");
  assert.ok(preRestore && restoredSnapshot, "restore must publish both automatic snapshots");
  const preRestoreProject = pptd.loadProject(path.join(project, ".versions", preRestore.id));
  assert.ok(
    preRestoreProject.pages.some((page) => page.path === "pages/reader-lock-snapshot.page"),
    "pre-restore snapshot must retain the complete pre-restore project",
  );
  const restoredSnapshotProject = pptd.loadProject(path.join(project, ".versions", restoredSnapshot.id));
  assert.ok(
    !restoredSnapshotProject.pages.some((page) => page.path === "pages/reader-lock-snapshot.page"),
    "post-restore snapshot must contain the requested version, not the old live project",
  );
  const afterRestoreTransaction = pptd.loadProject(project);
  assert.ok(
    afterRestoreTransaction.pages.some((page) => page.path === "pages/restore-transaction-writer.page"),
    "the writer that arrived during restore must run afterwards and survive",
  );
  console.log(JSON.stringify({
    ok: true,
    expectedSlideCount,
    exportedSlideCount: report.slideCount,
    postEditSlideCount: afterEdit.pages.length,
    postReadSlideCount: afterReaderLock.pages.length,
    postRestoreSlideCount: afterRestoreTransaction.pages.length,
  }));
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    if (!(await waitForServerExit(5_000))) {
      server.kill("SIGKILL");
      await waitForServerExit(2_000);
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
