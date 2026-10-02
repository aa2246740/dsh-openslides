import type { Theme } from "./types.js";
/** Resolve `$primary` style theme color refs; leave other strings as-is. */
export declare function resolveThemeColor(value: string | undefined, theme: Theme | undefined, fallback?: string): string;
/**
 * Official PPTD Color (`reference/pptd.md` Shared Types):
 * HEX6 `#RRGGBB`, HEX8 `#RRGGBBAA`, or `$theme`. Unprefixed `RRGGBB` is not listed.
 */
export type OfficialPptdColorKind = "omitted" | "hash" | "theme" | "unprefixed" | "invalid";
export declare function officialPptdColorKind(value: string | undefined | null): OfficialPptdColorKind;
export declare class InvalidPptdColorError extends Error {
    readonly input: string;
    readonly kind: OfficialPptdColorKind;
    constructor(input: string, kind?: OfficialPptdColorKind);
}
/**
 * Normalize official PPTD color to #RRGGBB (drop alpha).
 * Omitted values use `fallback`. Present unprefixed RRGGBB and unresolved
 * `$theme` are rejected — never invented as #000000 / #FFFFFF.
 */
export declare function toRgbHex(value: string | undefined, theme?: Theme, fallback?: string): string;
/** Extract alpha 0–1 from #RRGGBBAA if present. */
export declare function colorAlpha(value: string | undefined, theme?: Theme): number | undefined;
/** Relative luminance 0–1 from sRGB hex (WCAG). */
export declare function relativeLuminance(hex: string, theme?: Theme): number;
/** WCAG contrast ratio of two sRGB colors (1–21). */
export declare function contrastRatio(a: string, b: string, theme?: Theme): number;
export type ShapePaintFill = {
    hex: string;
    alpha: number;
};
type LooseFill = {
    type?: string;
    color?: string;
    stops?: {
        color?: string;
    }[];
};
/**
 * Paint the native canvas actually draws for a shape fill.
 * Missing fill / type none is no paint — opacity does not invent a color.
 */
export declare function shapePaintFill(fill: LooseFill | undefined, opacity?: number, theme?: Theme): ShapePaintFill | undefined;
export type ElementFillPaint = {
    type: "none";
} | {
    type: "solid";
    hex: string;
    alpha: number;
};
/**
 * Single paint decision for Hub SVG and hybrid PPTX.
 * Official PPTD (`reference/pptd.md`):
 * - Shape / table / chart `fill` default is "not applied" (no paint).
 * - Icon `fill` default is black solid.
 * Opacity does not invent a color.
 */
export declare function elementFillPaint(elementType: string, fill: LooseFill | undefined, opacity?: number, theme?: Theme): ElementFillPaint;
/** SVG `fill` attribute for Hub. Missing CSS is no paint — never invent a color. */
export declare function svgFillFromFillCss(fillCss: string | undefined): string;
export type ResolvedTextStyle = {
    text: string;
    color: string;
    /** Official #RRGGBB for hybrid PPTX. Never CSS rgba — that used to become 000000. */
    colorHex: string;
    fontSize: number;
    /**
     * Always a pair. `latin` draws ASCII, `ea` draws CJK; `fontCss` in
     * font-policy turns the pair into the canvas font stack, and the exporter
     * writes one `<a:latin>` and one `<a:ea>` from it.
     */
    fontFamily: {
        latin: string;
        ea: string;
    };
    bold: boolean;
    italic: boolean;
    underline: boolean;
    backgroundColor?: string;
    lineHeight: number;
    letterSpacing?: number;
    align: [string, string];
    wrap: boolean;
    list?: "bullet" | "number";
    href?: string;
    runs: RichTextRun[];
};
/** One styled span inside PPTD HTML (`<p><span style="font-size:36px">…`). */
export type RichTextRun = {
    text: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
};
/** Patch applied to a plain-text offset range. `null` clears the field. */
export type RangeStylePatch = {
    bold?: boolean | null;
    italic?: boolean | null;
    underline?: boolean | null;
    color?: string | null;
    fontSize?: number | null;
};
/**
 * Parse Kimi PPTD HTML fragments into styled runs.
 * Official decks store metric labels as `<p><span style=…>`.
 * Canonical serialize form (style-only spans) round-trips losslessly after merge.
 */
export declare function parseRichText(html: string): RichTextRun[];
/**
 * Canonical Kimi-style HTML: plain escaped string when there is a single
 * unstyled paragraph; otherwise `<p>` per line with style-only
 * `<span style="font-size:__px;color:__;font-weight:700;font-style:italic;text-decoration:underline">`.
 */
export declare function serializeRichText(runs: RichTextRun[]): string;
/**
 * Split runs at plain-text offsets `[start, end)` over concatenated run text
 * (paragraph breaks count as one `"\n"`), apply `patch`, and merge adjacent
 * identical styles.
 */
export declare function applyRangeStyle(runs: RichTextRun[], start: number, end: number, patch: RangeStylePatch): RichTextRun[];
/** Strip HTML to plain text (PPTD often stores `<p><span style=…>` rich text). */
export declare function stripHtmlToText(html: string): string;
/** CSS color that keeps 8-digit hex alpha (`#FFFFFFB3` → rgba). */
export declare function toCssColor(value: string | undefined, theme?: Theme, fallback?: string): string;
/**
 * Models often put JSON-style \\n into YAML plain scalars.
 * Those two characters are not a newline until we unescape them.
 */
export declare function unescapePlainText(text: string): string;
/**
 * Resolve text style chain: content fields > theme textStyles[style] > defaults.
 * `style` may be `"$pageTitle"` or `"pageTitle"`.
 */
export declare function resolveTextStyle(content: {
    text?: string;
    style?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string | {
        latin: string;
        ea: string;
    };
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    backgroundColor?: string;
    lineHeight?: number;
    letterSpacing?: number;
    align?: [string, string];
    wrap?: boolean;
    list?: "bullet" | "number";
    href?: string;
}, theme?: Theme): ResolvedTextStyle;
export {};
//# sourceMappingURL=theme.d.ts.map