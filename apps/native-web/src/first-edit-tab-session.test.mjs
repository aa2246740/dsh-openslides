import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import YAML from "yaml";

// A project that has never been edited has no version yet: its first mutating
// command snapshots V1 before applying the edit. That baseline must be taken
// through the same per-tab live session the command runs on, otherwise a
// browser tab's first edit collides with the "default" tab session and every
// retry answers 409 without ever creating V1.
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openslides-first-edit-tab-"));
const pageFile = path.join(projectRoot, "pages", "01_page.page");
fs.mkdirSync(path.dirname(pageFile), { recursive: true });
fs.writeFileSync(path.join(projectRoot, "deck.pptd"), `${JSON.stringify({
  version: "v2",
  title: "First edit",
  size: [960, 540],
  pages: ["pages/01_page.page"],
})}\n`);
fs.writeFileSync(pageFile, `${JSON.stringify({
  pageType: "content",
  elements: [{
    elementId: "title",
    elementType: "text",
    bounds: [80, 80, 800, 60],
    content: { text: "Before", fontSize: 32 },
  }],
})}\n`);

process.env.OPEN_SLIDESTUDIO_PROJECT = projectRoot;
const { server } = await import("./server.mjs");

async function endpoint() {
  if (!server.listening) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  }
  return `http://127.0.0.1:${server.address().port}`;
}

async function command(base, body, tab) {
  const query = new URLSearchParams({ project: projectRoot });
  if (tab) query.set("tab", tab);
  const response = await fetch(`${base}/api/command?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe("first edit on a version-less project", () => {
  it("snapshots V1 through the editing tab's own session", async () => {
    const base = await endpoint();
    // Another client (no tab id) already holds the default live session.
    assert.equal((await command(base, { cmd: "select", elementId: "title" })).status, 200);

    const first = await command(base, { cmd: "insert", kind: "table", rows: 2, columns: 2 }, "tab-a");
    assert.equal(first.status, 200, `first edit failed: ${first.body.error}`);
    const tables = first.body.model.elements.filter((element) => element.type === "table");
    assert.equal(tables.length, 1, "the inserted table is in the live model");

    const saved = YAML.parse(fs.readFileSync(pageFile, "utf8"));
    assert.equal(saved.elements.filter((element) => element.elementType === "table").length, 1,
      "the inserted table is persisted to the page file");

    const versions = await fetch(`${base}/api/versions?project=${encodeURIComponent(projectRoot)}&tab=tab-a`)
      .then((response) => response.json());
    const list = Array.isArray(versions) ? versions : versions.versions;
    assert.ok(Array.isArray(list) && list.length >= 1, "V1 baseline exists after the first edit");
  });
});
