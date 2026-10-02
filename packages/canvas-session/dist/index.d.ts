import { type RichTextRun, type RangeStylePatch, type Bounds, type Fill, type PptdElement, type PptdProject, type TextElement, type ChartElement, type ChartSeries, type ArrowType, type Animation, type ImageCrop, type ShapeDef, type ElementShadow, type SmartArtMeta, type SmartArtLayout, type AdjustHandle } from "@open-slidestudio/pptd-v2";
export type Selection = {
    kind: "none";
} | {
    kind: "page";
    pageIndex: number;
} | {
    kind: "element";
    pageIndex: number;
    elementId: string;
} | {
    kind: "multi";
    pageIndex: number;
    elementIds: string[];
};
export type CanvasSession = {
    project: PptdProject;
    pageIndex: number;
    selection: Selection;
    /** Oracle-backed control ids that may be invoked (OOP-29/30). */
    allowedControlIds: Set<string>;
    /** JSON document + view snapshots for undo (max 50). */
    undoStack: string[];
    redoStack: string[];
    /** S1 chrome — UI only, not PPTD. */
    zoomPercent: number;
    pageRailOpen: boolean;
    notesOpen: boolean;
    presenting: boolean;
    /** In-memory copy buffer (Cmd+C / Cmd+V). Not persisted. */
    clipboard: PptdElement[];
};
export type OpenSessionOpts = {
    allowedControlIds?: string[];
    /** Initial page; clamped to `[0, pageCount)`. */
    pageIndex?: number;
    /** Override; default open when the deck has more than one page. */
    pageRailOpen?: boolean;
};
export declare function openSession(source: string, opts?: OpenSessionOpts): CanvasSession;
export declare function pageCount(session: CanvasSession): number;
export declare function currentPage(session: CanvasSession): import("@open-slidestudio/pptd-v2").Page;
export declare function goToPage(session: CanvasSession, index: number): void;
export declare function selectElement(session: CanvasSession, elementId: string, skipGroup?: boolean): PptdElement;
/** Read-only single selected element, or null. Used by server rebuild. */
export declare function getSelectedElement(session: CanvasSession): PptdElement | null;
export declare function clearSelection(session: CanvasSession): void;
/** S3: Tab / Shift+Tab cycle through selectable elements (hidden skipped). */
export declare function tabSelect(session: CanvasSession, controlId: string, dir: 1 | -1): void;
export declare function selectMany(session: CanvasSession, elementIds: string[]): void;
/** Text content edit — requires oracle control id, e.g. element.text.content.set */
export declare function setSelectedText(session: CanvasSession, controlId: string, text: string): void;
/**
 * Replace selected text HTML after a parse→serialize whitelist sanitizer.
 * Control: element.text.content.set
 */
export declare function setSelectedRichText(session: CanvasSession, controlId: string, html: string): void;
/**
 * Apply a style patch to a plain-text offset range inside the selected text.
 * Always writes runs HTML — does not fall back to content.bold.
 */
export declare function setSelectedTextRangeStyle(session: CanvasSession, controlId: string, start: number, end: number, patch: RangeStylePatch): void;
export type { RangeStylePatch };
/** Toggle bold on selected text — element.text.toolbar.bold.toggle */
export declare function setSelectedBold(session: CanvasSession, controlId: string, bold: boolean): void;
/** Move / resize selected element — element.bounds.set */
export declare function setSelectedBounds(session: CanvasSession, controlId: string, bounds: Bounds, anchorElementId?: string): void;
export declare function undo(session: CanvasSession, controlId?: string): boolean;
export declare function redo(session: CanvasSession, controlId?: string): boolean;
export declare function persist(session: CanvasSession): void;
export declare function setZoomPercent(session: CanvasSession, controlId: string, percent: number): void;
export declare function zoomBy(session: CanvasSession, controlId: string, direction: "in" | "out"): void;
export declare function setPageRailOpen(session: CanvasSession, controlId: string, open: boolean): void;
export declare function setNotesOpen(session: CanvasSession, controlId: string, open: boolean): void;
export declare function setPresenting(session: CanvasSession, controlId: string, on: boolean): void;
export declare function addBlankPage(session: CanvasSession, controlId: string): void;
export declare function deletePage(session: CanvasSession, controlId: string, index?: number): void;
export declare function duplicatePage(session: CanvasSession, controlId: string, index?: number): void;
export declare function reorderPages(session: CanvasSession, controlId: string, fromIndex: number, toIndex: number): void;
export declare const MAX_INSERT_TEXT_LENGTH = 20000;
export declare function insertText(session: CanvasSession, controlId: string, initialText?: unknown): string;
export declare function insertShape(session: CanvasSession, controlId: string, shapeName?: string): string;
export declare function insertImage(session: CanvasSession, controlId: string, src?: string): string;
/** AC-11: turn selected image into independently selectable text/shape/line nodes. */
export declare function rebuildSelectedImage(session: CanvasSession, controlId: string, prompt?: string): {
    labels: string[];
    created: string[];
};
export declare const MIN_INSERT_TABLE_SIZE = 1;
export declare const MAX_INSERT_TABLE_SIZE = 6;
export declare function insertTable(session: CanvasSession, controlId: string, rows?: number, columns?: number): string;
export declare function insertChart(session: CanvasSession, controlId: string): string;
export declare function insertLine(session: CanvasSession, controlId: string): string;
export declare function insertIcon(session: CanvasSession, controlId: string, iconName?: string): string;
/** AC-07: insert SmartArt as independently selectable nodes + connectors. */
export declare function insertSmartArt(session: CanvasSession, controlId: string, layout?: SmartArtLayout, labels?: string[]): string;
export declare function addSmartArtNode(session: CanvasSession, controlId: string, label?: string): string;
export declare function deleteSmartArtNode(session: CanvasSession, controlId: string): void;
export declare function setSmartArtLayout(session: CanvasSession, controlId: string, layout: SmartArtLayout): void;
export declare function setSelectedLocked(session: CanvasSession, controlId: string, locked: boolean): void;
export declare function setSelectedHidden(session: CanvasSession, controlId: string, hidden: boolean): void;
export declare function setSelectedShadow(session: CanvasSession, controlId: string, shadow: ElementShadow | null): void;
export declare function groupSelected(session: CanvasSession, controlId: string): string;
export declare function ungroupSelected(session: CanvasSession, controlId: string): void;
export declare function deleteSelected(session: CanvasSession, controlId: string): void;
export declare function duplicateSelected(session: CanvasSession, controlId: string): void;
export declare function copySelected(session: CanvasSession): number;
export declare function pasteClipboard(session: CanvasSession, controlId: string): void;
export declare function arrangeSelected(session: CanvasSession, controlId: string, dir: "forward" | "backward" | "front" | "back"): void;
export declare function alignSelected(session: CanvasSession, controlId: string, edge: "left" | "center" | "right" | "top" | "middle" | "bottom"): void;
export declare function distributeSelected(session: CanvasSession, controlId: string, axis: "h" | "v"): void;
export declare function flipSelected(session: CanvasSession, controlId: string, axis: "h" | "v"): void;
export declare function setSelectedRotation(session: CanvasSession, controlId: string, degrees: number): void;
export declare function setSelectedOpacity(session: CanvasSession, controlId: string, opacity: number): void;
export type TextStylePatch = Omit<Partial<TextElement["content"]>, "list" | "href"> & {
    list?: TextElement["content"]["list"] | null;
    href?: string | null;
};
export declare function setSelectedTextStyle(session: CanvasSession, controlId: string, patch: TextStylePatch): void;
export declare function setSelectedFill(session: CanvasSession, controlId: string, colorOrFill: string | Fill): void;
export declare function setSelectedShapeName(session: CanvasSession, controlId: string, shapeName: string): void;
export declare function setSelectedAdjustments(session: CanvasSession, controlId: string, adjustments: number[]): void;
export declare function setSelectedBorder(session: CanvasSession, controlId: string, border: {
    style?: string;
    width?: number;
    color?: string;
}): void;
export declare function setImageSrc(session: CanvasSession, controlId: string, src: string): void;
export declare function setIconName(session: CanvasSession, controlId: string, iconName: string): void;
export declare function setLineArrow(session: CanvasSession, controlId: string, arrow: [ArrowType | null, ArrowType | null]): void;
export declare function setImageCrop(session: CanvasSession, controlId: string, crop: ImageCrop): void;
export declare function setImageCropShape(session: CanvasSession, controlId: string, cropShape: ShapeDef | undefined): void;
export declare function setLineCurve(session: CanvasSession, controlId: string, curve: "sharp" | "round" | "smooth"): void;
/** AC-07: SmartArt edge label (frame 14 italic captions). */
export declare function setLineLabel(session: CanvasSession, controlId: string, label: string | null): void;
export declare function setLinePoints(session: CanvasSession, controlId: string, points: string): void;
export declare function setImageFit(session: CanvasSession, controlId: string, mode: "fill" | "contain" | "cover"): void;
export declare function setTableCellText(session: CanvasSession, controlId: string, row: number, col: number, text: string): void;
export declare function setTableCellAlign(session: CanvasSession, controlId: string, row: number, col: number, align: [string, string]): void;
export declare function addTableRow(session: CanvasSession, controlId: string, after?: number): void;
export declare function addTableCol(session: CanvasSession, controlId: string, after?: number): void;
export declare function deleteTableRow(session: CanvasSession, controlId: string, row?: number): void;
export declare function deleteTableCol(session: CanvasSession, controlId: string, col?: number): void;
export declare function mergeTableCells(session: CanvasSession, controlId: string, r1: number, c1: number, r2: number, c2: number): void;
export declare function setTableCellFill(session: CanvasSession, controlId: string, row: number, col: number, color: string): void;
export declare function setChartData(session: CanvasSession, controlId: string, data: ChartElement["data"]): void;
export declare function setChartType(session: CanvasSession, controlId: string, type: string): void;
export declare function setChartTitle(session: CanvasSession, controlId: string, title: string): void;
export declare function setChartLegend(session: CanvasSession, controlId: string, legend: boolean): void;
export declare function setChartSeriesFill(session: CanvasSession, controlId: string, index: number, color: string): void;
export declare function setChartLabels(session: CanvasSession, controlId: string, labels: boolean): void;
export declare function setChartAxis(session: CanvasSession, controlId: string, axis: {
    x?: string;
    y?: string;
    secondaryY?: string;
}): void;
export declare function setPageBackground(session: CanvasSession, controlId: string, colorOrFill: string | Fill): void;
export declare function setThemeColor(session: CanvasSession, controlId: string, key: string, color: string): void;
export declare function setPageNotes(session: CanvasSession, controlId: string, notes: string): void;
export declare function setPageNotesAt(session: CanvasSession, controlId: string, pageIndex: number, notes: string): void;
export declare function setElementAnimation(session: CanvasSession, controlId: string, kind: string): void;
export declare function setPageAnimations(session: CanvasSession, controlId: string, animations: Animation[]): void;
/** Deterministic NL refine on the current page. Writes PPTD fields, not notes-only. */
export declare function applyNaturalRefine(session: CanvasSession, controlId: string, instruction: string): {
    applied: string[];
};
export type RenderElement = {
    id: string;
    type: string;
    bounds: Bounds;
    rotation: number;
    opacity: number;
    flipH?: boolean;
    flipV?: boolean;
    text?: string;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    fontSize?: number;
    /** CSS font stack from the resolved {latin, ea} pair. */
    fontFamily?: string;
    /** Latin face of the pair, for the font menu. */
    fontLatin?: string;
    /** East Asian face of the pair, for the font menu. */
    fontEastAsian?: string;
    letterSpacing?: number;
    lineHeight?: number;
    align?: [string, string];
    list?: "bullet" | "number";
    href?: string;
    wrap?: boolean;
    runs?: RichTextRun[];
    shapeName?: string;
    adjustments?: number[];
    pathD?: string;
    fillCss?: string;
    border?: {
        style?: string;
        width?: number;
        color?: string;
    };
    src?: string;
    fit?: string;
    crop?: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    };
    cropShape?: {
        shapeName: string;
        adjustments?: number[];
    };
    lineCurve?: string;
    table?: boolean;
    tableRows?: {
        text: string;
        bold?: boolean;
        color?: string;
        fill?: string;
        rowSpan?: number;
        colSpan?: number;
        align?: [string, string];
    }[][];
    columnWidths?: number[];
    chart?: boolean;
    chartTitle?: string;
    chartType?: string;
    chartData?: {
        cols: string[];
        rows: (number | string | null)[][];
    };
    chartSeries?: ChartSeries[];
    chartLegend?: boolean | Record<string, unknown>;
    chartBackgroundCss?: string;
    chartColors?: string[];
    line?: boolean;
    linePoints?: string;
    connects?: [string, string];
    icon?: boolean;
    iconName?: string;
    underline?: boolean;
    backgroundColor?: string;
    lineArrow?: [string | null, string | null];
    lineLabel?: string;
    animation?: string;
    pathStroke?: string;
    adjustHandles?: AdjustHandle[];
    locked?: boolean;
    hidden?: boolean;
    groupId?: string;
    smartArt?: SmartArtMeta;
    shadow?: {
        blur?: number;
        color?: string;
        offsetX?: number;
        offsetY?: number;
    };
    chartLabels?: boolean;
    chartAxis?: {
        x?: string;
        y?: string;
        secondaryY?: string;
    };
};
/** Snapshot for thumbnails / play / native DOM canvas: pure data, no DOM. */
export declare function renderModel(session: CanvasSession): {
    title: string;
    rootDir: string;
    size: [number, number];
    pageIndex: number;
    pageCount: number;
    pagePaths: string[];
    background: Fill | undefined;
    backgroundCss: string;
    backgroundImage: string | undefined;
    elements: RenderElement[];
    selection: Selection;
    canUndo: boolean;
    canRedo: boolean;
    allowedControlIds: string[];
    zoomPercent: number;
    pageRailOpen: boolean;
    notesOpen: boolean;
    presenting: boolean;
    notes: string;
    themeColors: Record<string, string>;
    animations: Animation[];
};
/** List all pages' render models for thumbnails (read-only projection). */
export declare function renderAllPages(session: CanvasSession): {
    title: string;
    rootDir: string;
    size: [number, number];
    pageIndex: number;
    pageCount: number;
    pagePaths: string[];
    background: Fill | undefined;
    backgroundCss: string;
    backgroundImage: string | undefined;
    elements: RenderElement[];
    selection: Selection;
    canUndo: boolean;
    canRedo: boolean;
    allowedControlIds: string[];
    zoomPercent: number;
    pageRailOpen: boolean;
    notesOpen: boolean;
    presenting: boolean;
    notes: string;
    themeColors: Record<string, string>;
    animations: Animation[];
}[];
//# sourceMappingURL=index.d.ts.map