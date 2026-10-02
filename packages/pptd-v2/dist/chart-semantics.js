import { niceScale } from "./chart-layout.js";
function categoricalKind(raw) {
    const type = String(raw ?? "bar").trim().toLowerCase();
    if (type === "line" || type === "area" || type === "pie")
        return type;
    return "bar";
}
export function chartKind(input) {
    const raw = String(input.series[0]?.type ?? "bar").trim().toLowerCase();
    if (raw === "line" ||
        raw === "pie" ||
        raw === "area" ||
        raw === "waterfall" ||
        raw === "scatter") {
        return raw;
    }
    return "bar";
}
function columnIndex(input, encodedName, fallback) {
    const encoded = encodedName ? input.data.cols.indexOf(encodedName) : -1;
    if (encoded >= 0)
        return encoded;
    return Math.min(Math.max(0, fallback), Math.max(0, input.data.cols.length - 1));
}
function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
function isNumericColumn(input, index) {
    const populated = input.data.rows
        .map((row) => row[index])
        .filter((value) => value != null && String(value).trim() !== "");
    return (populated.length > 0 &&
        populated.every((value) => Number.isFinite(Number(value))));
}
function encodedColumnIndex(input, encodedName) {
    if (!encodedName)
        return -1;
    return input.data.cols.indexOf(encodedName);
}
/**
 * Resolve category/value columns from the declared chart encoding. A bar with
 * numeric X and categorical Y is horizontal. Other Cartesian charts keep X as
 * the category axis and Y as the value axis. This is the shared data contract
 * for the editor and native PPTX writer.
 */
export function categoricalChartModel(input) {
    const rawKind = chartKind(input);
    const kind = rawKind === "line" || rawKind === "area" || rawKind === "pie"
        ? rawKind
        : "bar";
    const first = input.series[0];
    const cols = input.data.cols;
    const rows = input.data.rows;
    if (kind === "pie") {
        const declaredCategory = encodedColumnIndex(input, first?.encode?.category) >= 0
            ? encodedColumnIndex(input, first?.encode?.category)
            : encodedColumnIndex(input, first?.encode?.x);
        const categoryIndex = declaredCategory >= 0 ? declaredCategory : 0;
        const declaredValue = encodedColumnIndex(input, first?.encode?.value) >= 0
            ? encodedColumnIndex(input, first?.encode?.value)
            : encodedColumnIndex(input, first?.encode?.y);
        const valueIndex = declaredValue >= 0
            ? declaredValue
            : cols.findIndex((_, index) => index !== categoryIndex && isNumericColumn(input, index));
        const safeValueIndex = valueIndex >= 0 ? valueIndex : Math.min(1, Math.max(0, cols.length - 1));
        const values = rows.map((row) => finiteNumber(row[safeValueIndex]));
        return {
            kind,
            orientation: "vertical",
            categories: rows.map((row) => String(row[categoryIndex] ?? "")),
            series: [
                {
                    name: first?.name ?? cols[safeValueIndex] ?? "值",
                    values,
                    kind: "pie",
                    axis: first?.axis ?? "primary",
                },
            ],
            valueMax: Math.max(1, ...values),
            scale: niceScale(values.filter((v) => v > 0).length ? values : [1], {
                includeZero: true,
            }),
        };
    }
    const declaredX = encodedColumnIndex(input, first?.encode?.x);
    const declaredY = encodedColumnIndex(input, first?.encode?.y);
    const xIndex = declaredX >= 0 ? declaredX : 0;
    const fallbackY = cols.findIndex((_, index) => index !== xIndex && isNumericColumn(input, index));
    const yIndex = declaredY >= 0 ? declaredY : fallbackY >= 0 ? fallbackY : Math.min(1, Math.max(0, cols.length - 1));
    const orientation = kind === "bar" && isNumericColumn(input, xIndex) && !isNumericColumn(input, yIndex)
        ? "horizontal"
        : "vertical";
    const categoryIndex = orientation === "horizontal" ? yIndex : xIndex;
    const valueKey = orientation === "horizontal" ? "x" : "y";
    const numericCandidates = cols
        .map((_, index) => index)
        .filter((index) => index !== categoryIndex && isNumericColumn(input, index));
    const definitions = input.series.length === 1 &&
        encodedColumnIndex(input, input.series[0]?.encode?.[valueKey]) < 0 &&
        numericCandidates.length > 1
        ? numericCandidates.map((index) => ({
            name: cols[index],
            valueIndex: index,
            kind: categoricalKind(first?.type),
            axis: first?.axis ?? "primary",
        }))
        : input.series.map((series, seriesIndex) => {
            const declared = encodedColumnIndex(input, series.encode?.[valueKey]);
            const valueIndex = declared >= 0
                ? declared
                : numericCandidates[seriesIndex] ?? numericCandidates[0] ?? yIndex;
            return {
                name: series.name ?? cols[valueIndex] ?? `系列${seriesIndex + 1}`,
                valueIndex,
                kind: categoricalKind(series.type),
                axis: series.axis ?? "primary",
            };
        });
    const safeDefinitions = definitions.length
        ? definitions
        : numericCandidates.map((index) => ({
            name: cols[index],
            valueIndex: index,
            kind: categoricalKind(first?.type),
            axis: first?.axis ?? "primary",
        }));
    const series = safeDefinitions.map((definition) => ({
        name: definition.name ?? "值",
        values: rows.map((row) => finiteNumber(row[definition.valueIndex])),
        kind: definition.kind,
        axis: definition.axis,
    }));
    const allValues = series.flatMap((item) => item.values);
    const scale = niceScale(allValues, { includeZero: true });
    return {
        kind,
        orientation,
        categories: rows.map((row) => String(row[categoryIndex] ?? "")),
        series,
        valueMax: scale.max,
        scale,
    };
}
function isTruthyTotal(value) {
    if (value === true || value === 1)
        return true;
    if (typeof value !== "string")
        return false;
    return /^(1|true|yes|y|total|subtotal|合计|小计)$/i.test(value.trim());
}
function nearlyEqual(left, right) {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= scale * 0.000_001;
}
function looksLikeSubtotal(label) {
    return /净额|净增|净减|小计|subtotal/i.test(label);
}
/**
 * Build one deterministic waterfall interpretation for both the editor and
 * PPTX writer. First/last rows are totals. Explicit `encode.isTotal` rows are
 * totals. A labelled subtotal whose value equals the preceding signed deltas
 * is displayed from the block base without changing the running balance.
 */
export function waterfallChartModel(input) {
    const series = input.series[0];
    const categoryIndex = columnIndex(input, series?.encode?.x, 0);
    const valueIndex = columnIndex(input, series?.encode?.y, categoryIndex === 0 ? 1 : 0);
    const totalName = series?.encode?.isTotal;
    const totalIndex = totalName ? input.data.cols.indexOf(totalName) : -1;
    const rows = input.data.rows;
    const bars = [];
    let running = 0;
    let blockBase = 0;
    let blockDelta = 0;
    rows.forEach((row, index) => {
        const label = String(row[categoryIndex] ?? "");
        const value = finiteNumber(row[valueIndex]);
        const first = index === 0;
        const last = index === rows.length - 1;
        const explicitTotal = totalIndex >= 0 && isTruthyTotal(row[totalIndex]);
        const derivedSubtotal = !first &&
            !last &&
            looksLikeSubtotal(label) &&
            nearlyEqual(value, blockDelta);
        if (first) {
            bars.push({ label, value, start: 0, end: value, kind: "total" });
            running = value;
            blockBase = running;
            blockDelta = 0;
            return;
        }
        if (last) {
            bars.push({ label, value, start: 0, end: value, kind: "total" });
            running = value;
            return;
        }
        if (derivedSubtotal) {
            bars.push({
                label,
                value,
                start: blockBase,
                end: blockBase + value,
                kind: "subtotal",
            });
            return;
        }
        if (explicitTotal) {
            bars.push({ label, value, start: 0, end: value, kind: "total" });
            running = value;
            blockBase = running;
            blockDelta = 0;
            return;
        }
        const start = running;
        running += value;
        blockDelta += value;
        bars.push({
            label,
            value,
            start,
            end: running,
            kind: value >= 0 ? "increase" : "decrease",
        });
    });
    // A waterfall's readable domain spans the floating deltas plus the total
    // endpoints — never the totals' internal zero-start anchors. A margin
    // bridge from 37.5 to 37.8 on a 0-based axis turns its ±1 steps into
    // unreadable slivers pinned at the top of the plot area. Total columns are
    // allowed to clip at the axis floor; they stay readable as anchors.
    const floats = bars
        .filter((bar) => bar.kind !== "total")
        .flatMap((bar) => [bar.start, bar.end]);
    const ends = bars.filter((bar) => bar.kind === "total").map((bar) => bar.end);
    if (!floats.length && !ends.length) {
        return { bars, valueMin: 0, valueMax: 1, scale: niceScale([0, 1]) };
    }
    const scale = niceScale([...floats, ...ends]);
    return { bars, valueMin: scale.min, valueMax: scale.max, scale };
}
/** Build an XY model from `series[0].encode.x/y`, never from column order alone. */
export function scatterChartModel(input) {
    const series = input.series[0];
    const xIndex = columnIndex(input, series?.encode?.x, 1);
    const yIndex = columnIndex(input, series?.encode?.y, 2);
    let labelIndex = 0;
    if (labelIndex === xIndex || labelIndex === yIndex) {
        labelIndex = input.data.cols.findIndex((_, index) => index !== xIndex && index !== yIndex);
    }
    const points = input.data.rows.map((row, index) => ({
        label: labelIndex >= 0 ? String(row[labelIndex] ?? `P${index + 1}`) : `P${index + 1}`,
        x: finiteNumber(row[xIndex]),
        y: finiteNumber(row[yIndex]),
    }));
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const xScale = niceScale(xValues);
    const yScale = niceScale(yValues);
    return {
        xName: input.data.cols[xIndex] ?? series?.encode?.x ?? "X",
        yName: input.data.cols[yIndex] ?? series?.encode?.y ?? "Y",
        points,
        xMin: xScale.min,
        xMax: xScale.max,
        yMin: yScale.min,
        yMax: yScale.max,
        xScale,
        yScale,
    };
}
/** Greedy deterministic label placement shared by the DOM and PPTX renderers. */
export function placeScatterLabels(points, bounds, fontSize = 9) {
    const occupied = [];
    return points.map((point) => {
        const labelWidth = Math.max(fontSize * 2.7, Array.from(point.label).length * fontSize);
        const rightSide = point.x > bounds.left + (bounds.right - bounds.left) * 0.62;
        const nearTop = point.y < bounds.top + fontSize * 3.3;
        const horizontal = rightSide
            ? [
                { dx: -fontSize, anchor: "end" },
                { dx: fontSize, anchor: "start" },
            ]
            : [
                { dx: fontSize, anchor: "start" },
                { dx: -fontSize, anchor: "end" },
            ];
        const vertical = nearTop
            ? [fontSize * 1.9, -fontSize, fontSize * 3.2, -fontSize * 2.3]
            : [-fontSize, fontSize * 1.9, -fontSize * 2.3, fontSize * 3.2];
        const candidates = horizontal.flatMap((hPos) => vertical.map((dy) => ({ ...hPos, dy })));
        const scored = candidates.map((candidate) => {
            const textX = point.x + candidate.dx;
            const baseline = point.y + candidate.dy;
            const left = candidate.anchor === "end" ? textX - labelWidth : textX;
            const box = {
                left,
                top: baseline - fontSize * 1.1,
                right: left + labelWidth,
                bottom: baseline + fontSize * 0.25,
            };
            const outside = box.left < bounds.left ||
                box.right > bounds.right ||
                box.top < bounds.top ||
                box.bottom > bounds.bottom
                ? 10_000
                : 0;
            const overlap = occupied.reduce((sum, other) => {
                const inset = fontSize / 3;
                const width = Math.max(0, Math.min(box.right, other.right + inset) -
                    Math.max(box.left, other.left - inset));
                const height = Math.max(0, Math.min(box.bottom, other.bottom + inset) -
                    Math.max(box.top, other.top - inset));
                return sum + width * height;
            }, 0);
            const pointHits = points.reduce((sum, other) => {
                if (other === point)
                    return sum;
                const pad = fontSize * 0.55;
                const inside = other.x >= box.left - pad &&
                    other.x <= box.right + pad &&
                    other.y >= box.top - pad &&
                    other.y <= box.bottom + pad;
                return sum + (inside ? 500 : 0);
            }, 0);
            return { ...candidate, textX, baseline, box, score: outside + overlap + pointHits };
        });
        scored.sort((left, right) => left.score - right.score);
        const choice = scored[0];
        occupied.push(choice.box);
        return {
            label: point.label,
            pointX: point.x,
            pointY: point.y,
            textX: choice.textX,
            baseline: choice.baseline,
            anchor: choice.anchor,
            box: choice.box,
        };
    });
}
//# sourceMappingURL=chart-semantics.js.map