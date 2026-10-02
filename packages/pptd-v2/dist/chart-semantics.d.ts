import type { ChartElement } from "./types.js";
import { type ChartScale } from "./chart-layout.js";
export type SupportedChartKind = "bar" | "line" | "pie" | "area" | "waterfall" | "scatter";
export type WaterfallBar = {
    label: string;
    value: number;
    start: number;
    end: number;
    kind: "total" | "subtotal" | "increase" | "decrease";
};
export type WaterfallChartModel = {
    bars: WaterfallBar[];
    valueMin: number;
    valueMax: number;
    /** Shared nice axis (does not force zero). */
    scale: ChartScale;
};
export type ScatterPoint = {
    label: string;
    x: number;
    y: number;
};
export type ScatterChartModel = {
    xName: string;
    yName: string;
    points: ScatterPoint[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    xScale: ChartScale;
    yScale: ChartScale;
};
export type CategoricalChartSeries = {
    name: string;
    values: number[];
    kind: "bar" | "line" | "area" | "pie";
    axis: "primary" | "secondary";
};
export type CategoricalChartModel = {
    kind: "bar" | "line" | "area" | "pie";
    orientation: "vertical" | "horizontal";
    categories: string[];
    series: CategoricalChartSeries[];
    /** @deprecated use `scale.max`; kept for compatibility. */
    valueMax: number;
    /** Shared nice value axis (supports negatives and values < 1). */
    scale: ChartScale;
};
export type ScatterLabelPoint = Readonly<{
    label: string;
    x: number;
    y: number;
}>;
export type ScatterLabelPlacement = Readonly<{
    label: string;
    pointX: number;
    pointY: number;
    textX: number;
    baseline: number;
    anchor: "start" | "end";
    box: Readonly<{
        left: number;
        top: number;
        right: number;
        bottom: number;
    }>;
}>;
type ChartSemanticInput = Pick<ChartElement, "data" | "series">;
export declare function chartKind(input: ChartSemanticInput): SupportedChartKind;
/**
 * Resolve category/value columns from the declared chart encoding. A bar with
 * numeric X and categorical Y is horizontal. Other Cartesian charts keep X as
 * the category axis and Y as the value axis. This is the shared data contract
 * for the editor and native PPTX writer.
 */
export declare function categoricalChartModel(input: ChartSemanticInput): CategoricalChartModel;
/**
 * Build one deterministic waterfall interpretation for both the editor and
 * PPTX writer. First/last rows are totals. Explicit `encode.isTotal` rows are
 * totals. A labelled subtotal whose value equals the preceding signed deltas
 * is displayed from the block base without changing the running balance.
 */
export declare function waterfallChartModel(input: ChartSemanticInput): WaterfallChartModel;
/** Build an XY model from `series[0].encode.x/y`, never from column order alone. */
export declare function scatterChartModel(input: ChartSemanticInput): ScatterChartModel;
/** Greedy deterministic label placement shared by the DOM and PPTX renderers. */
export declare function placeScatterLabels(points: readonly ScatterLabelPoint[], bounds: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
}>, fontSize?: number): ScatterLabelPlacement[];
export {};
//# sourceMappingURL=chart-semantics.d.ts.map