export {
  exportProjectToPptx,
  exportProjectToFile,
  validateExportReport,
  HARD_DEGRADATION_KINDS,
  type ExportReport,
  type ExportResult,
  type ExportReportValidation,
  type ExportPptxOptions,
  type Degradation,
  type EditableLineEvidence,
} from "./export-pptd.js";
export {
  collectUsedText,
  buildEmbeddedFonts,
  embedFontsIntoPptx,
  fsTypeRestricted,
  sfntFsType,
  type EmbeddedFontFace,
  type EmbeddedFontInfo,
  type FontFaceSource,
  type FontEmbedOptions,
  type FontEmbedPlan,
  type SkippedFont,
} from "./font-embed.js";
export {
  mapChartElement,
  chartSwatch,
  DEFAULT_CHART_PALETTE,
  type ChartExportModel,
} from "./chart-map.js";
export { exportPageToPng, type PngExportResult } from "./export-png.js";
