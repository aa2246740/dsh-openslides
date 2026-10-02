import { z } from "zod";
import type { Deck } from "../types/deck.js";
import type { SlideElement } from "../types/elements.js";
import type { Command } from "../types/commands.js";

// ── Primitives ──────────────────────────────────────────────────────

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const SizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: z.string().min(1),
});

export const FillSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string().min(1) }),
  z.object({
    type: z.literal("gradient"),
    angle: z.number().optional(),
    stops: z.array(GradientStopSchema).min(2),
  }),
  z.object({
    type: z.literal("image"),
    assetId: z.string().min(1),
    fit: z.enum(["cover", "contain", "fill"]).optional(),
  }),
  z.object({ type: z.literal("none") }),
]);

export const StrokeSchema = z.object({
  color: z.string().min(1),
  width: z.number().nonnegative(),
  dash: z.enum(["solid", "dashed", "dotted"]).optional(),
});

export const ShadowSchema = z.object({
  color: z.string().min(1),
  blur: z.number().nonnegative(),
  offsetX: z.number(),
  offsetY: z.number(),
});

export const ThemeTokensSchema = z.object({
  name: z.string().min(1),
  colors: z.object({
    background: z.string(),
    surface: z.string(),
    ink: z.string(),
    muted: z.string(),
    accent: z.string(),
    primary: z.string(),
    secondary: z.string(),
    success: z.string().optional(),
    danger: z.string().optional(),
    chart: z.array(z.string()).min(1),
  }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    mono: z.string().optional(),
  }),
  radii: z
    .object({
      sm: z.number(),
      md: z.number(),
      lg: z.number(),
    })
    .optional(),
  spacing: z.number().optional(),
});

// ── Text ────────────────────────────────────────────────────────────

export const TextRunSchema = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().optional(),
  href: z.string().optional(),
  letterSpacing: z.number().optional(),
});

export const TextParagraphSchema = z.object({
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().optional(),
  spaceBefore: z.number().optional(),
  spaceAfter: z.number().optional(),
  bullet: z
    .union([
      z.boolean(),
      z.object({
        level: z.number().int().nonnegative(),
        style: z.enum(["disc", "number", "none"]).optional(),
      }),
    ])
    .optional(),
  runs: z.array(TextRunSchema),
});

const BaseElementFields = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  zIndex: z.number().int(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  name: z.string().optional(),
  sourceRef: z.string().optional(),
};

export const TextElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("text"),
  paragraphs: z.array(TextParagraphSchema),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  autoFit: z.boolean().optional(),
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
});

export const ShapeElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("shape"),
  shape: z.enum([
    "rect",
    "roundRect",
    "ellipse",
    "triangle",
    "line",
    "arrow",
    "diamond",
    "hexagon",
    "freeform",
  ]),
  fill: FillSchema,
  stroke: StrokeSchema.optional(),
  cornerRadius: z.number().nonnegative().optional(),
  shadow: ShadowSchema.optional(),
  text: z.array(TextParagraphSchema).optional(),
});

export const ImageElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("image"),
  src: z.string().min(1),
  alt: z.string().optional(),
  crop: z
    .object({
      left: z.number().min(0).max(1),
      top: z.number().min(0).max(1),
      right: z.number().min(0).max(1),
      bottom: z.number().min(0).max(1),
    })
    .optional(),
  objectFit: z.enum(["cover", "contain", "fill"]).optional(),
});

export const TableCellSchema = z.object({
  text: z.string(),
  colspan: z.number().int().positive().optional(),
  rowspan: z.number().int().positive().optional(),
  fill: FillSchema.optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  color: z.string().optional(),
  border: z
    .object({
      top: StrokeSchema.optional(),
      right: StrokeSchema.optional(),
      bottom: StrokeSchema.optional(),
      left: StrokeSchema.optional(),
    })
    .optional(),
});

export const TableElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("table"),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  columnWidths: z.array(z.number().positive()),
  rowHeights: z.array(z.number().positive()).optional(),
  cells: z.array(z.array(TableCellSchema)),
});

export const ChartSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
  color: z.string().optional(),
});

export const ChartElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("chart"),
  chartType: z.enum([
    "bar",
    "column",
    "line",
    "area",
    "pie",
    "doughnut",
    "scatter",
    "combo",
  ]),
  categories: z.array(z.string()),
  series: z.array(ChartSeriesSchema),
  showLegend: z.boolean().optional(),
  showDataLabels: z.boolean().optional(),
  title: z.string().optional(),
  xAxisTitle: z.string().optional(),
  yAxisTitle: z.string().optional(),
});

export const ConnectorEndSchema = z.object({
  elementId: z.string().optional(),
  anchor: z
    .union([
      z.enum(["n", "s", "e", "w", "ne", "nw", "se", "sw", "center"]),
      PointSchema,
    ])
    .optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const ConnectorElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("connector"),
  connectorType: z.enum(["straight", "elbow", "curved"]),
  start: ConnectorEndSchema,
  end: ConnectorEndSchema,
  stroke: StrokeSchema,
  startArrow: z.enum(["none", "triangle", "diamond", "oval"]).optional(),
  endArrow: z.enum(["none", "triangle", "diamond", "oval"]).optional(),
});

export const SmartArtNodeSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  parentId: z.string().nullable().optional(),
  style: z
    .object({
      fill: FillSchema.optional(),
      stroke: StrokeSchema.optional(),
      color: z.string().optional(),
    })
    .optional(),
  fixedPosition: PointSchema.optional(),
});

export const SmartArtEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

export const SmartArtElementSchema = z.object({
  ...BaseElementFields,
  kind: z.literal("smartart"),
  layout: z.enum([
    "process",
    "hierarchy",
    "cycle",
    "matrix",
    "pyramid",
    "timeline",
    "list",
  ]),
  nodes: z.array(SmartArtNodeSchema),
  edges: z.array(SmartArtEdgeSchema),
});

// Group is recursive — use lazy
export type SlideElementSchemaType = z.ZodType<SlideElement>;

export const SlideElementSchema: SlideElementSchemaType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    TextElementSchema,
    ShapeElementSchema,
    ImageElementSchema,
    TableElementSchema,
    ChartElementSchema,
    ConnectorElementSchema,
    SmartArtElementSchema,
    z.object({
      ...BaseElementFields,
      kind: z.literal("group"),
      children: z.array(SlideElementSchema),
    }),
  ]),
) as SlideElementSchemaType;

export const SlideSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  size: SizeSchema,
  background: FillSchema,
  elements: z.array(SlideElementSchema),
  notes: z.string().optional(),
  layoutHint: z.string().optional(),
});

export const ReferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  status: z.enum([
    "queued",
    "uploading",
    "parsing",
    "parsed",
    "unsupported",
    "failed",
  ]),
  url: z.string().optional(),
  parsedSummary: z.string().optional(),
});

export const CitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().optional(),
  fileRef: z.string().optional(),
  accessedAt: z.string().optional(),
  excerptHash: z.string().optional(),
  claimIds: z.array(z.string()).optional(),
});

export const DeckSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  aspectRatio: z.enum(["16:9", "4:3", "portrait"]),
  theme: ThemeTokensSchema,
  slides: z.array(SlideSchema),
  references: z.array(ReferenceSchema),
  citations: z.array(CitationSchema),
  versionId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  meta: z.record(z.string()).optional(),
});

export type DeckParseResult =
  | { success: true; data: Deck }
  | { success: false; error: z.ZodError };

/** Strict parse; throws ZodError on failure. */
export function parseDeck(input: unknown): Deck {
  return DeckSchema.parse(input) as Deck;
}

/** Safe parse for agent/repair loops. */
export function safeParseDeck(input: unknown): DeckParseResult {
  const result = DeckSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as Deck };
  }
  return { success: false, error: result.error };
}

/** Lightweight structural checks beyond zod (unique ids, table shape). */
export function validateDeckInvariants(deck: Deck): string[] {
  const errors: string[] = [];
  const slideIds = new Set<string>();

  for (const slide of deck.slides) {
    if (slideIds.has(slide.id)) {
      errors.push(`Duplicate slide id: ${slide.id}`);
    }
    slideIds.add(slide.id);

    const elIds = new Set<string>();
    const walk = (els: SlideElement[], path: string) => {
      for (const el of els) {
        if (elIds.has(el.id)) {
          errors.push(`Duplicate element id on slide ${slide.id}: ${el.id}`);
        }
        elIds.add(el.id);

        if (el.kind === "table") {
          if (el.columnWidths.length !== el.cols) {
            errors.push(
              `Table ${path}${el.id}: columnWidths length ${el.columnWidths.length} != cols ${el.cols}`,
            );
          }
          if (el.cells.length !== el.rows) {
            errors.push(
              `Table ${path}${el.id}: cells rows ${el.cells.length} != rows ${el.rows}`,
            );
          }
        }
        if (el.kind === "group") {
          walk(el.children, `${path}${el.id}/`);
        }
      }
    };
    walk(slide.elements, "");
  }

  return errors;
}

// ── Command schema (partial; useful for agent I/O) ──────────────────

const CommandBaseSchema = z.object({
  id: z.string().min(1),
  actor: z.enum(["user", "agent", "system"]),
  timestamp: z.string().min(1),
  requestId: z.string().optional(),
});

export const CommandSchema: z.ZodType<Command> = z.lazy(() =>
  z.discriminatedUnion("type", [
    CommandBaseSchema.extend({
      type: z.literal("addElement"),
      slideId: z.string(),
      element: SlideElementSchema,
      index: z.number().int().nonnegative().optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateElement"),
      slideId: z.string(),
      elementId: z.string(),
      patch: z.record(z.unknown()),
      before: SlideElementSchema.optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("deleteElement"),
      slideId: z.string(),
      elementId: z.string(),
      before: SlideElementSchema.optional(),
      beforeIndex: z.number().int().nonnegative().optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("addSlide"),
      slide: SlideSchema,
      index: z.number().int().nonnegative().optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("deleteSlide"),
      slideId: z.string(),
      before: SlideSchema.optional(),
      beforeIndex: z.number().int().nonnegative().optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("reorderSlide"),
      slideId: z.string(),
      fromIndex: z.number().int().nonnegative(),
      toIndex: z.number().int().nonnegative(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateSlide"),
      slideId: z.string(),
      patch: z.record(z.unknown()),
      before: z.record(z.unknown()).optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateTheme"),
      theme: ThemeTokensSchema,
      before: ThemeTokensSchema.optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateDeckMeta"),
      patch: z.record(z.unknown()),
      before: z.record(z.unknown()).optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("replaceAsset"),
      slideId: z.string(),
      elementId: z.string(),
      src: z.string(),
      beforeSrc: z.string().optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateChartData"),
      slideId: z.string(),
      elementId: z.string(),
      categories: z.array(z.string()).optional(),
      series: z.array(ChartSeriesSchema).optional(),
      chartType: z
        .enum([
          "bar",
          "column",
          "line",
          "area",
          "pie",
          "doughnut",
          "scatter",
          "combo",
        ])
        .optional(),
      before: z
        .object({
          categories: z.array(z.string()),
          series: z.array(ChartSeriesSchema),
          chartType: z.enum([
            "bar",
            "column",
            "line",
            "area",
            "pie",
            "doughnut",
            "scatter",
            "combo",
          ]),
        })
        .optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("updateSmartArt"),
      slideId: z.string(),
      elementId: z.string(),
      nodes: z.array(SmartArtNodeSchema).optional(),
      edges: z.array(SmartArtEdgeSchema).optional(),
      layout: z
        .enum([
          "process",
          "hierarchy",
          "cycle",
          "matrix",
          "pyramid",
          "timeline",
          "list",
        ])
        .optional(),
      before: z
        .object({
          nodes: z.array(SmartArtNodeSchema),
          edges: z.array(SmartArtEdgeSchema),
          layout: z.enum([
            "process",
            "hierarchy",
            "cycle",
            "matrix",
            "pyramid",
            "timeline",
            "list",
          ]),
        })
        .optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("setReferences"),
      references: z.array(ReferenceSchema),
      before: z.array(ReferenceSchema).optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("setCitations"),
      citations: z.array(CitationSchema),
      before: z.array(CitationSchema).optional(),
    }),
    CommandBaseSchema.extend({
      type: z.literal("batch"),
      commands: z.array(CommandSchema),
    }),
  ]),
) as z.ZodType<Command>;

export function parseCommand(input: unknown): Command {
  return CommandSchema.parse(input);
}

export function safeParseCommand(
  input: unknown,
): { success: true; data: Command } | { success: false; error: z.ZodError } {
  const result = CommandSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
