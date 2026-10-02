/**
 * @open-slidestudio/exporter-pptx
 *
 * PPTD → editable PPTX via pptxgenjs.
 * Product: DSH SlideStudio.
 */

export {
  exportDeckToPptx,
  exportDeckToArrayBuffer,
  exportDeckToBlob,
} from "./export-deck.js";

export { createReportBuilder, createCoverage } from "./report.js";

export type {
  ExportOptions,
  ExportOutputType,
  ExportResult,
  ExportReport,
  Degradation,
  DegradationKind,
  ElementCoverage,
} from "./types.js";

// Canonical IR lives in @open-slidestudio/pptd — re-export for ergonomics only.
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

export {
  LAYOUT_16x9,
  LAYOUT_4x3,
  LAYOUT_PORTRAIT,
  pxBoxToInches,
  resolveLayoutInches,
  buildSlideLayout,
} from "./geometry.js";

export { normalizeHexColor, mapFill, mapStroke } from "./style.js";

export { createSampleDeck, TINY_PNG_DATA_URL } from "./sample-deck.js";
