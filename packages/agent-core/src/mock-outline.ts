/**
 * Deterministic DeckOutline for MockProvider generate path.
 * Produces claim-style titles + role variety so design-brain can select recipes.
 * No network / LLM — Gate 1 demos stay offline.
 */

import type { DeckOutline, OutlineSlide } from "./llm/outline-schema.js";
import { titleFromPrompt } from "./util.js";

const SAMPLE_Q3_BRIEF =
  "为经营委员会写一版 Q3 区域增长决策材料：华北贡献、试点 vs 全量、本周动作";

/** True when prompt looks like the Gate 1 sample or a close Chinese ops brief. */
export function isChineseBusinessBrief(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  if (/[\u4e00-\u9fff]/.test(p)) return true;
  return false;
}

export function looksLikeQ3GrowthBrief(prompt: string): boolean {
  const p = prompt.replace(/\s+/g, "");
  return (
    (p.includes("经营委员会") || p.includes("Q3") || p.includes("区域增长")) &&
    (p.includes("华北") || p.includes("试点") || p.includes("全量"))
  );
}

/**
 * Build a multi-slide outline with claim-like titles.
 * Q3 sample path is fixed golden content; other Chinese/English prompts get
 * a structured generic business outline derived from the brief.
 */
export function buildMockOutline(prompt: string, titleHint?: string): DeckOutline {
  const title =
    titleHint?.trim() ||
    (looksLikeQ3GrowthBrief(prompt)
      ? "Q3 区域增长决策材料"
      : titleFromPrompt(prompt));

  if (looksLikeQ3GrowthBrief(prompt) || prompt.includes(SAMPLE_Q3_BRIEF.slice(0, 12))) {
    return q3GrowthOutline(title, prompt);
  }

  if (isChineseBusinessBrief(prompt)) {
    return chineseGenericOutline(title, prompt);
  }

  return englishGenericOutline(title, prompt);
}

function q3GrowthOutline(title: string, prompt: string): DeckOutline {
  const slides: OutlineSlide[] = [
    {
      role: "cover",
      recipeHint: "cover-hero",
      claim: "Q3 增长取决于试点是否先于全量铺开",
      focus: "经营委员会决策焦点",
      title: "Q3 增长取决于试点是否先于全量铺开",
      subtitle: "经营委员会 · 区域增长决策",
      notes: prompt.slice(0, 240),
    },
    {
      role: "thesis",
      recipeHint: "claim-bullets",
      claim: "决策只需回答三件事：贡献、路径、本周动作",
      focus: "议程即决策问题",
      title: "决策只需回答三件事：贡献、路径、本周动作",
      bullets: [
        "华北是否仍是增量主力？",
        "试点 vs 全量，哪条路径风险更可控？",
        "本周必须锁定的动作是什么？",
      ],
    },
    {
      role: "data",
      recipeHint: "chart-insight",
      claim: "华北贡献了 62% 的增量",
      focus: "区域贡献高度集中",
      title: "华北贡献了 62% 的增量",
      evidence: "四区域增量结构",
      chart: {
        type: "column",
        title: "Q3 增量贡献（%）",
        categories: ["华北", "华东", "华南", "西部"],
        series: [{ name: "增量贡献", values: [62, 18, 12, 8] }],
      },
      bullets: ["资源投放应优先对齐华北可复制单元"],
    },
    {
      role: "comparison",
      recipeHint: "two-column-compare",
      claim: "试点先验证转化，全量再放大节奏",
      focus: "两条路径的代价不同",
      title: "试点先验证转化，全量再放大节奏",
      left: ["试点：8 周验证转化", "预算与组织可回撤", "失败代价可控"],
      right: ["全量：节奏快、覆盖广", "一旦误判放大损失", "需要成熟打法模板"],
    },
    {
      role: "data",
      recipeHint: "table-matrix",
      claim: "试点单元转化率是全量的 1.8 倍",
      focus: "数据支撑路径选择",
      title: "试点单元转化率是全量的 1.8 倍",
      table: {
        headers: ["路径", "覆盖城数", "转化率", "单城投入"],
        rows: [
          ["试点", "3", "4.1%", "可控"],
          ["全量", "18", "2.3%", "偏高"],
        ],
      },
    },
    {
      role: "closing",
      recipeHint: "closing-next",
      claim: "建议本周锁定 3 个试点城并配置专项预算",
      focus: "本周动作",
      title: "建议本周锁定 3 个试点城并配置专项预算",
      action: "本周决策",
      bullets: [
        "锁定 3 城试点名单",
        "配置专项预算与负责人",
        "双周复盘：转化 / 单位经济 / 扩城门槛",
      ],
    },
  ];

  return {
    title,
    audience: "经营委员会",
    recipeFamily: "consulting-meridian",
    theme: {
      primary: "#0B3D5C",
      accent: "#C45C26",
      background: "#F7F5F1",
      ink: "#1A1A1A",
    },
    slides,
  };
}

function chineseGenericOutline(title: string, prompt: string): DeckOutline {
  const claimSeed = title.replace(/[。.!?！？]$/, "") || "核心结论需要数据支撑";
  return {
    title,
    audience: "业务决策者",
    recipeFamily: "consulting-meridian",
    slides: [
      {
        role: "cover",
        recipeHint: "cover-hero",
        claim: claimSeed,
        title: claimSeed,
        subtitle: "DSH SlideStudio · 决策材料",
        focus: "封面主张",
        notes: prompt.slice(0, 240),
      },
      {
        role: "thesis",
        recipeHint: "claim-bullets",
        claim: `${claimSeed}——先对齐问题再给方案`,
        title: `${claimSeed}——先对齐问题再给方案`,
        focus: "问题定义",
        bullets: [
          "现状与约束是什么？",
          "可选路径各自代价？",
          "本周可执行的决策是什么？",
        ],
      },
      {
        role: "data",
        recipeHint: "chart-insight",
        claim: "关键指标呈现结构性差异",
        title: "关键指标呈现结构性差异",
        focus: "用数据说话",
        chart: {
          type: "column",
          title: "示意指标",
          categories: ["A", "B", "C", "D"],
          series: [{ name: "贡献", values: [45, 25, 18, 12] }],
        },
      },
      {
        role: "comparison",
        recipeHint: "two-column-compare",
        claim: "路径选择取决于风险与速度的权衡",
        title: "路径选择取决于风险与速度的权衡",
        focus: "对比决策",
        left: ["稳健路径：验证后再放大", "可控回撤"],
        right: ["激进路径：全面铺开", "失败代价更高"],
      },
      {
        role: "closing",
        recipeHint: "closing-next",
        claim: "本周明确负责人、里程碑与复盘节奏",
        title: "本周明确负责人、里程碑与复盘节奏",
        focus: "下一步",
        bullets: ["指定 owner", "锁定里程碑", "建立双周复盘"],
      },
    ],
  };
}

function englishGenericOutline(title: string, prompt: string): DeckOutline {
  return {
    title,
    audience: "Leadership",
    recipeFamily: "consulting-meridian",
    slides: [
      {
        role: "cover",
        recipeHint: "cover-hero",
        claim: title,
        title,
        subtitle: "Decision brief",
        focus: "Cover claim",
        notes: prompt.slice(0, 240),
      },
      {
        role: "thesis",
        recipeHint: "claim-bullets",
        claim: "Three questions frame the decision",
        title: "Three questions frame the decision",
        focus: "Problem framing",
        bullets: [
          "Where is contribution concentrated?",
          "Which path balances speed and risk?",
          "What must ship this week?",
        ],
      },
      {
        role: "data",
        recipeHint: "chart-insight",
        claim: "Contribution is uneven across segments",
        title: "Contribution is uneven across segments",
        focus: "Evidence",
        chart: {
          type: "column",
          title: "Contribution share",
          categories: ["North", "East", "South", "West"],
          series: [{ name: "Share", values: [52, 22, 16, 10] }],
        },
      },
      {
        role: "comparison",
        recipeHint: "two-column-compare",
        claim: "Pilot first, then scale when conversion holds",
        title: "Pilot first, then scale when conversion holds",
        focus: "Options",
        left: ["Pilot: learn fast", "Lower downside"],
        right: ["Full rollout: speed", "Higher blast radius"],
      },
      {
        role: "closing",
        recipeHint: "closing-next",
        claim: "This week: owners, budget, and review cadence",
        title: "This week: owners, budget, and review cadence",
        focus: "Actions",
        bullets: ["Name owners", "Lock budget", "Biweekly review"],
      },
    ],
  };
}
