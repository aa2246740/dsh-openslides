/**
 * @open-slidestudio/pptd
 *
 * Presentation intermediate representation (PPTD): structured deck model,
 * reversible commands, factories, and zod schemas.
 *
 * Coordinates: slide-local, origin top-left. Default canvas 1920×1080 (16:9).
 */

// Types
export type {
  Point,
  Size,
  Rect,
  AspectRatio,
  GradientStop,
  SolidFill,
  GradientFill,
  ImageFill,
  NoneFill,
  Fill,
  StrokeDash,
  Stroke,
  Shadow,
  ThemeColors,
  ThemeFonts,
  ThemeRadii,
  ThemeTokens,
  BaseElement,
  TextAlign,
  VerticalAlign,
  TextRun,
  BulletStyle,
  TextParagraph,
  TextElement,
  ShapeKind,
  ShapeElement,
  ImageCrop,
  ImageElement,
  TableCell,
  TableElement,
  ChartType,
  ChartSeries,
  ChartElement,
  NamedAnchor,
  AnchorPoint,
  ConnectorEnd,
  ConnectorType,
  ArrowHead,
  ConnectorElement,
  GroupElement,
  SmartArtLayout,
  SmartArtNode,
  SmartArtEdge,
  SmartArtElement,
  SlideElement,
  ElementKind,
  ReferenceStatus,
  Reference,
  Citation,
  Slide,
  Deck,
  Actor,
  CommandBase,
  ElementPatch,
  AddElementCommand,
  UpdateElementCommand,
  DeleteElementCommand,
  AddSlideCommand,
  DeleteSlideCommand,
  ReorderSlideCommand,
  UpdateSlideCommand,
  UpdateThemeCommand,
  UpdateDeckMetaCommand,
  ReplaceAssetCommand,
  UpdateChartDataCommand,
  UpdateSmartArtCommand,
  SetReferencesCommand,
  SetCitationsCommand,
  BatchCommand,
  Command,
  CommandType,
  ApplyResult,
} from "./types/index.js";

export {
  DEFAULT_SLIDE_SIZE,
  sizeForAspectRatio,
  solidFill,
  noneFill,
  DEFAULT_THEME,
  isElementKind,
} from "./types/index.js";

// Commands
export {
  applyCommand,
  applyCommands,
  undoCommand,
  invertCommand,
  PptdError,
  cmdAddElement,
  cmdUpdateElement,
  cmdDeleteElement,
  cmdAddSlide,
  cmdDeleteSlide,
  cmdReorderSlide,
  cmdUpdateSlide,
  cmdUpdateTheme,
  cmdUpdateDeckMeta,
  cmdReplaceAsset,
  cmdUpdateChartData,
  cmdUpdateSmartArt,
  cmdSetReferences,
  cmdSetCitations,
  cmdBatch,
  cmdSetBackground,
  cmdSetSlideSize,
} from "./commands/index.js";

// Factories
export {
  createEmptyDeck,
  createEmptySlide,
  createSampleResearchDeck,
  SAMPLE_RESEARCH_THEME,
  type CreateEmptyDeckOptions,
} from "./factories/index.js";

// Schema
export {
  DeckSchema,
  SlideSchema,
  SlideElementSchema,
  ThemeTokensSchema,
  FillSchema,
  CommandSchema,
  parseDeck,
  safeParseDeck,
  parseCommand,
  safeParseCommand,
  validateDeckInvariants,
  type DeckParseResult,
} from "./schema/index.js";

// Query helpers
export {
  getSlideById,
  getElementById,
  findElement,
  listElements,
  sortSlidesByOrder,
} from "./query.js";

// Utils
export { createId, nowIso } from "./id.js";
export { deepClone } from "./clone.js";
