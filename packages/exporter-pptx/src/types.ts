/**
 * Export-layer types.
 *
 * Deck / element IR is the canonical `@open-slidestudio/pptd` package.
 * Do not re-duplicate IR here (no local shim).
 */

export type {
  Deck,
  Slide,
  SlideElement,
  BaseElement,
  TextElement,
  TextParagraph,
  TextRun,
  TextAlign,
  VerticalAlign,
  ShapeElement,
  ShapeKind,
  ImageElement,
  ImageCrop,
  TableElement,
  TableCell,
  ChartElement,
  ChartSeries,
  ChartType,
  GroupElement,
  ConnectorElement,
  ConnectorEnd,
  ConnectorType,
  ArrowHead,
  SmartArtElement,
  SmartArtNode,
  SmartArtEdge,
  SmartArtLayout,
  ThemeTokens,
  Fill,
  SolidFill,
  GradientFill,
  ImageFill,
  NoneFill,
  Stroke,
  Shadow,
  AspectRatio,
  Size,
  Reference,
  Citation,
} from "@open-slidestudio/pptd";

// ---------------------------------------------------------------------------
// Export API types (exporter-owned)
// ---------------------------------------------------------------------------

export type ExportOutputType =
  | "blob"
  | "arraybuffer"
  | "uint8array"
  | "nodebuffer"
  | "base64";

export type ExportOptions = {
  /** Binary output format. Default: blob in browsers, arraybuffer in Node. */
  output?: ExportOutputType;
  filename?: string;
  compression?: boolean;
  author?: string;
  company?: string;
  subject?: string;
  /** Skip elements with visible === false (default true). */
  skipHidden?: boolean;
};

export type DegradationKind =
  | "missing-image"
  | "unsupported-fill"
  | "unsupported-filter"
  | "unsupported-element"
  | "smartart-as-shapes"
  | "group-flattened"
  | "connector-as-line"
  | "chart-type-fallback"
  | "gradient-as-solid"
  | "font-unmapped"
  | "partial-style"
  | "empty-content"
  | "error";

export type Degradation = {
  slideId: string;
  slideIndex: number;
  elementId?: string;
  elementType?: string;
  kind: DegradationKind;
  reason: string;
  fallback: string;
};

export type ElementCoverage = {
  text: number;
  shape: number;
  table: number;
  chart: number;
  image: number;
  group: number;
  connector: number;
  smartArt: number;
  skipped: number;
  failed: number;
};

export type ExportReport = {
  deckId: string;
  title: string;
  versionId?: string;
  slideCount: number;
  elementCounts: ElementCoverage;
  degradations: Degradation[];
  warnings: string[];
  /** True when no degradations that drop editability of core objects. */
  fullyNative: boolean;
  /** Approximate share of elements exported as native OOXML objects (0–1). */
  nativeCoverage: number;
  generatedAt: string;
};

export type ExportResult = {
  /** PPTX bytes — Blob / ArrayBuffer / Uint8Array / base64 depending on options. */
  data: Blob | ArrayBuffer | Uint8Array | string;
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  filename: string;
  report: ExportReport;
  outputType: ExportOutputType;
};
