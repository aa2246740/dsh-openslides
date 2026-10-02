/**
 * Honest Think / Plan copy for the generate timeline.
 * Offline default explains the playbook decision; it is not a fake "ok".
 */
import {
  briefToOutline,
  deterministicDeck,
  extractReferenceLines,
  inferDeckIntent,
  type ComposeDeck,
  type DeckIntent,
} from "./compose-ir.js";
import { DEFAULT_DESIGN_SYSTEM } from "./playbook.js";

export type ReasonBlock = {
  summary: string;
  detail: string;
};

function isCjk(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function audienceFromBrief(brief: string): string | undefined {
  const m = brief.match(/面向([^，。,\n]{2,16})/);
  const raw = m?.[1]?.trim();
  return raw || undefined;
}

/** Structured reading of the brief — what we will actually use to plan pages. */
export function thinkAboutBrief(brief: string, referenceText?: string): ReasonBlock {
  const cleaned = brief.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    throw new Error("brief required");
  }
  const { title, claims } = briefToOutline(cleaned);
  const audience = audienceFromBrief(cleaned);
  const refs = extractReferenceLines(referenceText);
  const cjk = isCjk(cleaned);
  const intent = inferDeckIntent(cleaned);

  if (cjk) {
    const lines = [
      `题目：${title}`,
      audience
        ? `受众：${audience}。用对方能懂的词，少堆术语。`
        : "受众：未指定，按简报语气写，不升格成咨询腔。",
      `要讲清：${claims.join("；")}`,
      "约束：不编造课外统计、客户案例或权威出处；需要数字的地方用结构示意并标明占位。",
      refs.names.length
        ? `参考资料只引用：${refs.names.join("、")}。`
        : "没有上传参考资料，页上不出现假数据来源。",
      approachLine(intent, true),
    ];
    return {
      summary: audience ?? title.slice(0, 16),
      detail: lines.join("\n"),
    };
  }

  const lines = [
    `Topic: ${title}`,
    audience
      ? `Audience: ${audience}. Prefer plain language.`
      : "Audience: unspecified; keep the brief's tone.",
    `Claims to cover: ${claims.join("; ")}`,
    "Constraint: do not invent statistics, customers, or citations. Mark placeholders.",
    refs.names.length
      ? `Quote only: ${refs.names.join(", ")}.`
      : "No attachments; no fake sources on the slides.",
    approachLine(intent, false),
  ];
  return {
    summary: audience ?? title.slice(0, 24),
    detail: lines.join("\n"),
  };
}

/** Render a compose IR as the Plan body the user can expand. */
export function planFromDeck(deck: ComposeDeck): ReasonBlock {
  const cjk = isCjk(deck.title);
  const lines = deck.pages.map((p, i) => {
    const n = String(i + 1).padStart(2, "0");
    const extra = p.chart
      ? cjk
        ? ` · 图 ${p.chart.title}`
        : ` · chart ${p.chart.title}`
      : p.bullets?.length
        ? ` · ${p.bullets.slice(0, 2).join(" / ")}`
        : p.items?.length
          ? ` · ${p.items.slice(0, 3).join(" / ")}`
          : "";
    return `${n}  ${p.role}  ${p.title}${extra}`;
  });
  return {
    summary: cjk ? `${deck.pages.length} 页` : `${deck.pages.length} pages`,
    detail: [
      cjk
        ? `共 ${deck.pages.length} 页 · ${deck.title}`
        : `${deck.pages.length} pages · ${deck.title}`,
      "",
      ...lines,
    ].join("\n"),
  };
}

function approachLine(intent: DeckIntent, cjk: boolean): string {
  if (cjk) {
    switch (intent) {
      case "teach":
        return "做法：按课堂路径拆页——封面、今天要搞懂什么、概念、怎么记住、例子、带走什么。不套咨询复盘骨架。";
      case "report":
        return "做法：进展 → 问题 → 下一步，不硬塞四象限和示意柱状图。";
      case "promo":
        return "做法：记忆点 → 主张 → 收束，不当成咨询证据链。";
      case "academic":
        return "做法：问题 → 方法 → 结论，证据只引用已给材料。";
      default:
        return "做法：先锁判断，再按简报决定要不要证据/节奏/对照，页数跟着任务走。";
    }
  }
  switch (intent) {
    case "teach":
      return "Approach: lesson path — cover → what to learn → concept → remember → example → takeaway. Not a consulting recap.";
    case "report":
      return "Approach: progress → issues → next steps. Do not force a 2×2 or placeholder chart.";
    case "promo":
      return "Approach: memory point → claim → close. Not an evidence chain.";
    case "academic":
      return "Approach: question → method → conclusion. Quote only given sources.";
    default:
      return "Approach: lock one judgment, then add evidence/timeline/matrix only if the brief needs them.";
  }
}

export function localPlan(
  brief: string,
  designSystemId: string = DEFAULT_DESIGN_SYSTEM,
  referenceText?: string,
  categoryId?: string,
): { deck: ComposeDeck; reason: ReasonBlock } {
  const deck = deterministicDeck(brief, designSystemId, referenceText, categoryId);
  return { deck, reason: planFromDeck(deck) };
}
