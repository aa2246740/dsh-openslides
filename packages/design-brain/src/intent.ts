/**
 * Derive SlideIntent from outline-like content (LLM or author).
 * Role/focus drive selection; recipeId is only a soft hint.
 */

import type {
  ContentShape,
  Emphasis,
  SlideIntent,
  SlideRole,
} from "./schema.js";

export type IntentInput = {
  layout?: string;
  recipeId?: string;
  recipeHint?: string;
  recipeLocked?: boolean;
  role?: string;
  focus?: string;
  claim?: string;
  evidence?: string | string[];
  action?: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  quote?: string;
  attribution?: string;
  timeline?: Array<{ label: string; detail: string }>;
  chart?: SlideIntent["chart"];
  table?: SlideIntent["table"];
  notes?: string;
  /** 0-based index in deck */
  index?: number;
  slideCount?: number;
};

const ROLE_FROM_LAYOUT: Record<string, SlideRole> = {
  title: "cover",
  section: "section",
  bullets: "thesis",
  two_column: "comparison",
  chart: "data",
  table: "data",
  timeline: "process",
  quote: "quote",
  closing: "closing",
};

const ROLE_FROM_RECIPE: Record<string, SlideRole> = {
  "cover-hero": "cover",
  "section-break": "section",
  "claim-bullets": "thesis",
  "two-column-compare": "comparison",
  "chart-insight": "data",
  "table-matrix": "data",
  "timeline-milestones": "process",
  "quote-focus": "quote",
  "closing-next": "closing",
};

const VALID_ROLES = new Set<SlideRole>([
  "cover",
  "section",
  "thesis",
  "evidence",
  "comparison",
  "process",
  "data",
  "quote",
  "decision",
  "closing",
]);

function asRole(v: string | undefined): SlideRole | undefined {
  if (!v) return undefined;
  return VALID_ROLES.has(v as SlideRole) ? (v as SlideRole) : undefined;
}

function contentShape(input: IntentInput): ContentShape {
  const bullets = input.bullets ?? [];
  const left = input.left ?? [];
  const right = input.right ?? [];
  const items = bullets.length + left.length + right.length + (input.timeline?.length ?? 0);
  const textBits = [
    input.title,
    input.subtitle,
    input.claim,
    input.action,
    input.quote,
    ...bullets,
    ...left,
    ...right,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    textLength: textBits.length,
    itemCount: items,
    hasData: Boolean(
      (input.chart?.categories?.length && input.chart?.series?.length) ||
        input.table?.headers?.length,
    ),
    hasImage: false,
    hasTimeline: Boolean(input.timeline && input.timeline.length >= 2),
    hasComparison: left.length > 0 || right.length > 0 || input.layout === "two_column",
    hasQuote: Boolean(input.quote || input.layout === "quote"),
  };
}

function inferRole(input: IntentInput, shape: ContentShape): SlideRole {
  const explicit = asRole(input.role);
  if (explicit) return explicit;

  const fromRecipe =
    ROLE_FROM_RECIPE[input.recipeId ?? ""] ||
    ROLE_FROM_RECIPE[input.recipeHint ?? ""];
  if (fromRecipe) return fromRecipe;

  if (input.layout && ROLE_FROM_LAYOUT[input.layout]) {
    return ROLE_FROM_LAYOUT[input.layout]!;
  }

  const idx = input.index ?? 0;
  const n = input.slideCount ?? 1;
  if (idx === 0) return "cover";
  if (idx === n - 1 && n > 1) return "closing";
  if (shape.hasQuote) return "quote";
  if (shape.hasTimeline) return "process";
  if (shape.hasData) return "data";
  if (shape.hasComparison) return "comparison";
  if (/结论|建议|下一步|next step|recommend/i.test(input.title)) return "decision";
  if (/对比|比较|vs\.?|versus/i.test(input.title)) return "comparison";
  return "thesis";
}

function inferEmphasis(role: SlideRole, shape: ContentShape): Emphasis {
  if (role === "data" || shape.hasData) return "data";
  if (role === "quote" || role === "cover" || role === "section") return "statement";
  if (role === "process") return "visual";
  return "balanced";
}

function evidenceList(input: IntentInput): string[] | undefined {
  if (Array.isArray(input.evidence)) return input.evidence.map(String);
  if (typeof input.evidence === "string" && input.evidence.trim()) {
    return [input.evidence.trim()];
  }
  if (input.bullets?.length) return input.bullets;
  return undefined;
}

/**
 * Build a SlideIntent from outline fields. Safe defaults; never throws on partial input.
 */
export function deriveSlideIntent(input: IntentInput): SlideIntent {
  const shape = contentShape(input);
  const role = inferRole(input, shape);
  const claim = input.claim || input.title;
  const focus =
    (input.focus && input.focus.trim()) ||
    claim ||
    input.title ||
    "Untitled point";

  const hint = input.recipeHint || input.recipeId;

  return {
    role,
    focus,
    claim,
    evidence: evidenceList(input),
    action: input.action,
    contentShape: shape,
    emphasis: inferEmphasis(role, shape),
    recipeHint: hint,
    recipeLocked: Boolean(input.recipeLocked),
    title: input.title || claim,
    subtitle: input.subtitle,
    bullets: input.bullets,
    left: input.left,
    right: input.right,
    quote: input.quote,
    attribution: input.attribution,
    timeline: input.timeline,
    chart: input.chart,
    table: input.table,
    notes: input.notes,
  };
}
