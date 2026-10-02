import type { Fill, Shadow, Stroke } from "./fill.js";

/** Shared transform + layer fields for every slide element. */
export type BaseElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
  name?: string;
  /** Optional provenance (reference id, claim id, etc.) */
  sourceRef?: string;
};

// ── Text ────────────────────────────────────────────────────────────

export type TextAlign = "left" | "center" | "right" | "justify";
export type VerticalAlign = "top" | "middle" | "bottom";

export type TextRun = {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  href?: string;
  letterSpacing?: number;
};

export type BulletStyle = "disc" | "number" | "none";

export type TextParagraph = {
  align?: TextAlign;
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  bullet?: boolean | { level: number; style?: BulletStyle };
  runs: TextRun[];
};

export type TextElement = BaseElement & {
  kind: "text";
  paragraphs: TextParagraph[];
  verticalAlign?: VerticalAlign;
  autoFit?: boolean;
  fill?: Fill;
  stroke?: Stroke;
};

// ── Shape ───────────────────────────────────────────────────────────

export type ShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "line"
  | "arrow"
  | "diamond"
  | "hexagon"
  | "freeform";

export type ShapeElement = BaseElement & {
  kind: "shape";
  shape: ShapeKind;
  fill: Fill;
  stroke?: Stroke;
  cornerRadius?: number;
  shadow?: Shadow;
  /** Optional label drawn inside the shape */
  text?: TextParagraph[];
};

// ── Image ───────────────────────────────────────────────────────────

export type ImageCrop = {
  /** Fractions 0–1 from each edge */
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ImageElement = BaseElement & {
  kind: "image";
  /** Asset id, relative path, or data URI */
  src: string;
  alt?: string;
  crop?: ImageCrop;
  objectFit?: "cover" | "contain" | "fill";
};

// ── Table ───────────────────────────────────────────────────────────

export type TableCell = {
  text: string;
  colspan?: number;
  rowspan?: number;
  fill?: Fill;
  align?: TextAlign;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  border?: Partial<Record<"top" | "right" | "bottom" | "left", Stroke>>;
};

export type TableElement = BaseElement & {
  kind: "table";
  rows: number;
  cols: number;
  /** Absolute widths in slide units; length must equal cols */
  columnWidths: number[];
  rowHeights?: number[];
  cells: TableCell[][];
};

// ── Chart ───────────────────────────────────────────────────────────

export type ChartType =
  | "bar"
  | "column"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "scatter"
  | "combo";

export type ChartSeries = {
  name: string;
  values: number[];
  color?: string;
};

export type ChartElement = BaseElement & {
  kind: "chart";
  chartType: ChartType;
  categories: string[];
  series: ChartSeries[];
  showLegend?: boolean;
  showDataLabels?: boolean;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
};

// ── Connector ───────────────────────────────────────────────────────

export type NamedAnchor =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "center";

export type AnchorPoint = NamedAnchor | { x: number; y: number };

export type ConnectorEnd = {
  /** Bind to another element; when set, x/y are fallbacks */
  elementId?: string;
  anchor?: AnchorPoint;
  x?: number;
  y?: number;
};

export type ConnectorType = "straight" | "elbow" | "curved";
export type ArrowHead = "none" | "triangle" | "diamond" | "oval";

export type ConnectorElement = BaseElement & {
  kind: "connector";
  connectorType: ConnectorType;
  start: ConnectorEnd;
  end: ConnectorEnd;
  stroke: Stroke;
  startArrow?: ArrowHead;
  endArrow?: ArrowHead;
};

// ── Group ───────────────────────────────────────────────────────────

export type GroupElement = BaseElement & {
  kind: "group";
  /** Children use coordinates relative to the group origin */
  children: SlideElement[];
};

// ── SmartArt ────────────────────────────────────────────────────────

export type SmartArtLayout =
  | "process"
  | "hierarchy"
  | "cycle"
  | "matrix"
  | "pyramid"
  | "timeline"
  | "list";

export type SmartArtNode = {
  id: string;
  text: string;
  parentId?: string | null;
  style?: {
    fill?: Fill;
    stroke?: Stroke;
    color?: string;
  };
  fixedPosition?: { x: number; y: number };
};

export type SmartArtEdge = {
  id: string;
  from: string;
  to: string;
};

export type SmartArtElement = BaseElement & {
  kind: "smartart";
  layout: SmartArtLayout;
  nodes: SmartArtNode[];
  edges: SmartArtEdge[];
};

// ── Union ───────────────────────────────────────────────────────────

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | TableElement
  | ChartElement
  | GroupElement
  | ConnectorElement
  | SmartArtElement;

export type ElementKind = SlideElement["kind"];

export function isElementKind<K extends ElementKind>(
  el: SlideElement,
  kind: K,
): el is Extract<SlideElement, { kind: K }> {
  return el.kind === kind;
}
