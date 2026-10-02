/**
 * The only font policy for slide content.
 *
 * Slides name fonts that Windows ships and that Office and WPS both resolve,
 * so a deck looks the same on the canvas and after export without embedding
 * anything. Product chrome (the UI) keeps its own font stack and never reads
 * this table.
 *
 * Latin and East Asian text are named separately, the way PowerPoint assigns
 * glyphs: the `latin` face draws ASCII, the `ea` face draws CJK.
 */
export type FontPair = {
    latin: string;
    ea: string;
};
export type FontScript = "latin" | "ea";
export type FontEntry = {
    name: string;
    script: FontScript;
    /** CSS stack used where the face is not installed, e.g. on macOS. */
    fallbacks: readonly string[];
};
export declare const SLIDE_FONTS: readonly FontEntry[];
/** New decks, charts and tables use this pair unless a run says otherwise. */
export declare const DEFAULT_FONT_PAIR: FontPair;
/**
 * Marker the chart XML patcher splits into `<a:latin>` and `<a:ea>`. A pipe
 * cannot be the separator: pptxgenjs reads `body|heading` there and drops
 * the second face. `***` survives both the writer and the attribute
 * sanitizer, which strips braces.
 * `chart-layout.ts` repeats this string verbatim because the browser loads
 * that file on its own and cannot import this module. The two copies are
 * pinned equal by a test; change them together.
 */
export declare const CHART_FONT_FACE: string;
export declare function fontEntry(name: string): FontEntry | undefined;
/** True for exactly the names in `SLIDE_FONTS`, case-insensitively. */
export declare function isSlideFont(name: string): boolean;
/** Canonical spelling for a known font, otherwise the trimmed input. */
export declare function canonicalFontName(name: string): string;
/**
 * CSS `font-family` stack for a PPTD font. Latin is listed before the East
 * Asian stack, which mirrors PowerPoint: a browser takes the first family
 * that has the glyph, so ASCII comes from the Latin face and CJK from the
 * East Asian face. A bare string is treated as the face for both scripts.
 */
export declare function fontCss(family: string | FontPair | undefined): string;
/**
 * Turn any stored fontFamily into the pair the renderer and exporter share.
 * An unknown name is kept verbatim, so a deck saved before this policy still
 * renders the face it named rather than being silently rewritten.
 */
export declare function resolveFontPair(family: string | FontPair | undefined): FontPair;
export type FontReplacement = {
    from: string | FontPair;
    to: string | FontPair;
};
/**
 * Rewrite an Agent-requested font onto `SLIDE_FONTS`. A face already in the
 * table is kept; anything else is replaced by the common face with the same
 * role. `fontNotes` says exactly what moved, so the tool result can tell the
 * model its request was not used verbatim.
 */
export declare function normalizeFontFamily(value: unknown): {
    fontFamily: string | FontPair;
    note?: string;
};
/**
 * Walk Agent-authored page args and rewrite every fontFamily onto
 * `SLIDE_FONTS`. Covers element content, theme text styles and declared
 * custom fonts. Returns one note per value that actually changed.
 */
export declare function normalizePageFonts(args: Record<string, unknown>): FontReplacement[];
/** The theme object a new deck starts from: the default pair for every role. */
export declare function defaultThemeTextStyles(): Record<string, {
    fontFamily: FontPair;
}>;
//# sourceMappingURL=font-policy.d.ts.map