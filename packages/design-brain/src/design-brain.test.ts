import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleDesignSystemPrompt,
  composeDeckPlans,
  contractFromHints,
  contractToThemeTokens,
  defaultConsultingContract,
  defaultConsultingTheme,
  deriveSlideIntent,
  extractThemeFromHints,
  formatThemeTokensSummary,
  mergeThemeTokens,
  parseDesignContract,
  safeParseDesignContract,
  selectRecipe,
  themeTokensToPlain,
  toThemeTokens,
  withContractOverrides,
} from "./index.js";

describe("defaultConsultingTheme", () => {
  it("returns a complete theme with chart palette", () => {
    const theme = defaultConsultingTheme();
    assert.equal(theme.name, "Consulting Classic");
    assert.ok(theme.colors.chart.length >= 3);
    assert.match(theme.colors.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.colors.primary);
    assert.ok(theme.fonts.heading.includes("Inter"));
  });

  it("mirrors pptd-compatible keys", () => {
    const theme = defaultConsultingTheme();
    assert.ok("background" in theme.colors);
    assert.ok("accent" in theme.colors);
    assert.ok("primary" in theme.colors);
    assert.ok("secondary" in theme.colors);
    assert.ok("heading" in theme.fonts);
    assert.ok("body" in theme.fonts);
  });
});

describe("defaultConsultingContract", () => {
  it("validates against the schema", () => {
    const contract = defaultConsultingContract();
    const parsed = parseDesignContract(contract);
    assert.equal(parsed.name, "Consulting Classic");
    assert.ok(parsed.layoutArchetypes.length >= 8);
    assert.ok(parsed.antiSlopRules.some((r) => r.severity === "must"));
    assert.ok(parsed.typeScale);
  });

  it("rejects incomplete contracts", () => {
    const bad = safeParseDesignContract({ name: "x" });
    assert.equal(bad.success, false);
  });
});

describe("assembleDesignSystemPrompt", () => {
  it("includes tokens, archetypes, and anti-slop sections", () => {
    const prompt = assembleDesignSystemPrompt(defaultConsultingContract());
    assert.match(prompt, /Design system contract/);
    assert.match(prompt, /#0B3D5C/i);
    assert.match(prompt, /chart-focus/);
    assert.match(prompt, /Anti-slop — MUST/);
    assert.match(prompt, /Open SlideStudio/);
    assert.doesNotMatch(prompt, /\bKIMI\b/i);
  });

  it("formatThemeTokensSummary is compact", () => {
    const s = formatThemeTokensSummary(defaultConsultingContract());
    assert.ok(s.includes("Consulting Classic"));
    assert.ok(s.includes("density="));
  });
});

describe("extractThemeFromHints", () => {
  it("returns defaults for empty input", () => {
    const r = extractThemeFromHints("");
    assert.equal(r.confidence, 0);
    assert.equal(r.tokens.name, defaultConsultingTheme().name);
  });

  it("parses hex accent and font", () => {
    const r = extractThemeFromHints(
      "Use accent color #FF5500 and Inter for headings. Dense layout.",
    );
    assert.equal(r.tokens.colors.accent.toUpperCase(), "#FF5500");
    assert.match(r.tokens.fonts.heading, /Inter/);
    assert.equal(r.density, "dense");
    assert.ok(r.confidence > 0);
  });

  it("applies finance domain preset", () => {
    const r = extractThemeFromHints("Board finance deck for banking review");
    assert.ok(r.notes.some((n) => n.includes("finance")));
    assert.equal(r.tokens.colors.accent, "#0A2540");
  });

  it("handles dark mode keywords", () => {
    const r = extractThemeFromHints("dark theme navy accent");
    assert.equal(r.tokens.colors.background, "#0F1115");
  });

  it("contractFromHints yields a valid contract", () => {
    const c = contractFromHints("navy and gold consulting strategy deck");
    parseDesignContract(c);
    assert.ok(c.tokens.colors.accent);
  });
});

describe("mergeThemeTokens / themeTokensToPlain / mappers", () => {
  it("merges partial colors without dropping chart", () => {
    const base = defaultConsultingTheme();
    const merged = mergeThemeTokens(base, {
      colors: { accent: "#ABCDEF" },
    });
    assert.equal(merged.colors.accent, "#ABCDEF");
    assert.deepEqual(merged.colors.chart, base.colors.chart);
    assert.equal(merged.colors.ink, base.colors.ink);
  });

  it("clones plain tokens", () => {
    const base = defaultConsultingTheme();
    const plain = themeTokensToPlain(base);
    plain.colors.accent = "#000000";
    assert.notEqual(base.colors.accent, "#000000");
  });

  it("toThemeTokens and contractToThemeTokens produce plain objects", () => {
    const contract = defaultConsultingContract();
    const fromContract = contractToThemeTokens(contract);
    const fromHelper = toThemeTokens(contract.tokens);
    assert.equal(fromContract.name, "Consulting Classic");
    assert.equal(fromHelper.colors.accent, contract.tokens.colors.accent);
    assert.notEqual(fromContract.colors.chart, contract.tokens.colors.chart);
  });
});

describe("withContractOverrides", () => {
  it("overrides density and brand notes", () => {
    const base = defaultConsultingContract();
    const next = withContractOverrides(base, {
      density: "sparse",
      brandNotes: "Client X only",
      tokens: { colors: { accent: "#112233" } },
    });
    assert.equal(next.density, "sparse");
    assert.equal(next.brandNotes, "Client X only");
    assert.equal(next.tokens.colors.accent, "#112233");
    assert.equal(base.density, "balanced");
  });
});

describe("compose brain pipeline", () => {
  it("selects cover for first slide and varies recipes", () => {
    const result = composeDeckPlans(
      [
        {
          title: "Q3 增长取决于三条路径",
          claim: "Q3 增长取决于三条路径",
          role: "cover",
          focus: "三条路径决定增长",
          subtitle: "经营委员会决策会",
        },
        {
          title: "华北贡献了 62% 的增量",
          claim: "华北贡献了 62% 的增量",
          role: "data",
          focus: "区域贡献集中",
          chart: {
            type: "column",
            categories: ["华北", "华东", "华南", "西部"],
            series: [{ name: "增量", values: [62, 18, 12, 8] }],
          },
        },
        {
          title: "试点 vs 全量：试点先验证转化",
          claim: "试点先于全量",
          role: "comparison",
          focus: "对比两种打法",
          left: ["试点：8 周验证", "成本可控"],
          right: ["全量：节奏快", "失败代价高"],
        },
        {
          title: "建议本周锁定试点城市",
          claim: "本周锁定试点城市",
          role: "closing",
          focus: "决策下一步",
          bullets: ["锁定 3 城", "配置专项预算", "双周复盘"],
        },
      ],
      {
        title: "Q3 增长路径",
        audience: "经营委员会",
        recipeFamily: "consulting-meridian",
      },
    );

    assert.equal(result.plans[0]?.recipeId, "cover-hero");
    assert.equal(result.plans[1]?.recipeId, "chart-insight");
    assert.equal(result.plans[2]?.recipeId, "two-column-compare");
    assert.equal(result.plans[3]?.recipeId, "closing-next");
    assert.ok(result.quality.score >= 70, result.qualitySummary);
    assert.ok(result.plans.every((p) => p.elements.some((e) => e.kind === "title" || e.kind === "quote")));
    // Recipes should not all be the same
    const unique = new Set(result.plans.map((p) => p.recipeId));
    assert.ok(unique.size >= 3, `expected recipe variety, got ${[...unique]}`);
  });

  it("treats recipeId as soft hint unless locked", () => {
    const intent = deriveSlideIntent({
      title: "华北贡献了 62% 的增量",
      claim: "华北贡献了 62% 的增量",
      role: "data",
      recipeHint: "claim-bullets",
      chart: {
        categories: ["A", "B", "C"],
        series: [{ name: "v", values: [1, 2, 3] }],
      },
    });
    const soft = selectRecipe(intent);
    assert.equal(soft.recipeId, "chart-insight");

    const locked = selectRecipe({
      ...intent,
      recipeLocked: true,
      recipeHint: "claim-bullets",
    });
    assert.equal(locked.recipeId, "claim-bullets");
    assert.equal(locked.locked, true);
  });

  it("flags generic titles in lint", () => {
    const result = composeDeckPlans(
      [
        { title: "Overview", role: "thesis", bullets: ["a", "b", "c"] },
        { title: "Introduction", role: "thesis", bullets: ["d", "e"] },
        { title: "Summary", role: "thesis", bullets: ["f"] },
      ],
      { title: "Weak deck" },
    );
    assert.ok(
      result.quality.warnings.some((w) => w.code === "generic-title") ||
        result.quality.warnings.some((w) => w.code === "recipe-streak"),
      result.qualitySummary,
    );
  });

  it("flags Chinese generic titles in lint", () => {
    const result = composeDeckPlans(
      [
        { title: "概述", role: "thesis", bullets: ["a", "b"] },
        { title: "目录", role: "thesis", bullets: ["c", "d"] },
        { title: "总结", role: "closing", bullets: ["e"] },
      ],
      { title: "弱标题稿" },
    );
    assert.ok(
      result.quality.warnings.some((w) => w.code === "generic-title"),
      result.qualitySummary,
    );
  });
});
