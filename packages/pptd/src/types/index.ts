export type {
  Point,
  Size,
  Rect,
  AspectRatio,
} from "./geometry.js";
export { DEFAULT_SLIDE_SIZE, sizeForAspectRatio } from "./geometry.js";

export type {
  GradientStop,
  SolidFill,
  GradientFill,
  ImageFill,
  NoneFill,
  Fill,
  StrokeDash,
  Stroke,
  Shadow,
} from "./fill.js";
export { solidFill, noneFill } from "./fill.js";

export type {
  ThemeColors,
  ThemeFonts,
  ThemeRadii,
  ThemeTokens,
} from "./theme.js";
export { DEFAULT_THEME } from "./theme.js";

export type {
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
} from "./elements.js";
export { isElementKind } from "./elements.js";

export type {
  ReferenceStatus,
  Reference,
  Citation,
  Slide,
  Deck,
} from "./deck.js";

export type {
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
} from "./commands.js";
