/**
 * Shared chart mapping: canvas SVG and PPTX export must use the same
 * series, colors, value scale, legend, and layout. Everything geometric and
 * typographic comes from `pptd-v2`'s chart-layout contract so the exported
 * chart lands where the canvas painted it.
 */
import { chartSwatch, type ChartElement, type ChartLayout, type ChartScale, type LegendSpec } from "@open-slidestudio/pptd-v2";
/** Re-export so mapChart can share the same palette bookkeeping. */
export { chartSwatch };
export declare const DEFAULT_CHART_PALETTE: readonly ["#2563EB", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];
export type ChartExportSeries = {
    name: string;
    labels: string[];
    values: number[];
    pptxType: "bar" | "line" | "pie" | "area";
    axis: "primary" | "secondary";
    color: string;
    /** Per-series Excel format code for its data labels. */
    formatCode: string;
};
export type ChartExportModel = {
    pptxType: "bar" | "line" | "pie" | "area";
    barDir?: "col" | "bar";
    categories: string[];
    series: ChartExportSeries[];
    /** Hex with #; one color per bar (single series) or per series. */
    colors: string[];
    /** Shared nice value axis for the primary axis. */
    scale: ChartScale;
    secondaryScale?: ChartScale;
    /** Kept for compatibility with existing tests: scale.max. */
    valueMax: number;
    primaryValueMax: number;
    secondaryValueMax?: number;
    title?: string;
    legend: LegendSpec;
    showLegend: boolean;
    showValue: boolean;
    /** Max decimals across all series — the workbook display format. */
    dataLabelFormatCode: string;
    /** True when the model spreads `colors` per category (single series bar). */
    perCategoryColors: boolean;
    /** Element-relative geometry shared with the canvas painter. */
    layout: ChartLayout;
};
export declare function mapChartElement(el: ChartElement): ChartExportModel;
export declare function hexNoHash(color: string): string;
//# sourceMappingURL=chart-map.d.ts.map