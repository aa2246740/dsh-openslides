import type PptxGenJS from "pptxgenjs";
import type {
  ChartElement,
  ChartType,
  ConnectorElement,
  GroupElement,
  ImageElement,
  ShapeElement,
  ShapeKind,
  SlideElement,
  SmartArtElement,
  TableElement,
  TextElement,
  TextParagraph,
  ThemeTokens,
} from "./types.js";
import {
  pxBoxToInches,
  pxToInchesX,
  pxToInchesY,
  sortElementsByZ,
  type SlideLayout,
} from "./geometry.js";
import {
  firstFontFamily,
  isBold,
  mapAlign,
  mapCornerRadius,
  mapFill,
  mapShadow,
  mapStroke,
  mapTextRun,
  mapVAlign,
  normalizeHexColor,
  opacityToTransparency,
  resolveImageSource,
} from "./style.js";
import type { ReportBuilder } from "./report.js";

export type MapContext = {
  slide: PptxGenJS.Slide;
  pptx: PptxGenJS;
  layout: SlideLayout;
  report: ReportBuilder;
  slideId: string;
  slideIndex: number;
  theme?: ThemeTokens;
  /** Parent offset for flattened groups (px). */
  offsetX?: number;
  offsetY?: number;
  skipHidden?: boolean;
};

function elBox(
  el: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  ctx: MapContext,
) {
  const shifted = {
    x: el.x + (ctx.offsetX ?? 0),
    y: el.y + (ctx.offsetY ?? 0),
    width: el.width,
    height: el.height,
    rotation: el.rotation,
  };
  return pxBoxToInches(shifted, ctx.layout);
}

function bodyFont(theme?: ThemeTokens): string | undefined {
  return firstFontFamily(theme?.fonts?.body);
}

function headingFont(theme?: ThemeTokens): string | undefined {
  return firstFontFamily(theme?.fonts?.heading ?? theme?.fonts?.body);
}

function inkColor(theme?: ThemeTokens): string | undefined {
  return theme?.colors?.ink ?? theme?.colors?.primary;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function mapParagraphs(
  paragraphs: TextParagraph[],
  ctx: MapContext,
): PptxGenJS.TextProps[] {
  const items: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((para, pIdx) => {
    const runs = para.runs?.length ? para.runs : [{ text: "" }];
    runs.forEach((run, rIdx) => {
      const isLastRun = rIdx === runs.length - 1;
      const isLastPara = pIdx === paragraphs.length - 1;
      const opts: PptxGenJS.TextPropsOptions = {
        ...mapTextRun(run, {
          fontFace: bodyFont(ctx.theme),
          color: inkColor(ctx.theme),
        }),
        breakLine: isLastRun && !isLastPara,
      };
      if (para.align) opts.align = mapAlign(para.align);
      if (para.bullet === true) {
        opts.bullet = true;
      } else if (para.bullet && typeof para.bullet === "object") {
        if (para.bullet.style === "none") {
          // no bullet
        } else if (para.bullet.style === "number") {
          opts.bullet = { type: "number" };
        } else {
          opts.bullet = true;
        }
        if (para.bullet.level !== undefined) {
          opts.indentLevel = para.bullet.level;
        }
      }
      if (para.spaceBefore !== undefined) opts.paraSpaceBefore = para.spaceBefore;
      if (para.spaceAfter !== undefined) opts.paraSpaceAfter = para.spaceAfter;
      if (para.lineHeight !== undefined && para.lineHeight > 0) {
        if (para.lineHeight <= 4) opts.lineSpacingMultiple = para.lineHeight;
        else opts.lineSpacing = para.lineHeight;
      }
      items.push({ text: run.text ?? "", options: opts });
    });
  });
  return items;
}

export function mapText(el: TextElement, ctx: MapContext): void {
  const box = elBox(el, ctx);
  const textItems = mapParagraphs(el.paragraphs ?? [], ctx);
  const fill = mapFill(el.fill, ctx.report, {
    slideId: ctx.slideId,
    slideIndex: ctx.slideIndex,
    elementId: el.id,
  });
  const line = mapStroke(el.stroke);
  const transparency = opacityToTransparency(el.opacity);

  ctx.slide.addText(textItems, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    ...(box.rotate !== undefined ? { rotate: box.rotate } : {}),
    isTextBox: true,
    objectName: el.name ?? el.id,
    valign: mapVAlign(el.verticalAlign) ?? "top",
    ...(fill.fill && fill.fill.type !== "none" ? { fill: fill.fill } : {}),
    ...(line ? { line } : {}),
    ...(transparency !== undefined ? { transparency } : {}),
    ...(el.autoFit ? { fit: "shrink" as const } : {}),
    fontFace: headingFont(ctx.theme),
    color: normalizeHexColor(inkColor(ctx.theme), "111111"),
  });
  ctx.report.bump("text");
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const SHAPE_MAP: Record<string, string> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  line: "line",
  arrow: "rightArrow",
  diamond: "diamond",
  hexagon: "hexagon",
  freeform: "rect",
};

function resolveShapeType(
  pptx: PptxGenJS,
  shape: ShapeKind,
): PptxGenJS.SHAPE_NAME {
  const mapped = SHAPE_MAP[shape] ?? "rect";
  const st = pptx.ShapeType as unknown as Record<string, PptxGenJS.SHAPE_NAME>;
  if (mapped in st) return st[mapped]!;
  return pptx.ShapeType.rect;
}

export function mapShape(el: ShapeElement, ctx: MapContext): void {
  const box = elBox(el, ctx);
  const shapeName = resolveShapeType(ctx.pptx, el.shape);

  if (el.shape === "freeform") {
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "shape",
      kind: "partial-style",
      reason: "freeform path not available; exported as rectangle",
      fallback: "rect",
    });
  }

  const fill = mapFill(el.fill, ctx.report, {
    slideId: ctx.slideId,
    slideIndex: ctx.slideIndex,
    elementId: el.id,
  });
  const line = mapStroke(el.stroke);
  const shadow = mapShadow(el.shadow);
  const transparency = opacityToTransparency(el.opacity);
  const rectRadius = mapCornerRadius(el.cornerRadius, el, ctx.layout);

  const shapeOpts: PptxGenJS.ShapeProps = {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    ...(box.rotate !== undefined ? { rotate: box.rotate } : {}),
    objectName: el.name ?? el.id,
    ...(fill.fill ? { fill: fill.fill } : {}),
    ...(line ? { line } : {}),
    ...(shadow ? { shadow } : {}),
    ...(rectRadius !== undefined && shapeName === ctx.pptx.ShapeType.roundRect
      ? { rectRadius }
      : {}),
  };

  if (
    transparency !== undefined &&
    shapeOpts.fill &&
    shapeOpts.fill.type !== "none"
  ) {
    shapeOpts.fill = {
      ...shapeOpts.fill,
      transparency: Math.max(shapeOpts.fill.transparency ?? 0, transparency),
    };
  }

  const hasText = Boolean(el.text?.length);

  if (hasText && el.text) {
    const textItems = mapParagraphs(el.text, ctx);
    ctx.slide.addText(textItems, {
      ...shapeOpts,
      shape: shapeName,
      valign: "middle",
      align: "center",
      fontFace: bodyFont(ctx.theme),
      color: normalizeHexColor(inkColor(ctx.theme), "111111"),
    });
  } else if (el.shape === "line") {
    ctx.slide.addShape(ctx.pptx.ShapeType.line, {
      ...shapeOpts,
      line: line ?? { color: "000000", width: 1.5 },
    });
  } else {
    ctx.slide.addShape(shapeName, shapeOpts);
  }
  ctx.report.bump("shape");
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export function mapImage(el: ImageElement, ctx: MapContext): void {
  const box = elBox(el, ctx);
  const src = resolveImageSource(el.src);

  if (!src) {
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "image",
      kind: "missing-image",
      reason: el.src
        ? `image src "${el.src}" could not be resolved (asset id or missing data)`
        : "image has empty src",
      fallback: "placeholder rectangle",
    });
    ctx.slide.addShape(ctx.pptx.ShapeType.rect, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      fill: { type: "solid", color: "E8E8E8" },
      line: { color: "BBBBBB", width: 1, dashType: "dash" },
      objectName: el.name ?? `${el.id}-missing`,
    });
    ctx.slide.addText("Image unavailable", {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      align: "center",
      valign: "middle",
      fontSize: 10,
      color: "888888",
      fontFace: bodyFont(ctx.theme) ?? "Arial",
    });
    ctx.report.bump("failed");
    return;
  }

  const transparency = opacityToTransparency(el.opacity);
  const opts: PptxGenJS.ImageProps = {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    ...(box.rotate !== undefined ? { rotate: box.rotate } : {}),
    objectName: el.name ?? el.id,
    ...(el.alt ? { altText: el.alt } : {}),
    ...(transparency !== undefined ? { transparency } : {}),
  };

  if (src.kind === "data") opts.data = src.value;
  else opts.path = src.value;

  if (el.objectFit === "cover" || el.objectFit === "contain") {
    opts.sizing = { type: el.objectFit, w: box.w, h: box.h };
  } else if (el.crop) {
    opts.sizing = {
      type: "crop",
      w: box.w,
      h: box.h,
      x: el.crop.left * box.w,
      y: el.crop.top * box.h,
    };
  }

  try {
    ctx.slide.addImage(opts);
    ctx.report.bump("image");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "image",
      kind: "missing-image",
      reason: `addImage failed: ${message}`,
      fallback: "placeholder rectangle",
    });
    ctx.slide.addShape(ctx.pptx.ShapeType.rect, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      fill: { type: "solid", color: "E8E8E8" },
      line: { color: "BBBBBB", width: 1 },
      objectName: el.name ?? `${el.id}-error`,
    });
    ctx.report.bump("failed");
  }
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function mapTable(el: TableElement, ctx: MapContext): void {
  const box = elBox(el, ctx);
  if (!el.cells?.length) {
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "table",
      kind: "empty-content",
      reason: "table has no cells",
      fallback: "skipped",
    });
    ctx.report.bump("skipped");
    return;
  }

  const defaultBorder: PptxGenJS.BorderProps = {
    type: "solid",
    pt: 0.5,
    color: "CCCCCC",
  };

  const rows: PptxGenJS.TableRow[] = el.cells.map((row) =>
    row.map((cell) => {
      const fill = mapFill(cell.fill, null, {
        slideId: ctx.slideId,
        slideIndex: ctx.slideIndex,
        elementId: el.id,
      });
      const options: PptxGenJS.TableCellProps = {
        align: mapAlign(cell.align) ?? "left",
        valign: "middle",
        border: defaultBorder,
        fontFace: bodyFont(ctx.theme) ?? "Arial",
        ...(cell.fontSize !== undefined ? { fontSize: cell.fontSize } : {}),
        ...(cell.color
          ? { color: normalizeHexColor(cell.color) }
          : { color: normalizeHexColor(inkColor(ctx.theme), "111111") }),
        ...(isBold(cell.fontWeight) ? { bold: true } : {}),
        ...(fill.solidColor
          ? { fill: { type: "solid" as const, color: fill.solidColor } }
          : {}),
        ...(cell.colspan ? { colspan: cell.colspan } : {}),
        ...(cell.rowspan ? { rowspan: cell.rowspan } : {}),
      };
      return { text: cell.text ?? "", options };
    }),
  );

  let colW: number[] | undefined;
  if (el.columnWidths?.length) {
    const sum = el.columnWidths.reduce((a, b) => a + b, 0) || 1;
    colW = el.columnWidths.map((w) => (w / sum) * box.w);
  }

  let rowH: number[] | undefined;
  if (el.rowHeights?.length === el.cells.length) {
    const sum = el.rowHeights.reduce((a, b) => a + b, 0) || 1;
    rowH = el.rowHeights.map((h) => (h / sum) * box.h);
  }

  ctx.slide.addTable(rows, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    colW,
    rowH,
    border: defaultBorder,
    fontFace: bodyFont(ctx.theme) ?? "Arial",
    color: normalizeHexColor(inkColor(ctx.theme), "111111"),
    objectName: el.name ?? el.id,
    align: "left",
    valign: "middle",
  });
  ctx.report.bump("table");
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** v0.1 native chart whitelist — others fall back to editable tables. */
const NATIVE_CHART_TYPES = new Set<ChartType>([
  "bar",
  "column",
  "line",
  "area",
  "pie",
  "doughnut",
]);

function mapChartType(
  pptx: PptxGenJS,
  t: ChartType,
): { type: PptxGenJS.CHART_NAME; degraded?: string } | null {
  switch (t) {
    case "bar":
      return { type: pptx.ChartType.bar };
    case "column":
      return { type: pptx.ChartType.bar };
    case "line":
      return { type: pptx.ChartType.line };
    case "area":
      return { type: pptx.ChartType.area };
    case "pie":
      return { type: pptx.ChartType.pie };
    case "doughnut":
      return { type: pptx.ChartType.doughnut };
    default:
      return null;
  }
}

function chartAsTableFallback(el: ChartElement, ctx: MapContext, reason: string): void {
  const box = elBox(el, ctx);
  const categories =
    el.categories?.length > 0
      ? el.categories
      : el.series[0]?.values.map((_, i) => String(i + 1)) ?? [];
  const header = [
    { text: el.title || "Category", options: { bold: true } },
    ...el.series.map((s) => ({ text: s.name, options: { bold: true } })),
  ];
  const rows: PptxGenJS.TableRow[] = [
    header,
    ...categories.map((cat, i) => [
      { text: cat },
      ...el.series.map((s) => ({ text: String(s.values[i] ?? "") })),
    ]),
  ];
  ctx.report.addDegradation({
    slideId: ctx.slideId,
    slideIndex: ctx.slideIndex,
    elementId: el.id,
    elementType: "chart",
    kind: "chart-type-fallback",
    reason,
    fallback: "editable table",
  });
  ctx.slide.addTable(rows, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    border: { type: "solid", pt: 0.5, color: "CCCCCC" },
    fontFace: bodyFont(ctx.theme) ?? "Arial",
    color: normalizeHexColor(inkColor(ctx.theme), "111111"),
    objectName: el.name ?? `${el.id}-chart-table`,
  });
  ctx.report.bump("table");
}

export function mapChart(el: ChartElement, ctx: MapContext): void {
  const box = elBox(el, ctx);
  if (!el.series?.length) {
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "chart",
      kind: "empty-content",
      reason: "chart has no series",
      fallback: "skipped",
    });
    ctx.report.bump("skipped");
    return;
  }

  if (!NATIVE_CHART_TYPES.has(el.chartType)) {
    chartAsTableFallback(
      el,
      ctx,
      `chart type "${el.chartType}" outside v0.1 native whitelist; exported as table`,
    );
    return;
  }

  const mapped = mapChartType(ctx.pptx, el.chartType);
  if (!mapped) {
    chartAsTableFallback(el, ctx, `unsupported chart type "${el.chartType}"`);
    return;
  }
  const { type } = mapped;

  const isColumn = el.chartType === "column";
  const categories =
    el.categories?.length > 0
      ? el.categories
      : el.series[0]!.values.map((_, i) => String(i + 1));

  const chartData: PptxGenJS.OptsChartData[] = el.series.map((s) => ({
    name: s.name,
    labels: categories,
    values: s.values,
  }));

  const themeColors = ctx.theme?.colors?.chart?.map((c) => normalizeHexColor(c));
  const seriesColors = el.series
    .map((s) => (s.color ? normalizeHexColor(s.color) : undefined))
    .filter((c): c is string => Boolean(c));
  const colors = seriesColors.length ? seriesColors : themeColors;

  const opts: PptxGenJS.IChartOpts = {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    showLegend: el.showLegend ?? el.series.length > 1,
    showTitle: Boolean(el.title),
    ...(el.title ? { title: el.title } : {}),
    showValue: el.showDataLabels ?? false,
    ...(colors?.length ? { chartColors: colors } : {}),
    objectName: el.name ?? el.id,
    ...(isColumn ? { barDir: "col" as const } : {}),
    ...(el.xAxisTitle ? { catAxisTitle: el.xAxisTitle, showCatAxisTitle: true } : {}),
    ...(el.yAxisTitle ? { valAxisTitle: el.yAxisTitle, showValAxisTitle: true } : {}),
  };

  try {
    ctx.slide.addChart(type, chartData, opts);
    ctx.report.bump("chart");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    chartAsTableFallback(el, ctx, `addChart failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

function resolveEndPoint(
  end: ConnectorElement["start"],
  el: ConnectorElement,
  which: "start" | "end",
): { x: number; y: number } {
  if (end.x !== undefined && end.y !== undefined) {
    return { x: end.x, y: end.y };
  }
  if (end.anchor && typeof end.anchor === "object" && "x" in end.anchor) {
    return { x: end.anchor.x, y: end.anchor.y };
  }
  // Fallback: use element box edges
  if (which === "start") {
    return { x: el.x, y: el.y + el.height / 2 };
  }
  return { x: el.x + el.width, y: el.y + el.height / 2 };
}

export function mapConnector(el: ConnectorElement, ctx: MapContext): void {
  const from = resolveEndPoint(el.start, el, "start");
  const to = resolveEndPoint(el.end, el, "end");

  const x1 = pxToInchesX(from.x + (ctx.offsetX ?? 0), ctx.layout);
  const y1 = pxToInchesY(from.y + (ctx.offsetY ?? 0), ctx.layout);
  const x2 = pxToInchesX(to.x + (ctx.offsetX ?? 0), ctx.layout);
  const y2 = pxToInchesY(to.y + (ctx.offsetY ?? 0), ctx.layout);

  const line = mapStroke(el.stroke) ?? {
    color: "666666",
    width: 1.5,
    dashType: "solid" as const,
  };

  const arrowMap: Record<string, PptxGenJS.ShapeLineProps["endArrowType"]> = {
    none: "none",
    triangle: "triangle",
    diamond: "diamond",
    oval: "oval",
  };
  if (el.endArrow && el.endArrow !== "none") {
    line.endArrowType = arrowMap[el.endArrow] ?? "triangle";
  }
  if (el.startArrow && el.startArrow !== "none") {
    line.beginArrowType = arrowMap[el.startArrow] ?? "triangle";
  }

  ctx.slide.addShape(ctx.pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line,
    objectName: el.name ?? el.id,
  });

  if (el.start.elementId || el.end.elementId || el.connectorType !== "straight") {
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: "connector",
      kind: "connector-as-line",
      reason:
        "connectors exported as free lines; dynamic element binding / elbow / curve not preserved",
      fallback: "line shape",
    });
  }

  ctx.report.bump("connector");
}

// ---------------------------------------------------------------------------
// SmartArt → shapes + connectors
// ---------------------------------------------------------------------------

export function mapSmartArt(el: SmartArtElement, ctx: MapContext): void {
  ctx.report.addDegradation({
    slideId: ctx.slideId,
    slideIndex: ctx.slideIndex,
    elementId: el.id,
    elementType: "smartart",
    kind: "smartart-as-shapes",
    reason:
      "SmartArt exported as native shapes + lines (editable objects, not OOXML SmartArt)",
    fallback: "shapes + connectors",
  });

  const nodes = el.nodes ?? [];
  if (nodes.length === 0) {
    ctx.report.bump("skipped");
    return;
  }

  const pad = 16;
  const gap = 24;
  const n = nodes.length;
  const nodeW = Math.max(
    120,
    (el.width - pad * 2 - gap * Math.max(n - 1, 0)) / n,
  );
  const nodeH = Math.min(100, el.height - pad * 2);

  const positions = nodes.map((node, i) => {
    if (node.fixedPosition) {
      return {
        id: node.id,
        x: node.fixedPosition.x,
        y: node.fixedPosition.y,
        width: nodeW,
        height: nodeH,
      };
    }
    const x = pad + i * (nodeW + gap);
    const y = (el.height - nodeH) / 2;
    return { id: node.id, x, y, width: nodeW, height: nodeH };
  });

  const byId = new Map(positions.map((p) => [p.id, p]));
  const accent = ctx.theme?.colors?.accent ?? ctx.theme?.colors?.secondary ?? "#4D9CFF";

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const pos = positions[i]!;
    const shapeEl: ShapeElement = {
      id: `${el.id}-node-${node.id}`,
      kind: "shape",
      shape: "roundRect",
      x: el.x + pos.x,
      y: el.y + pos.y,
      width: pos.width,
      height: pos.height,
      rotation: 0,
      opacity: 1,
      zIndex: el.zIndex,
      fill: node.style?.fill ?? { type: "solid", color: accent },
      stroke: node.style?.stroke,
      cornerRadius: 8,
      text: [
        {
          align: "center",
          runs: [
            {
              text: node.text,
              fontSize: 14,
              fontWeight: "bold",
              color: node.style?.color ?? "#FFFFFF",
            },
          ],
        },
      ],
    };
    mapShape(shapeEl, ctx);
    ctx.report.coverage.shape -= 1;
  }

  const edges =
    el.edges?.length > 0
      ? el.edges
      : positions.slice(0, -1).map((p, i) => ({
          id: `auto-${p.id}-${positions[i + 1]!.id}`,
          from: p.id,
          to: positions[i + 1]!.id,
        }));

  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const connector: ConnectorElement = {
      id: `${el.id}-edge-${edge.id}`,
      kind: "connector",
      connectorType: "straight",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: 0,
      opacity: 1,
      zIndex: el.zIndex,
      start: {
        x: el.x + a.x + a.width,
        y: el.y + a.y + a.height / 2,
      },
      end: {
        x: el.x + b.x,
        y: el.y + b.y + b.height / 2,
      },
      stroke: { color: "#888888", width: 1.5 },
      endArrow: "triangle",
    };
    mapConnector(connector, ctx);
    ctx.report.coverage.connector -= 1;
  }

  ctx.report.bump("smartArt");
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function mapGroup(el: GroupElement, ctx: MapContext): void {
  ctx.report.addDegradation({
    slideId: ctx.slideId,
    slideIndex: ctx.slideIndex,
    elementId: el.id,
    elementType: "group",
    kind: "group-flattened",
    reason:
      "groups are flattened to child objects (still individually editable)",
    fallback: "child elements with absolute positions",
  });

  const childCtx: MapContext = {
    ...ctx,
    offsetX: (ctx.offsetX ?? 0) + el.x,
    offsetY: (ctx.offsetY ?? 0) + el.y,
  };

  const children = sortElementsByZ(el.children ?? []);
  for (const child of children) {
    mapElement(child, childCtx);
  }
  ctx.report.bump("group");
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function mapElement(el: SlideElement, ctx: MapContext): void {
  if (ctx.skipHidden !== false && el.visible === false) {
    ctx.report.bump("skipped");
    return;
  }

  try {
    switch (el.kind) {
      case "text":
        mapText(el, ctx);
        break;
      case "shape":
        mapShape(el, ctx);
        break;
      case "image":
        mapImage(el, ctx);
        break;
      case "table":
        mapTable(el, ctx);
        break;
      case "chart":
        mapChart(el, ctx);
        break;
      case "group":
        mapGroup(el, ctx);
        break;
      case "connector":
        mapConnector(el, ctx);
        break;
      case "smartart":
        mapSmartArt(el, ctx);
        break;
      default: {
        const unknown = el as { kind?: string; id?: string };
        ctx.report.addDegradation({
          slideId: ctx.slideId,
          slideIndex: ctx.slideIndex,
          elementId: unknown.id,
          elementType: unknown.kind,
          kind: "unsupported-element",
          reason: `element kind "${String(unknown.kind)}" is not mapped`,
          fallback: "skipped",
        });
        ctx.report.bump("skipped");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: el.id,
      elementType: el.kind,
      kind: "error",
      reason: message,
      fallback: "skipped",
    });
    ctx.report.bump("failed");
  }
}
