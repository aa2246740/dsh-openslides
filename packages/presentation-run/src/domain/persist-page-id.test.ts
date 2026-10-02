import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, loadProject, saveProject } from "@open-slidestudio/pptd-v2";
import {
  persistPageKey,
  persistPagePathFromId,
  pageIdMatchesFile,
} from "./layout-qa.js";
import type { SkillPageInput } from "./skill-pages.js";
import { executeGenerateTool, persistWrittenPages } from "./agent-tools.js";
import { loadPlaybook } from "./playbook.js";
import { runDomainHand, writeDomainRuntime } from "./domain-hands.js";
import { stableSha256 } from "./run-ledger.js";

const navy = {
  elementId: "cl-bg",
  elementType: "shape" as const,
  shapeName: "rect" as const,
  bounds: [0, 0, 960, 540] as [number, number, number, number],
  fill: { type: "solid" as const, color: "#06223F" },
};

function textEl(
  id: string,
  text: string,
  bounds: [number, number, number, number],
  fontSize: number,
): SkillPageInput["elements"][number] {
  return {
    elementId: id,
    elementType: "text",
    bounds,
    content: { text, fontSize, color: "#FFFFFF" },
  };
}

function pageWithCopy(id: string, pageType: SkillPageInput["pageType"], title: string): SkillPageInput {
  return {
    id,
    pageType,
    elements: [navy, textEl("t", title, [80, 160, 800, 80], 36)],
  };
}

function closingElements(id: string, title: string): SkillPageInput["elements"] {
  return [
    navy,
    textEl(`${id}-title`, title, [80, 120, 800, 64], 32),
    textEl(`${id}-recap`, "本页有可读的回顾信息。", [80, 230, 800, 52], 18),
    textEl(`${id}-ask`, "下一步：确认并执行。", [80, 330, 800, 52], 18),
  ];
}

function persistAll(root: string, pages: SkillPageInput[]): void {
  persistWrittenPages({
    brief: "persist identity inversion",
    playbook: loadPlaybook({ hostDefaults: false }),
    todos: [],
    researchNotes: [],
    writtenPages: pages,
    projectRoot: root,
  });
}

function listedBasenames(root: string): string[] {
  return loadProject(root).pages.map((page) => page.path.replace(/\\/g, "/"));
}

describe("EDITH persist identity round-trip", () => {
  it("id → path → id is persistPageKey for 1_cover, 1_cover.page, 12_div_ops, p01_cover", () => {
    for (const id of ["1_cover", "1_cover.page", "12_div_ops", "12_div_ops.page", "p01_cover", "p01_cover.page"]) {
      const rel = persistPagePathFromId(id);
      assert.equal(persistPageKey(rel), persistPageKey(id), id);
      assert.equal(pageIdMatchesFile(id, rel), true, id);
      assert.doesNotMatch(rel, /coverpage|divopspage|opspage/);
    }
    assert.equal(persistPagePathFromId("1_cover"), "pages/1_cover.page");
    assert.equal(persistPagePathFromId("1_cover.page"), "pages/1_cover.page");
    assert.equal(persistPagePathFromId("12_div_ops"), "pages/12_div_ops.page");
    assert.equal(persistPagePathFromId("p01_cover"), "pages/p01_cover.page");
    assert.equal(pageIdMatchesFile("1_cover.page", "pages/1_coverpage.page"), false);
    assert.equal(pageIdMatchesFile("1_cover", "pages/02_cover.page"), false);
  });

  it("persist id=1_cover twice → one file pages/1_cover.page, never 1_coverpage.page, never 2_cover.page", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "persist-1-cover-"));
    createEmptyProject(root, { title: "persist 1_cover" });
    const cover = pageWithCopy("1_cover", "cover", "封面标题足够长了用于测试");
    persistAll(root, [cover]);
    persistAll(root, [cover]);
    const listed = listedBasenames(root);
    assert.deepEqual(listed, ["pages/1_cover.page"]);
    assert.equal(fs.existsSync(path.join(root, "pages", "1_cover.page")), true);
    assert.equal(fs.existsSync(path.join(root, "pages", "1_coverpage.page")), false);
    assert.equal(fs.existsSync(path.join(root, "pages", "02_cover.page")), false);
    assert.equal(fs.existsSync(path.join(root, "pages", "2_cover.page")), false);
  });

  it("persist id=1_cover.page twice then with 12_div_ops.page does not append leftovers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "persist-dot-id-"));
    createEmptyProject(root, { title: "persist MiniMax ids" });
    const cover = pageWithCopy("1_cover.page", "cover", "封面标题足够长了用于测试");
    const ops = pageWithCopy("12_div_ops.page", "chapter", "商品与运营章节标题足够");
    persistAll(root, [cover]);
    persistAll(root, [cover]);
    persistAll(root, [cover, ops]);
    persistAll(root, [cover, ops]);
    const listed = listedBasenames(root);
    assert.deepEqual(listed, ["pages/1_cover.page", "pages/12_div_ops.page"]);
    assert.equal(listed.includes("pages/1_coverpage.page"), false);
    assert.equal(listed.some((rel) => /\/\d+_cover\.page$/.test(rel) && rel !== "pages/1_cover.page"), false);
    assert.equal(loadProject(root).pages.length, 2);
  });

  it("persist p01_cover twice stays pages/p01_cover.page", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "persist-p01-"));
    createEmptyProject(root, { title: "persist p01_cover" });
    const cover = pageWithCopy("p01_cover", "cover", "差 140 万不是客单下跌封面");
    persistAll(root, [cover]);
    persistAll(root, [cover]);
    assert.deepEqual(listedBasenames(root), ["pages/p01_cover.page"]);
    assert.equal(fs.existsSync(path.join(root, "pages", "1_cover.page")), false);
  });

  it("runDomainHand writes p2 without replaying stale p1 over a native edit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "domain-page-scope-"));
    createEmptyProject(root, { title: "page scoped domain hand" });
    writeDomainRuntime(root, { brief: "给团队介绍一个简单产品，不是经营月报。" });
    const p1 = await runDomainHand(
      "write_page",
      { id: "p1", pageType: "final", elements: closingElements("p1", "DSH 原始 p1") },
      root,
    );
    assert.equal(p1.ok, true, p1.detail);

    const native = loadProject(root);
    const first = native.pages.find((page) => page.path === "pages/p1.page");
    assert.ok(first);
    const title = first.page.elements.find((element) => element.elementId === "p1-title") as {
      content?: { text?: string };
    };
    assert.ok(title?.content);
    title.content.text = "Native 已编辑 p1";
    saveProject(native);

    const p2 = await runDomainHand(
      "write_page",
      { id: "p2", pageType: "final", elements: closingElements("p2", "DSH 新写 p2") },
      root,
    );
    assert.equal(p2.ok, true, p2.detail);
    const render = await runDomainHand("render_page", { pageId: "p2" }, root);
    assert.equal(render.name, "render_page");

    const after = loadProject(root);
    const p1After = after.pages.find((page) => page.path === "pages/p1.page");
    const p2After = after.pages.find((page) => page.path === "pages/p2.page");
    assert.match(JSON.stringify(p1After?.page.elements), /Native 已编辑 p1/);
    assert.match(JSON.stringify(p2After?.page.elements), /DSH 新写 p2/);
  });

  it("rejects a stale expectedPageSha256 inside the project write transaction", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "domain-page-cas-"));
    createEmptyProject(root, { title: "page CAS" });
    const firstPage = pageWithCopy("p1", "cover", "AI 读取时的标题");
    persistAll(root, [firstPage]);

    const before = loadProject(root);
    const persisted = before.pages.find((page) => page.path === "pages/p1.page");
    assert.ok(persisted);
    const staleSha256 = stableSha256({ ...persisted.page, id: "p1" });

    const title = persisted.page.elements.find((element) => element.elementId === "t") as {
      content?: { text?: string };
    };
    assert.ok(title?.content);
    title.content.text = "人类在 AI 写入前的新标题";
    saveProject(before);

    const state = {
      brief: "page CAS",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [firstPage],
      projectRoot: root,
    };
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page",
      expiresAt: Date.now() + 60_000,
    }));
    const missing = persistWrittenPages(
      state,
      [pageWithCopy("p1", "cover", "没有 CAS 的 AI 修改")],
    );
    assert.equal(missing.ok, false);
    if (missing.ok) assert.fail("an active AI review guard must require CAS");
    assert.equal(missing.error, "page_revision_required");

    const result = persistWrittenPages(
      state,
      [pageWithCopy("p1", "cover", "AI 的旧基线修改")],
      { expectedPageSha256: staleSha256 },
    );

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("stale CAS must not succeed");
    assert.equal(result.error, "page_revision_conflict");
    assert.match(JSON.stringify(loadProject(root).pages[0]?.page.elements), /人类在 AI 写入前的新标题/);
    assert.doesNotMatch(JSON.stringify(loadProject(root).pages[0]?.page.elements), /AI 的旧基线修改/);

    const latest = loadProject(root).pages[0];
    assert.ok(latest);
    const currentSha256 = stableSha256({ ...latest.page, id: "p1" });
    const accepted = persistWrittenPages(
      state,
      [pageWithCopy("p1", "cover", "基于最新读取的 AI 修改")],
      { expectedPageSha256: currentSha256 },
    );
    assert.equal(accepted.ok, true);
    assert.match(JSON.stringify(loadProject(root).pages[0]?.page.elements), /基于最新读取的 AI 修改/);
  });
});

describe("human element review write guard", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-write-scope-"));
    createEmptyProject(root, { title: "Preserve deck title" });
    const page = pageWithCopy("p1", "cover", "Before");
    persistAll(root, [page, pageWithCopy("p2", "content", "Other page")]);
    const project = loadProject(root);
    project.presentation.title = "Human deck title";
    saveProject(project);
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    const scope = { kind: "elements", pageId: "p1", elementIds: ["t"] };
    fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page", expiresAt: Date.now() + 60_000, scope, pageBody: project.pages[0]!.page,
    }));
    const state = {
      brief: "Old generation title must not overwrite human title",
      playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [page], projectRoot: root,
    };
    const sha = (id = "p1") => stableSha256({ ...loadProject(root).pages.find(p => p.path === `pages/${id}.page`)!.page, id });
    return { root, state, page, sha };
  }

  it("rejects unselected edits, metadata, reorder and page changes before any bytes change", () => {
    const f = fixture();
    const files = ["deck.pptd", "pages/p1.page", "pages/p2.page"];
    const before = files.map(file => fs.readFileSync(path.join(f.root, file), "utf8"));
    const changedOutside = structuredClone(pageWithCopy("p1", "cover", "After"));
    changedOutside.elements[0]!.bounds = [1, 0, 960, 540];
    const changedMeta = { ...pageWithCopy("p1", "cover", "After"), notes: "Unauthorized notes" };
    const reordered = pageWithCopy("p1", "cover", "After");
    reordered.elements.reverse();
    for (const proposed of [changedOutside, changedMeta, reordered, pageWithCopy("p2", "content", "Unauthorized page")]) {
      const result = persistWrittenPages(f.state, [proposed], { expectedPageSha256: f.sha(proposed.id) });
      assert.equal(result.ok, false);
      if (result.ok) assert.fail("out-of-scope write must fail");
      assert.equal(result.error, "review_scope_violation");
      assert.deepEqual(files.map(file => fs.readFileSync(path.join(f.root, file), "utf8")), before);
    }
  });

  it("allows only the selected target and preserves the deck title and other page", () => {
    const f = fixture();
    const other = fs.readFileSync(path.join(f.root, "pages/p2.page"), "utf8");
    const result = persistWrittenPages(f.state, [pageWithCopy("p1", "cover", "After")], { expectedPageSha256: f.sha() });
    assert.equal(result.ok, true);
    assert.equal(loadProject(f.root).presentation.title, "Human deck title");
    assert.equal(fs.readFileSync(path.join(f.root, "pages/p2.page"), "utf8"), other);
    assert.match(JSON.stringify(loadProject(f.root).pages[0]!.page), /After/);
  });

  it("honors multi-element and explicit page/deck scopes without relaxing version checks", () => {
    for (const scope of [
      { kind: "elements", pageId: "p1", elementIds: ["t", "cl-bg"] },
      { kind: "page", pageId: "p1", elementIds: [] },
      { kind: "pages", pageId: "p2", elementIds: [], targetPageIds: ["p2"] },
      { kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2"] },
    ]) {
      const f = fixture();
      fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
        pagePath: "pages/p1.page", expiresAt: Date.now() + 60_000, scope, pageBody: loadProject(f.root).pages[0]!.page,
      }));
      const id = scope.kind === "deck" || scope.kind === "pages" ? "p2" : "p1";
      const proposed = structuredClone(pageWithCopy(id, id === "p1" ? "cover" : "content", "After"));
      proposed.elements[0]!.bounds = [1, 0, 959, 540];
      const noCas = persistWrittenPages(f.state, [proposed]);
      assert.equal(noCas.ok, false, scope.kind);
      const accepted = persistWrittenPages(f.state, [proposed], { expectedPageSha256: f.sha(id) });
      assert.equal(accepted.ok, true, JSON.stringify(accepted));
      assert.equal(loadProject(f.root).presentation.title, "Human deck title");
      if (scope.kind === "pages") {
        const outside = persistWrittenPages(f.state, [pageWithCopy("p1", "cover", "Outside subset")], {
          expectedPageSha256: f.sha("p1"),
        });
        assert.equal(outside.ok, false);
        if (outside.ok) assert.fail("pages scope must reject a page outside its exact target set");
        assert.equal(outside.error, "review_scope_violation");
      }
    }
  });

  it("keeps the original protected baseline across repeated edits and external changes", () => {
    const f = fixture();
    for (const title of ["First correction", "Second correction"]) {
      assert.equal(persistWrittenPages(f.state, [pageWithCopy("p1", "cover", title)], { expectedPageSha256: f.sha() }).ok, true);
    }
    // An unrelated writer bypasses the editor lease. A fresh read/CAS must not
    // legitimize that mutation as part of this element-scoped review.
    const changed = loadProject(f.root);
    changed.pages[0]!.page.elements[0]!.bounds = [1, 0, 959, 540];
    saveProject(changed);
    const proposed = structuredClone(pageWithCopy("p1", "cover", "Third correction"));
    proposed.elements[0]!.bounds = [1, 0, 959, 540];
    const before = fs.readFileSync(path.join(f.root, "pages/p1.page"), "utf8");
    const rejected = persistWrittenPages(f.state, [proposed], { expectedPageSha256: f.sha() });
    assert.equal(rejected.ok, false);
    if (rejected.ok) assert.fail("fresh CAS must not replace original review baseline");
    assert.equal(rejected.error, "review_scope_violation");
    assert.equal(fs.readFileSync(path.join(f.root, "pages/p1.page"), "utf8"), before);
  });

  it("fails closed if an element scope loses its original baseline", () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page", expiresAt: Date.now() + 60_000,
      scope: { kind: "elements", pageId: "p1", elementIds: ["t"] },
    }));
    const result = persistWrittenPages(f.state, [pageWithCopy("p1", "cover", "After")], { expectedPageSha256: f.sha() });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("must not silently recapture a missing baseline");
    assert.equal(result.error, "review_scope_violation");
    assert.doesNotMatch(JSON.stringify(loadProject(f.root).pages[0]!.page), /After/);
  });
});


describe("structural page-list edit guard", () => {
  function fixture(insertIndex: number) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "structural-edit-"));
    createEmptyProject(root, { title: "Structural" });
    persistAll(root, [pageWithCopy("p1", "cover", "Cover"), pageWithCopy("p2", "content", "Second"), pageWithCopy("p3", "content", "Third")]);
    const project = loadProject(root);
    const projectPages = project.pages.map((entry) => ({
      pageId: entry.path.replace(/^pages\//, "").replace(/\.page$/, ""),
      pagePath: entry.path,
      pageSha256: stableSha256({ id: entry.path.replace(/^pages\//, "").replace(/\.page$/, ""), ...entry.page }),
    }));
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page",
      expiresAt: Date.now() + 60_000,
      scope: { kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2", "p3"], structureOnly: true, insertIndex },
      projectPages,
    }));
    const state = { brief: "Structural", playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [], projectRoot: root };
    const sha = (id: string) => stableSha256({ ...loadProject(root).pages.find(p => p.path === `pages/${id}.page`)!.page, id });
    return { root, state, sha };
  }

  it("writes a new page without CAS and inserts it at insertIndex", () => {
    const f = fixture(1);
    const p2Bytes = fs.readFileSync(path.join(f.root, "pages/p2.page"), "utf8");
    const result = persistWrittenPages(f.state, [pageWithCopy("new_closing", "final", "再见页")]);
    assert.equal(result.ok, true, JSON.stringify(result));
    const order = loadProject(f.root).pages.map((entry) => entry.path);
    assert.equal(order.length, 4);
    assert.equal(order[1], "pages/new_closing.page");
    assert.equal(fs.readFileSync(path.join(f.root, "pages/p2.page"), "utf8"), p2Bytes);
  });

  it("appends when insertIndex reaches the end and keeps write order for sequential inserts", () => {
    const f = fixture(3);
    assert.equal(persistWrittenPages(f.state, [pageWithCopy("n1", "final", "第一页新增")]).ok, true);
    assert.equal(persistWrittenPages(f.state, [pageWithCopy("n2", "final", "第二页新增")]).ok, true);
    const order = loadProject(f.root).pages.map((entry) => entry.path);
    assert.deepEqual(order.slice(3), ["pages/n1.page", "pages/n2.page"]);
  });

  it("lands sequential mid-deck inserts after the pages this turn already added", () => {
    const f = fixture(1);
    assert.equal(persistWrittenPages(f.state, [pageWithCopy("n1", "content", "插入一")]).ok, true);
    assert.equal(persistWrittenPages(f.state, [pageWithCopy("n2", "content", "插入二")]).ok, true);
    const order = loadProject(f.root).pages.map((entry) => entry.path);
    assert.deepEqual(order, ["pages/p1.page", "pages/n1.page", "pages/n2.page", "pages/p2.page", "pages/p3.page"]);
  });

  it("rejects writes to existing pages even with a valid CAS", () => {
    const f = fixture(3);
    const result = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "不许改")], { expectedPageSha256: f.sha("p2") });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("structural guard must not allow editing an existing page");
    assert.equal(result.error, "review_scope_violation");
    assert.match(JSON.stringify(loadProject(f.root).pages.find(p => p.path === "pages/p2.page")!.page), /Second/);
  });

  it("rejects a multi-page structural write and a stale CAS on a new page", () => {
    const f = fixture(3);
    const multi = persistWrittenPages(f.state, [pageWithCopy("n1", "final", "一"), pageWithCopy("n2", "final", "二")]);
    assert.equal(multi.ok, false);
    if (multi.ok) assert.fail("structural writes stay single-page like every write_page call");
    const staleCas = persistWrittenPages(f.state, [pageWithCopy("n1", "final", "一")], { expectedPageSha256: "f".repeat(64) });
    assert.equal(staleCas.ok, false);
    if (staleCas.ok) assert.fail("a fabricated CAS must not bless a new page");
    assert.equal(staleCas.error, "page_revision_conflict");
  });

  it("a non-structural deck guard still cannot create pages", () => {
    const f = fixture(3);
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page",
      expiresAt: Date.now() + 60_000,
      scope: { kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2", "p3"] },
    }));
    const result = persistWrittenPages(f.state, [pageWithCopy("n1", "final", "新页")]);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("a plain deck scope must not grow the page list");
    assert.equal(result.error, "page_revision_required");
  });

  it("whitelists editable baseline pages while every other existing page stays frozen", () => {
    const f = fixture(3);
    const lock = JSON.parse(fs.readFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), "utf8"));
    lock.scope.editablePageIds = ["p2"];
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    // Whitelisted page: CAS-guarded write succeeds.
    const allowed = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "改成这样")], { expectedPageSha256: f.sha("p2") });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    assert.match(JSON.stringify(loadProject(f.root).pages.find(p => p.path === "pages/p2.page")!.page), /改成这样/);
    // Whitelisted page still requires CAS.
    const noCas = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "无校验")]);
    assert.equal(noCas.ok, false);
    if (noCas.ok) assert.fail("an editable baseline page still needs its CAS");
    assert.equal(noCas.error, "page_revision_required");
    // Non-whitelisted page stays frozen even with a valid CAS.
    const denied = persistWrittenPages(f.state, [pageWithCopy("p3", "content", "不许改")], { expectedPageSha256: f.sha("p3") });
    assert.equal(denied.ok, false);
    if (denied.ok) assert.fail("editablePageIds is a whitelist, not a blanket grant");
    assert.equal(denied.error, "review_scope_violation");
    assert.match(JSON.stringify(loadProject(f.root).pages.find(p => p.path === "pages/p3.page")!.page), /Third/);
    // Adding still works alongside the editable whitelist.
    assert.equal(persistWrittenPages(f.state, [pageWithCopy("n1", "final", "新页")]).ok, true);
    assert.equal(loadProject(f.root).pages.length, 4);
  });

  it("delete_pages removes only the authorized page, updates the manifest and the file", () => {
    const f = fixture(3);
    const lock = JSON.parse(fs.readFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), "utf8"));
    lock.scope.deletablePageIds = ["p2"];
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    const result = executeGenerateTool("delete_pages", { pageIds: ["p2"] }, f.state);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(fs.existsSync(path.join(f.root, "pages/p2.page")), false);
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path), ["pages/p1.page", "pages/p3.page"]);
    // Remaining page content untouched.
    assert.match(fs.readFileSync(path.join(f.root, "pages/p3.page"), "utf8"), /Third/);
  });

  it("delete_pages refuses pages outside the authorized set and reports missing ids", () => {
    const f = fixture(3);
    const lock = JSON.parse(fs.readFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), "utf8"));
    lock.scope.deletablePageIds = ["p2"];
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    const denied = executeGenerateTool("delete_pages", { pageIds: ["p2", "p3"] }, f.state);
    assert.equal(denied.ok, false);
    assert.equal((denied.payload as { error?: string } | undefined)?.error, "review_scope_violation");
    assert.equal(loadProject(f.root).pages.length, 3, "nothing may be removed on a denied call");
    const missing = executeGenerateTool("delete_pages", { pageIds: ["p2", "ghost"] }, f.state);
    assert.equal(missing.ok, false);
    assert.equal((missing.payload as { error?: string } | undefined)?.error, "review_scope_violation", "unauthorized ghost id must fail before deletion");
    assert.equal(loadProject(f.root).pages.length, 3);
  });

  it("delete_pages without a deletable grant is refused even under a structural lock", () => {
    const f = fixture(3);
    const denied = executeGenerateTool("delete_pages", { pageIds: ["p2"] }, f.state);
    assert.equal(denied.ok, false);
    assert.equal((denied.payload as { error?: string } | undefined)?.error, "review_scope_violation");
    assert.equal(loadProject(f.root).pages.length, 3);
  });

  it("reorder_pages applies exactly the authorized permutation and touches no page content", () => {
    const f = fixture(3);
    const lock = JSON.parse(fs.readFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), "utf8"));
    delete lock.scope.insertIndex;
    lock.scope.reorderPageIds = ["p3", "p1", "p2"];
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    const bytesBefore = Object.fromEntries(loadProject(f.root).pages.map((entry) =>
      [entry.path, fs.readFileSync(path.join(f.root, entry.path), "utf8")]));
    const result = executeGenerateTool("reorder_pages", { pageIds: ["p3", "p1", "p2"] }, f.state);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path), ["pages/p3.page", "pages/p1.page", "pages/p2.page"]);
    for (const [p, bytes] of Object.entries(bytesBefore)) {
      assert.equal(fs.readFileSync(path.join(f.root, p), "utf8"), bytes, `${p} content must be byte-identical`);
    }
  });

  it("reorder_pages refuses a different order and is absent without the grant", () => {
    const f = fixture(3);
    const lock = JSON.parse(fs.readFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), "utf8"));
    delete lock.scope.insertIndex;
    lock.scope.reorderPageIds = ["p3", "p1", "p2"];
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    const wrong = executeGenerateTool("reorder_pages", { pageIds: ["p1", "p3", "p2"] }, f.state);
    assert.equal(wrong.ok, false);
    assert.equal((wrong.payload as { error?: string } | undefined)?.error, "review_scope_violation");
    const partial = executeGenerateTool("reorder_pages", { pageIds: ["p3", "p1"] }, f.state);
    assert.equal(partial.ok, false);
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path), ["pages/p1.page", "pages/p2.page", "pages/p3.page"], "nothing moves on a refused call");
    delete lock.scope.reorderPageIds;
    fs.writeFileSync(path.join(f.root, "_agent", "ai-review-lock.v1.json"), JSON.stringify(lock));
    const noGrant = executeGenerateTool("reorder_pages", { pageIds: ["p3", "p1", "p2"] }, f.state);
    assert.equal(noGrant.ok, false);
    assert.equal((noGrant.payload as { error?: string } | undefined)?.error, "review_scope_violation");
  });
});

describe("full rewrite lock", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-edit-"));
    createEmptyProject(root, { title: "Rewrite" });
    persistAll(root, [pageWithCopy("p1", "cover", "Cover"), pageWithCopy("p2", "content", "Second"), pageWithCopy("p3", "content", "Third")]);
    const project = loadProject(root);
    const projectPages = project.pages.map((entry) => ({
      pageId: entry.path.replace(/^pages\//, "").replace(/\.page$/, ""),
      pagePath: entry.path,
      pageSha256: stableSha256({ id: entry.path.replace(/^pages\//, "").replace(/\.page$/, ""), ...entry.page }),
    }));
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page",
      expiresAt: Date.now() + 60_000,
      scope: { kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2", "p3"], rewrite: true },
      projectPages,
    }));
    const state = { brief: "Rewrite", playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [], projectRoot: root };
    const sha = (id: string) => stableSha256({ ...loadProject(root).pages.find(p => p.path === `pages/${id}.page`)!.page, id });
    return { root, state, sha };
  }

  it("rewrites a baseline page under CAS and appends a brand-new page id", () => {
    const f = fixture();
    const edited = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "重写后的第二页")], { expectedPageSha256: f.sha("p2") });
    assert.equal(edited.ok, true, JSON.stringify(edited));
    assert.match(JSON.stringify(loadProject(f.root).pages.find(p => p.path === "pages/p2.page")!.page), /重写后的第二页/);
    // A page id the manifest never had needs no CAS — it appends at the end.
    const added = persistWrittenPages(f.state, [pageWithCopy("w1", "final", "新大纲页")]);
    assert.equal(added.ok, true, JSON.stringify(added));
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path),
      ["pages/p1.page", "pages/p2.page", "pages/p3.page", "pages/w1.page"]);
  });

  it("still requires CAS on existing pages and never invents a page id outside the write", () => {
    const f = fixture();
    const noCas = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "无校验重写")]);
    assert.equal(noCas.ok, false);
    if (noCas.ok) assert.fail("rewrite is not a free pass on baseline pages");
    assert.equal(noCas.error, "page_revision_required");
    const stale = persistWrittenPages(f.state, [pageWithCopy("p2", "content", "旧基线")], { expectedPageSha256: "f".repeat(64) });
    assert.equal(stale.ok, false);
    assert.equal((stale as { error?: string }).error, "page_revision_conflict");
    assert.match(JSON.stringify(loadProject(f.root).pages.find(p => p.path === "pages/p2.page")!.page), /Second/);
  });

  it("delete_pages may drop any baseline page under a rewrite lock", () => {
    const f = fixture();
    const result = executeGenerateTool("delete_pages", { pageIds: ["p1", "p3"] }, f.state);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path), ["pages/p2.page"]);
    assert.equal(fs.existsSync(path.join(f.root, "pages/p1.page")), false);
    const denied = executeGenerateTool("delete_pages", { pageIds: ["ghost"] }, f.state);
    assert.equal(denied.ok, false);
    assert.equal((denied.payload as { error?: string } | undefined)?.error, "review_scope_violation");
  });

  it("reorder_pages under rewrite accepts any changed permutation of the live manifest", () => {
    const f = fixture();
    const reordered = executeGenerateTool("reorder_pages", { pageIds: ["p3", "p2", "p1"] }, f.state);
    assert.equal(reordered.ok, true, JSON.stringify(reordered));
    assert.deepEqual(loadProject(f.root).pages.map((entry) => entry.path), ["pages/p3.page", "pages/p2.page", "pages/p1.page"]);
    // After deleting a page the remaining manifest is the reorderable set.
    assert.equal(executeGenerateTool("delete_pages", { pageIds: ["p2"] }, f.state).ok, true);
    const survivors = executeGenerateTool("reorder_pages", { pageIds: ["p1", "p3"] }, f.state);
    assert.equal(survivors.ok, true, JSON.stringify(survivors));
    // Identity order and incomplete lists are refused.
    const identity = executeGenerateTool("reorder_pages", { pageIds: ["p1", "p3"] }, f.state);
    assert.equal(identity.ok, false);
    const partial = executeGenerateTool("reorder_pages", { pageIds: ["p1", "p3", "p2"] }, f.state);
    assert.equal(partial.ok, false, "a deleted page is no longer part of the manifest");
  });
});

it("batch guard authorizes the per-page union while preserving all other objects and pages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-scope-persist-"));
  createEmptyProject(root, { title: "Batch" });
  persistAll(root, [pageWithCopy("p1", "content", "First"), pageWithCopy("p2", "content", "Second"), pageWithCopy("p3", "content", "Untouched")]);
  const before = loadProject(root);
  const p1 = before.pages[0]!;
  const p2 = before.pages[1]!;
  const p3Bytes = fs.readFileSync(path.join(root, before.pages[2]!.path));
  const items = [
    { pagePath: p1.path, scope: { kind: "elements", pageId: "p1", elementIds: ["t"] }, pageBody: p1.page },
    { pagePath: p1.path, scope: { kind: "elements", pageId: "p1", elementIds: ["cl-bg"] }, pageBody: p1.page },
    { pagePath: p2.path, scope: { kind: "elements", pageId: "p2", elementIds: ["t"] }, pageBody: p2.page },
  ];
  fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
  fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({ ...items[0], items, expiresAt: Date.now() + 60_000 }));
  const state = { brief: "Batch", playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [], projectRoot: root };
  const first = structuredClone(p1.page);
  (first.elements[0] as typeof navy).fill.color = "#333333";
  (first.elements[1] as { content: { text: string } }).content.text = "Both targets";
  assert.deepEqual(persistWrittenPages(state, [{ ...first, id: "p1" }], { expectedPageSha256: stableSha256({ ...p1.page, id: "p1" }) }), { ok: true });
  const second = structuredClone(p2.page);
  (second.elements[1] as { content: { text: string } }).content.text = "Second page";
  const sha = stableSha256({ ...p2.page, id: "p2" });
  const outside = structuredClone(second);
  (outside.elements[0] as typeof navy).fill.color = "#444444";
  const denied = persistWrittenPages(state, [{ ...outside, id: "p2" }], { expectedPageSha256: sha });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error, "review_scope_violation");
  assert.deepEqual(persistWrittenPages(state, [{ ...second, id: "p2" }], { expectedPageSha256: sha }), { ok: true });
  assert.deepEqual(fs.readFileSync(path.join(root, before.pages[2]!.path)), p3Bytes);
});

describe("update_deck metadata guard", () => {
  function fixture(scope: Record<string, unknown>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-meta-"));
    createEmptyProject(root, { title: "原标题" });
    persistAll(root, [pageWithCopy("p1", "cover", "Cover"), pageWithCopy("p2", "content", "Second")]);
    // persistAll runs unguarded and stamps the brief as the deck title —
    // restore the fixture title before the lock goes on.
    const seeded = loadProject(root);
    seeded.presentation.title = "原标题";
    saveProject(seeded);
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "_agent", "ai-review-lock.v1.json"), JSON.stringify({
      pagePath: "pages/p1.page",
      expiresAt: Date.now() + 60_000,
      scope,
    }));
    const state = { brief: "Meta", playbook: loadPlaybook({ hostDefaults: false }), todos: [], researchNotes: [], writtenPages: [], projectRoot: root };
    return { root, state };
  }

  it("renames the deck title only when editableMeta whitelists it", () => {
    const granted = fixture({ kind: "page", pageId: "p1", elementIds: [], targetPageIds: ["p1"], editableMeta: ["title"] });
    const ok = executeGenerateTool("update_deck", { title: "季度总结" }, granted.state);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(loadProject(granted.root).presentation.title, "季度总结");
    // Theme stays locked under a title-only grant.
    const denied = executeGenerateTool("update_deck", { theme: { colors: { accent1: "#112233" } } }, granted.state);
    assert.equal(denied.ok, false);
    assert.equal((denied.payload as { error?: string } | undefined)?.error, "review_scope_violation");
  });

  it("rejects every metadata write without an editableMeta grant", () => {
    const denied = fixture({ kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2"] });
    const result = executeGenerateTool("update_deck", { title: "越权标题" }, denied.state);
    assert.equal(result.ok, false);
    assert.equal(loadProject(denied.root).presentation.title, "原标题");
    const noLock = fixture({});
    fs.rmSync(path.join(noLock.root, "_agent", "ai-review-lock.v1.json"));
    const orphan = executeGenerateTool("update_deck", { title: "无锁" }, noLock.state);
    assert.equal(orphan.ok, false);
    assert.equal(loadProject(noLock.root).presentation.title, "原标题");
  });

  it("a rewrite lock implicitly authorizes both title and theme", () => {
    const f = fixture({ kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2"], rewrite: true });
    const result = executeGenerateTool("update_deck", { title: "重写标题", theme: { colors: { accent1: "#445566" } } }, f.state);
    assert.equal(result.ok, true, JSON.stringify(result));
    const project = loadProject(f.root);
    assert.equal(project.presentation.title, "重写标题");
    assert.equal((project.presentation.theme as { colors?: Record<string, string> } | undefined)?.colors?.accent1, "#445566");
  });

  it("a structural lock may carry editableMeta alongside page-list grants", () => {
    const f = fixture({ kind: "deck", pageId: "p1", elementIds: [], targetPageIds: ["p1", "p2"], structureOnly: true, insertIndex: 2, editableMeta: ["theme"] });
    const theme = executeGenerateTool("update_deck", { theme: { colors: { accent1: "#aabbcc" } } }, f.state);
    assert.equal(theme.ok, true, JSON.stringify(theme));
    const title = executeGenerateTool("update_deck", { title: "未授权标题" }, f.state);
    assert.equal(title.ok, false);
    assert.equal(loadProject(f.root).presentation.title, "原标题");
  });
});
