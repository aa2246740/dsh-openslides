import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, loadProject, saveProject, titleOnlyCoverPage } from "@open-slidestudio/pptd-v2";
import {
  isCloserPage,
  pageHasReadableCopy,
  pageHasVisibleContent,
  pageCoverage,
  reviewSkillPages,
  persistPageKey,
  pageIdMatchesFile,
  EMPTY_CLOSER_PRODUCE_NEXT,
  HOST_SEED_PRODUCE_NEXT,
  composedPageLeftoverIssues,
  renderedLayoutBlocksCompose,
  isHostOpenedSeedPath,
  writePageSchemaIssues,
  writePageSchemaError,
  reusedFullBleedSrcIssue,
  photoExhibitIssues,
} from "./layout-qa.js";
import type { SkillPageInput } from "./skill-pages.js";
import { executeGenerateTool, persistWrittenPages, type AgentToolState } from "./agent-tools.js";
import { loadPlaybook } from "./playbook.js";
import { packColorWriteContextFrom, PACK_COLOR_ERROR } from "./theme-pack.js";

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

describe("empty closer gate", () => {
  it("treats last/final/closing pages as closers and navy-only as unreadable", () => {
    assert.equal(isCloserPage({ id: "closing", pageType: "final" }), true);
    assert.equal(isCloserPage({ id: "p20", pageType: "content" }, 19, 19), true);
    assert.equal(isCloserPage({ id: "cover", pageType: "cover" }, 0, 19), false);
    assert.equal(pageHasReadableCopy({ elements: [navy] }), false);
    assert.equal(
      pageHasReadableCopy({
        elements: [
          navy,
          textEl("title", "澄光生活 · 结束页", [80, 140, 760, 80], 36),
          textEl("recap", "7月营收 1,860 万，预算达成 93%。", [80, 240, 760, 72], 18),
        ],
      }),
      true,
    );
  });

  it("fails compose-mode QA when the closer has no copy", () => {
    const review = reviewSkillPages(
      [
        {
          id: "cover",
          pageType: "cover",
          elements: [navy, textEl("t", "澄光生活 2026年7月经营月报封面标题", [80, 160, 800, 80], 36)],
        },
        { id: "closing", pageType: "final", elements: [navy] },
      ],
      { mode: "compose" },
    );
    assert.equal(review.ok, false);
    assert.ok(
      review.issues.some(
        (issue) => issue.pageId === "closing" && issue.code === "empty" && /readable copy/.test(issue.message),
      ),
    );
  });

  it("write_page and compose_deck refuse an empty closer without painting", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const state: AgentToolState = {
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [
        {
          id: "cover",
          pageType: "cover",
          elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
        },
        { id: "closing", pageType: "final", elements: [navy] },
      ],
    };
    const write = executeGenerateTool(
      "write_page",
      { id: "closing", pageType: "final", elements: [navy] },
      state,
    );
    assert.equal(write.ok, false);
    assert.equal((write.payload as { error?: string }).error, "empty_closer");
    assert.equal((write.payload as { painted?: boolean }).painted, false);
    const compose = executeGenerateTool("compose_deck", { title: "closer test" }, state);
    assert.equal(compose.ok, false);
    assert.equal((compose.payload as { error?: string }).error, "empty_closer");
  });

  it("patches the closer in place and does not unlink leftover pages", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "closer-persist-"));
    const project = createEmptyProject(root, { title: "closer persist" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    project.pages = [
      { path: "pages/1_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/02_final.page", page: { pageType: "final", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    const emptyCloser: SkillPageInput = { id: "02_final", pageType: "final", elements: [navy] };
    const filledCloser: SkillPageInput = {
      id: "02_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "澄光生活 · 结束页", [80, 140, 760, 80], 36),
        textEl("recap", "7月营收 1,860 万，预算达成 93%。", [80, 240, 760, 72], 18),
        textEl("ask", "8月拍板：华北续约 / 华东履约 / 华南库存。", [80, 330, 760, 64], 16),
      ],
    };
    const playbook = loadPlaybook({ hostDefaults: false });
    persistWrittenPages({
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [filledCloser],
      skillDeck: { title: "closer persist", pages: [cover, emptyCloser] },
      projectRoot: root,
    });
    const patched = loadProject(root);
    assert.equal(patched.pages.length, 2);
    assert.equal(fs.existsSync(path.join(root, "pages/1_cover.page")), true);
    assert.ok(pageHasReadableCopy({ elements: patched.pages[1]!.page.elements }));
    const state: AgentToolState = {
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [cover, emptyCloser],
      skillDeck: { title: "closer persist", pages: [cover, emptyCloser] },
      projectRoot: root,
    };
    const write = executeGenerateTool(
      "write_page",
      {
        id: filledCloser.id,
        pageType: filledCloser.pageType,
        elements: filledCloser.elements,
      },
      state,
    );
    assert.equal(write.ok, true);
    assert.equal((write.payload as { painted?: boolean }).painted, false);
    const after = loadProject(root);
    assert.equal(after.pages.length, 2);
    assert.ok(pageHasReadableCopy({ elements: after.pages[1]!.page.elements }));
    assert.ok(
      (state.skillDeck?.pages.at(-1)?.elements.filter((el) => el.elementType === "text").length ?? 0) >=
        2,
    );
  });

  it("refuses an empty last written page even when pageType is content", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const emptyLast: SkillPageInput = {
      id: "15_decision_cash",
      pageType: "content",
      elements: [navy],
    };
    const state: AgentToolState = {
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [cover, emptyLast],
    };
    const write = executeGenerateTool(
      "write_page",
      { id: emptyLast.id, pageType: "content", elements: [navy] },
      state,
    );
    assert.equal(write.ok, false);
    assert.equal((write.payload as { error?: string }).error, "empty_closer");
    assert.equal((write.payload as { next?: string }).next, "write_page");
    assert.equal((write.payload as { painted?: boolean }).painted, false);
  });

  it("compose_deck bounces to write_page when leftover last YAML is empty", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "leftover-compose-"));
    const project = createEmptyProject(root, { title: "beilu leftover" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "北麓制造 2026 上半年经营汇报封面", [80, 160, 800, 80], 36)],
    };
    const filledFinal: SkillPageInput = {
      id: "16_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "结束页 · 本次董事会要拍的板", [52, 80, 760, 60], 32),
        textEl("recap", "营收 23.84 亿元，毛利率 24.6%，现金流 3.42 亿元由负转正。", [52, 176, 856, 60], 14),
        textEl("ask", "下半年要拍的板：投票选定 1.0 亿产能投资方案。", [52, 294, 856, 80], 20),
      ],
    };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/15_final.page", page: { pageType: "final", elements: filledFinal.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    const playbook = loadPlaybook({ hostDefaults: false });
    const state: AgentToolState = {
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [cover, filledFinal],
      projectRoot: root,
    };
    const first = executeGenerateTool("compose_deck", { title: "北麓 H1" }, state);
    assert.equal(first.ok, false);
    assert.equal((first.payload as { error?: string }).error, "empty_closer");
    assert.equal((first.payload as { next?: string }).next, "write_page");
    assert.equal(first.detail, EMPTY_CLOSER_PRODUCE_NEXT);
    assert.equal(pageHasReadableCopy({ elements: loadProject(root).pages.at(-1)!.page.elements }), false);
    const again = executeGenerateTool("compose_deck", { title: "北麓 H1" }, state);
    assert.equal(again.ok, false);
    assert.equal((again.payload as { error?: string }).error, "empty_closer");
  });

  it("does not wipe a written closer when a later empty skillDeck persists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "closer-nowipe-"));
    const project = createEmptyProject(root, { title: "closer nowipe" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const onFifteen = "ON_15_FINAL_ONLY";
    const filledFifteen: SkillPageInput = {
      id: "15_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "十五结束页不是十六", [52, 80, 760, 60], 32),
        textEl("recap", onFifteen, [52, 176, 856, 60], 14),
        textEl("ask", "不要把十六写进十五。", [52, 294, 856, 80], 20),
      ],
    };
    const filledFinal: SkillPageInput = {
      id: "16_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "结束页 · 本次要拍的板", [52, 80, 760, 60], 32),
        textEl("recap", "营收 23.84 亿元，毛利率 24.6%，现金流转正。", [52, 176, 856, 60], 14),
        textEl("ask", "下半年投票选定 1.0 亿产能方案。", [52, 294, 856, 80], 20),
      ],
    };
    const emptyCash: SkillPageInput = {
      id: "15_decision_cash",
      pageType: "content",
      elements: [navy],
    };
    const emptyFinal: SkillPageInput = { id: "16_final", pageType: "final", elements: [navy] };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/15_final.page", page: { pageType: "final", elements: filledFifteen.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    persistWrittenPages({
      brief: "a closer test deck",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [cover, filledFinal, emptyCash],
      skillDeck: { title: "stale", pages: [cover, emptyFinal] },
      projectRoot: root,
    });
    const after = loadProject(root);
    const fifteen = after.pages.find((page) => page.path.endsWith("15_final.page"));
    const leftover = after.pages.find((page) => page.path.endsWith("16_content.page"));
    const sixteen = after.pages.find((page) => page.path.endsWith("16_final.page"));
    assert.ok(fifteen);
    assert.ok(leftover);
    assert.ok(sixteen);
    assert.match(JSON.stringify(fifteen!.page.elements), /ON_15_FINAL_ONLY/);
    assert.equal(pageHasReadableCopy({ elements: leftover!.page.elements }), false);
    assert.ok(pageHasReadableCopy({ elements: sixteen!.page.elements }));
    assert.match(JSON.stringify(sixteen!.page.elements), /23\.84/);
    persistWrittenPages({
      brief: "a closer test deck",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [cover, emptyFinal],
      skillDeck: { title: "stale", pages: [cover, emptyFinal] },
      projectRoot: root,
    });
    const again = loadProject(root);
    const fifteenAgain = again.pages.find((page) => page.path.endsWith("15_final.page"));
    const sixteenAgain = again.pages.find((page) => page.path.endsWith("16_final.page"));
    assert.match(JSON.stringify(fifteenAgain!.page.elements), /ON_15_FINAL_ONLY/);
    assert.ok(pageHasReadableCopy({ elements: sixteenAgain!.page.elements }));
    assert.match(JSON.stringify(sixteenAgain!.page.elements), /23\.84/);
  });

  it("write_page empty_closer fires on last disk leftover *_content, not only pageType final", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "leftover-write-"));
    const project = createEmptyProject(root, { title: "beilu leftover write" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "北麓制造 2026 上半年经营汇报封面", [80, 160, 800, 80], 36)],
    };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/15_final.page", page: { pageType: "final", elements: cover.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    const write = executeGenerateTool(
      "write_page",
      { id: "16_content", pageType: "content", elements: [navy] },
      {
        brief: "a closer test deck",
        playbook: loadPlaybook({ hostDefaults: false }),
        todos: [],
        researchNotes: [],
        writtenPages: [cover],
        projectRoot: root,
      },
    );
    assert.equal(write.ok, false);
    assert.equal((write.payload as { error?: string }).error, "empty_closer");
    assert.equal((write.payload as { next?: string }).next, "write_page");
    assert.equal(pageHasReadableCopy({ elements: loadProject(root).pages.at(-1)!.page.elements }), false);
  });

  it("does not overlay closer copy onto leftover until produce write_page", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "no-overlay-"));
    const project = createEmptyProject(root, { title: "no overlay" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const filledFinal: SkillPageInput = {
      id: "16_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "结束页 · 本次要拍的板", [52, 80, 760, 60], 32),
        textEl("recap", "营收 23.84 亿元，毛利率 24.6%，现金流转正。", [52, 176, 856, 60], 14),
        textEl("ask", "下半年投票选定 1.0 亿产能方案。", [52, 294, 856, 80], 20),
      ],
    };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/15_final.page", page: { pageType: "final", elements: filledFinal.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    persistWrittenPages({
      brief: "a closer test deck",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [cover],
      projectRoot: root,
    });
    const after = loadProject(root);
    assert.equal(pageHasReadableCopy({ elements: after.pages.at(-1)!.page.elements }), false);
    assert.equal(after.pages.length, 3);
  });
});

function tableEl(
  id: string,
  header: string[],
  body: string[][],
): SkillPageInput["elements"][number] {
  return {
    elementId: id,
    elementType: "table",
    bounds: [40, 160, 880, 280],
    columnWidths: header.map(() => 880 / header.length),
    rows: [header.map((text) => ({ text })), ...body.map((row) => row.map((text) => ({ text })))],
  };
}

describe("EDITH produce leaks", () => {
  it("1. a full-bleed navy rect is empty even when shape-area coverage is 1", () => {
    assert.equal(pageHasVisibleContent({ elements: [navy] }), false);
    assert.ok(pageCoverage([navy]) >= 0.99);
    const review = reviewSkillPages(
      [{ id: "p12", pageType: "content", elements: [navy] }],
      { mode: "compose" },
    );
    assert.equal(review.ok, false);
    assert.ok(review.issues.some((issue) => issue.code === "empty" && /not content/.test(issue.message)));
  });

  it("2. leftover *_content.page cannot close the deck", () => {
    assert.equal(pageIdMatchesFile("16_final", "pages/15_final.page"), false);
    assert.equal(pageIdMatchesFile("16_final", "pages/16_content.page"), false);
    assert.equal(persistPageKey("16_content.page"), "16_content");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "leftover-cannot-close-"));
    const project = createEmptyProject(root, { title: "leftover cannot close" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "北麓制造 2026 上半年经营汇报封面", [80, 160, 800, 80], 36)],
    };
    const leftoverCopy: SkillPageInput = {
      id: "16_content",
      pageType: "content",
      elements: [
        navy,
        textEl("title", "这页还是 leftover content", [52, 80, 760, 60], 32),
        textEl("recap", "有字也不算结束页，因为文件名是 16_content。", [52, 176, 856, 60], 14),
      ],
    };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: leftoverCopy.elements } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    const compose = executeGenerateTool(
      "compose_deck",
      { title: "北麓 H1" },
      {
        brief: "a closer test deck",
        playbook: loadPlaybook({ hostDefaults: false }),
        todos: [],
        researchNotes: [],
        writtenPages: [cover, leftoverCopy],
        projectRoot: root,
      },
    );
    assert.equal(compose.ok, false);
    assert.equal((compose.payload as { error?: string }).error, "empty_closer");
    assert.equal((compose.payload as { next?: string }).next, "write_page");
  });

  it("3. persist id=16_final does not write 15_final.page", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "persist-by-id-"));
    const project = createEmptyProject(root, { title: "persist by id" });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const fifteen: SkillPageInput = {
      id: "15_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "十五不是十六", [52, 80, 760, 60], 32),
        textEl("recap", "STAY_ON_FIFTEEN", [52, 176, 856, 60], 14),
        textEl("ask", "不要 remap。", [52, 294, 856, 80], 20),
      ],
    };
    const sixteen: SkillPageInput = {
      id: "16_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "十六结束页", [52, 80, 760, 60], 32),
        textEl("recap", "WRITE_SIXTEEN_ONLY", [52, 176, 856, 60], 14),
        textEl("ask", "persist by id.", [52, 294, 856, 80], 20),
      ],
    };
    project.pages = [
      { path: "pages/01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/15_final.page", page: { pageType: "final", elements: fifteen.elements } },
      { path: "pages/16_content.page", page: { pageType: "content", elements: [navy] } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    persistWrittenPages({
      brief: "a closer test deck",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [sixteen],
      projectRoot: root,
    });
    const after = loadProject(root);
    const fifteenAfter = after.pages.find((page) => page.path.endsWith("15_final.page"))!;
    const leftover = after.pages.find((page) => page.path.endsWith("16_content.page"))!;
    const sixteenAfter = after.pages.find((page) => page.path.endsWith("16_final.page"));
    assert.match(JSON.stringify(fifteenAfter.page.elements), /STAY_ON_FIFTEEN/);
    assert.doesNotMatch(JSON.stringify(fifteenAfter.page.elements), /WRITE_SIXTEEN_ONLY/);
    assert.equal(pageHasVisibleContent({ elements: leftover.page.elements }), false);
    assert.ok(sixteenAfter);
    assert.match(JSON.stringify(sixteenAfter!.page.elements), /WRITE_SIXTEEN_ONLY/);
  });

  it("4. table header 缺货天数 requires a nonempty body value", () => {
    const page: SkillPageInput = {
      id: "12_stockout",
      pageType: "content",
      elements: [
        navy,
        textEl("title", "澄光生活 · 缺货 SKU", [40, 36, 800, 40], 24),
        tableEl(
          "sku",
          ["SKU 名称", "缺货天数"],
          [["青瓷杯套装 6 件", ""]],
        ),
      ],
    };
    const review = reviewSkillPages([page], { mode: "compose" });
    assert.ok(review.issues.some((issue) => issue.code === "empty_cell" && /缺货天数/.test(issue.message)));
    const write = executeGenerateTool(
      "write_page",
      { id: page.id, pageType: page.pageType, elements: page.elements },
      {
        brief: "a closer test deck",
        playbook: loadPlaybook({ hostDefaults: false }),
        todos: [],
        researchNotes: [],
        writtenPages: [
          {
            id: "1_cover",
            pageType: "cover",
            elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
          },
        ],
      },
    );
    assert.equal(write.ok, false);
    assert.equal((write.payload as { error?: string }).error, "empty_cell");
  });

  it("5. write_page rejects overflow, text overlap, omitted bounds, and zero area", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const state = (): AgentToolState => ({
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [cover],
    });
    const overflow = executeGenerateTool(
      "write_page",
      {
        id: "p-overflow",
        pageType: "content",
        elements: [
          navy,
          textEl("t", "溢出标题足够长了", [900, 0, 200, 100], 20),
          textEl("b", "溢出正文足够长了", [40, 200, 400, 40], 16),
        ],
      },
      state(),
    );
    assert.equal(overflow.ok, false);
    assert.equal((overflow.payload as { error?: string }).error, "overflow");
    const overlap = executeGenerateTool(
      "write_page",
      {
        id: "p-overlap",
        pageType: "content",
        elements: [
          navy,
          textEl("a", "重叠标题足够长了", [80, 80, 400, 80], 20),
          textEl("b", "重叠正文足够长了", [100, 100, 400, 80], 16),
        ],
      },
      state(),
    );
    assert.equal(overlap.ok, false);
    assert.equal((overlap.payload as { error?: string }).error, "overlap");
    const zero = executeGenerateTool(
      "write_page",
      {
        id: "p-zero",
        pageType: "content",
        elements: [
          navy,
          { elementId: "z", elementType: "text", bounds: [0, 0, 0, 0], content: { text: "零面积标题足够长了", fontSize: 18 } },
          textEl("b", "另一段正文足够长了", [40, 200, 400, 40], 16),
        ],
      },
      state(),
    );
    assert.equal(zero.ok, false);
    assert.equal((zero.payload as { error?: string }).error, "zero_area");
    const omitted = executeGenerateTool(
      "write_page",
      {
        id: "p-omitted",
        pageType: "content",
        elements: [
          navy,
          { elementId: "t", elementType: "text", content: { text: "没有 bounds 的标题足够长了", fontSize: 18 } },
        ],
      },
      state(),
    );
    assert.equal(omitted.ok, false);
    assert.equal((omitted.payload as { error?: string }).error, "bounds_omitted");
  });

  it("write_page rejects footer-reserve text without layoutRole=footer and does not stamp layout=pass", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const state = (): AgentToolState => ({
      brief: "a closer test deck",
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [cover],
    });
    const rejected = executeGenerateTool(
      "write_page",
      {
        id: "p-footer",
        pageType: "content",
        elements: [
          navy,
          textEl("t", "标题足够长了用于测试", [80, 80, 800, 40], 28),
          textEl("b", "正文足够长了用于测试内容", [80, 140, 800, 40], 16),
          textEl("src", "来源：内部核对 7 月数字", [40, 508, 880, 20], 12),
        ],
      },
      state(),
    );
    assert.equal(rejected.ok, false);
    assert.equal((rejected.payload as { error?: string }).error, "footer_zone");
    assert.equal((rejected.payload as { layout?: string }).layout, undefined);
    const allowed = executeGenerateTool(
      "write_page",
      {
        id: "p-footer-ok",
        pageType: "content",
        elements: [
          navy,
          textEl("t", "标题足够长了用于测试", [80, 80, 800, 40], 28),
          textEl("b", "正文足够长了用于测试内容", [80, 140, 800, 40], 16),
          {
            ...textEl("src", "来源：内部核对 7 月数字", [40, 508, 880, 20], 12),
            layoutRole: "footer",
          },
        ],
      },
      state(),
    );
    assert.equal(allowed.ok, true);
    assert.equal((allowed.payload as { layout?: string }).layout, undefined);
  });

  it("write_page rejects unprefixed RRGGBB so it cannot become srgb 000000", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const rejected = executeGenerateTool(
      "write_page",
      {
        id: "19_final",
        pageType: "final",
        elements: [
          {
            elementId: "bg",
            elementType: "shape",
            shapeName: "rect",
            bounds: [0, 0, 960, 540],
            fill: { type: "solid", color: "0E0807" },
          },
          {
            elementId: "recap",
            elementType: "text",
            bounds: [60, 120, 840, 80],
            content: {
              text: "我把一条事故频发的发布线改造成可回滚。",
              fontSize: 18,
              color: "E8DED7",
            },
          },
        ],
      },
      {
        brief: "unprefixed hex inversion",
        playbook,
        todos: [],
        researchNotes: [],
        writtenPages: [cover],
      },
    );
    assert.equal(rejected.ok, false);
    assert.equal((rejected.payload as { error?: string }).error, "invalid_color");
    assert.match(String(rejected.detail), /0E0807|E8DED7/);
    assert.match(String(rejected.detail), /must not become #000000/);
  });

  it("write_page rejects unresolved $nope and accepts existing $primary", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const rejected = executeGenerateTool(
      "write_page",
      {
        id: "19_final",
        pageType: "final",
        elements: [
          {
            elementId: "bg",
            elementType: "shape",
            shapeName: "rect",
            bounds: [0, 0, 960, 540],
            fill: { type: "solid", color: "#0E0807" },
          },
          {
            elementId: "recap",
            elementType: "text",
            bounds: [60, 120, 840, 80],
            content: {
              text: "我把一条事故频发的发布线改造成可回滚。",
              fontSize: 18,
              color: "$nope",
            },
          },
          {
            elementId: "ask",
            elementType: "text",
            bounds: [60, 312, 840, 80],
            content: {
              text: "下个月请评委给三件事反馈。",
              fontSize: 16,
              color: "#E8DED7",
            },
          },
        ],
      },
      {
        brief: "unresolved theme inversion",
        playbook,
        todos: [],
        researchNotes: [],
        writtenPages: [cover],
      },
    );
    assert.equal(rejected.ok, false);
    assert.equal((rejected.payload as { error?: string }).error, "invalid_color");
    assert.match(String(rejected.detail), /\$nope/);
    assert.match(String(rejected.detail), /must not become #000000/);
    const theme = { colors: { primary: "#2563EB", text: "#111111" } };
    const officialThemePage: SkillPageInput = {
      id: "19_final",
      pageType: "final",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "$primary" },
        },
        {
          elementId: "recap",
          elementType: "text",
          bounds: [60, 120, 840, 80],
          content: { text: "我把一条事故频发的发布线改造成可回滚。", fontSize: 18, color: "$text" },
        },
        {
          elementId: "ask",
          elementType: "text",
          bounds: [60, 312, 840, 80],
          content: { text: "下个月请评委给三件事反馈。", fontSize: 16, color: "$text" },
        },
      ],
    };
    const allowed = writePageSchemaError(
      writePageSchemaIssues(officialThemePage, { theme }),
      officialThemePage,
      { theme },
    );
    assert.equal(allowed, undefined);
  });

  it("write_page rejects HTML style color:0E0807 and accepts official # / $theme span colors", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const rejected = executeGenerateTool(
      "write_page",
      {
        id: "19_final",
        pageType: "final",
        elements: [
          {
            elementId: "bg",
            elementType: "shape",
            shapeName: "rect",
            bounds: [0, 0, 960, 540],
            fill: { type: "solid", color: "#0E0807" },
          },
          {
            elementId: "recap",
            elementType: "text",
            bounds: [60, 120, 840, 80],
            content: {
              text: '<p><span style="color:0E0807">我把一条事故频发的发布线改造成可回滚。</span></p>',
              fontSize: 18,
              color: "#E8DED7",
            },
          },
        ],
      },
      {
        brief: "html unprefixed hex inversion",
        playbook,
        todos: [],
        researchNotes: [],
        writtenPages: [cover],
      },
    );
    assert.equal(rejected.ok, false);
    assert.equal((rejected.payload as { error?: string }).error, "invalid_color");
    assert.match(String(rejected.detail), /0E0807/);
    assert.match(String(rejected.detail), /@style\.color/);
    assert.match(String(rejected.detail), /must not become #000000/);
    const bgPage: SkillPageInput = {
      id: "19_final",
      pageType: "final",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#0E0807" },
        },
        {
          elementId: "recap",
          elementType: "text",
          bounds: [60, 120, 840, 80],
          content: {
            text: '<p><span style="background-color:E8DED7">我把一条事故频发的发布线改造成可回滚。</span></p>',
            fontSize: 18,
            color: "#E8DED7",
          },
        },
      ],
    };
    const bgRejected = writePageSchemaError(writePageSchemaIssues(bgPage), bgPage);
    assert.equal(bgRejected?.error, "invalid_color");
    assert.match(String(bgRejected?.detail), /E8DED7/);
    assert.match(String(bgRejected?.detail), /@style\.background-color/);
    const theme = { colors: { primary: "#2563EB" } };
    const officialHtml: SkillPageInput = {
      id: "19_final",
      pageType: "final",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#0E0807" },
        },
        {
          elementId: "recap",
          elementType: "text",
          bounds: [60, 120, 840, 80],
          content: {
            text: '<p><span style="color:#E8DED7">我把一条事故频发的发布线改造成可回滚。</span></p>',
            fontSize: 18,
            color: "#E8DED7",
          },
        },
        {
          elementId: "ask",
          elementType: "text",
          bounds: [60, 312, 840, 80],
          content: {
            text: '<p><span style="color:$primary">下个月请评委给三件事反馈。</span></p>',
            fontSize: 16,
            color: "#E8DED7",
          },
        },
      ],
    };
    const allowed = writePageSchemaError(
      writePageSchemaIssues(officialHtml, { theme }),
      officialHtml,
      { theme },
    );
    assert.equal(allowed, undefined);
    const mention: SkillPageInput = {
      id: "19_final",
      pageType: "final",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#0E0807" },
        },
        {
          elementId: "recap",
          elementType: "text",
          bounds: [60, 120, 840, 80],
          content: {
            text: "<p>我把一条事故频发的发布线改造成可回滚。主色 0E0807 写在正文里，没有 style 属性。</p>",
            fontSize: 18,
            color: "#E8DED7",
          },
        },
        {
          elementId: "ask",
          elementType: "text",
          bounds: [60, 312, 840, 80],
          content: {
            text: "<p>下个月请评委给三件事反馈。</p>",
            fontSize: 16,
            color: "#E8DED7",
          },
        },
      ],
    };
    assert.equal(writePageSchemaError(writePageSchemaIssues(mention), mention), undefined);
  });

  it("write_page refuses another pack's Color Palette hex after adopt and skips when no pack is adopted", () => {
    const pine = packColorWriteContextFrom({
      designSystemId: "consulting/pine-green-strategy",
    });
    const foreign: SkillPageInput = {
      id: "cover",
      pageType: "cover",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#FDC356" },
        },
        textEl("t", "北麓制造 2026 上半年经营汇报", [80, 160, 800, 80], 36),
      ],
    };
    const rejected = writePageSchemaError(writePageSchemaIssues(foreign, pine), foreign, pine);
    assert.equal(rejected?.error, PACK_COLOR_ERROR);
    assert.match(String(rejected?.detail), /#FDC356/);
    const mixed: SkillPageInput = {
      id: "cover",
      pageType: "cover",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#03522C" },
        },
        textEl("t", "北麓制造 2026 上半年经营汇报", [80, 160, 800, 80], 36),
        {
          elementId: "accent",
          elementType: "shape",
          shapeName: "rect",
          bounds: [80, 260, 200, 40],
          fill: { type: "solid", color: "#FDC356" },
        },
      ],
    };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(mixed, pine), mixed, pine)?.error,
      PACK_COLOR_ERROR,
    );
    const adopted: SkillPageInput = {
      id: "cover",
      pageType: "cover",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#03522C" },
        },
        textEl("t", "北麓制造 2026 上半年经营汇报", [80, 160, 800, 80], 36),
      ],
    };
    assert.equal(writePageSchemaError(writePageSchemaIssues(adopted, pine), adopted, pine), undefined);
    assert.equal(writePageSchemaError(writePageSchemaIssues(foreign), foreign), undefined);
    const navy: SkillPageInput = {
      id: "cover",
      pageType: "cover",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#06223F" },
        },
        textEl("t", "北麓制造 2026 上半年经营汇报", [80, 160, 800, 80], 36),
      ],
    };
    assert.equal(writePageSchemaError(writePageSchemaIssues(navy, pine), navy, pine)?.error, PACK_COLOR_ERROR);
    const hostBlue: SkillPageInput = {
      ...navy,
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "#2563EB" },
        },
        navy.elements[1]!,
      ],
    };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(hostBlue, pine), hostBlue, pine)?.error,
      PACK_COLOR_ERROR,
    );
    const packPrimary: SkillPageInput = {
      id: "cover",
      pageType: "cover",
      elements: [
        {
          elementId: "bg",
          elementType: "shape",
          shapeName: "rect",
          bounds: [0, 0, 960, 540],
          fill: { type: "solid", color: "$primary" },
        },
        textEl("t", "北麓制造 2026 上半年经营汇报", [80, 160, 800, 80], 36),
      ],
    };
    const packTheme = { theme: { colors: { primary: "#03522C" } }, ...pine };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(packPrimary, packTheme), packPrimary, packTheme),
      undefined,
    );
    const emptyTheme = { theme: { colors: { primary: "#2563EB" } }, ...pine };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(packPrimary, emptyTheme), packPrimary, emptyTheme)?.error,
      PACK_COLOR_ERROR,
    );
  });

  it("allows only canonical page background color to leave the adopted pack under explicit override", () => {
    const pine = packColorWriteContextFrom({
      designSystemId: "consulting/pine-green-strategy",
    });
    const backgroundOnly: SkillPageInput = {
      id: "p1",
      pageType: "content",
      background: { type: "solid", color: "#FDC356" },
      elements: [textEl("title", "只改页面背景色", [80, 120, 800, 80], 36)],
    };
    const overridden = { ...pine, backgroundColorOverride: true };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(backgroundOnly, pine), backgroundOnly, pine)?.error,
      PACK_COLOR_ERROR,
    );
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(backgroundOnly, overridden), backgroundOnly, overridden),
      undefined,
    );
    const retained = { ...pine, persistedBackgroundColor: "#FDC356" };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(backgroundOnly, retained), backgroundOnly, retained),
      undefined,
    );
    const changedWithoutAuthorization: SkillPageInput = {
      ...backgroundOnly,
      background: { type: "solid", color: "#DDEEFF" },
    };
    assert.equal(
      writePageSchemaError(
        writePageSchemaIssues(changedWithoutAuthorization, retained),
        changedWithoutAuthorization,
        retained,
      )?.error,
      PACK_COLOR_ERROR,
    );
    const academic = packColorWriteContextFrom({
      designSystemId: "academic/paper-white-courseware",
    });
    const whiteBackground: SkillPageInput = {
      ...backgroundOnly,
      background: { type: "solid", color: "#FFFFFF" },
      elements: [
        {
          ...backgroundOnly.elements[0]!,
          content: { text: "整稿背景改为纯白", fontSize: 36, color: "#56687A" },
        },
      ],
    };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(whiteBackground, academic), whiteBackground, academic)?.error,
      PACK_COLOR_ERROR,
    );
    const academicOverride = { ...academic, backgroundColorOverride: true };
    assert.equal(
      writePageSchemaError(
        writePageSchemaIssues(whiteBackground, academicOverride),
        whiteBackground,
        academicOverride,
      ),
      undefined,
    );

    const foreignElement: SkillPageInput = {
      ...backgroundOnly,
      background: { type: "solid", color: "#03522C" },
      elements: [
        {
          elementId: "accent",
          elementType: "shape",
          shapeName: "rect",
          bounds: [80, 260, 200, 40],
          fill: { type: "solid", color: "#FDC356" },
        },
        backgroundOnly.elements[0]!,
      ],
    };
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(foreignElement, overridden), foreignElement, overridden)?.error,
      PACK_COLOR_ERROR,
    );

    const invalidBackground: SkillPageInput = {
      ...backgroundOnly,
      background: { type: "solid", color: "white" },
    };
    assert.equal(
      writePageSchemaError(
        writePageSchemaIssues(invalidBackground, overridden),
        invalidBackground,
        overridden,
      )?.error,
      "invalid_color",
    );
  });

  it("createEmptyProject lists zero composed pages; persistWrittenPages lists the agent cover, not a host seed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "empty-create-persist-"));
    const created = createEmptyProject(root, { title: "澄光生活 2026年7月经营月报" });
    assert.equal(created.pages.length, 0);
    assert.deepEqual(created.presentation.pages, []);
    assert.equal(fs.existsSync(path.join(root, "pages", "1_cover.page")), false);
    const cover: SkillPageInput = {
      id: "p01_cover",
      pageType: "cover",
      elements: [
        navy,
        textEl("t1", "差 140 万不是客单下跌", [50, 170, 700, 80], 40),
        textEl("t2", "2026年7月经营月报已核实数字", [50, 270, 800, 40], 16),
      ],
    };
    persistWrittenPages({
      brief: "澄光生活 2026年7月经营月报",
      playbook: loadPlaybook({ hostDefaults: false }),
      todos: [],
      researchNotes: [],
      writtenPages: [cover],
      projectRoot: root,
    });
    const after = loadProject(root);
    assert.equal(after.pages.length, 1);
    assert.equal(after.pages[0]!.path, "pages/p01_cover.page");
    assert.equal(after.pages.some((page) => isHostOpenedSeedPath(page.path)), false);
    assert.equal(composedPageLeftoverIssues(after.pages).some((issue) => issue.kind === "host_seed"), false);
  });

  it("7. compose does not skip layout QA when writtenPages.length >= 2", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const cover: SkillPageInput = {
      id: "1_cover",
      pageType: "cover",
      elements: [navy, textEl("t", "封面标题足够长了用于测试", [80, 160, 800, 80], 36)],
    };
    const emptyBody: SkillPageInput = { id: "12_stockout", pageType: "content", elements: [navy] };
    const closer: SkillPageInput = {
      id: "16_final",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "结束页 · 本次要拍的板", [52, 80, 760, 60], 32),
        textEl("recap", "营收 23.84 亿元，毛利率 24.6%。", [52, 176, 856, 60], 14),
        textEl("ask", "下半年投票选定产能方案。", [52, 294, 856, 80], 20),
      ],
    };
    const compose = executeGenerateTool(
      "compose_deck",
      { title: "layout qa skip" },
      {
        brief: "a closer test deck",
        playbook,
        todos: [],
        researchNotes: [],
        writtenPages: [cover, emptyBody, closer],
      },
    );
    assert.equal(compose.ok, false);
    assert.equal((compose.payload as { error?: string }).error, "layout QA failed");
    assert.ok(
      ((compose.payload as { review?: { issues?: { pageId: string; code: string }[] } }).review?.issues ??
        []).some((issue) => issue.pageId === "12_stockout" && issue.code === "empty"),
    );
  });
});

describe("rendered layout compose gate", () => {
  it("keeps legacy missing optional and requires a current pass for strict editor runs", () => {
    assert.equal(renderedLayoutBlocksCompose("fail"), true);
    assert.equal(renderedLayoutBlocksCompose("missing"), false);
    assert.equal(renderedLayoutBlocksCompose("unavailable"), false);
    assert.equal(renderedLayoutBlocksCompose("pass"), false);
    assert.equal(renderedLayoutBlocksCompose("missing", true), true);
    assert.equal(renderedLayoutBlocksCompose("unavailable", true), true);
    assert.equal(renderedLayoutBlocksCompose("fail", true), true);
    assert.equal(renderedLayoutBlocksCompose("pass", true), false);
  });
});

describe("host seed leftover scan", () => {
  const seedPage = {
    path: "pages/1_cover.page",
    page: {
      pageType: "cover" as const,
      elements: [
        {
          elementId: "title",
          elementType: "text" as const,
          bounds: [80, 200, 800, 80] as [number, number, number, number],
          content: { text: "澄光生活 2026年7月经营月报", fontSize: 36, color: "#111111" },
        },
      ],
    },
  };
  const agentCover = {
    path: "pages/p01_cover.page",
    page: {
      pageType: "cover" as const,
      elements: [
        navy,
        textEl("t1", "差 140 万不是客单下跌", [50, 170, 700, 80], 40),
        textEl("t2", "2026年7月经营月报已核实数字", [50, 270, 800, 40], 16),
      ],
    },
  };

  it("rejects seed 1_cover.page listed with a real agent cover; without the seed it does not", () => {
    const withSeed = composedPageLeftoverIssues([seedPage, agentCover]);
    assert.equal(withSeed.some((issue) => issue.kind === "host_seed"), true);
    assert.equal(withSeed[0]?.message, HOST_SEED_PRODUCE_NEXT);
    const withoutSeed = composedPageLeftoverIssues([agentCover]);
    assert.equal(withoutSeed.some((issue) => issue.kind === "host_seed"), false);
  });

  it("compose_deck bounces host seed leftover and does not paint YAML", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "host-seed-compose-"));
    const project = createEmptyProject(root, { title: "澄光生活 2026年7月经营月报" });
    const cover: SkillPageInput = {
      id: "p01_cover",
      pageType: "cover",
      elements: agentCover.page.elements,
    };
    const closer: SkillPageInput = {
      id: "p20_closing",
      pageType: "final",
      elements: [
        navy,
        textEl("title", "结束页 · 7 月一句话", [52, 80, 760, 60], 32),
        textEl("recap", "差 140 万是合同不是客单。", [52, 176, 856, 60], 14),
        textEl("ask", "8 月要客单和续约一起涨。", [52, 294, 856, 80], 20),
      ],
    };
    project.pages = [
      { path: "pages/1_cover.page", page: titleOnlyCoverPage("澄光生活 2026年7月经营月报") },
      { path: "pages/p01_cover.page", page: { pageType: "cover", elements: cover.elements } },
      { path: "pages/p20_closing.page", page: { pageType: "final", elements: closer.elements } },
    ];
    project.presentation.pages = project.pages.map((page) => page.path);
    saveProject(project);
    const first = executeGenerateTool(
      "compose_deck",
      { title: "澄光月报" },
      {
        brief: "a closer test deck",
        playbook: loadPlaybook({ hostDefaults: false }),
        todos: [],
        researchNotes: [],
        writtenPages: [cover, closer],
        projectRoot: root,
      },
    );
    assert.equal(first.ok, false);
    assert.equal((first.payload as { error?: string }).error, "host_seed");
    assert.equal((first.payload as { next?: string }).next, "write_page");
    assert.equal(first.detail, HOST_SEED_PRODUCE_NEXT);
    assert.equal(loadProject(root).pages[0]?.path, "pages/1_cover.page");
  });
});

describe("chart slot without exhibit", () => {
  it("refuses a 走势/架构 label with an empty slot below it", () => {
    const hollow: SkillPageInput = {
      id: "financials",
      pageType: "content",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 72, 760, 40],
          content: { text: "营收三年翻三倍", fontSize: 26, color: "#001142" },
        },
        {
          elementId: "slot",
          elementType: "text",
          bounds: [40, 186, 540, 18],
          content: { text: "营收与净利率走势（2024–2028E）", fontSize: 13, color: "#001142" },
        },
      ],
    };
    const err = writePageSchemaError(writePageSchemaIssues(hollow), hollow);
    assert.equal(err?.error, "empty_box");
    assert.match(err?.detail ?? "", /走势/);
  });

  it("accepts the same label when a chart occupies the slot", () => {
    const filled: SkillPageInput = {
      id: "financials",
      pageType: "content",
      elements: [
        {
          elementId: "slot",
          elementType: "text",
          bounds: [40, 186, 540, 18],
          content: { text: "营收与净利率走势（2024–2028E）", fontSize: 13, color: "#001142" },
        },
        {
          elementId: "chart",
          elementType: "chart",
          bounds: [40, 214, 540, 220],
          data: { cols: ["年", "营收"], rows: [["2024", 12], ["2028", 53]] },
          series: [{ type: "bar", name: "营收", encode: { x: "年", y: "营收" } }],
        },
      ],
    };
    assert.equal(writePageSchemaError(writePageSchemaIssues(filled), filled), undefined);
  });
});

describe("reused full-bleed src", () => {
  const coverSrc = "media/aerial-lifeline-cover.png";
  const siblings = [{ pageId: "cover", src: coverSrc }];

  function photoPage(
    id: string,
    pageType: string,
    src: string,
    bounds: [number, number, number, number],
  ): SkillPageInput {
    return {
      id,
      pageType,
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 40, 400, 40],
          content: { text: "低空医疗物流规模", fontSize: 22, color: "#111111" },
        },
        {
          elementId: "hero",
          elementType: "image",
          bounds,
          src,
        },
      ],
    };
  }

  it("allows a cover full-bleed even when siblings reuse the src", () => {
    const cover = photoPage("cover", "cover", coverSrc, [0, 0, 960, 540]);
    assert.equal(reusedFullBleedSrcIssue(cover, siblings), undefined);
    assert.equal(
      writePageSchemaError(writePageSchemaIssues(cover, { siblingImageSrcs: siblings }), cover, {
        siblingImageSrcs: siblings,
      }),
      undefined,
    );
  });

  it("rejects a non-cover full-bleed that reuses a sibling src", () => {
    const section = photoPage("section", "content", coverSrc, [0, 0, 960, 540]);
    const issue = reusedFullBleedSrcIssue(section, siblings);
    assert.equal(issue?.code, "reused_cover_src");
    assert.match(issue?.message ?? "", /reused/);
    assert.match(issue?.message ?? "", /aerial-lifeline-cover/);
    assert.match(issue?.message ?? "", /cover/);
    const err = writePageSchemaError(
      writePageSchemaIssues(section, { siblingImageSrcs: siblings }),
      section,
      { siblingImageSrcs: siblings },
    );
    assert.equal(err?.error, "reused_cover_src");
    assert.match(err?.detail ?? "", /aerial-lifeline-cover/);
  });

  it("allows a non-cover full-bleed with a unique src", () => {
    const section = photoPage("section", "content", "media/section-corridor.png", [0, 0, 960, 540]);
    assert.equal(reusedFullBleedSrcIssue(section, siblings), undefined);
    assert.equal(
      writePageSchemaError(
        writePageSchemaIssues(section, { siblingImageSrcs: siblings }),
        section,
        { siblingImageSrcs: siblings },
      ),
      undefined,
    );
  });

  it("allows a small image that reuses the cover src", () => {
    const section = photoPage("section", "content", coverSrc, [20, 20, 64, 64]);
    assert.equal(reusedFullBleedSrcIssue(section, siblings), undefined);
    assert.equal(
      writePageSchemaError(
        writePageSchemaIssues(section, { siblingImageSrcs: siblings }),
        section,
        { siblingImageSrcs: siblings },
      ),
      undefined,
    );
  });
});

describe("photo exhibit media gate", () => {
  function photoPage(
    id: string,
    src: string | undefined,
    bounds: [number, number, number, number] = [40, 120, 560, 300],
  ): SkillPageInput {
    return {
      id,
      pageType: "content",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 40, 400, 40],
          content: { text: "城市空中血液网络", fontSize: 22, color: "#111111" },
        },
        ...(src
          ? [{ elementId: "hero", elementType: "image" as const, bounds, src }]
          : []),
      ],
    };
  }

  function mediaRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "photo-gate-"));
    createEmptyProject(root, { title: "photo gate" });
    fs.mkdirSync(path.join(root, "media"), { recursive: true });
    fs.writeFileSync(path.join(root, "media", "corridor.png"), "png");
    return root;
  }

  it("refuses a photo todo page without any image element", () => {
    const issues = photoExhibitIssues(photoPage("cover_scene", undefined), { photoExhibit: true });
    assert.equal(issues[0]?.code, "missing_media");
    assert.match(issues[0]?.message ?? "", /photo-led/);
  });

  it("refuses a photo page whose src is not in media/", () => {
    const issues = photoExhibitIssues(photoPage("cover_scene", "media/ghost.png"), {
      photoExhibit: true,
      projectRoot: mediaRoot(),
    });
    assert.equal(issues[0]?.code, "missing_media");
    assert.match(issues[0]?.message ?? "", /media\/ghost\.png/);
  });

  it("accepts a photo page backed by an existing unique media file", () => {
    const ctx = { photoExhibit: true, projectRoot: mediaRoot(), siblingImageSrcs: [{ pageId: "cover", src: "media/cover.png" }] };
    assert.deepEqual(photoExhibitIssues(photoPage("cover_scene", "media/corridor.png"), ctx), []);
  });

  it("refuses a photo page whose only image reuses a sibling src", () => {
    const ctx = { photoExhibit: true, projectRoot: mediaRoot(), siblingImageSrcs: [{ pageId: "cover", src: "media/corridor.png" }] };
    const issues = photoExhibitIssues(photoPage("cover_scene", "media/corridor.png"), ctx);
    assert.equal(issues[0]?.code, "reused_cover_src");
  });

  it("stays off when the todo does not promise a photo", () => {
    assert.deepEqual(photoExhibitIssues(photoPage("cover_scene", undefined), {}), []);
    assert.deepEqual(
      writePageSchemaIssues(photoPage("cover_scene", undefined), { projectRoot: mediaRoot() }),
      [],
    );
  });

  it("rejects at write_page schema level with missing_media", () => {
    const page = photoPage("cover_scene", undefined);
    const err = writePageSchemaError(writePageSchemaIssues(page, { photoExhibit: true }), page, {
      photoExhibit: true,
    });
    assert.equal(err?.error, "missing_media");
  });
});
