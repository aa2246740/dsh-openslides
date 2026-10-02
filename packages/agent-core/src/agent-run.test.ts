import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentRun,
  generateDeck,
  MockProvider,
  refineDeck,
  toolLabel,
  nextVersion,
  titleFromPrompt,
  isTerminalStatus,
  composeSampleDeck,
  fallbackTheme,
  buildMockOutline,
  looksLikeQ3GrowthBrief,
  compileOutlineToDeckDetailed,
} from "./index.js";
import type { ToolEvent } from "./events.js";

const GATE1_CN_BRIEF =
  "为经营委员会写一版 Q3 区域增长决策材料：华北贡献、试点 vs 全量、本周动作。";

describe("util / version helpers", () => {
  it("titleFromPrompt extracts a short title", () => {
    assert.equal(titleFromPrompt("Nuclear fusion overview. More detail."), "Nuclear fusion overview");
    assert.ok(titleFromPrompt("a".repeat(100)).endsWith("…"));
  });

  it("nextVersion starts at 1 and bumps", () => {
    assert.equal(nextVersion().versionNumber, 1);
    assert.equal(nextVersion(1).versionNumber, 2);
    assert.equal(nextVersion(3).versionLabel, "V4");
  });

  it("toolLabel maps PRD-visible names", () => {
    assert.equal(toolLabel("think"), "Think");
    assert.equal(toolLabel("write_todo"), "Write Todo");
    assert.equal(toolLabel("edit_slide"), "Edit slide");
  });

  it("isTerminalStatus", () => {
    assert.equal(isTerminalStatus("ready"), true);
    assert.equal(isTerminalStatus("planning"), false);
  });
});

describe("composeSampleDeck", () => {
  it("emits structured multi-slide PPTD-compatible deck", () => {
    const deck = composeSampleDeck({
      title: "Fusion Research",
      prompt: "Explain nuclear fusion for executives",
      theme: fallbackTheme(),
    });
    assert.equal(deck.title, "Fusion Research");
    assert.equal(deck.aspectRatio, "16:9");
    assert.ok(deck.slides.length >= 5);
    assert.ok(deck.slides.every((s) => s.elements.length > 0));
    const kinds = new Set(deck.slides.flatMap((s) => s.elements.map((e) => e.kind)));
    assert.ok(kinds.has("text"));
    assert.ok(kinds.has("chart"));
    assert.ok(kinds.has("table"));
    assert.ok(kinds.has("smartart"));
    assert.ok(deck.versionId);
    assert.ok(deck.createdAt);
    assert.ok(deck.updatedAt);
  });
});

describe("createAgentRun + MockProvider", () => {
  it("runs generate pipeline to ready with deck and version V1", async () => {
    const events: ToolEvent[] = [];
    const run = createAgentRun(
      {
        prompt: "Build a research deck on nuclear fusion commercialization.",
        title: "Fusion Commercialization",
        mockSpeed: 0,
        modelId: "mock-local",
      },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );

    run.subscribe((e) => events.push(e));
    const result = await run.wait();

    assert.equal(run.status, "ready");
    assert.equal(result.versionLabel, "V1");
    assert.equal(result.versionNumber, 1);
    assert.equal(result.deck.title, "Fusion Commercialization");
    assert.ok(result.deck.slides.length >= 5);
    assert.ok(result.steps.some((s) => s.tool === "think" && s.status === "completed"));
    assert.ok(result.steps.some((s) => s.tool === "compose_deck"));
    assert.ok(result.steps.some((s) => s.tool === "version_snapshot"));
    assert.ok(events.some((e) => e.type === "deck_ready"));
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("refinement bumps version and appends structural edit", async () => {
    const first = await generateDeck(
      {
        prompt: "Quarterly ops review",
        title: "Q Ops",
        mockSpeed: 0,
      },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );

    const refined = await refineDeck(
      {
        deck: first.deck,
        versionNumber: first.versionNumber,
        versionId: first.versionId,
      },
      "Add a slide summarizing risks and mitigations",
      { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
    );

    assert.equal(refined.versionNumber, first.versionNumber + 1);
    assert.equal(refined.versionLabel, `V${first.versionNumber + 1}`);
    assert.ok(refined.deck.slides.length >= first.deck.slides.length);
    assert.notEqual(refined.versionId, first.versionId);
    assert.equal(refined.deck.meta?.versionLabel, refined.versionLabel);
    assert.match(refined.deck.meta?.lastRefinement ?? "", /risks/i);
    // Prior deck snapshot identity preserved on first version for history restore flows
    assert.ok(first.deck.versionId);
    assert.notEqual(first.deck.versionId, refined.deck.versionId);
  });

  it("cancel aborts a slow run", async () => {
    const run = createAgentRun(
      {
        prompt: "Slow run for cancel test",
        mockSpeed: 1,
      },
      {
        provider: new MockProvider({ baseDelayMs: 50 }),
        autoStart: true,
      },
    );

    // Let it queue then cancel
    await new Promise((r) => setTimeout(r, 20));
    run.cancel();

    await assert.rejects(() => run.wait(), (err: Error) => {
      assert.equal(err.name, "AbortError");
      return true;
    });
    assert.equal(run.status, "cancelled");
  });

  it("rejects empty prompt", () => {
    assert.throws(
      () =>
        createAgentRun(
          { prompt: "  " },
          { provider: new MockProvider({ baseDelayMs: 0 }) },
        ),
      /prompt/,
    );
  });

  it("Gate1: Chinese brief → multi-slide claim titles + recipe variety via design brain", async () => {
    assert.equal(looksLikeQ3GrowthBrief(GATE1_CN_BRIEF), true);

    const outline = buildMockOutline(GATE1_CN_BRIEF);
    assert.ok(outline.slides.length >= 5);
    assert.ok(
      outline.slides.every((s) => {
        const t = (s.claim || s.title).trim();
        return t.length > 0 && !/^(概述|目录|简介|总结|Agenda|Overview)$/i.test(t);
      }),
      "outline titles should be claim-like",
    );
    assert.ok(outline.slides.some((s) => s.chart), "data slide with chart");
    assert.ok(
      outline.slides.some((s) => /试点|本周|华北|增长/.test(s.claim || s.title)),
      "sample domain language present",
    );

    const result = await generateDeck(
      {
        prompt: GATE1_CN_BRIEF,
        mockSpeed: 0,
      },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );

    assert.equal(result.versionLabel, "V1");
    assert.ok(result.deck.slides.length >= 5);
    assert.ok(result.steps.some((s) => s.tool === "compose_deck" && s.status === "completed"));
    assert.ok(
      result.steps.some(
        (s) =>
          s.tool === "compose_deck" &&
          (s.summary?.includes("design-brain") || s.detail?.includes("slides")),
      ),
    );

    const titles = result.deck.slides.map((slide) => {
      const texts = slide.elements
        .filter((e) => e.kind === "text")
        .flatMap((e) =>
          e.kind === "text"
            ? e.paragraphs.flatMap((p) => p.runs.map((r) => r.text))
            : [],
        );
      return texts.join(" ");
    });
    const joined = titles.join(" | ");
    assert.ok(/华北|试点|本周|增长/.test(joined), `expected CN claims in deck, got: ${joined.slice(0, 200)}`);
    assert.ok(
      !/Global EV Market/i.test(joined),
      "must not fall back to English EV sample for CN brief",
    );

    // design-brain metadata from compile
    assert.ok(result.deck.meta?.generator?.includes("design-brain") || result.deck.meta?.recipes);
    const recipes = (result.deck.meta?.recipes ?? "").split(",").filter(Boolean);
    if (recipes.length >= 2) {
      assert.ok(new Set(recipes).size >= 3, `recipe variety expected, got ${recipes}`);
    }

    // chart object present on a data slide
    const hasChart = result.deck.slides.some((s) =>
      s.elements.some((e) => e.kind === "chart"),
    );
    assert.ok(hasChart, "expected chart element for takeaway data page");
  });

  it("compileOutlineToDeckDetailed yields score and varied recipes for Q3 outline", () => {
    const outline = buildMockOutline(GATE1_CN_BRIEF);
    const compiled = compileOutlineToDeckDetailed(outline);
    assert.ok(compiled.qualityScore >= 70, compiled.qualitySummary);
    assert.ok(compiled.recipeIds.length >= 5);
    assert.ok(new Set(compiled.recipeIds).size >= 3, String(compiled.recipeIds));
    assert.ok(compiled.deck.slides.every((s) => s.elements.length > 0));
  });

  it("requires an injected provider", () => {
    assert.throws(() => createAgentRun({ prompt: "hello" }), /provider/);
  });
});
