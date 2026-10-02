/**
 * @open-slidestudio/pptd-v2
 *
 * Kimi YAML PPTD v2 — sole document SSOT for native offline stack.
 */
export { WRITE_PAGE_PARAMETER_SPEC, PPTD_ELEMENT_PARAMETER_SPEC, EDIT_ELEMENTS_PARAMETER_SPEC, writePageJsonSchema, editElementsJsonSchema, canonicalWritePageIssues, canonicalEditElementsIssues, canonicalFillIssues, canonicalTextStylePatchIssues, isCanonicalWritePageArgs, isCanonicalEditElementsArgs, coerceLineArrowHead, normalizeWritePageLineArrows, normalizeWritePageDialect, } from "./write-page-schema.js";
export { categoricalChartModel, chartKind, placeScatterLabels, scatterChartModel, waterfallChartModel, } from "./chart-semantics.js";
export { CHART_GRID, CHART_INK, CHART_PALETTE, CHART_TEXT_PX, alignedSecondaryScale, chartLayout, chartNumberFormatCode, chartSwatch, chartZeroHiddenFormatCode, formatChartValue, measureChartText, niceScale, resolveChartLegend, seriesDecimals, } from "./chart-layout.js";
export { DEFAULT_TEXT_LINE_HEIGHT, TEXT_LAYOUT_CONTRACT_V1, effectiveLayoutRole, footerZoneTopForSlide, } from "./text-layout.js";
export { loadProject, saveProject, withProjectWriteLock, createEmptyProject, titleOnlyCoverPage, listComposedPage, calculateMaterialFingerprint, PptdError, } from "./parse.js";
export { SHAPE_ALIASES, SHAPE_CATALOG, SHAPE_BY_NAME, SUPPORTED_SHAPE_NAMES, canonicalShapeName, isSupportedShapeName, shapeDefaults, } from "./shape-catalog.js";
export { shapePath, shapeSvg, shapeGeometry, adjUnit } from "./shape-path.js";
export { ooxmlShapePath, ooxmlPresetNames, ooxmlShapeGeometry, ooxmlAdjustHandles, } from "./ooxml-geom.js";
export { CHART_FONT_FACE, DEFAULT_FONT_PAIR, SLIDE_FONTS, canonicalFontName, defaultThemeTextStyles, fontCss, fontEntry, isSlideFont, normalizeFontFamily, normalizePageFonts, resolveFontPair, } from "./font-policy.js";
export { resolveThemeColor, officialPptdColorKind, InvalidPptdColorError, toRgbHex, colorAlpha, relativeLuminance, contrastRatio, shapePaintFill, elementFillPaint, svgFillFromFillCss, stripHtmlToText, parseRichText, serializeRichText, applyRangeStyle, toCssColor, unescapePlainText, resolveTextStyle, } from "./theme.js";
//# sourceMappingURL=index.js.map