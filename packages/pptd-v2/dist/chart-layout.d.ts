/**
 * Shared chart layout, scale, and text contract. The canvas SVG painters and
 * the native PPTX exporter both consume the helpers in this file so that a
 * chart's geometry, tick labels, number formatting, legend placement, and
 * font sizes are computed once instead of approximated twice.
 *
 * This module is served to the browser as `/runtime/chart-layout.js`; keep it
 * free of Node-only APIs and value-level imports from other modules (type-only
 * imports are erased at build time).
 */
import type { ChartElement } from "./types.js";
export type Rect = Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
}>;
export type Point = Readonly<{
    x: number;
    y: number;
}>;
/** Palette shared by the canvas and the exporter. */
export declare const CHART_PALETTE: readonly ["#2563EB", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];
/** Chart ink/grid on light vs dark chart surfaces. */
export declare const CHART_INK: {
    readonly light: "#626976";
    readonly dark: "#CBD5E1";
};
export declare const CHART_GRID: {
    readonly light: "#E5E7EB";
    readonly dark: "#475569";
};
/**
 * Chart text sizes in slide px (the same space `el.bounds` lives in). The
 * canvas writes these as SVG `font-size`; the exporter converts them with
 * `cssPxToPt`. Sizes are fixed slide metrics and never scale with the chart.
 */
export declare const CHART_TEXT_PX: {
    readonly title: 14;
    readonly legend: 10;
    /** Tick labels on the value axis and scatter axes. */
    readonly tick: 9;
    /** Category labels under/over the axis. */
    readonly category: 10;
    /** Value labels on bars/points. */
    readonly dataLabel: 9;
    readonly axisTitle: 10;
    /** Scatter point labels carry weight 600. */
    readonly scatterLabel: 9;
};
/**
 * Marker the chart XML patcher splits into `<a:latin>` and `<a:ea>`. Charts
 * use the slide default pair, so this is the same value as the font policy's
 * `CHART_FONT_FACE`; chart-layout does not import that module because the
 * browser loads this file on its own.
 */
export declare const CHART_FONT_FACE = "Arial***\u5FAE\u8F6F\u96C5\u9ED1";
/**
 * Same swatch rule on both renderers: explicit `el.colors`, then the series
 * fill, then the palette. `seriesCount` may exceed `series.length` when the
 * data table carries more value columns than declared series.
 */
export declare function chartSwatch(el: Pick<ChartElement, "colors" | "series">, index: number, seriesCount?: number): string;
/** Decimals needed to render `values` exactly, capped at MAX_DECIMALS. */
export declare function seriesDecimals(values: readonly number[]): number;
/**
 * Shared chart number format: thousands separators, `decimals` fraction
 * digits (explicit) or the minimal needed (omitted), optional +/− sign.
 */
export declare function formatChartValue(value: number, decimals?: number, opts?: {
    signed?: boolean;
}): string;
/** Excel number-format code matching formatChartValue (without sign flag). */
export declare function chartNumberFormatCode(decimals: number): string;
/** `#,##0.00;-#,##0.00;;` hides zeros on both halves; used for combo labels. */
export declare function chartZeroHiddenFormatCode(formatCode: string): string;
export type ChartScale = Readonly<{
    min: number;
    max: number;
    step: number;
    /** Interior gridline values (min..max exclusive endpoints included). */
    ticks: number[];
    /** Decimals needed to render `step` exactly. */
    tickDecimals: number;
}>;
/**
 * One deterministic nice scale for the canvas and the exporter. Supports
 * negatives and values < 1, always returns a non-empty tick set, and snaps
 * min/max onto step boundaries so the canvas grid and PowerPoint's own
 * `min/max/majorUnit` land on the same values.
 *
 * `includeZero` is for bars/lines (the canvas draws a zero baseline);
 * floating-range charts (waterfall, scatter) pass `false`.
 */
export declare function niceScale(values: readonly number[], opts?: {
    includeZero?: boolean;
    tickCount?: number;
}): ChartScale;
/**
 * Secondary axis of a combo chart: reuse the primary tick count so both
 * gridline rows align.
 */
export declare function alignedSecondaryScale(values: readonly number[], primary: ChartScale): ChartScale;
export type LegendPosition = "top" | "bottom" | "left" | "right";
export type LegendSpec = Readonly<{
    show: boolean;
    position: LegendPosition;
}>;
/**
 * Resolve the PPTD `legend` field — `true`, `false`, `{show}`, `{position}`
 * or a mix — into a single show/position contract used by both renderers.
 */
export declare function resolveChartLegend(legend: ChartElement["legend"]): LegendSpec;
/**
 * Approximate rendered width of chart label text in px. CJK and full-width
 * punctuation measure 1em; the rest uses a conservative Latin width. A 10%
 * padding factor keeps the canvas painter and PowerPoint's own text metrics
 * on the same side of tight edges.
 */
export declare function measureChartText(text: string, fontPx: number): number;
export type ChartLayoutOptions = {
    title?: string;
    legend: LegendSpec;
    /** Item names: series names, or category names for pie. */
    legendItems: string[];
    /** Longest value-axis tick label, for the left reserve. */
    widestTickLabel: string;
    /** Longest category label, for the bottom reserve. */
    widestCategoryLabel?: string;
    categoryCount: number;
    hasSecondaryAxis?: boolean;
    /** Secondary-axis tick label width, for the right reserve. */
    widestSecondaryTickLabel?: string;
    /**
     * Leave a band under the plot, above the category names, for a label that
     * sits below a negative bar or point. Omit it for pie and horizontal bars.
     */
    reserveBelowLabel?: boolean;
    axis?: {
        x?: string;
        y?: string;
        secondaryY?: string;
    };
};
export type LegendItemLayout = Readonly<{
    name: string;
    swatch: Rect;
    text: Rect;
    textAnchor: Point;
}>;
export type LegendLayout = Readonly<{
    position: LegendPosition;
    area: Rect;
    items: LegendItemLayout[];
}>;
export type ChartLayout = Readonly<{
    /** Element-relative title band; absent when the chart has no title. */
    title?: Rect;
    /** Inner plot area (where bars/points render), element-relative. */
    plot: Rect;
    legend?: LegendLayout;
    /** Category labels band under/over the plot; absent for pie. */
    categoryBand?: Rect;
    /** Element-relative rect for the x axis title text. */
    axisTitleX?: Rect;
    axisTitleY?: Rect;
    axisTitleSecondaryY?: Rect;
}>;
/**
 * Compute the element-relative geometry every painter/exporter shares:
 * title band, legend area + items, category label band, axis-title rects and
 * the inner plot rect. Reserves are computed from actual label text so ticks,
 * legend and axis titles never overlap and stay inside the chart bounds.
 */
export declare function chartLayout(bounds: {
    w: number;
    h: number;
}, opts: ChartLayoutOptions): ChartLayout;
//# sourceMappingURL=chart-layout.d.ts.map