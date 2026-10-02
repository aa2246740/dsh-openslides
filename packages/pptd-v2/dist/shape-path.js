import { canonicalShapeName, SHAPE_BY_NAME } from "./shape-catalog.js";
import { ooxmlShapeGeometry, ooxmlShapePath, } from "./ooxml-geom.js";
/** OOXML adj units: 0–100000 → 0–1. */
export function adjUnit(v, fallback) {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return n / 100000;
}
function pick(adj, i, fallback) {
    const v = adj?.[i];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function poly(pts) {
    return pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ") + " Z";
}
function star(n, inner) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        const r = i % 2 === 0 ? 48 : 48 * inner;
        pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    return poly(pts);
}
function ngon(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        pts.push([50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46]);
    }
    return poly(pts);
}
/**
 * SVG path in viewBox 0 0 100 100.
 * Prefers the ECMA-376 interpreter; falls back to the hand path table.
 */
export function shapePath(shapeName, adjustments) {
    shapeName = canonicalShapeName(shapeName);
    const info = SHAPE_BY_NAME.get(shapeName);
    const adj = adjustments?.length ? adjustments : info?.defaults;
    const oox = ooxmlShapePath(shapeName, adj);
    if (oox)
        return oox;
    const a0 = pick(adj, 0, 50000);
    switch (shapeName) {
        case "rect":
        case "actionButtonBlank":
        case "flowChartProcess":
            return poly([[4, 8], [96, 8], [96, 92], [4, 92]]);
        case "roundRect":
        case "flowChartAlternateProcess":
        case "plaque": {
            const r = 4 + adjUnit(a0, 16667) * 28;
            return `M ${4 + r} 8 H ${96 - r} Q 96 8 96 ${8 + r} V ${92 - r} Q 96 92 ${96 - r} 92 H ${4 + r} Q 4 92 4 ${92 - r} V ${8 + r} Q 4 8 ${4 + r} 8 Z`;
        }
        case "ellipse":
        case "flowChartConnector":
            return "M 50 6 A 44 44 0 1 1 49.9 6 Z";
        case "triangle": {
            const x = 8 + adjUnit(a0, 50000) * 84;
            return poly([[x, 6], [96, 94], [4, 94]]);
        }
        case "rtTriangle":
            return poly([[6, 6], [6, 94], [94, 94]]);
        case "parallelogram": {
            const s = 8 + adjUnit(a0, 25000) * 30;
            return poly([[6 + s, 8], [96, 8], [96 - s, 92], [4, 92]]);
        }
        case "trapezoid": {
            const s = 8 + adjUnit(a0, 25000) * 28;
            return poly([[6 + s, 8], [94 - s, 8], [94, 92], [6, 92]]);
        }
        case "nonIsoscelesTrapezoid":
            return poly([[18, 8], [88, 8], [96, 92], [4, 92]]);
        case "diamond":
        case "flowChartDecision":
            return poly([[50, 4], [96, 50], [50, 96], [4, 50]]);
        case "pentagon":
            return ngon(5);
        case "hexagon":
        case "flowChartPreparation":
            return ngon(6);
        case "heptagon":
            return ngon(7);
        case "octagon":
            return ngon(8);
        case "decagon":
            return ngon(10);
        case "dodecagon":
            return ngon(12);
        case "plus":
        case "mathPlus":
        case "chartPlus": {
            const w = 12 + adjUnit(a0, 25000) * 18;
            return poly([
                [50 - w, 8], [50 + w, 8], [50 + w, 50 - w], [92, 50 - w],
                [92, 50 + w], [50 + w, 50 + w], [50 + w, 92], [50 - w, 92],
                [50 - w, 50 + w], [8, 50 + w], [8, 50 - w], [50 - w, 50 - w],
            ]);
        }
        case "homePlate":
            return poly([[6, 10], [68, 10], [94, 50], [68, 90], [6, 90]]);
        case "chevron":
            return poly([[8, 10], [62, 10], [92, 50], [62, 90], [8, 90], [38, 50]]);
        case "pie":
        case "pieWedge":
            return "M 50 50 L 50 8 A 42 42 0 0 1 88 62 Z";
        case "arc":
            return "M 16 70 A 40 40 0 0 1 84 70";
        case "chord":
            return "M 16 70 A 40 40 0 0 1 84 70 Z";
        case "blockArc":
            return "M 18 72 A 38 38 0 0 1 82 72 L 72 64 A 26 26 0 0 0 28 64 Z";
        case "teardrop":
            return "M 50 8 C 90 8 94 50 70 78 Q 50 96 30 78 C 6 50 10 8 50 8 Z";
        case "frame": {
            const t = 8 + adjUnit(a0, 12500) * 16;
            return `M 6 6 H 94 V 94 H 6 Z M ${6 + t} ${6 + t} V ${94 - t} H ${94 - t} V ${6 + t} Z`;
        }
        case "halfFrame":
            return poly([[8, 8], [92, 8], [92, 28], [28, 28], [28, 92], [8, 92]]);
        case "corner":
            return poly([[8, 8], [92, 8], [92, 28], [28, 28], [28, 92], [8, 92]]);
        case "diagStripe":
            return poly([[8, 70], [70, 8], [92, 8], [8, 92]]);
        case "foldedCorner":
            return "M 8 8 H 92 V 72 L 72 92 H 8 Z M 72 92 V 72 H 92";
        case "donut": {
            const ir = 12 + adjUnit(a0, 25000) * 20;
            return `M 50 6 A 44 44 0 1 1 49.9 6 Z M 50 ${50 - ir} A ${ir} ${ir} 0 1 0 50.1 ${50 - ir} Z`;
        }
        case "noSmoking":
            return "M 50 8 A 40 40 0 1 1 49.9 8 Z M 22 30 L 70 78 M 30 22 L 78 70";
        case "heart":
            return "M 50 88 C 20 64 6 48 6 30 6 16 18 8 30 8 38 8 45 12 50 20 55 12 62 8 70 8 82 8 94 16 94 30 94 48 80 64 50 88 Z";
        case "lightningBolt":
            return poly([[58, 4], [28, 52], [48, 52], [38, 96], [78, 42], [56, 42]]);
        case "sun":
            return star(12, 0.45);
        case "moon": {
            const c = 18 + adjUnit(a0, 50000) * 20;
            return `M 62 10 A 40 40 0 1 0 62 90 A ${c} ${c + 10} 0 1 1 62 10 Z`;
        }
        case "cloud":
            return "M 28 62 C 10 62 10 38 30 36 C 34 20 62 18 68 34 C 88 32 94 54 80 62 C 78 78 40 80 28 62 Z";
        case "smileyFace":
            return "M 50 8 A 40 40 0 1 1 49.9 8 Z M 35 40 A 4 4 0 1 1 34.9 40 Z M 65 40 A 4 4 0 1 1 64.9 40 Z M 32 62 Q 50 78 68 62";
        case "bevel":
            return "M 12 12 H 88 V 88 H 12 Z M 12 12 L 24 24 H 76 L 88 12 M 88 88 L 76 76 V 24 L 88 12 M 12 88 L 24 76 H 76 L 88 88";
        case "can":
            return "M 18 22 C 18 10 82 10 82 22 V 78 C 82 90 18 90 18 78 Z M 18 22 C 18 34 82 34 82 22";
        case "cube":
            return "M 20 28 L 50 10 L 80 28 V 72 L 50 90 L 20 72 Z M 20 28 L 50 46 L 80 28 M 50 46 V 90";
        case "funnel":
            return poly([[18, 10], [82, 10], [58, 48], [58, 90], [42, 90], [42, 48]]);
        case "gear6":
            return star(6, 0.62);
        case "gear9":
            return star(9, 0.62);
        case "wave":
        case "doubleWave":
            return "M 6 50 Q 25 20 44 50 T 82 50 T 98 50 L 98 70 Q 80 90 62 70 T 26 70 T 6 70 Z";
        case "lineInv":
            return "M 8 92 L 92 8";
        case "round1Rect":
            return "M 8 8 H 72 Q 92 8 92 28 V 92 H 8 Z";
        case "round2DiagRect":
            return "M 28 8 H 92 V 72 Q 92 92 72 92 H 8 V 28 Q 8 8 28 8 Z";
        case "round2SameRect":
            return "M 28 8 H 72 Q 92 8 92 28 V 92 H 8 V 28 Q 8 8 28 8 Z";
        case "snip1Rect":
            return poly([[8, 8], [80, 8], [92, 20], [92, 92], [8, 92]]);
        case "snip2DiagRect":
            return poly([[20, 8], [92, 8], [92, 80], [80, 92], [8, 92], [8, 20]]);
        case "snip2SameRect":
            return poly([[20, 8], [80, 8], [92, 20], [92, 92], [8, 92], [8, 20]]);
        case "snipRoundRect":
            return "M 8 28 Q 8 8 28 8 H 80 L 92 20 V 92 H 8 Z";
        case "star4":
            return star(4, adjUnit(a0, 12500) + 0.15);
        case "star5":
        case "chartStar":
            return star(5, adjUnit(a0, 19098) + 0.18);
        case "star6":
            return star(6, adjUnit(a0, 28868) + 0.18);
        case "star7":
            return star(7, adjUnit(a0, 34601) + 0.18);
        case "star8":
            return star(8, adjUnit(a0, 37500) + 0.18);
        case "star10":
            return star(10, adjUnit(a0, 42533) + 0.16);
        case "star12":
            return star(12, adjUnit(a0, 37500) + 0.18);
        case "star16":
            return star(16, adjUnit(a0, 37500) + 0.2);
        case "star24":
            return star(24, adjUnit(a0, 37500) + 0.22);
        case "star32":
            return star(32, adjUnit(a0, 37500) + 0.24);
        case "irregularSeal1":
        case "irregularSeal2":
            return star(11, 0.42);
        case "rightArrow":
            return poly([[6, 36], [58, 36], [58, 18], [94, 50], [58, 82], [58, 64], [6, 64]]);
        case "leftArrow":
            return poly([[94, 36], [42, 36], [42, 18], [6, 50], [42, 82], [42, 64], [94, 64]]);
        case "upArrow":
            return poly([[36, 94], [36, 42], [18, 42], [50, 6], [82, 42], [64, 42], [64, 94]]);
        case "downArrow":
            return poly([[36, 6], [36, 58], [18, 58], [50, 94], [82, 58], [64, 58], [64, 6]]);
        case "leftRightArrow":
            return poly([[6, 50], [28, 22], [28, 40], [72, 40], [72, 22], [94, 50], [72, 78], [72, 60], [28, 60], [28, 78]]);
        case "upDownArrow":
            return poly([[50, 6], [22, 28], [40, 28], [40, 72], [22, 72], [50, 94], [78, 72], [60, 72], [60, 28], [78, 28]]);
        case "quadArrow":
            return poly([[50, 4], [36, 22], [44, 22], [44, 44], [22, 44], [22, 36], [4, 50], [22, 64], [22, 56], [44, 56], [44, 78], [36, 78], [50, 96], [64, 78], [56, 78], [56, 56], [78, 56], [78, 64], [96, 50], [78, 36], [78, 44], [56, 44], [56, 22], [64, 22]]);
        case "notchedRightArrow":
        case "stripedRightArrow":
        case "swooshArrow":
            return poly([[6, 38], [60, 38], [60, 18], [94, 50], [60, 82], [60, 62], [6, 62], [16, 50]]);
        case "bentArrow":
        case "bentUpArrow":
        case "uturnArrow":
            return "M 12 78 H 60 Q 88 78 88 50 Q 88 22 60 22 H 40 V 10 L 16 32 L 40 54 V 42 H 56 Q 70 42 70 50 Q 70 58 56 58 H 12 Z";
        case "circularArrow":
        case "leftCircularArrow":
        case "leftRightCircularArrow":
        case "curvedRightArrow":
        case "curvedLeftArrow":
        case "curvedUpArrow":
        case "curvedDownArrow":
            return "M 20 70 A 32 32 0 1 1 78 42 L 88 34 L 70 28 L 74 48";
        case "leftRightUpArrow":
        case "leftUpArrow":
            return poly([[8, 70], [28, 50], [28, 62], [44, 62], [44, 28], [32, 28], [50, 8], [68, 28], [56, 28], [56, 78], [28, 78], [28, 90]]);
        case "rightArrowCallout":
        case "leftArrowCallout":
        case "upArrowCallout":
        case "downArrowCallout":
        case "leftRightArrowCallout":
        case "upDownArrowCallout":
        case "quadArrowCallout":
            return poly([[8, 28], [58, 28], [58, 16], [92, 50], [58, 84], [58, 72], [8, 72]]);
        case "wedgeRectCallout":
        case "wedgeRoundRectCallout":
        case "wedgeEllipseCallout":
        case "cloudCallout":
        case "borderCallout1":
        case "borderCallout2":
        case "borderCallout3":
        case "accentCallout1":
        case "accentCallout2":
        case "accentCallout3":
        case "accentBorderCallout1":
        case "accentBorderCallout2":
        case "accentBorderCallout3":
        case "callout1":
        case "callout2":
        case "callout3":
            return "M 10 12 H 90 V 68 H 42 L 22 90 L 34 68 H 10 Z";
        case "leftBrace":
            return "M 70 8 Q 30 8 30 28 T 8 50 T 30 72 T 70 92";
        case "rightBrace":
            return "M 30 8 Q 70 8 70 28 T 92 50 T 70 72 T 30 92";
        case "leftBracket":
            return "M 70 8 H 36 V 92 H 70";
        case "rightBracket":
            return "M 30 8 H 64 V 92 H 30";
        case "bracePair":
            return "M 28 8 Q 8 8 8 50 Q 8 92 28 92 M 72 8 Q 92 8 92 50 Q 92 92 72 92";
        case "bracketPair":
            return "M 28 8 H 12 V 92 H 28 M 72 8 H 88 V 92 H 72";
        case "ribbon":
        case "ribbon2":
        case "ellipseRibbon":
        case "ellipseRibbon2":
        case "leftRightRibbon":
            return poly([[8, 38], [20, 50], [8, 62], [78, 62], [92, 50], [78, 38]]);
        case "horizontalScroll":
            return "M 16 28 H 84 Q 96 28 96 40 V 68 Q 96 80 84 80 H 16 Q 4 80 4 68 V 40 Q 4 28 16 28 Z M 16 28 Q 24 20 24 40 V 68";
        case "verticalScroll":
            return "M 28 16 V 84 Q 28 96 40 96 H 68 Q 80 96 80 84 V 16 Q 80 4 68 4 H 40 Q 28 4 28 16 Z";
        case "mathMinus":
            return poly([[12, 42], [88, 42], [88, 58], [12, 58]]);
        case "mathMultiply":
        case "chartX":
        case "flowChartSummingJunction":
            return "M 22 18 L 50 42 L 78 18 L 86 26 L 58 50 L 86 74 L 78 82 L 50 58 L 22 82 L 14 74 L 42 50 L 14 26 Z";
        case "mathDivide":
            return "M 50 18 A 6 6 0 1 1 49.9 18 Z M 14 46 H 86 V 54 H 14 Z M 50 76 A 6 6 0 1 1 49.9 76 Z";
        case "mathEqual":
            return "M 14 34 H 86 V 44 H 14 Z M 14 56 H 86 V 66 H 14 Z";
        case "mathNotEqual":
            return "M 14 34 H 86 V 44 H 14 Z M 14 56 H 86 V 66 H 14 Z M 30 18 L 70 82";
        case "cornerTabs":
        case "squareTabs":
        case "plaqueTabs":
            return "M 8 8 H 28 V 28 H 8 Z M 72 8 H 92 V 28 H 72 Z M 8 72 H 28 V 92 H 8 Z M 72 72 H 92 V 92 H 72 Z";
        case "actionButtonHome":
            return poly([[16, 52], [50, 18], [84, 52], [84, 84], [62, 84], [62, 62], [38, 62], [38, 84], [16, 84]]);
        case "actionButtonHelp":
            return "M 50 8 A 40 40 0 1 1 49.9 8 Z M 40 36 Q 40 24 50 24 Q 62 24 62 36 Q 62 46 50 50 V 60 M 50 72 A 4 4 0 1 1 49.9 72 Z";
        case "actionButtonInformation":
            return "M 50 8 A 40 40 0 1 1 49.9 8 Z M 50 28 A 5 5 0 1 1 49.9 28 Z M 44 42 H 54 V 74 H 44 Z";
        case "actionButtonBackPrevious":
        case "actionButtonBeginning":
            return poly([[72, 20], [28, 50], [72, 80]]);
        case "actionButtonForwardNext":
        case "actionButtonEnd":
            return poly([[28, 20], [72, 50], [28, 80]]);
        case "actionButtonReturn":
            return "M 30 28 H 70 V 48 L 88 36 L 70 70 V 56 H 24 V 28";
        case "actionButtonDocument":
            return poly([[28, 10], [68, 10], [78, 22], [78, 90], [28, 90]]);
        case "actionButtonMovie":
            return poly([[16, 28], [70, 28], [70, 42], [86, 30], [86, 70], [70, 58], [70, 72], [16, 72]]);
        case "actionButtonSound":
            return poly([[18, 40], [36, 40], [54, 24], [54, 76], [36, 60], [18, 60]]) + " M 64 40 Q 78 50 64 60";
        case "flowChartDocument":
            return "M 10 14 H 90 V 72 Q 70 88 50 72 T 10 72 Z";
        case "flowChartMultidocument":
            return "M 18 10 H 86 V 20 H 92 V 76 Q 74 90 56 76 T 18 76 Z M 12 20 H 18 V 82 H 80";
        case "flowChartInputOutput":
        case "flowChartManualOperation":
            return poly([[22, 16], [92, 16], [78, 84], [8, 84]]);
        case "flowChartPredefinedProcess":
            return "M 10 18 H 90 V 82 H 10 Z M 22 18 V 82 M 78 18 V 82";
        case "flowChartInternalStorage":
            return "M 12 16 H 88 V 84 H 12 Z M 12 32 H 88 M 28 16 V 84";
        case "flowChartManualInput":
            return poly([[12, 28], [88, 12], [88, 86], [12, 86]]);
        case "flowChartDelay":
            return "M 16 18 H 62 A 24 32 0 0 1 62 82 H 16 Z";
        case "flowChartTerminator":
            return "M 28 20 H 72 Q 90 20 90 50 Q 90 80 72 80 H 28 Q 10 80 10 50 Q 10 20 28 20 Z";
        case "flowChartOffpageConnector":
            return poly([[16, 12], [84, 12], [84, 68], [50, 90], [16, 68]]);
        case "flowChartPunchedCard":
            return poly([[24, 14], [88, 14], [88, 86], [12, 86], [12, 28]]);
        case "flowChartPunchedTape":
            return "M 10 28 Q 30 12 50 28 T 90 28 V 72 Q 70 88 50 72 T 10 72 Z";
        case "flowChartCollate":
            return poly([[16, 14], [84, 14], [50, 50], [84, 86], [16, 86], [50, 50]]);
        case "flowChartSort":
            return poly([[50, 8], [90, 50], [50, 92], [10, 50]]);
        case "flowChartExtract":
            return poly([[16, 86], [84, 86], [50, 16]]);
        case "flowChartMerge":
            return poly([[16, 16], [84, 16], [50, 86]]);
        case "flowChartOr":
            return "M 50 8 A 40 40 0 1 1 49.9 8 Z M 50 8 V 92 M 10 50 H 90";
        case "flowChartOnlineStorage":
            return "M 22 18 H 78 C 94 18 94 82 78 82 H 22 C 6 82 6 18 22 18 Z";
        case "flowChartMagneticDisk":
        case "flowChartMagneticDrum":
            return "M 18 28 C 18 14 82 14 82 28 V 72 C 82 86 18 86 18 72 Z M 18 28 C 18 42 82 42 82 28";
        case "flowChartMagneticTape":
            return "M 50 16 A 34 34 0 1 1 28 78 L 16 88";
        case "flowChartOfflineStorage":
            return poly([[16, 16], [84, 16], [68, 86], [32, 86]]);
        case "flowChartDisplay":
            return "M 20 20 H 78 L 92 50 L 78 80 H 20 Q 8 80 8 50 Q 8 20 20 20 Z";
        default:
            return poly([[10, 18], [90, 18], [90, 82], [10, 82]]);
    }
}
export function shapeGeometry(shapeName, adjustments) {
    shapeName = canonicalShapeName(shapeName);
    const info = SHAPE_BY_NAME.get(shapeName);
    const adj = adjustments?.length ? adjustments : info?.defaults;
    const oox = ooxmlShapeGeometry(shapeName, adj);
    if (oox)
        return oox;
    return { fill: shapePath(shapeName, adj), stroke: "", handles: [] };
}
export function shapeSvg(shapeName, opts = {}) {
    const d = shapePath(shapeName, opts.adjustments);
    const fill = opts.fill ?? "#2563EB";
    const stroke = opts.stroke ?? "none";
    const sw = opts.strokeWidth ?? 0;
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" fill-rule="evenodd" vector-effect="non-scaling-stroke"/></svg>`;
}
//# sourceMappingURL=shape-path.js.map