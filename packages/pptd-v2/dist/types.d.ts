/** Kimi YAML PPTD v2 — types used by native stack (subset + extensible). */
export type Color = string;
export type SolidFill = {
    type: "solid";
    color: Color;
};
export type GradientStop = {
    position: number;
    color: Color;
};
export type GradientFill = {
    type: "gradient";
    gradientType: "linear" | "radial";
    stops: GradientStop[];
    angle?: number;
};
export type ImageFill = {
    type: "image";
    src: string;
    fit?: {
        mode: "fill" | "contain" | "cover";
    };
    opacity?: number;
};
export type Fill = SolidFill | GradientFill | ImageFill;
export type Bounds = [number, number, number, number];
/**
 * Semantic placement used by layout QA. It does not affect drawing order or
 * document content, and remains optional for existing PPTD files.
 */
export type LayoutRole = "footer" | "content" | "decoration";
/** Editable shapes that jointly implement a requested non-chart exhibit. */
export type ExhibitRole = "funnel" | "gauge" | "pyramid" | "matrix" | "timeline" | "kpi-card" | "comparison-card";
export type TextContent = {
    text: string;
    style?: string;
    color?: Color;
    fontSize?: number;
    fontFamily?: string | {
        latin: string;
        ea: string;
    };
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    backgroundColor?: Color;
    lineHeight?: number;
    letterSpacing?: number;
    align?: [string, string];
    wrap?: boolean;
    list?: "bullet" | "number";
    href?: string;
};
export type ElementShadow = {
    blur?: number;
    color?: Color;
    offsetX?: number;
    offsetY?: number;
};
/** Native SmartArt is shapes + labels + connectors (no dual IR). */
export type SmartArtLayout = "process" | "cycle" | "hierarchy";
export type SmartArtRole = "node" | "label" | "connector";
export type SmartArtMeta = {
    id: string;
    layout: SmartArtLayout;
    role: SmartArtRole;
    index?: number;
};
export type ElementBase = {
    elementId: string;
    elementType: string;
    bounds: Bounds;
    rotation?: number;
    opacity?: number;
    flipH?: boolean;
    flipV?: boolean;
    locked?: boolean;
    hidden?: boolean;
    groupId?: string;
    shadow?: ElementShadow;
    /** Layout QA role. Text without a role is treated as content. */
    layoutRole?: LayoutRole;
    /** Visual-contract role. A label alone never satisfies a diagram role. */
    exhibitRole?: ExhibitRole;
    /** AC-07: diagram membership; nodes stay independently selectable. */
    smartArt?: SmartArtMeta & {
        /** User-moved node: relayout keeps its position and re-flows others. */
        pinned?: boolean;
    };
};
export type TextElement = ElementBase & {
    elementType: "text";
    content: TextContent;
};
export type ShapeElement = ElementBase & {
    elementType: "shape";
    shapeName: string;
    fill?: Fill;
    border?: {
        style?: string;
        width?: number;
        color?: Color;
    };
    adjustments?: number[];
};
export type ImageCrop = {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
};
export type ShapeDef = {
    shapeName: string;
    adjustments?: number[];
};
export type ImageElement = ElementBase & {
    elementType: "image";
    src: string;
    fit?: {
        mode: "fill" | "contain" | "cover";
    };
    crop?: ImageCrop;
    cropShape?: ShapeDef;
};
export type TableCell = {
    text?: string;
    bold?: boolean;
    color?: Color;
    fill?: Fill;
    align?: [string, string];
    rowSpan?: number;
    colSpan?: number;
};
export type TableElement = ElementBase & {
    elementType: "table";
    columnWidths: number[];
    rowHeights?: number[];
    rows: TableCell[][];
};
export type ChartData = {
    cols: string[];
    rows: (number | string | null)[][];
};
export type ChartSeries = {
    type: string;
    name?: string;
    encode?: Record<string, string>;
    fill?: string | GradientFill;
    /** Combination charts: bind this series to the right-side value axis. */
    axis?: "primary" | "secondary";
};
export type ChartElement = ElementBase & {
    elementType: "chart";
    data: ChartData;
    series: ChartSeries[];
    /**
     * Explicit chart swatches. Pie charts map one color to each category;
     * other charts map one color to each series. This keeps canvas and PPTX
     * export off their built-in default palettes.
     */
    colors?: Color[];
    /** Optional opaque chart-area surface. Manual inserts set this so existing slide content does not show through. */
    background?: Fill;
    title?: string | {
        text: string;
    };
    legend?: boolean | Record<string, unknown>;
    labels?: boolean;
    axis?: {
        x?: string;
        y?: string;
        secondaryY?: string;
    };
};
export type IconElement = ElementBase & {
    elementType: "icon";
    iconName: string;
    fill?: Fill;
};
export type ArrowType = "arrow" | "stealth" | "diamond" | "oval";
export type LineElement = ElementBase & {
    elementType: "line";
    viewBox: [number, number];
    points: string;
    border?: {
        style?: string;
        width?: number;
        color?: Color;
    };
    curve?: string;
    /** [start, end]; null = no marker (official PPTD). */
    arrow?: [ArrowType | null, ArrowType | null];
    /** Native SmartArt: keep this line attached to these element ids. */
    connects?: [string, string];
    /** AC-07: italic edge label (frame 14). */
    label?: string;
};
export type PptdElement = TextElement | ShapeElement | ImageElement | TableElement | ChartElement | IconElement | LineElement | (ElementBase & Record<string, unknown>);
export type AnimationEffect = "appear" | "fade-in" | "fly-in" | "zoom-in" | "wipe-in" | "float-in" | "disappear" | "fade-out" | "none";
export type Animation = {
    elementId: string;
    effect: string;
    trigger?: "onClick" | "withPrevious" | "afterPrevious" | string;
    direction?: "up" | "down" | "left" | "right" | string;
    durationMs?: number;
    delayMs?: number;
};
export type Page = {
    pageType?: string;
    background?: Fill;
    notes?: string;
    elements: PptdElement[];
    animations?: Animation[];
};
export type Theme = {
    colors?: Record<string, Color>;
    textStyles?: Record<string, Record<string, unknown>>;
    tableStyles?: Record<string, unknown>;
};
export type Presentation = {
    version: "v2";
    title?: string;
    size: [number, number];
    theme?: Theme;
    pages: string[];
    customFonts?: {
        family: string;
        src: string;
    }[];
};
export type LoadedPage = {
    path: string;
    page: Page;
};
/** Fully loaded project in memory (still serializes to YAML PPTD files). */
export type PptdProject = {
    rootDir: string;
    manifestPath: string;
    presentation: Presentation;
    pages: LoadedPage[];
};
//# sourceMappingURL=types.d.ts.map