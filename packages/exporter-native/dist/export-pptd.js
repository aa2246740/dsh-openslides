import fs from "node:fs";
import path from "node:path";
import pptxgenjs from "pptxgenjs";
import { loadProject, chartKind, canonicalShapeName, placeScatterLabels, parseRichText, resolveTextStyle, scatterChartModel, colorAlpha, elementFillPaint, toRgbHex, waterfallChartModel, CHART_FONT_FACE, CHART_GRID, CHART_INK, CHART_TEXT_PX, chartLayout, chartZeroHiddenFormatCode, formatChartValue, resolveChartLegend, } from "@open-slidestudio/pptd-v2";
import { chartSwatch, hexNoHash, mapChartElement } from "./chart-map.js";
import { buildEmbeddedFonts, embedFontsIntoPptx, } from "./font-embed.js";
export const HARD_DEGRADATION_KINDS = [
    "missing-image",
    "error",
    "chart-export-failed",
    "line-geometry",
    "full-page-raster",
];
export function validateExportReport(raw, options = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, reason: "export report is not an object" };
    }
    const report = raw;
    if (report.ok !== true) {
        return { ok: false, reason: "export report.ok is not true" };
    }
    if (typeof report.slideCount !== "number" || !Number.isFinite(report.slideCount)) {
        return { ok: false, reason: "export report slideCount is missing or invalid" };
    }
    const minSlides = options.minSlideCount ?? 1;
    if (report.slideCount < minSlides) {
        return {
            ok: false,
            reason: `export report slideCount ${report.slideCount} is less than required ${minSlides}`,
        };
    }
    if (typeof report.bytes !== "number" || !Number.isFinite(report.bytes) || report.bytes <= 0) {
        return { ok: false, reason: "export report bytes is zero or invalid" };
    }
    if (Array.isArray(report.editDataCharts?.failed) && report.editDataCharts.failed.length > 0) {
        return {
            ok: false,
            reason: `export report has failed editDataCharts: ${report.editDataCharts.failed.join(", ")}`,
        };
    }
    if (Array.isArray(report.degradations)) {
        for (const d of report.degradations) {
            if (HARD_DEGRADATION_KINDS.includes(d.kind) ||
                /full-page|raster slide|screenshot slide/i.test(d.reason ?? "")) {
                return {
                    ok: false,
                    reason: `hard degradation in slide ${d.slideIndex} (${d.kind}): ${d.reason}`,
                    hardDegradation: d,
                };
            }
        }
    }
    return { ok: true, report };
}
function createPptx() {
    const mod = pptxgenjs;
    const Ctor = typeof mod === "function" ? mod : mod.default;
    return new Ctor();
}
function hex(color, theme) {
    return toRgbHex(color, theme).replace("#", "");
}
function pageSurfaceColor(page, theme, size) {
    const backdrop = page.elements.find((element) => {
        if (element.elementType !== "shape")
            return false;
        const [x, y, width, height] = element.bounds;
        return x <= 0 && y <= 0 && width >= size[0] && height >= size[1];
    });
    if (backdrop?.elementType === "shape") {
        const color = exportedFillColor(backdrop.fill, theme);
        if (color)
            return color;
    }
    const color = exportedFillColor(page.background, theme);
    if (color)
        return color;
    return "#FFFFFF";
}
/**
 * Surface contrast uses the first gradient stop, matching canvas paint.
 * A dark overlay must still count as a dark page for exported chart ink.
 */
function exportedFillColor(fill, theme) {
    const paint = elementFillPaint("shape", fill, undefined, theme);
    return paint.type === "solid" ? paint.hex : undefined;
}
function isDarkHex(color) {
    const value = color.replace(/^#/, "");
    if (!/^[0-9A-F]{6}$/i.test(value))
        return false;
    const red = Number.parseInt(value.slice(0, 2), 16) / 255;
    const green = Number.parseInt(value.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
    const linear = (channel) => channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    return luminance < 0.24;
}
function ooxmlStopPos(position, index, count) {
    if (typeof position === "number" && Number.isFinite(position)) {
        if (position >= 0 && position <= 1)
            return Math.round(position * 100000);
        if (position > 1 && position <= 100000)
            return Math.round(position);
    }
    return Math.round((index / Math.max(1, count - 1)) * 100000);
}
function encodeXmlName(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function mapGradientStops(stops, theme, opacity) {
    const elementOpacity = opacity == null || Number.isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
    return stops.map((stop, index) => {
        const raw = String(stop.color ?? "#000000");
        const stopAlpha = (colorAlpha(raw, theme) ?? 1) * elementOpacity;
        return {
            pos: ooxmlStopPos(stop.position, index, stops.length),
            color: toRgbHex(raw, theme).replace("#", ""),
            alpha: stopAlpha >= 0.995 ? undefined : Math.round(stopAlpha * 100000),
        };
    });
}
function solidFromPaint(fill, theme, opacity, elementType) {
    const paint = elementFillPaint(elementType, fill, opacity, theme);
    if (paint.type === "none")
        return undefined;
    return {
        color: paint.hex.replace("#", ""),
        transparency: paint.alpha < 0.995 ? Math.round((1 - paint.alpha) * 100) : undefined,
    };
}
function fillToPptx(fill, theme, deg, slideIndex, elementId, opacity, elementType = "shape") {
    const loose = fill;
    if (loose?.type === "image") {
        deg.push({
            slideIndex,
            elementId,
            kind: "image-fill-as-solid",
            reason: "fill not fully mapped; solid placeholder",
        });
        return { type: "solid", color: "E5E7EB" };
    }
    if (loose?.type === "gradient") {
        const stops = Array.isArray(loose.stops) ? loose.stops : [];
        if (elementType === "shape" && stops.length >= 2) {
            const mappedStops = mapGradientStops(stops, theme, opacity);
            const fallback = solidFromPaint(fill, theme, opacity, elementType) ?? {
                color: mappedStops[0].color,
            };
            return {
                type: "gradient",
                gradientType: loose.gradientType === "radial" ? "radial" : "linear",
                angle: typeof loose.angle === "number" && Number.isFinite(loose.angle) ? loose.angle : 0,
                stops: mappedStops,
                fallback,
            };
        }
        deg.push({
            slideIndex,
            elementId,
            kind: "gradient-as-solid",
            reason: "gradient collapsed to first stop; 8-digit alpha kept as transparency",
        });
    }
    const solid = solidFromPaint(fill, theme, opacity, elementType);
    if (!solid)
        return { type: "none" };
    return { type: "solid", ...solid };
}
function pptxSolidFill(fill) {
    if (fill.type === "none")
        return undefined;
    if (fill.type === "gradient") {
        return {
            type: "solid",
            color: fill.fallback.color,
            transparency: fill.fallback.transparency,
        };
    }
    return {
        type: "solid",
        color: fill.color,
        transparency: fill.transparency,
    };
}
function pptxInk(fill, fallback = "FFFFFF") {
    if (fill.type === "none")
        return fallback;
    if (fill.type === "gradient")
        return fill.fallback.color;
    return fill.color;
}
function ooxmlGradientFill(fill) {
    const stops = fill.stops
        .map((stop) => {
        const color = stop.alpha == null
            ? `<a:srgbClr val="${stop.color}"/>`
            : `<a:srgbClr val="${stop.color}"><a:alpha val="${stop.alpha}"/></a:srgbClr>`;
        return `<a:gs pos="${stop.pos}">${color}</a:gs>`;
    })
        .join("");
    const shade = fill.gradientType === "radial"
        ? `<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>`
        : `<a:lin ang="${Math.round(fill.angle * 60000)}" scaled="1"/>`;
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`;
}
function patchShapeGradient(xml, objectName, fill) {
    const name = encodeXmlName(objectName);
    const chunks = xml.split(/(?=<p:sp>)/);
    let found = false;
    const next = chunks.map((chunk) => {
        if (!chunk.startsWith("<p:sp>"))
            return chunk;
        const nv = chunk.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? "";
        if (!nv.includes(`name="${name}"`))
            return chunk;
        const grad = ooxmlGradientFill(fill);
        const patched = chunk.replace(/(<a:(?:prstGeom|custGeom)\b[\s\S]*?<\/a:(?:prstGeom|custGeom)>)(<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:noFill\/>)/, `$1${grad}`);
        if (patched === chunk) {
            throw new Error(`gradient overlay ${objectName} has no shape fill to patch`);
        }
        found = true;
        return patched;
    });
    if (!found)
        throw new Error(`gradient overlay ${objectName} missing from slide xml`);
    return next.join("");
}
/**
 * Insert or replace the <a:srcRect> inside the named <p:pic>'s blipFill.
 * pptxgenjs writes one itself when `sizing` is used, so replace whatever is
 * there — a second srcRect would corrupt the part.
 */
function patchImageSrcRect(xml, objectName, crop) {
    const name = encodeXmlName(objectName);
    const chunks = xml.split(/(?=<p:pic>)/);
    let found = false;
    const attr = (v) => `="${Math.round(Math.max(0, Math.min(1, v)) * 100000)}"`;
    const srcRect = `<a:srcRect l${attr(crop.l)} t${attr(crop.t)} r${attr(crop.r)} b${attr(crop.b)}/>`;
    const next = chunks.map((chunk) => {
        if (!chunk.startsWith("<p:pic>"))
            return chunk;
        const nv = chunk.match(/<p:cNvPr\b[^>]*\/?>/)?.[0] ?? "";
        if (!nv.includes(`name="${name}"`))
            return chunk;
        let patched = chunk;
        if (/<a:srcRect\b[^>]*\/>/.test(patched)) {
            patched = patched.replace(/<a:srcRect\b[^>]*\/>/, srcRect);
        }
        else {
            patched = patched.replace(/(<a:blip\b[\s\S]*?)(<a:stretch>)/, `$1${srcRect}$2`);
        }
        if (patched === chunk) {
            throw new Error(`image srcRect ${objectName} has no blipFill to patch`);
        }
        found = true;
        return patched;
    });
    if (!found)
        throw new Error(`image ${objectName} missing from slide xml`);
    return next.join("");
}
/** Rewind docProps timestamps so identical input exports byte-identically. */
function patchCoreTimestamps(xml) {
    const epoch = "2000-01-01T00:00:00Z";
    return xml
        .replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g, `$1${epoch}$2`);
}
/** Escape an XML attribute value the same way pptxgenjs does. */
function xmlAttr(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
/**
 * pptxgenjs takes one fontFace, so a pair travels as `latin***ea`. It then
 * writes that string onto `<a:latin>`, and sometimes onto `<a:ea>` / `<a:cs>`
 * as well, with extra attributes such as pitchFamily. Rewrite each tag in
 * place: latin and cs keep the Latin face, ea keeps the East Asian face.
 * When a rewritten latin tag has no ea sibling yet, insert one. A face
 * without the marker is left untouched.
 */
function splitFontMarkers(xml) {
    const withLatin = xml.replace(/<a:latin\b([^>]*?)typeface="([^"]*)\*\*\*([^"]*)"([^>]*?)\/>/g, (full, before, latin, ea, after, offset, source) => {
        const rest = source.slice(offset + full.length, offset + full.length + 500);
        const end = rest.search(/<\/a:(?:defRPr|rPr|endParaRPr)>/);
        const scope = end >= 0 ? rest.slice(0, end) : rest;
        let extra = "";
        if (!/<a:ea\b/.test(scope))
            extra += `<a:ea typeface="${ea || latin}"/>`;
        if (!/<a:cs\b/.test(scope))
            extra += `<a:cs typeface="${latin}"/>`;
        return `<a:latin${before}typeface="${latin}"${after}/>${extra}`;
    });
    return withLatin.replace(/<a:(ea|cs)\b([^>]*?)typeface="([^"]*)\*\*\*([^"]*)"([^>]*?)\/>/g, (_full, tag, before, latin, ea, after) => `<a:${tag}${before}typeface="${tag === "ea" ? ea || latin : latin}"${after}/>`);
}
function patchChartFonts(xml) {
    return splitFontMarkers(xml);
}
function patchSlideFonts(xml) {
    return splitFontMarkers(xml);
}
/**
 * pptxgenjs writes one chart-level `dataLabelFormatCode` under each series'
 * `dLbls`. Per-series precision differs (0.091 vs 8.641 in the same chart), so
 * rewrite each `<c:ser>`'s `dLbls/numFmt` with the series' own format code.
 */
function patchSeriesFormatCodes(xml, formatCodes) {
    let index = 0;
    return xml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, body) => {
        const code = formatCodes[index];
        index += 1;
        if (!code)
            return match;
        const replaced = body.replace(/<c:dLbls>([\s\S]*?)<\/c:dLbls>/, (block, inner) => `<c:dLbls>${inner.replace(/<c:numFmt formatCode="[^"]*" sourceLinked="0"\/>/, `<c:numFmt formatCode="${xmlAttr(code)}" sourceLinked="0"/>`)}</c:dLbls>`);
        return `<c:ser>${replaced}</c:ser>`;
    });
}
/**
 * Pptxgenjs never writes a legend manualLayout, so PowerPoint drops the
 * legend wherever it wants. Inject the shared layout rect so legend position
 * matches the canvas, right after `<c:legendPos>` per the schema.
 */
function patchLegendLayout(xml, patch) {
    if (!patch.legend?.layout)
        return xml;
    const { x, y, w, h } = patch.legend.layout;
    const manual = `<c:layout><c:manualLayout>` +
        `<c:layoutTarget val="outer"/>` +
        `<c:xMode val="edge"/><c:yMode val="edge"/>` +
        `<c:x val="${x.toFixed(6)}"/><c:y val="${y.toFixed(6)}"/>` +
        `<c:w val="${w.toFixed(6)}"/><c:h val="${h.toFixed(6)}"/>` +
        `</c:manualLayout></c:layout>`;
    // CT_Legend: legendPos → legendEntry → layout → overlay → txPr …
    return xml.replace(/<c:legend>([\s\S]*?)<\/c:legend>/, (match, inner) => inner.includes("<c:layout>")
        ? match
        : `<c:legend>${inner.replace(/(<c:legendPos val="[a-z]+"\/>)/, `$1${manual}`)}</c:legend>`);
}
/**
 * Pie labels: the canvas renders "name pct%". pptxgenjs only writes
 * `showCatName`/`showPercent`; without a separator PowerPoint jams them.
 */
function patchPieSeparator(xml) {
    return xml.replace(/(<c:showPercent val="1"\/>)/g, `$1<c:separator val=" "/>`);
}
/**
 * Horizontal bars use a `maxMin` category axis; PowerPoint then pins the
 * value axis to the top unless the value axis crosses at max.
 */
function patchHorizontalBarCrossing(xml) {
    return xml.replace(/<c:valAx>([\s\S]*?)<\/c:valAx>/g, (match) => match.includes("<c:crosses")
        ? match.replace(/<c:crosses val="[^"]*"\/>/, '<c:crosses val="max"/>')
        : match.replace(/(<c:axId[^/]*\/>)/, `$1<c:crosses val="max"/>`));
}
/**
 * The canvas draws bar labels just past the bar end and line labels above the
 * point. OOXML allows `outEnd` on clustered bars (not stacked), but the
 * pptxgenjs 3.12 validator has that rule inverted and drops `outEnd` from
 * clustered bars, so the chart is generated with `inEnd` and corrected here.
 * Line labels get `t`; pptxgenjs writes none for a standalone line (PowerPoint
 * then defaults to the right) and the shared combo position for a combo line.
 */
function patchDataLabelPositions(xml) {
    const setPos = (block, pos) => block.replace(/<c:dLbls>([\s\S]*?)<\/c:dLbls>/g, (_match, inner) => {
        const next = /<c:dLblPos val="[^"]*"\/>/.test(inner)
            ? inner.replace(/<c:dLblPos val="[^"]*"\/>/, `<c:dLblPos val="${pos}"/>`)
            : inner.replace(/(\s*<c:showLegendKey)/, `<c:dLblPos val="${pos}"/>$1`);
        return `<c:dLbls>${next}</c:dLbls>`;
    });
    return xml
        .replace(/<c:barChart>[\s\S]*?<\/c:barChart>/g, (block) => /<c:grouping val="clustered"\/>/.test(block) ? setPos(block, "outEnd") : block)
        .replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/g, (block) => setPos(block, "t"));
}
/** Apply every chart patch to `ppt/charts/chart*.xml`, in slide order. */
async function patchChartXml(zip, charts) {
    if (!charts.length)
        return;
    // pptxgenjs names chart parts chart1.xml…chartN.xml in addChart order.
    // A stacked waterfall can be split into two chart parts for one call, so
    // the part count may exceed the call count. The slide-order pairing still
    // holds: walk parts in the same order as `charts` and reuse the last
    // pending patch for any extra part belonging to the same call.
    const partNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/chart(\d+)\.xml/)?.[1]) -
        Number(b.match(/chart(\d+)\.xml/)?.[1]));
    if (partNames.length < charts.length) {
        throw new Error(`native exporter: expected at least ${charts.length} chart parts, found ${partNames.length}`);
    }
    // Pair each part to the chart whose series names it contains. A split
    // stacked chart shares names across its parts, so the first matching
    // unconsumed patch wins and stays available for the extra part.
    const pending = charts.map((patch) => ({ patch, matched: false }));
    for (const [index, rel] of partNames.entries()) {
        const file0 = zip.file(rel);
        if (!file0)
            continue;
        const preview = await file0.async("string");
        const owner = pending.find((entry) => !entry.matched &&
            entry.patch.seriesNames.some((name) => preview.includes(xmlAttr(name)))) ?? pending.find((entry) => entry.matched);
        const patch = owner?.patch ?? charts[Math.min(index, charts.length - 1)];
        if (owner && !owner.matched)
            owner.matched = true;
        const file = zip.file(rel);
        if (!file) {
            throw new Error(`native exporter: ${rel} missing while patching ${patch.elementId}`);
        }
        let xml = await file.async("string");
        xml = patchChartFonts(xml);
        xml = patchSeriesFormatCodes(xml, patch.seriesFormatCodes);
        xml = patchLegendLayout(xml, patch);
        xml = patchDataLabelPositions(xml);
        if (patch.pie)
            xml = patchPieSeparator(xml);
        if (patch.barHorizontal)
            xml = patchHorizontalBarCrossing(xml);
        zip.file(rel, xml);
    }
}
async function postProcessPptx(buffer, patches) {
    const gradients = patches.gradients ?? [];
    const srcRects = patches.srcRects ?? [];
    const charts = patches.charts ?? [];
    if (gradients.length === 0 &&
        srcRects.length === 0 &&
        charts.length === 0 &&
        !patches.fixedTimestamps &&
        !patches.slideFonts) {
        return buffer;
    }
    const { default: JSZipCtor } = await import("jszip");
    const zip = await JSZipCtor.loadAsync(buffer);
    const bySlide = new Map();
    const bucket = (slideIndex) => {
        let entry = bySlide.get(slideIndex);
        if (!entry) {
            entry = { gradients: [], srcRects: [] };
            bySlide.set(slideIndex, entry);
        }
        return entry;
    };
    for (const patch of gradients)
        bucket(patch.slideIndex).gradients.push(patch);
    for (const patch of srcRects)
        bucket(patch.slideIndex).srcRects.push(patch);
    for (const [slideIndex, slidePatches] of bySlide) {
        const rel = `ppt/slides/slide${slideIndex + 1}.xml`;
        const file = zip.file(rel);
        if (!file) {
            throw new Error(`native exporter: ${rel} missing while patching slides`);
        }
        let xml = await file.async("string");
        for (const patch of slidePatches.gradients) {
            xml = patchShapeGradient(xml, patch.objectName, patch.fill);
        }
        for (const patch of slidePatches.srcRects) {
            xml = patchImageSrcRect(xml, patch.objectName, patch.crop);
        }
        xml = patchSlideFonts(xml);
        zip.file(rel, xml);
    }
    const slideParts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    for (const rel of slideParts) {
        if (bySlide.has(Number(rel.match(/slide(\d+)\.xml/)?.[1]) - 1))
            continue;
        const file = zip.file(rel);
        if (!file)
            continue;
        zip.file(rel, patchSlideFonts(await file.async("string")));
    }
    if (charts.length) {
        await patchChartXml(zip, charts);
    }
    if (patches.fixedTimestamps) {
        const core = zip.file("docProps/core.xml");
        if (core)
            zip.file("docProps/core.xml", patchCoreTimestamps(await core.async("string")));
    }
    for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir)
            delete zip.files[name];
    }
    return zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
    });
}
/**
 * PPTD fontFamily resolves to a `{latin, ea}` pair. pptxgenjs takes one
 * fontFace, so the pair travels as a `latin***ea` marker and `splitFontMarkers`
 * splits it into `<a:latin>` and `<a:ea>` after the package is built.
 * Characters that would break the XML attribute, or that pptxgenjs reads as
 * a body/heading separator, are stripped from both names.
 */
function singleFontFace(family) {
    if (!family)
        return undefined;
    const pair = typeof family === "string" ? { latin: family, ea: family } : family;
    const clean = (name) => name.replace(/[<>&"'|*]/g, "").trim().slice(0, 64);
    const latin = clean(pair.latin);
    const ea = clean(pair.ea);
    if (!latin && !ea)
        return undefined;
    return `${latin}***${ea || latin}`;
}
function pxToIn(px, slidePx, slideIn) {
    return (px / slidePx) * slideIn;
}
function cssPxToPt(px) {
    return (px * 72) / 96;
}
function isMicroscopicHiddenChart(element) {
    if (element.elementType !== "chart")
        return false;
    const [, , width, height] = element.bounds;
    return width <= 4 && height <= 4 && (element.opacity ?? 1) <= 0.05;
}
function mapText(slide, el, theme, size, layout) {
    const [x, y, w, h] = el.bounds;
    const st = resolveTextStyle(el.content ?? { text: "" }, theme);
    const lineFontSizePx = Math.max(st.fontSize, ...st.runs.map((run) => run.fontSize ?? st.fontSize));
    const opts = {
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: pxToIn(w, size[0], layout.w),
        h: pxToIn(h, size[1], layout.h),
        fontSize: cssPxToPt(st.fontSize),
        color: hex(st.colorHex, theme),
        bold: st.bold,
        italic: st.italic,
        align: st.align[0] ?? "left",
        valign: st.align[1] ?? "top",
        wrap: st.wrap,
        // PPTD bounds match the native canvas content box. PowerPoint otherwise
        // applies its own insets and wraps short labels/numbers that fit in CSS.
        margin: 0,
        // Browser and Office font metrics are not byte-identical. Keep the
        // authored bounds authoritative and let the target renderer reduce text
        // only when its own wrapping would otherwise escape the box.
        fit: "shrink",
        // OOXML percentage spacing multiplies Office's own font leading, so a
        // CSS 1.2 line-height becomes visibly taller than 1.2. Use the authored
        // CSS line box as an absolute point value instead.
        lineSpacing: cssPxToPt(lineFontSizePx * st.lineHeight),
        underline: st.underline ? { style: "sng" } : undefined,
    };
    const face = singleFontFace(st.fontFamily);
    if (face)
        opts.fontFace = face;
    if (st.letterSpacing)
        opts.charSpacing = cssPxToPt(st.letterSpacing);
    if (st.list === "number")
        opts.bullet = { type: "number" };
    else if (st.list === "bullet")
        opts.bullet = true;
    if (st.href)
        opts.hyperlink = { url: st.href };
    const runs = parseRichText(el.content?.text ?? "");
    const styledRuns = [];
    for (const run of runs) {
        const runOptions = {
            fontSize: cssPxToPt(run.fontSize ?? st.fontSize),
            color: hex(run.color ?? st.colorHex, theme),
            bold: run.bold ?? st.bold,
            italic: run.italic ?? st.italic,
            fontFace: face,
            charSpacing: st.letterSpacing ? cssPxToPt(st.letterSpacing) : undefined,
            underline: (run.underline ?? st.underline)
                ? { style: "sng" }
                : undefined,
        };
        const parts = run.text.split("\n");
        parts.forEach((text, index) => {
            if (index > 0 && styledRuns.length === 0) {
                styledRuns.push({ text: "", options: runOptions });
            }
            styledRuns.push({
                text,
                options: {
                    ...runOptions,
                    // CSS `white-space: pre-wrap` treats LF as a line break inside the
                    // same block. PptxGenJS otherwise turns every LF into a paragraph,
                    // whose target-renderer metrics can overflow the authored box.
                    softBreakBefore: index > 0,
                },
            });
        });
    }
    const needsRuns = runs.length > 1 ||
        st.text.includes("\n") ||
        Boolean(runs[0] && (runs[0].fontSize || runs[0].color));
    if (needsRuns && !st.list) {
        slide.addText(styledRuns, opts);
        return;
    }
    slide.addText(st.text, opts);
}
function mapShape(slide, nativeShapeTypes, el, theme, size, layout, deg, slideIndex, gradientPatches) {
    const [x, y, w, h] = el.bounds;
    const fill = fillToPptx(el.fill, theme, deg, slideIndex, el.elementId, el.opacity, "shape");
    const hasLine = Boolean(el.border?.color) && (el.border?.width ?? 1) > 0;
    if (fill.type === "none" && !hasLine)
        return;
    const shapeName = canonicalShapeName(el.shapeName ?? "rect");
    const pptxNames = {
        rect: "rect",
        roundRect: "roundRect",
        ellipse: "ellipse",
        triangle: "triangle",
        rtTriangle: "rtTriangle",
        diamond: "diamond",
        parallelogram: "parallelogram",
        trapezoid: "trapezoid",
        pentagon: "pentagon",
        hexagon: "hexagon",
        heptagon: "heptagon",
        octagon: "octagon",
        plus: "plus",
        chevron: "chevron",
        rightArrow: "rightArrow",
        leftArrow: "leftArrow",
        upArrow: "upArrow",
        downArrow: "downArrow",
        bentArrow: "bentArrow",
        homePlate: "homePlate",
        pie: "pie",
        donut: "donut",
        can: "can",
        cube: "cube",
        bevel: "bevel",
        folderCorner: "folderCorner",
        heart: "heart",
        lightningBolt: "lightningBolt",
        sun: "sun",
        moon: "moon",
        smileyFace: "smileyFace",
        cloud: "cloud",
        arc: "arc",
        teardrop: "teardrop",
        frame: "frame",
        halfFrame: "halfFrame",
        corner: "corner",
        diagStripe: "diagStripe",
        chord: "chord",
        star4: "star4",
        star5: "star5",
        star6: "star6",
        star7: "star7",
        star8: "star8",
        star10: "star10",
        star12: "star12",
        star16: "star16",
        star24: "star24",
        star32: "star32",
        ribbon: "ribbon",
        ribbon2: "ribbon2",
        ellipseRibbon: "ellipseRibbon",
        ellipseRibbon2: "ellipseRibbon2",
        verticalScroll: "verticalScroll",
        horizontalScroll: "horizontalScroll",
        wave: "wave",
        doubleWave: "doubleWave",
        leftRightArrow: "leftRightArrow",
        upDownArrow: "upDownArrow",
        quadArrow: "quadArrow",
        leftRightUpArrow: "leftRightUpArrow",
        bentUpArrow: "bentUpArrow",
        leftUpArrow: "leftUpArrow",
        circularArrow: "circularArrow",
        notchedRightArrow: "notchedRightArrow",
        stripedRightArrow: "stripedRightArrow",
        callout1: "wedgeRectCallout",
        callout2: "wedgeRectCallout",
        wedgeRectCallout: "wedgeRectCallout",
        wedgeRoundRectCallout: "wedgeRoundRectCallout",
        wedgeEllipseCallout: "wedgeEllipseCallout",
        cloudCallout: "cloudCallout",
        borderCallout1: "borderCallout1",
        borderCallout2: "borderCallout2",
        accentCallout1: "accentCallout1",
        accentBorderCallout1: "accentBorderCallout1",
        actionButtonBlank: "actionButtonBlank",
        flowChartProcess: "flowChartProcess",
        flowChartDecision: "flowChartDecision",
        flowChartTerminator: "flowChartTerminator",
        flowChartDocument: "flowChartDocument",
    };
    const type = pptxNames[shapeName] ?? nativeShapeTypes[shapeName];
    if (!type) {
        deg.push({
            slideIndex,
            elementId: el.elementId,
            kind: "shape-as-rect",
            reason: `preset ${shapeName} exported as rect`,
        });
    }
    slide.addShape((type || "rect"), {
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: pxToIn(w, size[0], layout.w),
        h: pxToIn(h, size[1], layout.h),
        fill: pptxSolidFill(fill),
        // The authored border must survive the export — a shape with a border
        // but no fill previously dropped the stroke entirely.
        ...(hasLine
            ? {
                line: {
                    color: hex(el.border.color, theme),
                    width: cssPxToPt(el.border.width ?? 1),
                    dashType: lineDashType(el.border.style),
                    ...(el.opacity !== undefined
                        ? {
                            transparency: Math.round((1 - Math.max(0, Math.min(1, el.opacity))) * 100),
                        }
                        : {}),
                },
            }
            : {}),
        objectName: el.elementId,
        ...(el.rotation ? { rotate: el.rotation } : {}),
        ...(el.flipH ? { flipH: true } : {}),
        ...(el.flipV ? { flipV: true } : {}),
    });
    if (fill.type === "gradient") {
        gradientPatches.push({ slideIndex, objectName: el.elementId, fill });
    }
}
function mapTable(slide, el, theme, size, layout) {
    const [x, y, w, h] = el.bounds;
    const tableW = pxToIn(w, size[0], layout.w);
    const tableH = pxToIn(h, size[1], layout.h);
    const colSum = (el.columnWidths ?? []).reduce((a, b) => a + b, 0);
    const rowSum = (el.rowHeights ?? []).reduce((a, b) => a + b, 0);
    // PPTD keeps covered cells as placeholders in the grid; pptxgenjs wants
    // them omitted so the colspan bookkeeping stays consistent. Mark coverage.
    const covered = new Set();
    el.rows.forEach((row, r) => row.forEach((cell, c) => {
        const rs = Math.max(1, Math.floor(Number(cell.rowSpan) || 1));
        const cs = Math.max(1, Math.floor(Number(cell.colSpan) || 1));
        for (let dr = 0; dr < rs; dr += 1) {
            for (let dc = 0; dc < cs; dc += 1) {
                if (dr || dc)
                    covered.add(`${r + dr}:${c + dc}`);
            }
        }
    }));
    const rows = el.rows.map((row, r) => row
        .map((cell, c) => {
        // Row 0 gets the canvas's is-header defaults when the author did not
        // pin explicit cell paint/bold.
        const isHeader = r === 0;
        const explicitFill = cell.fill && cell.fill.type === "solid"
            ? hex(cell.fill.color, theme)
            : undefined;
        const options = {
            bold: cell.bold ?? isHeader,
            color: hex(cell.color ?? "#1A1917", theme),
            fill: { color: explicitFill ?? (isHeader ? "F3F4F6" : "FFFFFF") },
            valign: "middle",
            align: cell.align?.[0] ?? "left",
            // CSS .el-table td pads 4px vertical / 6px horizontal at 96 CSS px
            // per inch. pptxgenjs TableCellProps.margin is in inches here.
            margin: [
                (4 / 96),
                (6 / 96),
                (4 / 96),
                (6 / 96),
            ],
            fontFace: CHART_FONT_FACE,
            fontSize: cssPxToPt(13),
        };
        // Merged regions: the origin cell carries the span; covered cells are
        // placeholders in the PPTD grid and must be omitted from the row.
        if (typeof cell.colSpan === "number" && cell.colSpan > 1) {
            options.colspan = Math.floor(cell.colSpan);
        }
        if (typeof cell.rowSpan === "number" && cell.rowSpan > 1) {
            options.rowspan = Math.floor(cell.rowSpan);
        }
        return { text: cell.text ?? "", options, covered: covered.has(`${r}:${c}`) };
    })
        .filter((cell) => !cell.covered)
        .map(({ text, options }) => ({ text, options })));
    slide.addTable(rows, {
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: tableW,
        h: tableH,
        colW: colSum > 0
            ? el.columnWidths.map((c) => (c / colSum) * tableW)
            : undefined,
        rowH: rowSum > 0 && el.rowHeights.length === el.rows.length
            ? el.rowHeights.map((r) => (r / rowSum) * tableH)
            : undefined,
        border: [
            { type: "solid", pt: 0.75, color: "D1D5DB" },
            { type: "solid", pt: 0.75, color: "D1D5DB" },
            { type: "solid", pt: 0.75, color: "D1D5DB" },
            { type: "solid", pt: 0.75, color: "D1D5DB" },
        ],
        fontFace: CHART_FONT_FACE,
        fontSize: cssPxToPt(13),
        valign: "middle",
    });
}
function formatChartNumber(value, signed = false) {
    const absolute = Math.abs(value);
    const body = Number.isInteger(absolute)
        ? absolute.toLocaleString("en-US")
        : absolute.toLocaleString("en-US", { maximumFractionDigits: 3 });
    if (!signed || value === 0)
        return body;
    return `${value > 0 ? "+" : "−"}${body}`;
}
function relativeLuminance(color) {
    const value = color.replace(/^#/, "");
    if (!/^[0-9A-F]{6}$/i.test(value))
        return 1;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
    const linear = (channel) => channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    return 0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2]);
}
function contrastRatio(foreground, background) {
    const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}
/** Composite an exported semi-transparent shape over its actual surface. */
function compositeHex(foreground, background, transparency) {
    const alpha = Math.max(0, Math.min(1, 1 - transparency / 100));
    const fg = foreground.replace(/^#/, "");
    const bg = background.replace(/^#/, "");
    const component = (offset) => {
        const value = Number.parseInt(fg.slice(offset, offset + 2), 16) * alpha +
            Number.parseInt(bg.slice(offset, offset + 2), 16) * (1 - alpha);
        return Math.round(value).toString(16).padStart(2, "0");
    };
    return `#${component(0)}${component(2)}${component(4)}`.toUpperCase();
}
/**
 * Labels sit above semi-transparent quadrant fills, so the page color alone
 * is not enough for legibility. Pick a direct readable ink when possible and
 * place it on a high-contrast plate to keep that result stable in PowerPoint.
 */
function readableScatterLabelStyle(underlay) {
    const dark = "0F172A";
    const light = "F8FAFC";
    const darkOnUnderlay = contrastRatio(`#${dark}`, underlay);
    const lightOnUnderlay = contrastRatio(`#${light}`, underlay);
    const foreground = darkOnUnderlay >= lightOnUnderlay ? dark : light;
    const backplate = foreground === dark ? light : dark;
    const transparency = 12;
    const effectiveBackplate = compositeHex(`#${backplate}`, underlay, transparency);
    return contrastRatio(`#${foreground}`, effectiveBackplate) >= 4.5
        ? { foreground, backplate, transparency }
        : { foreground, backplate, transparency: 0 };
}
function mapWaterfallChart(slide, el, size, layout, surface, tickPt, catPt, labelPt, axisTitlePt) {
    const [x, y, w, h] = el.bounds;
    const model = waterfallChartModel(el);
    const labels = model.bars.map((bar) => bar.label);
    const data = [
        {
            name: "基线",
            labels,
            values: model.bars.map((bar) => bar.kind === "total" ? 0 : Math.min(bar.start, bar.end)),
        },
        {
            name: "增加",
            labels,
            values: model.bars.map((bar) => (bar.kind === "increase" ? Math.abs(bar.value) : 0)),
        },
        {
            name: "减少",
            labels,
            values: model.bars.map((bar) => (bar.kind === "decrease" ? Math.abs(bar.value) : 0)),
        },
        {
            name: "合计",
            labels,
            values: model.bars.map((bar) => bar.kind === "total"
                ? Math.abs(bar.end)
                : bar.kind === "subtotal"
                    ? Math.abs(bar.value)
                    : 0),
        },
    ];
    const valueRange = Math.max(1e-9, model.valueMax - model.valueMin);
    const wfLayout = waterfallLayoutFor(el, model, w, h);
    slide.addChart("bar", data, {
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: pxToIn(w, size[0], layout.w),
        h: pxToIn(h, size[1], layout.h),
        layout: {
            x: wfLayout.plot.x / w,
            y: wfLayout.plot.y / h,
            w: wfLayout.plot.w / w,
            h: wfLayout.plot.h / h,
        },
        barDir: "col",
        barGrouping: "stacked",
        barOverlapPct: 100,
        showLegend: false,
        showValue: false,
        dataLabelColor: surface.ink,
        dataLabelFontFace: CHART_FONT_FACE,
        dataLabelFontSize: labelPt,
        showTitle: false,
        showCatAxisTitle: Boolean(el.axis?.x),
        catAxisTitle: el.axis?.x,
        catAxisTitleColor: surface.ink,
        catAxisTitleFontFace: CHART_FONT_FACE,
        catAxisTitleFontSize: axisTitlePt,
        catAxisLabelColor: surface.ink,
        catAxisLabelFontFace: CHART_FONT_FACE,
        catAxisLabelFontSize: catPt,
        catAxisLineColor: surface.grid,
        catGridLine: { style: "none" },
        showValAxisTitle: Boolean(el.axis?.y),
        valAxisTitle: el.axis?.y,
        valAxisTitleColor: surface.ink,
        valAxisTitleFontFace: CHART_FONT_FACE,
        valAxisTitleFontSize: axisTitlePt,
        valAxisLabelColor: surface.ink,
        valAxisLabelFontFace: CHART_FONT_FACE,
        valAxisLabelFontSize: tickPt,
        valAxisLineColor: surface.grid,
        valAxisLabelFormatCode: "#,##0" + (model.scale.tickDecimals > 0 ? `.${"0".repeat(model.scale.tickDecimals)}` : ""),
        valAxisMinVal: model.valueMin,
        valAxisMaxVal: model.valueMax,
        valAxisMajorUnit: model.scale.step,
        chartColors: ["transparent", "10B981", "EF4444", "F59E0B"],
        valGridLine: { color: surface.grid, size: 0.5 },
    });
    if (el.title && wfLayout.title) {
        const t = wfLayout.title;
        slide.addText(typeof el.title === "string" ? el.title : el.title.text ?? "", {
            x: pxToIn(x + t.x, size[0], layout.w),
            y: pxToIn(y + t.y, size[1], layout.h),
            w: pxToIn(t.w, size[0], layout.w),
            h: pxToIn(t.h, size[1], layout.h),
            fontFace: CHART_FONT_FACE,
            fontSize: Math.round(cssPxToPt(CHART_TEXT_PX.title) * 100) / 100,
            color: surface.ink,
            align: "left",
            valign: "middle",
            margin: 0,
            wrap: false,
        });
    }
    // Connector lines and labels stay editable while the embedded workbook
    // remains the source for bar geometry. The plot rect is the same one the
    // canvas painter computed through the shared layout.
    const plot = {
        x: x + wfLayout.plot.x,
        y: y + wfLayout.plot.y,
        w: wfLayout.plot.w,
        h: wfLayout.plot.h,
    };
    const group = plot.w / Math.max(1, model.bars.length);
    const yFor = (value) => plot.y + ((model.valueMax - value) / valueRange) * plot.h;
    model.bars.forEach((bar, index) => {
        const centerX = plot.x + group * (index + 0.5);
        const topValue = Math.max(bar.start, bar.end);
        slide.addText(formatChartNumber(bar.value, bar.kind === "increase" || bar.kind === "decrease"), {
            x: pxToIn(centerX - group * 0.42, size[0], layout.w),
            y: pxToIn(Math.max(plot.y, yFor(topValue) - 13), size[1], layout.h),
            w: pxToIn(group * 0.84, size[0], layout.w),
            h: pxToIn(12, size[1], layout.h),
            fontFace: CHART_FONT_FACE,
            fontSize: labelPt,
            color: surface.ink,
            align: "center",
            margin: 0,
            fit: "shrink",
        });
        if (index >= model.bars.length - 1)
            return;
        const next = model.bars[index + 1];
        const connectorValue = next.kind === "total" ? bar.end : next.start;
        const connectorY = yFor(connectorValue);
        slide.addShape("line", {
            x: pxToIn(centerX + group * 0.32, size[0], layout.w),
            y: pxToIn(connectorY, size[1], layout.h),
            w: pxToIn(group * 0.36, size[0], layout.w),
            h: 0,
            line: { color: "9CA3AF", width: 0.75, dashType: "dash" },
        });
    });
}
function mapScatterChart(slide, el, size, layout, surface, tickPt, catPt, axisTitlePt) {
    const [x, y, w, h] = el.bounds;
    const model = scatterChartModel(el);
    const color = hexNoHash(chartSwatch(el, 0));
    const data = [
        { name: model.xName, values: model.points.map((point) => point.x) },
        {
            name: el.series[0]?.name ?? model.yName,
            values: model.points.map((point) => point.y),
        },
    ];
    const scLayout = scatterLayoutFor(el, model, w, h);
    const plot = {
        x: x + scLayout.plot.x,
        y: y + scLayout.plot.y,
        w: scLayout.plot.w,
        h: scLayout.plot.h,
    };
    const thresholdX = plot.x + plot.w * 0.7;
    const thresholdY = plot.y + plot.h * 0.3;
    const quadrants = [
        { x: plot.x, y: plot.y, w: thresholdX - plot.x, h: thresholdY - plot.y, color: "FEF3C7", transparency: 55 },
        { x: thresholdX, y: plot.y, w: plot.x + plot.w - thresholdX, h: thresholdY - plot.y, color: "FEE2E2", transparency: 35 },
        { x: plot.x, y: thresholdY, w: thresholdX - plot.x, h: plot.y + plot.h - thresholdY, color: "ECFDF5", transparency: 35 },
        { x: thresholdX, y: thresholdY, w: plot.x + plot.w - thresholdX, h: plot.y + plot.h - thresholdY, color: "FEF3C7", transparency: 55 },
    ];
    for (const quadrant of quadrants) {
        slide.addShape("rect", {
            x: pxToIn(quadrant.x, size[0], layout.w),
            y: pxToIn(quadrant.y, size[1], layout.h),
            w: pxToIn(quadrant.w, size[0], layout.w),
            h: pxToIn(quadrant.h, size[1], layout.h),
            fill: { color: quadrant.color, transparency: quadrant.transparency },
            line: { color: quadrant.color, transparency: 100 },
        });
    }
    slide.addChart("scatter", data, {
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: pxToIn(w, size[0], layout.w),
        h: pxToIn(h, size[1], layout.h),
        layout: {
            x: scLayout.plot.x / w,
            y: scLayout.plot.y / h,
            w: scLayout.plot.w / w,
            h: scLayout.plot.h / h,
        },
        showTitle: false,
        showLegend: resolveChartLegend(el.legend).show,
        legendColor: surface.ink,
        legendFontFace: CHART_FONT_FACE,
        legendFontSize: Math.round(cssPxToPt(CHART_TEXT_PX.legend) * 100) / 100,
        showLabel: false,
        showValue: false,
        dataLabelColor: surface.ink,
        chartColors: [color],
        lineSize: 0,
        lineDataSymbol: "circle",
        lineDataSymbolSize: 8,
        lineDataSymbolLineColor: color,
        lineDataSymbolLineSize: 1,
        catAxisMinVal: model.xMin,
        catAxisMaxVal: model.xMax,
        catAxisMajorUnit: model.xScale.step,
        valAxisMinVal: model.yMin,
        valAxisMaxVal: model.yMax,
        valAxisMajorUnit: model.yScale.step,
        showCatAxisTitle: true,
        catAxisTitle: el.axis?.x ?? model.xName,
        catAxisTitleColor: surface.ink,
        catAxisTitleFontFace: CHART_FONT_FACE,
        catAxisTitleFontSize: axisTitlePt,
        catAxisLabelColor: surface.ink,
        catAxisLabelFontFace: CHART_FONT_FACE,
        catAxisLabelFontSize: catPt,
        catAxisLineColor: surface.grid,
        showValAxisTitle: true,
        valAxisTitle: el.axis?.y ?? model.yName,
        valAxisTitleColor: surface.ink,
        valAxisTitleFontFace: CHART_FONT_FACE,
        valAxisTitleFontSize: axisTitlePt,
        valAxisLabelColor: surface.ink,
        valAxisLabelFontFace: CHART_FONT_FACE,
        valAxisLabelFontSize: tickPt,
        valAxisLineColor: surface.grid,
        valAxisLabelFormatCode: "#,##0" + (model.yScale.tickDecimals > 0 ? `.${"0".repeat(model.yScale.tickDecimals)}` : ""),
        catLabelFormatCode: "#,##0" + (model.xScale.tickDecimals > 0 ? `.${"0".repeat(model.xScale.tickDecimals)}` : ""),
        valGridLine: { color: surface.grid, size: 0.5 },
        catGridLine: { color: surface.grid, size: 0.5 },
        chartArea: {
            fill: { color: "FFFFFF", transparency: 100 },
            border: { color: "FFFFFF", pt: 0 },
        },
        plotArea: {
            fill: { color: "FFFFFF", transparency: 100 },
            border: { color: surface.grid, pt: 0.5 },
        },
    });
    if (el.title && scLayout.title) {
        const t = scLayout.title;
        slide.addText(typeof el.title === "string" ? el.title : el.title.text ?? "", {
            x: pxToIn(x + t.x, size[0], layout.w),
            y: pxToIn(y + t.y, size[1], layout.h),
            w: pxToIn(t.w, size[0], layout.w),
            h: pxToIn(t.h, size[1], layout.h),
            fontFace: CHART_FONT_FACE,
            fontSize: Math.round(cssPxToPt(CHART_TEXT_PX.title) * 100) / 100,
            color: surface.ink,
            align: "left",
            valign: "middle",
            margin: 0,
            wrap: false,
        });
    }
    const xRange = Math.max(1e-9, model.xMax - model.xMin);
    const yRange = Math.max(1e-9, model.yMax - model.yMin);
    const placements = placeScatterLabels(model.points.map((point) => ({
        label: point.label,
        x: plot.x + ((point.x - model.xMin) / xRange) * plot.w,
        y: plot.y + ((model.yMax - point.y) / yRange) * plot.h,
    })), { left: x + 2, top: y + 4, right: x + w - 2, bottom: y + h - 3 }, 9);
    for (const placement of placements) {
        const quadrant = quadrants.find((candidate) => placement.pointX >= candidate.x &&
            placement.pointX <= candidate.x + candidate.w &&
            placement.pointY >= candidate.y &&
            placement.pointY <= candidate.y + candidate.h);
        const underlay = quadrant
            ? compositeHex(`#${quadrant.color}`, surface.background, quadrant.transparency)
            : surface.background;
        const labelStyle = readableScatterLabelStyle(underlay);
        const plateLeft = placement.box.left - 3;
        const plateTop = placement.box.top - 1;
        const plateWidth = placement.box.right - placement.box.left + 6;
        const plateHeight = placement.box.bottom - placement.box.top + 5;
        slide.addShape("roundRect", {
            x: pxToIn(plateLeft, size[0], layout.w),
            y: pxToIn(plateTop, size[1], layout.h),
            w: pxToIn(plateWidth, size[0], layout.w),
            h: pxToIn(plateHeight, size[1], layout.h),
            fill: { color: labelStyle.backplate, transparency: labelStyle.transparency },
            line: { color: labelStyle.backplate, transparency: 100 },
        });
        slide.addText(placement.label, {
            x: pxToIn(placement.box.left, size[0], layout.w),
            y: pxToIn(placement.box.top, size[1], layout.h),
            w: pxToIn(placement.box.right - placement.box.left, size[0], layout.w),
            h: pxToIn(placement.box.bottom - placement.box.top + 3, size[1], layout.h),
            fontFace: CHART_FONT_FACE,
            fontSize: Math.round(cssPxToPt(CHART_TEXT_PX.scatterLabel) * 100) / 100,
            bold: true,
            color: labelStyle.foreground,
            margin: 0,
            wrap: false,
            fit: "none",
            valign: "middle",
        });
    }
}
/** Shared element-relative layout for scatter and its label overlays. */
function scatterLayoutFor(el, model, w, h) {
    const tickLabels = model.yScale.ticks.map((t) => formatChartValue(t, model.yScale.tickDecimals));
    const widestTickLabel = tickLabels.reduce((best, label) => (label.length > best.length ? label : best), "0");
    return chartLayout({ w, h }, {
        title: typeof el.title === "string" ? el.title : el.title?.text ?? "",
        legend: resolveChartLegend(el.legend),
        legendItems: [el.series[0]?.name ?? model.yName],
        widestTickLabel,
        widestCategoryLabel: "",
        categoryCount: 1,
        axis: { x: el.axis?.x ?? model.xName, y: el.axis?.y ?? model.yName },
    });
}
/** Shared element-relative layout for waterfall and the overlay labels. */
function waterfallLayoutFor(el, model, w, h) {
    const tickLabels = model.scale.ticks.map((t) => formatChartValue(t, model.scale.tickDecimals));
    const widestTickLabel = tickLabels.reduce((best, label) => (label.length > best.length ? label : best), "0");
    const widestCategoryLabel = model.bars
        .map((bar) => bar.label)
        .reduce((best, label) => (String(label).length > best.length ? String(label) : best), "");
    return chartLayout({ w, h }, {
        title: typeof el.title === "string" ? el.title : el.title?.text ?? "",
        legend: resolveChartLegend(el.legend),
        legendItems: [],
        widestTickLabel,
        widestCategoryLabel,
        categoryCount: Math.max(1, model.bars.length),
        axis: el.axis,
    });
}
/** px-in-slide fraction → pptxgenjs manualLayout fraction of the chart area. */
function fractionOfChart(px, span) {
    return Math.max(0, Math.min(1, px / Math.max(1, span)));
}
function mapChart(slide, el, theme, size, layout, deg, slideIndex, editData, pageSurface, chartPatches) {
    const [x, y, w, h] = el.bounds;
    try {
        if (el.background) {
            const fill = fillToPptx(el.background, theme, deg, slideIndex, el.elementId, el.opacity, "chart");
            if (fill.type !== "none") {
                slide.addShape("rect", {
                    x: pxToIn(x, size[0], layout.w),
                    y: pxToIn(y, size[1], layout.h),
                    w: pxToIn(w, size[0], layout.w),
                    h: pxToIn(h, size[1], layout.h),
                    fill: pptxSolidFill(fill),
                    line: { color: pptxInk(fill), transparency: 100 },
                });
            }
        }
        const chartSurfaceColor = exportedFillColor(el.background, theme) ?? pageSurface;
        const chartSurfaceDark = isDarkHex(chartSurfaceColor);
        const ink = chartSurfaceDark ? CHART_INK.dark.slice(1) : CHART_INK.light.slice(1);
        const grid = chartSurfaceDark ? CHART_GRID.dark.slice(1) : CHART_GRID.light.slice(1);
        const kind = chartKind(el);
        const fontPt = (px) => Math.round(cssPxToPt(px) * 100) / 100;
        const tickPt = fontPt(CHART_TEXT_PX.tick);
        const catPt = fontPt(CHART_TEXT_PX.category);
        const labelPt = fontPt(CHART_TEXT_PX.dataLabel);
        const legendPt = fontPt(CHART_TEXT_PX.legend);
        const titlePt = fontPt(CHART_TEXT_PX.title);
        const axisTitlePt = fontPt(CHART_TEXT_PX.axisTitle);
        if (kind === "waterfall") {
            mapWaterfallChart(slide, el, size, layout, { ink, grid, background: chartSurfaceColor }, tickPt, catPt, labelPt, axisTitlePt);
            chartPatches.push({
                slideIndex,
                elementId: el.elementId,
                seriesFormatCodes: [],
                seriesNames: ["基线", "增加", "减少", "合计"],
                fontFace: CHART_FONT_FACE,
            });
            editData.ok.push(el.elementId);
            return;
        }
        if (kind === "scatter") {
            mapScatterChart(slide, el, size, layout, { ink, grid, background: chartSurfaceColor }, tickPt, catPt, axisTitlePt);
            chartPatches.push({
                slideIndex,
                elementId: el.elementId,
                seriesFormatCodes: [],
                seriesNames: [el.series[0]?.name ?? scatterChartModel(el).yName],
                fontFace: CHART_FONT_FACE,
            });
            editData.ok.push(el.elementId);
            return;
        }
        const mapped = mapChartElement(el);
        const type = (el.series[0]?.type ?? "bar").toLowerCase();
        const patch = {
            slideIndex,
            elementId: el.elementId,
            seriesFormatCodes: mapped.series.map((s) => s.formatCode),
            seriesNames: mapped.series.map((s) => s.name),
            fontFace: CHART_FONT_FACE,
            pie: mapped.pptxType === "pie",
            barHorizontal: mapped.barDir === "bar",
            plotLayout: {
                x: fractionOfChart(mapped.layout.plot.x, w),
                y: fractionOfChart(mapped.layout.plot.y, h),
                w: fractionOfChart(mapped.layout.plot.w, w),
                h: fractionOfChart(mapped.layout.plot.h, h),
            },
        };
        if (mapped.showLegend && mapped.layout.legend) {
            patch.legend = {
                position: mapped.legend.position,
                layout: {
                    x: fractionOfChart(mapped.layout.legend.area.x, w),
                    y: fractionOfChart(mapped.layout.legend.area.y, h),
                    w: fractionOfChart(mapped.layout.legend.area.w, w),
                    h: fractionOfChart(mapped.layout.legend.area.h, h),
                },
            };
        }
        const opts = {
            x: pxToIn(x, size[0], layout.w),
            y: pxToIn(y, size[1], layout.h),
            w: pxToIn(w, size[0], layout.w),
            h: pxToIn(h, size[1], layout.h),
            layout: patch.plotLayout,
            showTitle: false,
            showLegend: mapped.showLegend,
            legendPos: { top: "t", bottom: "b", left: "l", right: "r" }[mapped.legend.position],
            showValue: mapped.showValue,
            dataLabelFormatCode: mapped.dataLabelFormatCode,
            dataLabelColor: ink,
            dataLabelFontFace: CHART_FONT_FACE,
            dataLabelFontSize: labelPt,
            chartColors: mapped.colors.map(hexNoHash),
            catAxisLabelColor: ink,
            catAxisLabelFontFace: CHART_FONT_FACE,
            catAxisLabelFontSize: catPt,
            catAxisLineColor: grid,
            catAxisTitleColor: ink,
            catAxisTitleFontFace: CHART_FONT_FACE,
            catAxisTitleFontSize: axisTitlePt,
            catGridLine: { style: "none" },
            valAxisLabelColor: ink,
            valAxisLabelFontFace: CHART_FONT_FACE,
            valAxisLabelFontSize: tickPt,
            valAxisLineColor: grid,
            valAxisTitleColor: ink,
            valAxisTitleFontFace: CHART_FONT_FACE,
            valAxisTitleFontSize: axisTitlePt,
            valGridLine: { color: grid, size: 0.5 },
            valAxisLabelFormatCode: "#,##0" + (mapped.scale.tickDecimals > 0 ? `.${"0".repeat(mapped.scale.tickDecimals)}` : ""),
            valAxisMinVal: mapped.scale.min,
            valAxisMaxVal: mapped.scale.max,
            valAxisMajorUnit: mapped.scale.step,
            legendColor: ink,
            legendFontFace: CHART_FONT_FACE,
            legendFontSize: legendPt,
            showCatAxisTitle: Boolean(el.axis?.x),
            catAxisTitle: el.axis?.x,
            showValAxisTitle: Boolean(el.axis?.y),
            valAxisTitle: el.axis?.y,
            titleColor: ink,
            titleFontFace: CHART_FONT_FACE,
            titleFontSize: titlePt,
            barGapWidthPct: 50,
            barOverlapPct: -8,
        };
        if (mapped.pptxType === "line" || mapped.pptxType === "area") {
            opts.lineSize = 2.25;
            opts.lineDataSymbol = "none";
        }
        if (mapped.pptxType === "pie") {
            opts.showLabel = true;
            opts.showPercent = true;
            opts.dataLabelPosition = "ctr";
        }
        if (mapped.barDir)
            opts.barDir = mapped.barDir;
        if (mapped.barDir === "bar") {
            // Written as inEnd so pptxgenjs emits a dLblPos at all;
            // patchDataLabelPositions turns clustered bars into outEnd.
            opts.dataLabelPosition = "inEnd";
            // OOXML supports maxMin for a top-to-bottom category order, while the
            // PptxGenJS 3.x declaration exposes only minMax. The writer forwards the
            // valid OOXML value unchanged.
            opts.catAxisOrientation = "maxMin";
        }
        else if (mapped.pptxType === "bar") {
            // pptxgenjs drops `outEnd` from clustered bars; see
            // patchDataLabelPositions for the post-write correction.
            opts.dataLabelPosition = "inEnd";
        }
        // pptxgenjs only splits a chart into parts when one series uses a
        // secondary axis, and it rejects the split otherwise.
        const combo = new Set(mapped.series.map((series) => series.pptxType)).size >= 2 &&
            mapped.series.some((series) => series.axis === "secondary");
        if (combo) {
            const groups = new Map();
            for (const series of mapped.series) {
                const key = `${series.pptxType}:${series.axis}`;
                const group = groups.get(key) ?? [];
                group.push(series);
                groups.set(key, group);
            }
            const multi = [...groups.values()].map((group) => ({
                type: group[0].pptxType,
                data: group.map((series) => ({
                    name: series.name,
                    labels: series.labels,
                    values: series.values,
                })),
                options: {
                    secondaryValAxis: group[0].axis === "secondary",
                    secondaryCatAxis: group[0].axis === "secondary",
                    showValue: mapped.showValue,
                    // A zero-only category is common in bar/line combinations. A blank
                    // zero section keeps those labels off the category axis while the
                    // source values remain editable in the embedded workbook.
                    dataLabelFormatCode: chartZeroHiddenFormatCode(mapped.dataLabelFormatCode),
                    dataLabelColor: ink,
                    dataLabelFontFace: CHART_FONT_FACE,
                    dataLabelFontSize: labelPt,
                    // pptxgenjs shares one position across all parts and validates it
                    // against the first; patchDataLabelPositions then sets outEnd on
                    // the bar part and `t` on the line part.
                    dataLabelPosition: "inEnd",
                    chartColors: group.map((series) => hexNoHash(series.color)),
                    ...(group[0].pptxType === "bar" ? { barDir: "col" } : {}),
                    ...(group[0].pptxType === "line" || group[0].pptxType === "area"
                        ? { lineSize: 2.25, lineDataSymbol: "none" }
                        : {}),
                },
            }));
            opts.catAxes = [
                {
                    catAxisLabelColor: ink,
                    catAxisLineColor: grid,
                    catAxisLabelFontSize: catPt,
                    catAxisLabelFontFace: CHART_FONT_FACE,
                    catAxisLabelPos: "low",
                    catAxisTitleFontFace: CHART_FONT_FACE,
                    catAxisTitleFontSize: axisTitlePt,
                },
                {
                    catAxisHidden: true,
                    catAxisLabelPos: "none",
                    catAxisLineShow: false,
                },
            ];
            const secondaryScale = mapped.secondaryScale ?? mapped.scale;
            opts.valAxes = [
                {
                    valAxisMinVal: mapped.scale.min,
                    valAxisMaxVal: mapped.scale.max,
                    valAxisMajorUnit: mapped.scale.step,
                    valAxisLabelFormatCode: opts.valAxisLabelFormatCode,
                    valAxisLabelFontSize: tickPt,
                    valAxisLabelFontFace: CHART_FONT_FACE,
                    showValAxisTitle: Boolean(el.axis?.y),
                    valAxisTitle: el.axis?.y,
                    valAxisTitleFontFace: CHART_FONT_FACE,
                    valAxisTitleFontSize: axisTitlePt,
                },
                {
                    valAxisMinVal: secondaryScale.min,
                    valAxisMaxVal: secondaryScale.max,
                    valAxisMajorUnit: secondaryScale.step,
                    valAxisLabelPos: "high",
                    valGridLine: { style: "none" },
                    valAxisLabelFormatCode: opts.valAxisLabelFormatCode,
                    valAxisLabelFontSize: tickPt,
                    valAxisLabelFontFace: CHART_FONT_FACE,
                    showValAxisTitle: Boolean(el.axis?.secondaryY),
                    valAxisTitle: el.axis?.secondaryY,
                    valAxisTitleFontFace: CHART_FONT_FACE,
                    valAxisTitleFontSize: axisTitlePt,
                },
            ];
            const addMultiChart = slide.addChart.bind(slide);
            addMultiChart(multi, opts);
            chartPatches.push(patch);
            editData.ok.push(el.elementId);
            return;
        }
        slide.addChart(mapped.pptxType, mapped.series.map((s) => ({
            name: s.name,
            labels: s.labels,
            values: s.values,
        })), opts);
        chartPatches.push(patch);
        if (["bar", "line", "pie", "area", "column"].includes(type)) {
            editData.ok.push(el.elementId);
        }
        else {
            editData.failed.push(el.elementId);
            deg.push({
                slideIndex,
                elementId: el.elementId,
                kind: "chart-type-fallback",
                reason: `chart type ${type} may lack full Edit Data fidelity`,
            });
        }
        // The chart title is a native text box on the shared layout rect: the
        // canvas paints it identically, and pptxgenjs' titlePos math is broken.
        if (mapped.title && mapped.layout.title) {
            const t = mapped.layout.title;
            slide.addText(mapped.title, {
                x: pxToIn(x + t.x, size[0], layout.w),
                y: pxToIn(y + t.y, size[1], layout.h),
                w: pxToIn(t.w, size[0], layout.w),
                h: pxToIn(t.h, size[1], layout.h),
                fontFace: CHART_FONT_FACE,
                fontSize: titlePt,
                color: ink,
                align: "left",
                valign: "middle",
                margin: 0,
                wrap: false,
            });
        }
    }
    catch (e) {
        editData.failed.push(el.elementId);
        deg.push({
            slideIndex,
            elementId: el.elementId,
            kind: "chart-export-failed",
            reason: e instanceof Error ? e.message : String(e),
        });
    }
}
function parsePolylinePoints(points) {
    const source = points.trim();
    if (!source || /[ml]/.test(source))
        return undefined;
    const numberSource = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
    const tokenPattern = new RegExp(`M|L|${numberSource}`, "g");
    const tokens = source.match(tokenPattern) ?? [];
    const residue = source.replace(tokenPattern, "").replace(/[,\s]/g, "");
    if (residue)
        return undefined;
    const parsed = [];
    if (tokens.includes("M") || tokens.includes("L")) {
        if (tokens[0] !== "M" || tokens.length < 6 || (tokens.length - 3) % 3 !== 0) {
            return undefined;
        }
        const startX = Number(tokens[1]);
        const startY = Number(tokens[2]);
        if (!Number.isFinite(startX) || !Number.isFinite(startY))
            return undefined;
        parsed.push([startX, startY]);
        for (let index = 3; index < tokens.length; index += 3) {
            if (tokens[index] !== "L")
                return undefined;
            const pointX = Number(tokens[index + 1]);
            const pointY = Number(tokens[index + 2]);
            if (!Number.isFinite(pointX) || !Number.isFinite(pointY))
                return undefined;
            parsed.push([pointX, pointY]);
        }
        return parsed.length >= 2 ? parsed : undefined;
    }
    const numbers = tokens.map(Number);
    if (numbers.length < 4 || numbers.length % 2 !== 0)
        return undefined;
    if (numbers.some((value) => !Number.isFinite(value)))
        return undefined;
    for (let index = 0; index < numbers.length; index += 2) {
        parsed.push([numbers[index], numbers[index + 1]]);
    }
    return parsed;
}
function lineDashType(style) {
    switch (style?.trim().toLowerCase()) {
        case "dash":
        case "dashed":
            return "dash";
        case "dot":
        case "dotted":
            return "sysDot";
        case "dash-dot":
        case "dashdot":
            return "dashDot";
        default:
            return "solid";
    }
}
/** Preserve PPTD bounds/viewBox/points as one editable OOXML custom-geometry path. */
function mapLine(slide, el, theme, size, layout, degradations, slideIndex) {
    const [x, y, w, h] = el.bounds;
    const color = hex(el.border?.color ?? theme?.colors?.primary ?? "#111111", theme);
    const pt = el.border?.width ?? 1.5;
    const objectName = `PPTD line ${el.elementId}`;
    const source = {
        bounds: [...el.bounds],
        viewBox: [...el.viewBox],
        points: el.points,
        ...(el.rotation !== undefined ? { rotation: el.rotation } : {}),
        ...(el.opacity !== undefined ? { opacity: el.opacity } : {}),
        ...(el.flipH !== undefined ? { flipH: el.flipH } : {}),
        ...(el.flipV !== undefined ? { flipV: el.flipV } : {}),
    };
    const points = parsePolylinePoints(el.points);
    const [viewWidth, viewHeight] = el.viewBox;
    const viewBoxValid = Number.isFinite(viewWidth) &&
        Number.isFinite(viewHeight) &&
        viewWidth > 0 &&
        viewHeight > 0;
    const curve = el.curve?.trim().toLowerCase();
    const curvePreserved = !points || points.length <= 2 || !curve || curve === "straight" || curve === "sharp";
    const line = {
        color,
        width: pt,
        dashType: lineDashType(el.border?.style),
        ...(el.opacity !== undefined
            ? { transparency: Math.round((1 - Math.max(0, Math.min(1, el.opacity))) * 100) }
            : {}),
        ...(el.arrow?.[0] ? { beginArrowType: el.arrow[0] } : {}),
        ...(el.arrow?.[1] ? { endArrowType: el.arrow[1] } : {}),
    };
    if (points && viewBoxValid) {
        const widthInches = pxToIn(w, size[0], layout.w);
        const heightInches = pxToIn(h, size[1], layout.h);
        slide.addShape("custGeom", {
            x: pxToIn(x, size[0], layout.w),
            y: pxToIn(y, size[1], layout.h),
            w: widthInches,
            h: heightInches,
            objectName,
            fill: { type: "none" },
            line,
            ...(el.rotation !== undefined ? { rotate: el.rotation } : {}),
            ...(el.flipH !== undefined ? { flipH: el.flipH } : {}),
            ...(el.flipV !== undefined ? { flipV: el.flipV } : {}),
            points: points.map(([pointX, pointY], index) => ({
                x: (pointX / viewWidth) * widthInches,
                y: (pointY / viewHeight) * heightInches,
                ...(index === 0 ? { moveTo: true } : {}),
            })),
        });
        if (!curvePreserved) {
            degradations.push({
                slideIndex,
                elementId: el.elementId,
                kind: "line-geometry",
                reason: `curve mode ${el.curve} exported as an editable sharp polyline`,
            });
        }
        return {
            slideIndex,
            elementId: el.elementId,
            source,
            output: {
                kind: "custom-geometry",
                objectName,
                segmentCount: points.length - 1,
            },
            preserved: curvePreserved,
        };
    }
    degradations.push({
        slideIndex,
        elementId: el.elementId,
        kind: "line-geometry",
        reason: viewBoxValid
            ? "points could not be parsed as a straight/polyline path"
            : "viewBox must contain two positive finite dimensions",
    });
    if (w >= h) {
        slide.addShape("line", {
            x: pxToIn(x, size[0], layout.w),
            y: pxToIn(y + h / 2, size[1], layout.h),
            w: pxToIn(w, size[0], layout.w),
            h: 0,
            objectName,
            line,
            ...(el.rotation !== undefined ? { rotate: el.rotation } : {}),
            ...(el.flipH !== undefined ? { flipH: el.flipH } : {}),
            ...(el.flipV !== undefined ? { flipV: el.flipV } : {}),
        });
    }
    else {
        slide.addShape("line", {
            x: pxToIn(x + w / 2, size[0], layout.w),
            y: pxToIn(y, size[1], layout.h),
            w: 0,
            h: pxToIn(h, size[1], layout.h),
            objectName,
            line,
            ...(el.rotation !== undefined ? { rotate: el.rotation } : {}),
            ...(el.flipH !== undefined ? { flipH: el.flipH } : {}),
            ...(el.flipV !== undefined ? { flipV: el.flipV } : {}),
        });
    }
    return {
        slideIndex,
        elementId: el.elementId,
        source,
        output: { kind: "axis-fallback", objectName, segmentCount: 1 },
        preserved: false,
    };
}
function mapIcon(slide, el, theme, size, layout, degradations, slideIndex) {
    const [x, y, w, h] = el.bounds;
    const fill = fillToPptx(el.fill, theme, degradations, slideIndex, el.elementId, el.opacity, "icon");
    const color = pptxInk(fill);
    const transparency = fill.type === "solid"
        ? fill.transparency
        : fill.type === "gradient"
            ? fill.fallback.transparency
            : undefined;
    const icon = String(el.iconName ?? "star").replace(/^(fas|far|fab):/, "");
    const px = (value, axis) => pxToIn(value, axis === "x" ? size[0] : size[1], axis === "x" ? layout.w : layout.h);
    if (icon === "mug-hot") {
        slide.addShape("ellipse", {
            x: px(x + w * 0.58, "x"),
            y: px(y + h * 0.39, "y"),
            w: px(w * 0.34, "x"),
            h: px(h * 0.34, "y"),
            fill: { color, transparency: 100 },
            line: {
                color,
                width: 1.25,
                transparency,
            },
        });
        slide.addShape("roundRect", {
            x: px(x + w * 0.08, "x"),
            y: px(y + h * 0.34, "y"),
            w: px(w * 0.62, "x"),
            h: px(h * 0.5, "y"),
            fill: {
                type: "solid",
                color,
                transparency,
            },
            line: { color, transparency: 100 },
        });
        for (const offset of [0.26, 0.48]) {
            slide.addShape("line", {
                x: px(x + w * offset, "x"),
                y: px(y + h * 0.04, "y"),
                w: 0,
                h: px(h * 0.22, "y"),
                line: {
                    color,
                    width: 1.1,
                    transparency,
                },
            });
        }
        slide.addShape("line", {
            x: px(x + w * 0.03, "x"),
            y: px(y + h * 0.9, "y"),
            w: px(w * 0.82, "x"),
            h: 0,
            line: {
                color,
                width: 1.1,
                transparency,
            },
        });
        return;
    }
    slide.addShape("star5", {
        x: px(x, "x"),
        y: px(y, "y"),
        w: px(w, "x"),
        h: px(h, "y"),
        fill: {
            type: "solid",
            color,
            transparency,
        },
    });
    if (icon !== "star") {
        degradations.push({
            slideIndex,
            elementId: el.elementId,
            kind: "icon-as-star",
            reason: `icon ${el.iconName ?? ""} exported as star5 vector`,
        });
    }
}
/** Minimal natural-size probe — enough to convert crop fractions into OOXML
 * srcRect values that compose with cover fitting. */
export function probeImageSize(buf) {
    // PNG: signature + IHDR dims at byte 16.
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // GIF: logical screen descriptor.
    if (buf.length > 10 && buf.toString("ascii", 0, 6).startsWith("GIF")) {
        return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    // JPEG: walk segments to the first SOF marker.
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let off = 2;
        while (off + 9 < buf.length) {
            if (buf[off] !== 0xff) {
                off++;
                continue;
            }
            const marker = buf[off + 1];
            if (marker >= 0xc0 &&
                marker <= 0xcf &&
                marker !== 0xc4 &&
                marker !== 0xc8 &&
                marker !== 0xcc) {
                return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
            }
            const len = buf.readUInt16BE(off + 2);
            off += 2 + len;
        }
    }
    // WebP: RIFF container — VP8/VP8L/VP8X headers.
    if (buf.length > 30 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP") {
        const fourcc = buf.toString("ascii", 12, 16);
        if (fourcc === "VP8X") {
            return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
        }
        if (fourcc === "VP8 ") {
            return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
        }
        if (fourcc === "VP8L") {
            const bits = buf.readUInt32LE(21);
            return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
        }
    }
    return undefined;
}
const clamp01 = (v) => Math.max(0, Math.min(1, typeof v === "number" && Number.isFinite(v) ? v : 0));
/**
 * Convert element-relative crop fractions into a source-image srcRect.
 * The editor applies crop to the *cover-fitted* image, so under cover fit the
 * crop window composes with the visible center region of the source.
 */
function srcRectForCrop(crop, fitMode, natural, boxW, boxH) {
    const l = clamp01(crop.left);
    const t = clamp01(crop.top);
    const r = clamp01(crop.right);
    const b = clamp01(crop.bottom);
    if (l + r >= 1 || t + b >= 1)
        return { l: 0.5, t: 0.5, r: 0.5, b: 0.5 };
    if (fitMode === "cover" &&
        natural &&
        natural.w > 0 &&
        natural.h > 0 &&
        boxW > 0 &&
        boxH > 0) {
        const scale = Math.max(boxW / natural.w, boxH / natural.h);
        // Fraction of the source that the cover fit shows.
        const fw = Math.min(1, boxW / (natural.w * scale));
        const fh = Math.min(1, boxH / (natural.h * scale));
        const x0 = (1 - fw) / 2;
        const y0 = (1 - fh) / 2;
        const left = x0 + l * fw;
        const right = x0 + (1 - r) * fw;
        const top = y0 + t * fh;
        const bottom = y0 + (1 - b) * fh;
        return { l: left, t: top, r: 1 - right, b: 1 - bottom };
    }
    // fill stretches the whole source into the box, so box fractions equal
    // source fractions; contain approximates the same (letterbox margins are
    // treated as image area — close enough for an edge crop).
    return { l, t, r, b };
}
function mapImage(slide, el, rootDir, size, layout, deg, slideIndex, srcRectPatches) {
    const [x, y, w, h] = el.bounds;
    let src = el.src;
    let natural;
    if (!src.startsWith("http") && !src.startsWith("data:")) {
        const local = path.join(rootDir, src);
        if (fs.existsSync(local)) {
            src = local;
            try {
                natural = probeImageSize(fs.readFileSync(local));
            }
            catch {
                natural = undefined;
            }
        }
        else {
            deg.push({
                slideIndex,
                elementId: el.elementId,
                kind: "missing-image",
                reason: `image not found: ${el.src}`,
            });
            return;
        }
    }
    else if (src.startsWith("data:")) {
        const comma = src.indexOf(",");
        try {
            natural = probeImageSize(Buffer.from(src.slice(comma + 1), "base64"));
        }
        catch {
            natural = undefined;
        }
    }
    const boxW = pxToIn(w, size[0], layout.w);
    const boxH = pxToIn(h, size[1], layout.h);
    const fitMode = el.fit?.mode ?? "cover";
    const hasCrop = Boolean(el.crop && (el.crop.left || el.crop.top || el.crop.right || el.crop.bottom));
    const image = {
        path: src.startsWith("data:") ? undefined : src,
        data: src.startsWith("data:") ? src : undefined,
        x: pxToIn(x, size[0], layout.w),
        y: pxToIn(y, size[1], layout.h),
        w: boxW,
        h: boxH,
        objectName: el.elementId,
        ...(el.rotation ? { rotate: el.rotation } : {}),
        ...(el.flipH ? { flipH: true } : {}),
        ...(el.flipV ? { flipV: true } : {}),
        ...(el.opacity !== undefined && el.opacity < 1
            ? { transparency: Math.round((1 - Math.max(0, el.opacity)) * 100) }
            : {}),
    };
    if (hasCrop) {
        // When we own the srcRect we must not let pptxgenjs write one too — the
        // post-pass composes cover fit and crop into a single source rect.
        const rect = srcRectForCrop(el.crop, fitMode, natural, w, h);
        srcRectPatches.push({
            slideIndex,
            objectName: el.elementId,
            crop: rect,
        });
        if (fitMode === "contain") {
            deg.push({
                slideIndex,
                elementId: el.elementId,
                kind: "image-crop-approx",
                reason: "contain-fit crop exported without letterbox margins",
            });
        }
    }
    else if (fitMode === "contain" || fitMode === "cover") {
        image.sizing = { type: fitMode, w: boxW, h: boxH };
    }
    slide.addImage(image);
}
export async function exportProjectToPptx(source, opts = {}) {
    const project = typeof source === "string" ? loadProject(source) : source;
    const size = project.presentation.size;
    const layout = { w: 10, h: (10 * size[1]) / size[0] };
    const pptx = createPptx();
    pptx.defineLayout({ name: "PPTD", width: layout.w, height: layout.h });
    pptx.layout = "PPTD";
    pptx.author = "Open SlideStudio native exporter";
    pptx.title = project.presentation.title ?? "Deck";
    const degradations = [];
    const gradientPatches = [];
    const srcRectPatches = [];
    const chartPatches = [];
    const editDataCharts = { ok: [], failed: [] };
    const editableLines = [];
    let mapped = 0;
    let failed = 0;
    project.pages.forEach((lp, slideIndex) => {
        const slide = pptx.addSlide();
        const pageSurface = pageSurfaceColor(lp.page, project.presentation.theme, size);
        const bg = lp.page.background;
        if (bg) {
            if (bg.type === "solid" || (!bg.type && typeof bg.color === "string")) {
                slide.background = {
                    color: hex(bg.color ?? "#FFFFFF", project.presentation.theme),
                };
            }
            else if (bg.type === "image" && bg.src) {
                let src = bg.src;
                if (!src.startsWith("http") && !src.startsWith("data:")) {
                    const local = path.join(project.rootDir, src);
                    if (fs.existsSync(local))
                        src = local;
                    else {
                        degradations.push({
                            slideIndex,
                            kind: "missing-image",
                            reason: `page background not found: ${bg.src}`,
                        });
                        src = "";
                    }
                }
                if (src) {
                    try {
                        slide.background = {
                            path: src.startsWith("data:") ? undefined : src,
                            data: src.startsWith("data:") ? src : undefined,
                        };
                    }
                    catch {
                        degradations.push({
                            slideIndex,
                            kind: "image-fill-as-solid",
                            reason: "page background image failed; solid fallback",
                        });
                        slide.background = { color: "111111" };
                    }
                }
            }
            else if (bg.type === "gradient") {
                degradations.push({
                    slideIndex,
                    kind: "gradient-as-solid",
                    reason: "page gradient collapsed to first stop",
                });
                const c = bg.stops?.[0]?.color ?? "#FFFFFF";
                slide.background = { color: hex(c, project.presentation.theme) };
            }
        }
        for (const el of lp.page.elements) {
            if (isMicroscopicHiddenChart(el))
                continue;
            try {
                switch (el.elementType) {
                    case "text":
                        mapText(slide, el, project.presentation.theme, size, layout);
                        mapped++;
                        break;
                    case "shape":
                        mapShape(slide, pptx.ShapeType, el, project.presentation.theme, size, layout, degradations, slideIndex, gradientPatches);
                        mapped++;
                        break;
                    case "table":
                        mapTable(slide, el, project.presentation.theme, size, layout);
                        mapped++;
                        break;
                    case "chart":
                        mapChart(slide, el, project.presentation.theme, size, layout, degradations, slideIndex, editDataCharts, pageSurface, chartPatches);
                        mapped++;
                        break;
                    case "image":
                        mapImage(slide, el, project.rootDir, size, layout, degradations, slideIndex, srcRectPatches);
                        mapped++;
                        break;
                    case "line":
                        editableLines.push(mapLine(slide, el, project.presentation.theme, size, layout, degradations, slideIndex));
                        mapped++;
                        break;
                    case "icon": {
                        const ic = el;
                        mapIcon(slide, ic, project.presentation.theme, size, layout, degradations, slideIndex);
                        mapped++;
                        break;
                    }
                    default:
                        degradations.push({
                            slideIndex,
                            elementId: el.elementId,
                            kind: "unsupported-element",
                            reason: `elementType ${el.elementType} not mapped in shell exporter`,
                        });
                        failed++;
                }
            }
            catch (e) {
                failed++;
                degradations.push({
                    slideIndex,
                    elementId: el.elementId,
                    kind: "error",
                    reason: e instanceof Error ? e.message : String(e),
                });
            }
        }
        if (lp.page.notes) {
            slide.addNotes(lp.page.notes);
        }
    });
    let raw = await postProcessPptx((await pptx.write({ outputType: "nodebuffer" })), {
        gradients: gradientPatches,
        srcRects: srcRectPatches,
        fixedTimestamps: true,
        slideFonts: true,
        charts: chartPatches,
    });
    let embeddedFonts;
    let skippedFonts;
    if (opts.embedFonts) {
        // One bad face must never abort the export: plan-level failures degrade
        // to an empty embed set instead.
        const plan = await buildEmbeddedFonts(project, opts.embedFonts.families, opts.embedFonts.fontsDir).catch((error) => ({
            fonts: [],
            skipped: [
                {
                    typeface: "*",
                    reason: error instanceof Error ? error.message : String(error),
                },
            ],
        }));
        const packed = await embedFontsIntoPptx(raw, plan);
        raw = packed.data;
        embeddedFonts = packed.embedded;
        skippedFonts = plan.skipped;
    }
    const total = mapped + failed;
    const hard = degradations.filter((d) => HARD_DEGRADATION_KINDS.includes(d.kind) ||
        /full-page|raster slide|screenshot slide/i.test(d.reason ?? ""));
    const report = {
        ok: hard.length === 0 && editDataCharts.failed.length === 0,
        slideCount: project.pages.length,
        nativeCoverage: total === 0 ? 1 : mapped / total,
        degradations,
        editDataCharts,
        editableLines,
        bytes: raw.byteLength,
        ...(embeddedFonts ? { embeddedFonts } : {}),
        ...(skippedFonts ? { skippedFonts } : {}),
    };
    const filename = `${(project.presentation.title ?? "deck").replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_+|_+$/g, "") || "deck"}.pptx`;
    return { data: raw, report, filename };
}
export async function exportProjectToFile(source, outPath, opts = {}) {
    const result = await exportProjectToPptx(source, opts);
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, result.data);
    return result;
}
//# sourceMappingURL=export-pptd.js.map