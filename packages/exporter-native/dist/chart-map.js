/**
 * Shared chart mapping: canvas SVG and PPTX export must use the same
 * series, colors, value scale, legend, and layout. Everything geometric and
 * typographic comes from `pptd-v2`'s chart-layout contract so the exported
 * chart lands where the canvas painted it.
 */
import { alignedSecondaryScale, categoricalChartModel, chartLayout, chartNumberFormatCode, chartSwatch, CHART_PALETTE, formatChartValue, resolveChartLegend, seriesDecimals, } from "@open-slidestudio/pptd-v2";
/** Re-export so mapChart can share the same palette bookkeeping. */
export { chartSwatch };
export const DEFAULT_CHART_PALETTE = CHART_PALETTE;
function chartTitle(el) {
    if (!el.title)
        return undefined;
    if (typeof el.title === "string")
        return el.title;
    if (typeof el.title === "object" && "text" in el.title) {
        return String(el.title.text);
    }
    return undefined;
}
export function mapChartElement(el) {
    const semantic = categoricalChartModel(el);
    const categories = semantic.categories;
    const values = semantic.series.map((series) => series.values);
    const legend = resolveChartLegend(el.legend);
    const secondarySeries = semantic.series.filter((s) => s.axis === "secondary");
    const secondaryScale = secondarySeries.length
        ? alignedSecondaryScale(secondarySeries.flatMap((s) => s.values), semantic.scale)
        : undefined;
    const dataLabelFormatCode = chartNumberFormatCode(Math.max(0, ...values.map((v) => seriesDecimals(v))));
    const series = semantic.series.map((item, index) => ({
        name: item.name,
        labels: categories,
        values: item.values,
        pptxType: item.kind,
        axis: item.axis,
        color: chartSwatch(el, index),
        formatCode: chartNumberFormatCode(seriesDecimals(item.values)),
    }));
    const pptxType = semantic.kind;
    const perCategoryColors = pptxType === "bar" && semantic.series.length === 1 && semantic.orientation === "vertical";
    const colors = pptxType === "pie"
        ? categories.map((_, i) => chartSwatch(el, i, categories.length))
        : perCategoryColors
            ? categories.map((_, i) => chartSwatch(el, i, categories.length))
            : series.map((_, s) => chartSwatch(el, s, series.length));
    const primaryValues = semantic.series
        .filter((series) => series.axis === "primary")
        .flatMap((series) => series.values);
    const secondaryValues = secondarySeries.flatMap((s) => s.values);
    const tickLabels = semantic.scale.ticks.map((t) => formatChartValue(t, semantic.scale.tickDecimals));
    const widestTickLabel = tickLabels.reduce((best, label) => (label.length > best.length ? label : best), "0");
    const secondaryTickLabels = secondaryScale
        ? secondaryScale.ticks.map((t) => formatChartValue(t, secondaryScale.tickDecimals))
        : undefined;
    const widestSecondaryTickLabel = secondaryTickLabels?.reduce((best, label) => (label.length > best.length ? label : best), "0");
    const widestCategoryLabel = categories.reduce((best, label) => (String(label).length > best.length ? String(label) : best), "");
    const legendItems = pptxType === "pie" ? categories : series.map((series) => series.name);
    const bounds = el.bounds;
    const layout = chartLayout({ w: bounds[2], h: bounds[3] }, {
        title: chartTitle(el) ?? "",
        legend,
        legendItems,
        widestTickLabel,
        widestCategoryLabel,
        categoryCount: Math.max(1, categories.length),
        hasSecondaryAxis: Boolean(secondaryScale),
        widestSecondaryTickLabel,
        axis: el.axis,
        reserveBelowLabel: pptxType !== "pie" &&
            semantic.orientation !== "horizontal" &&
            (semantic.scale.min < 0 || (secondaryScale?.min ?? 0) < 0),
    });
    return {
        pptxType,
        barDir: pptxType === "bar"
            ? semantic.orientation === "horizontal"
                ? "bar"
                : "col"
            : undefined,
        categories,
        series,
        colors,
        scale: semantic.scale,
        secondaryScale,
        valueMax: semantic.scale.max,
        primaryValueMax: semantic.scale.max,
        secondaryValueMax: secondaryScale?.max,
        title: chartTitle(el),
        legend,
        showLegend: legend.show,
        showValue: el.labels !== false,
        dataLabelFormatCode,
        perCategoryColors,
        layout,
    };
}
export function hexNoHash(color) {
    return color.replace(/^#/, "").toUpperCase();
}
//# sourceMappingURL=chart-map.js.map