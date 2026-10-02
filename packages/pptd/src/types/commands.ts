import type { ThemeTokens } from "./theme.js";
import type {
  SlideElement,
  ChartSeries,
  ChartType,
  SmartArtNode,
  SmartArtEdge,
  SmartArtLayout,
} from "./elements.js";
import type { Slide, Deck, Reference, Citation } from "./deck.js";

export type Actor = "user" | "agent" | "system";

export type CommandBase = {
  id: string;
  actor: Actor;
  timestamp: string;
  requestId?: string;
};

export type AddElementCommand = CommandBase & {
  type: "addElement";
  slideId: string;
  element: SlideElement;
  /** Index within slide.elements; defaults to append */
  index?: number;
};

/**
 * Fields that may be merged onto an existing element.
 * `kind` and `id` are never changed by updateElement.
 */
export type ElementPatch = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  visible?: boolean;
  name?: string;
  sourceRef?: string;
  // text
  paragraphs?: import("./elements.js").TextParagraph[];
  verticalAlign?: import("./elements.js").VerticalAlign;
  autoFit?: boolean;
  // shape / shared paint
  shape?: import("./elements.js").ShapeKind;
  fill?: import("./fill.js").Fill;
  stroke?: import("./fill.js").Stroke;
  cornerRadius?: number;
  shadow?: import("./fill.js").Shadow;
  text?: import("./elements.js").TextParagraph[];
  // image
  src?: string;
  alt?: string;
  crop?: import("./elements.js").ImageCrop;
  objectFit?: "cover" | "contain" | "fill";
  // table
  rows?: number;
  cols?: number;
  columnWidths?: number[];
  rowHeights?: number[];
  cells?: import("./elements.js").TableCell[][];
  // chart
  chartType?: ChartType;
  categories?: string[];
  series?: ChartSeries[];
  showLegend?: boolean;
  showDataLabels?: boolean;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  // connector
  connectorType?: import("./elements.js").ConnectorType;
  start?: import("./elements.js").ConnectorEnd;
  end?: import("./elements.js").ConnectorEnd;
  startArrow?: import("./elements.js").ArrowHead;
  endArrow?: import("./elements.js").ArrowHead;
  // group
  children?: SlideElement[];
  // smartart
  layout?: SmartArtLayout;
  nodes?: SmartArtNode[];
  edges?: SmartArtEdge[];
};

export type UpdateElementCommand = CommandBase & {
  type: "updateElement";
  slideId: string;
  elementId: string;
  /** Partial patch applied on top of the live element (kind/id are ignored). */
  patch: ElementPatch;
  /** Populated by applyCommand for undo */
  before?: SlideElement;
};

export type DeleteElementCommand = CommandBase & {
  type: "deleteElement";
  slideId: string;
  elementId: string;
  /** Populated by applyCommand for undo */
  before?: SlideElement;
  /** Index where the element lived (for undo insert) */
  beforeIndex?: number;
};

export type AddSlideCommand = CommandBase & {
  type: "addSlide";
  slide: Slide;
  /** Insertion index; defaults to append */
  index?: number;
};

export type DeleteSlideCommand = CommandBase & {
  type: "deleteSlide";
  slideId: string;
  before?: Slide;
  beforeIndex?: number;
};

export type ReorderSlideCommand = CommandBase & {
  type: "reorderSlide";
  slideId: string;
  fromIndex: number;
  toIndex: number;
};

export type UpdateSlideCommand = CommandBase & {
  type: "updateSlide";
  slideId: string;
  patch: Partial<Pick<Slide, "background" | "notes" | "layoutHint" | "size">>;
  before?: Partial<Pick<Slide, "background" | "notes" | "layoutHint" | "size">>;
};

export type UpdateThemeCommand = CommandBase & {
  type: "updateTheme";
  theme: ThemeTokens;
  before?: ThemeTokens;
};

export type UpdateDeckMetaCommand = CommandBase & {
  type: "updateDeckMeta";
  patch: Partial<Pick<Deck, "title" | "aspectRatio" | "meta">>;
  before?: Partial<Pick<Deck, "title" | "aspectRatio" | "meta">>;
};

export type ReplaceAssetCommand = CommandBase & {
  type: "replaceAsset";
  slideId: string;
  elementId: string;
  /** New image src / asset id */
  src: string;
  beforeSrc?: string;
};

export type UpdateChartDataCommand = CommandBase & {
  type: "updateChartData";
  slideId: string;
  elementId: string;
  categories?: string[];
  series?: ChartSeries[];
  chartType?: ChartType;
  before?: {
    categories: string[];
    series: ChartSeries[];
    chartType: ChartType;
  };
};

export type UpdateSmartArtCommand = CommandBase & {
  type: "updateSmartArt";
  slideId: string;
  elementId: string;
  nodes?: SmartArtNode[];
  edges?: SmartArtEdge[];
  layout?: SmartArtLayout;
  before?: {
    nodes: SmartArtNode[];
    edges: SmartArtEdge[];
    layout: SmartArtLayout;
  };
};

export type SetReferencesCommand = CommandBase & {
  type: "setReferences";
  references: Reference[];
  before?: Reference[];
};

export type SetCitationsCommand = CommandBase & {
  type: "setCitations";
  citations: Citation[];
  before?: Citation[];
};

export type BatchCommand = CommandBase & {
  type: "batch";
  commands: Command[];
};

export type Command =
  | AddElementCommand
  | UpdateElementCommand
  | DeleteElementCommand
  | AddSlideCommand
  | DeleteSlideCommand
  | ReorderSlideCommand
  | UpdateSlideCommand
  | UpdateThemeCommand
  | UpdateDeckMetaCommand
  | ReplaceAssetCommand
  | UpdateChartDataCommand
  | UpdateSmartArtCommand
  | SetReferencesCommand
  | SetCitationsCommand
  | BatchCommand;

export type CommandType = Command["type"];

/** Result of applying a command: new deck + command enriched with undo snapshots. */
export type ApplyResult = {
  deck: Deck;
  command: Command;
};
