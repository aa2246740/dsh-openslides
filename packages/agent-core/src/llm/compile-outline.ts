/**
 * Compile a DeckOutline into a full PPTD Deck via design-brain CompositionPlan.
 * LLM supplies content/intent; selector+composer decide geometry.
 */

import {
  createId,
  nowIso,
  solidFill,
  type ChartElement,
  type ChartType,
  type Deck,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
  type TextParagraph,
  type ThemeTokens,
  DEFAULT_THEME,
  deepClone,
} from "@open-slidestudio/pptd";
import {
  composeDeckPlans,
  type CompositionPlan,
  type ComposedElement,
  type SlideDesignContract,
} from "@open-slidestudio/design-brain";
import type { DeckOutline, OutlineSlide } from "./outline-schema.js";

const W = 1920;
const H = 1080;

function para(
  text: string,
  opts: {
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    bullet?: boolean;
    align?: TextParagraph["align"];
  } = {},
): TextParagraph {
  return {
    align: opts.align,
    bullet: opts.bullet || undefined,
    runs: [
      {
        text,
        fontSize: opts.fontSize ?? 20,
        fontWeight: opts.fontWeight ?? 400,
        color: opts.color,
      },
    ],
  };
}

function textEl(
  box: { x: number; y: number; w: number; h: number; z?: number; name?: string },
  paragraphs: TextParagraph[],
): TextElement {
  return {
    kind: "text",
    id: createId("el"),
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rotation: 0,
    opacity: 1,
    zIndex: box.z ?? 2,
    name: box.name,
    paragraphs,
  };
}

function shapeEl(
  box: { x: number; y: number; w: number; h: number; z?: number; name?: string },
  fill: string,
  shape: ShapeElement["shape"] = "rect",
): ShapeElement {
  return {
    kind: "shape",
    id: createId("el"),
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rotation: 0,
    opacity: 1,
    zIndex: box.z ?? 1,
    name: box.name,
    shape,
    fill: solidFill(fill),
    cornerRadius: shape === "roundRect" ? 16 : undefined,
  };
}

function themeFromContract(contract: SlideDesignContract): ThemeTokens {
  const base = deepClone(DEFAULT_THEME);
  base.name = contract.name;
  base.colors.background = contract.colors.background;
  base.colors.surface = contract.colors.surface;
  base.colors.ink = contract.colors.ink;
  base.colors.muted = contract.colors.muted;
  base.colors.accent = contract.colors.accent;
  base.colors.primary = contract.colors.primary;
  base.colors.secondary = contract.colors.accent;
  base.colors.chart = [...contract.colors.chart];
  return base;
}

function typeSize(
  contract: SlideDesignContract,
  role?: keyof SlideDesignContract["typeScale"],
): { size: number; weight: number } {
  const scale = contract.typeScale;
  switch (role) {
    case "display":
      return { size: scale.display, weight: 700 };
    case "h1":
      return { size: scale.h1, weight: 700 };
    case "h2":
      return { size: scale.h2, weight: 600 };
    case "caption":
      return { size: scale.caption, weight: 400 };
    case "body":
    default:
      return { size: scale.body, weight: 400 };
  }
}

function inkForElement(
  el: ComposedElement,
  plan: CompositionPlan,
  theme: ThemeTokens,
): string {
  const isHero =
    plan.recipeId === "cover-hero" || plan.recipeId === "closing-next";
  if (isHero && (el.kind === "title" || el.kind === "subtitle" || el.kind === "body")) {
    return el.kind === "title" ? "#FFFFFF" : "#D0D7E2";
  }
  if (el.role === "action") return theme.colors.accent;
  if (el.role === "attribution") return theme.colors.muted;
  return theme.colors.ink;
}

function compileComposedElement(
  el: ComposedElement,
  plan: CompositionPlan,
  theme: ThemeTokens,
  contract: SlideDesignContract,
): SlideElement | SlideElement[] | null {
  const box = { x: el.x, y: el.y, w: el.w, h: el.h, z: el.z, name: el.role };

  if (el.kind === "bg" || el.kind === "accent-bar" || el.kind === "card" || el.kind === "marker") {
    return shapeEl(box, el.fill || theme.colors.accent, el.shape || "rect");
  }

  if (el.kind === "chart" && el.chart?.categories?.length && el.chart.series?.length) {
    const chartType = (el.chart.type ?? "column") as ChartType;
    const chart: ChartElement = {
      kind: "chart",
      id: createId("el"),
      x: el.x,
      y: el.y,
      width: el.w,
      height: el.h,
      rotation: 0,
      opacity: 1,
      zIndex: el.z,
      name: el.role,
      chartType: ["bar", "column", "line", "area", "pie", "doughnut"].includes(chartType)
        ? chartType
        : "column",
      categories: el.chart.categories,
      series: el.chart.series.map((s, i) => ({
        name: s.name || `Series ${i + 1}`,
        values: s.values.map((v) => Number(v) || 0),
        color: s.color || theme.colors.chart[i % theme.colors.chart.length],
      })),
      title: el.chart.title,
      showLegend: true,
    };
    return chart;
  }

  if (el.kind === "table" && el.table?.headers?.length) {
    const t = el.table;
    const cols = t.headers.length;
    const rows = t.rows?.length ?? 0;
    const cells: TableElement["cells"] = [
      t.headers.map((h) => ({
        text: h,
        fontWeight: 700,
        fill: solidFill("#EEF4FC"),
        align: "center" as const,
        color: theme.colors.ink,
      })),
      ...t.rows.map((row) =>
        Array.from({ length: cols }, (_, i) => ({
          text: row[i] ?? "",
          align: "center" as const,
          color: theme.colors.ink,
        })),
      ),
    ];
    const table: TableElement = {
      kind: "table",
      id: createId("el"),
      x: el.x,
      y: el.y,
      width: el.w,
      height: Math.min(el.h, 80 + (rows + 1) * 70),
      rotation: 0,
      opacity: 1,
      zIndex: el.z,
      name: el.role,
      rows: rows + 1,
      cols,
      columnWidths: Array.from({ length: cols }, () => Math.floor(el.w / cols)),
      cells,
    };
    return table;
  }

  // Text-like
  if (
    el.kind === "title" ||
    el.kind === "subtitle" ||
    el.kind === "body" ||
    el.kind === "footer" ||
    el.kind === "quote"
  ) {
    const ts = typeSize(contract, el.typeRole);
    const color = inkForElement(el, plan, theme);
    const weight =
      el.kind === "title" || el.kind === "quote"
        ? ts.weight
        : el.role === "action"
          ? 600
          : ts.weight;
    const fontSize =
      el.kind === "quote" ? Math.max(ts.size, contract.typeScale.h1) : ts.size;

    if (Array.isArray(el.text)) {
      // Timeline milestone: first line bold label, second muted detail
      if (el.role === "milestone-label" && el.text.length >= 2) {
        return textEl(box, [
          para(el.text[0]!, {
            fontSize: contract.typeScale.body,
            fontWeight: 700,
            color: theme.colors.ink,
          }),
          para(el.text[1]!, {
            fontSize: contract.typeScale.caption,
            color: theme.colors.muted,
          }),
        ]);
      }
      return textEl(
        box,
        el.text.map((line) =>
          para(line, {
            fontSize,
            fontWeight: weight,
            color,
            bullet: el.bullet,
          }),
        ),
      );
    }
    const text = el.text ?? "";
    if (!text && el.kind === "footer") return null;
    return textEl(box, [
      para(text, {
        fontSize,
        fontWeight: weight,
        color,
        bullet: el.bullet,
      }),
    ]);
  }

  return null;
}

function compilePlanToSlide(
  plan: CompositionPlan,
  order: number,
  theme: ThemeTokens,
  contract: SlideDesignContract,
  notes?: string,
): Slide {
  const elements: SlideElement[] = [];
  for (const el of plan.elements) {
    const compiled = compileComposedElement(el, plan, theme, contract);
    if (!compiled) continue;
    if (Array.isArray(compiled)) elements.push(...compiled);
    else elements.push(compiled);
  }

  const isHero =
    plan.recipeId === "cover-hero" || plan.recipeId === "closing-next";

  return {
    id: createId("slide"),
    order,
    size: { width: W, height: H },
    background: solidFill(
      isHero ? theme.colors.primary || theme.colors.background : theme.colors.surface,
    ),
    notes: notes
      ? `${notes}\n\n[design] ${plan.recipeId} · ${plan.rationale.slice(0, 4).join("; ")}`
      : `[design] ${plan.recipeId} · focus: ${plan.focus}`,
    elements,
  };
}

export type CompileOutlineResult = {
  deck: Deck;
  qualitySummary: string;
  qualityScore: number;
  recipeIds: string[];
};

export function compileOutlineToDeck(
  outline: DeckOutline,
  opts: { versionId?: string; meta?: Record<string, string> } = {},
): Deck {
  return compileOutlineToDeckDetailed(outline, opts).deck;
}

export function compileOutlineToDeckDetailed(
  outline: DeckOutline,
  opts: { versionId?: string; meta?: Record<string, string> } = {},
): CompileOutlineResult {
  const slidesIn =
    outline.slides?.length > 0
      ? outline.slides
      : [{ title: outline.title || "Untitled", layout: "title" as const }];

  const composed = composeDeckPlans(
    slidesIn.map((s) => ({
      layout: s.layout,
      recipeId: s.recipeId,
      recipeHint: s.recipeHint || s.recipeId,
      recipeLocked: s.recipeLocked,
      role: s.role,
      focus: s.focus,
      claim: s.claim,
      evidence: s.evidence,
      action: s.action,
      title: s.title,
      subtitle: s.subtitle,
      bullets: s.bullets,
      left: s.left,
      right: s.right,
      quote: s.quote,
      attribution: s.attribution,
      timeline: s.timeline,
      chart: s.chart,
      table: s.table,
      notes: s.notes,
    })),
    {
      title: outline.title,
      audience: outline.audience,
      recipeFamily: outline.recipeFamily,
      theme: outline.theme,
      deckClaim: outline.title,
    },
  );

  const theme = themeFromContract(composed.contract);
  const slides = composed.plans.map((plan, i) =>
    compilePlanToSlide(plan, i, theme, composed.contract, slidesIn[i]?.notes),
  );

  const ts = nowIso();
  const deck: Deck = {
    id: createId("deck"),
    title: outline.title || "Untitled Deck",
    aspectRatio: "16:9",
    theme,
    slides,
    references: [],
    citations: [],
    versionId: opts.versionId ?? createId("ver"),
    createdAt: ts,
    updatedAt: ts,
    meta: {
      product: "DSH SlideStudio",
      generator: "design-brain-compose",
      audience: outline.audience ?? "",
      designTheme: composed.contract.themeId,
      designScore: String(composed.quality.score),
      recipes: composed.plans.map((p) => p.recipeId).join(","),
      ...(opts.meta ?? {}),
    },
  };

  return {
    deck,
    qualitySummary: composed.qualitySummary,
    qualityScore: composed.quality.score,
    recipeIds: composed.plans.map((p) => p.recipeId),
  };
}

export function parseOutline(raw: unknown): DeckOutline {
  if (!raw || typeof raw !== "object") {
    throw new Error("Outline must be an object");
  }
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? "Untitled Deck");
  const slidesIn = Array.isArray(o.slides) ? o.slides : [];
  if (!slidesIn.length) {
    throw new Error("Outline has no slides");
  }
  const slides: OutlineSlide[] = slidesIn.map((s, i) => {
    const row = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return {
      layout: (row.layout as OutlineSlide["layout"]) || (i === 0 ? "title" : "bullets"),
      recipeId: row.recipeId != null ? String(row.recipeId) : undefined,
      recipeHint:
        row.recipeHint != null
          ? String(row.recipeHint)
          : row.recipeId != null
            ? String(row.recipeId)
            : undefined,
      recipeLocked: row.recipeLocked === true,
      role: row.role != null ? String(row.role) : undefined,
      focus: row.focus != null ? String(row.focus) : undefined,
      claim: row.claim != null ? String(row.claim) : undefined,
      evidence:
        typeof row.evidence === "string"
          ? row.evidence
          : Array.isArray(row.evidence)
            ? row.evidence.map(String).join("; ")
            : undefined,
      action: row.action != null ? String(row.action) : undefined,
      title: String(row.title ?? `Slide ${i + 1}`),
      subtitle: row.subtitle != null ? String(row.subtitle) : undefined,
      bullets: Array.isArray(row.bullets) ? row.bullets.map(String) : undefined,
      left: Array.isArray(row.left) ? row.left.map(String) : undefined,
      right: Array.isArray(row.right) ? row.right.map(String) : undefined,
      quote: row.quote != null ? String(row.quote) : undefined,
      attribution: row.attribution != null ? String(row.attribution) : undefined,
      timeline: Array.isArray(row.timeline)
        ? row.timeline.map((t) => {
            const item = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
            return {
              label: String(item.label ?? ""),
              detail: String(item.detail ?? ""),
            };
          })
        : undefined,
      chart:
        row.chart && typeof row.chart === "object"
          ? (row.chart as OutlineSlide["chart"])
          : undefined,
      table:
        row.table && typeof row.table === "object"
          ? (row.table as OutlineSlide["table"])
          : undefined,
      notes: row.notes != null ? String(row.notes) : undefined,
    };
  });
  return {
    title,
    audience: o.audience != null ? String(o.audience) : undefined,
    recipeFamily:
      o.recipeFamily != null ? String(o.recipeFamily) : "consulting-meridian",
    theme:
      o.theme && typeof o.theme === "object"
        ? (o.theme as DeckOutline["theme"])
        : undefined,
    slides: slides.map((s) => ({
      ...s,
      claim: s.claim ?? s.title,
      focus: s.focus ?? s.claim ?? s.title,
    })),
  };
}
