import { resolveFontPair } from "./font-policy.js";
import { DEFAULT_TEXT_LINE_HEIGHT } from "./text-layout.js";
/** Resolve `$primary` style theme color refs; leave other strings as-is. */
export function resolveThemeColor(value, theme, fallback = "#000000") {
    if (!value)
        return fallback;
    if (value.startsWith("$") && theme?.colors) {
        const key = value.slice(1);
        const c = theme.colors[key];
        if (c)
            return resolveThemeColor(c, theme, fallback);
    }
    return value;
}
export function officialPptdColorKind(value) {
    if (value == null)
        return "omitted";
    const v = String(value).trim();
    if (v === "")
        return "omitted";
    if (/^\$[A-Za-z][A-Za-z0-9_-]*$/.test(v))
        return "theme";
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(v))
        return "hash";
    if (/^[0-9A-Fa-f]{3}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v) || /^[0-9A-Fa-f]{8}$/.test(v)) {
        return "unprefixed";
    }
    return "invalid";
}
export class InvalidPptdColorError extends Error {
    input;
    kind;
    constructor(input, kind = officialPptdColorKind(input)) {
        super(`PPTD Color requires #RRGGBB, #RRGGBBAA, or a Theme.colors $token that exists (reference/pptd.md). ${JSON.stringify(input)} is ${kind}; it must not become #000000.`);
        this.name = "InvalidPptdColorError";
        this.input = input;
        this.kind = kind;
    }
}
function normalizeOfficialHash(v) {
    if (!v.startsWith("#"))
        return undefined;
    let h = v.slice(1);
    if (h.length === 3) {
        h = h
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (h.length === 8)
        h = h.slice(0, 6);
    if (h.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(h))
        return undefined;
    return `#${h.toUpperCase()}`;
}
/**
 * Normalize official PPTD color to #RRGGBB (drop alpha).
 * Omitted values use `fallback`. Present unprefixed RRGGBB and unresolved
 * `$theme` are rejected — never invented as #000000 / #FFFFFF.
 */
export function toRgbHex(value, theme, fallback = "#000000") {
    if (value == null || String(value).trim() === "") {
        return normalizeOfficialHash(fallback) ?? "#000000";
    }
    const resolved = resolveThemeColor(value, theme, "").trim();
    const kind = officialPptdColorKind(resolved);
    if (kind === "hash") {
        const hex = normalizeOfficialHash(resolved);
        if (hex)
            return hex;
    }
    if (kind === "unprefixed" || kind === "invalid" || kind === "theme") {
        throw new InvalidPptdColorError(String(value).trim(), kind);
    }
    return normalizeOfficialHash(fallback) ?? "#000000";
}
/** Extract alpha 0–1 from #RRGGBBAA if present. */
export function colorAlpha(value, theme) {
    const v = resolveThemeColor(value, theme, "").trim();
    if (!v.startsWith("#"))
        return undefined;
    const h = v.slice(1);
    if (h.length === 8) {
        return parseInt(h.slice(6, 8), 16) / 255;
    }
    return undefined;
}
function srgbChannelToLinear(channel) {
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
/** Relative luminance 0–1 from sRGB hex (WCAG). */
export function relativeLuminance(hex, theme) {
    const value = toRgbHex(hex, theme).replace("#", "");
    const red = Number.parseInt(value.slice(0, 2), 16) / 255;
    const green = Number.parseInt(value.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
    return (0.2126 * srgbChannelToLinear(red) +
        0.7152 * srgbChannelToLinear(green) +
        0.0722 * srgbChannelToLinear(blue));
}
/** WCAG contrast ratio of two sRGB colors (1–21). */
export function contrastRatio(a, b, theme) {
    const left = relativeLuminance(a, theme);
    const right = relativeLuminance(b, theme);
    const hi = Math.max(left, right);
    const lo = Math.min(left, right);
    return (hi + 0.05) / (lo + 0.05);
}
/**
 * Paint the native canvas actually draws for a shape fill.
 * Missing fill / type none is no paint — opacity does not invent a color.
 */
export function shapePaintFill(fill, opacity, theme) {
    if (!fill || fill.type === "none")
        return undefined;
    let raw;
    if (fill.type === "solid" || (!fill.type && typeof fill.color === "string")) {
        raw = fill.color;
    }
    else if (fill.type === "gradient") {
        raw = fill.stops?.[0]?.color;
    }
    else {
        return undefined;
    }
    if (!raw)
        return undefined;
    const elementOpacity = opacity == null || Number.isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
    const alpha = Math.max(0, Math.min(1, (colorAlpha(raw, theme) ?? 1) * elementOpacity));
    if (alpha <= 0)
        return undefined;
    return { hex: toRgbHex(raw, theme), alpha };
}
/**
 * Single paint decision for Hub SVG and hybrid PPTX.
 * Official PPTD (`reference/pptd.md`):
 * - Shape / table / chart `fill` default is "not applied" (no paint).
 * - Icon `fill` default is black solid.
 * Opacity does not invent a color.
 */
export function elementFillPaint(elementType, fill, opacity, theme) {
    const kind = (elementType || "shape").toLowerCase();
    if (!fill) {
        if (kind === "icon") {
            const elementOpacity = opacity == null || Number.isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
            if (elementOpacity <= 0)
                return { type: "none" };
            return { type: "solid", hex: "#000000", alpha: elementOpacity };
        }
        return { type: "none" };
    }
    const paint = shapePaintFill(fill, opacity, theme);
    if (!paint)
        return { type: "none" };
    return { type: "solid", hex: paint.hex, alpha: paint.alpha };
}
/** SVG `fill` attribute for Hub. Missing CSS is no paint — never invent a color. */
export function svgFillFromFillCss(fillCss) {
    if (!fillCss || fillCss === "none" || fillCss === "transparent")
        return "none";
    return fillCss;
}
function decodeEntities(s) {
    return s
        // Line endings normalize to \n — a pasted or hand-edited CRLF must not
        // survive into run text and round-trip as a literal \r.
        .replace(/\r\n?/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (m, d) => {
        const n = Number(d);
        return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
        .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
        const n = parseInt(h, 16);
        return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
        // &amp; decodes LAST: a double-escaped entity like &amp;lt; must stay the
        // literal text "&lt;", not collapse to "<".
        .replace(/&amp;/g, "&");
}
function applyInlineCss(run, css) {
    for (const part of css.split(";")) {
        const i = part.indexOf(":");
        if (i < 0)
            continue;
        const key = part.slice(0, i).trim().toLowerCase();
        const val = part.slice(i + 1).trim();
        if (key === "font-size") {
            const n = parseFloat(val);
            // Slide font sizes live in a sane point range; anything else is a
            // malformed clipboard fragment, not a style.
            if (Number.isFinite(n) && n > 0 && n <= 400)
                run.fontSize = n;
        }
        else if (key === "color") {
            // Whitelist color syntax — a hostile clipboard style like
            // url(javascript:…) or expression(…) must not become a run color.
            if (/^(#[0-9a-fA-F]{3,8}|rgba?\([^()]{1,60}\)|hsla?\([^()]{1,60}\)|[a-zA-Z]{1,20})$/.test(val)) {
                run.color = val;
            }
        }
        else if (key === "font-weight") {
            const n = parseInt(val, 10);
            run.bold = val === "bold" || (Number.isFinite(n) && n >= 600);
        }
        else if (key === "font-style") {
            run.italic = val === "italic";
        }
        else if (key === "text-decoration") {
            const lower = val.toLowerCase();
            if (lower.includes("underline"))
                run.underline = true;
            else if (lower.includes("none"))
                run.underline = false;
        }
    }
}
const SKIP_TEXT_TAGS = new Set(["script", "style", "iframe", "object", "noscript"]);
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function runStyle(run) {
    const out = {};
    if (run.fontSize != null)
        out.fontSize = run.fontSize;
    if (run.color != null && run.color !== "")
        out.color = run.color;
    if (run.bold)
        out.bold = true;
    if (run.italic)
        out.italic = true;
    if (run.underline)
        out.underline = true;
    return out;
}
function runHasStyle(run) {
    return (run.fontSize != null ||
        (run.color != null && run.color !== "") ||
        Boolean(run.bold) ||
        Boolean(run.italic) ||
        Boolean(run.underline));
}
function styleKey(run) {
    const s = runStyle(run);
    return JSON.stringify({
        fontSize: s.fontSize ?? null,
        color: s.color ?? null,
        bold: Boolean(s.bold),
        italic: Boolean(s.italic),
        underline: Boolean(s.underline),
    });
}
function mergeRuns(runs) {
    const out = [];
    for (const run of runs) {
        if (!run.text)
            continue;
        const styled = { ...runStyle(run), text: run.text };
        const prev = out[out.length - 1];
        if (prev && styleKey(prev) === styleKey(styled)) {
            prev.text += styled.text;
        }
        else {
            out.push(styled);
        }
    }
    return out;
}
function appendText(runs, style, text) {
    if (!text)
        return;
    const last = runs[runs.length - 1];
    const next = { ...runStyle(style), text };
    if (last && styleKey(last) === styleKey(next))
        last.text += text;
    else
        runs.push(next);
}
function styleCss(run) {
    const parts = [];
    if (run.fontSize != null)
        parts.push(`font-size:${run.fontSize}px`);
    if (run.color != null && run.color !== "")
        parts.push(`color:${run.color}`);
    if (run.bold)
        parts.push("font-weight:700");
    if (run.italic)
        parts.push("font-style:italic");
    if (run.underline)
        parts.push("text-decoration:underline");
    return parts.join(";");
}
function applyPatch(style, patch) {
    const next = { ...style };
    const keys = ["bold", "italic", "underline", "color", "fontSize"];
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(patch, key))
            continue;
        const val = patch[key];
        if (val === null)
            delete next[key];
        else
            next[key] = val;
    }
    return runStyle(next);
}
/**
 * Parse Kimi PPTD HTML fragments into styled runs.
 * Official decks store metric labels as `<p><span style=…>`.
 * Canonical serialize form (style-only spans) round-trips losslessly after merge.
 */
export function parseRichText(html) {
    if (!html)
        return [];
    if (!/<[a-z][\s\S]*>/i.test(html)) {
        return mergeRuns([{ text: decodeEntities(html) }]);
    }
    const runs = [];
    const stack = [{}];
    let skipDepth = 0;
    // Comments (incl. clipboard <!--StartFragment--> markers) are matched first
    // and dropped — otherwise the comment body leaks in as literal text.
    const tokenRe = /<!--[\s\S]*?-->|<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
    let m;
    while ((m = tokenRe.exec(html))) {
        if (m[1] == null && m[2] == null && m[3] == null)
            continue; // comment
        if (m[3] != null) {
            if (skipDepth)
                continue;
            const text = decodeEntities(m[3]);
            if (!text)
                continue;
            appendText(runs, stack[stack.length - 1], text);
            continue;
        }
        const tag = m[1].toLowerCase();
        const closing = m[0].startsWith("</");
        const selfClosing = /\/>$/.test(m[0]);
        if (SKIP_TEXT_TAGS.has(tag)) {
            if (closing)
                skipDepth = Math.max(0, skipDepth - 1);
            else
                skipDepth += 1;
            continue;
        }
        if (tag === "br") {
            if (!skipDepth)
                appendText(runs, stack[stack.length - 1], "\n");
            continue;
        }
        if (tag === "p" && closing) {
            // Paragraph break belongs to the preceding run so styled wraps
            // like </span></p><p><span> round-trip as one "\n" with that style.
            if (!skipDepth) {
                if (runs.length)
                    runs[runs.length - 1].text += "\n";
                else
                    appendText(runs, stack[stack.length - 1], "\n");
            }
        }
        if (closing) {
            if (stack.length > 1)
                stack.pop();
            continue;
        }
        // Self-closing tags (<span/>, <b/>) wrap no text — pushing a frame would
        // leak their style into everything that follows.
        if (selfClosing)
            continue;
        const next = { ...stack[stack.length - 1] };
        const style = /style\s*=\s*"([^"]*)"/i.exec(m[2] ?? "")?.[1] ?? "";
        applyInlineCss(next, style);
        if (tag === "b" || tag === "strong")
            next.bold = true;
        if (tag === "i" || tag === "em")
            next.italic = true;
        if (tag === "u")
            next.underline = true;
        stack.push(next);
    }
    // Final </p> always contributes one terminator newline — drop exactly one.
    if (runs.length) {
        const last = runs[runs.length - 1];
        if (last.text.endsWith("\n")) {
            last.text = last.text.slice(0, -1);
            if (!last.text)
                runs.pop();
        }
    }
    return mergeRuns(runs);
}
/**
 * Canonical Kimi-style HTML: plain escaped string when there is a single
 * unstyled paragraph; otherwise `<p>` per line with style-only
 * `<span style="font-size:__px;color:__;font-weight:700;font-style:italic;text-decoration:underline">`.
 */
export function serializeRichText(runs) {
    if (!runs.length)
        return "";
    const hasStyle = runs.some(runHasStyle);
    const joined = runs.map((r) => r.text).join("");
    if (!hasStyle && !joined.includes("\n"))
        return escapeHtml(joined);
    const paragraphs = [
        [],
    ];
    for (const run of runs) {
        const style = runStyle(run);
        const parts = run.text.split("\n");
        for (let i = 0; i < parts.length; i++) {
            if (i > 0)
                paragraphs.push([]);
            if (parts[i].length) {
                paragraphs[paragraphs.length - 1].push({ style, text: parts[i] });
            }
        }
    }
    return paragraphs
        .map((para) => {
        const inner = para
            .map(({ style, text }) => {
            const css = styleCss(style);
            const escaped = escapeHtml(text);
            return css ? `<span style="${css}">${escaped}</span>` : escaped;
        })
            .join("");
        return `<p>${inner}</p>`;
    })
        .join("");
}
/**
 * Split runs at plain-text offsets `[start, end)` over concatenated run text
 * (paragraph breaks count as one `"\n"`), apply `patch`, and merge adjacent
 * identical styles.
 */
export function applyRangeStyle(runs, start, end, patch) {
    const total = runs.reduce((n, r) => n + r.text.length, 0);
    const lo = Math.max(0, Math.min(start, end, total));
    const hi = Math.max(0, Math.min(Math.max(start, end), total));
    if (lo === hi)
        return mergeRuns(runs.map((r) => ({ ...r, text: r.text })));
    const out = [];
    let cursor = 0;
    for (const run of runs) {
        const runStart = cursor;
        const runEnd = cursor + run.text.length;
        cursor = runEnd;
        if (runEnd <= lo || runStart >= hi) {
            out.push({ ...runStyle(run), text: run.text });
            continue;
        }
        const leftLen = Math.max(0, lo - runStart);
        const midEnd = Math.min(run.text.length, hi - runStart);
        if (leftLen > 0) {
            out.push({ ...runStyle(run), text: run.text.slice(0, leftLen) });
        }
        const mid = run.text.slice(leftLen, midEnd);
        if (mid) {
            out.push({ ...applyPatch(run, patch), text: mid });
        }
        if (midEnd < run.text.length) {
            out.push({ ...runStyle(run), text: run.text.slice(midEnd) });
        }
    }
    return mergeRuns(out);
}
/** Strip HTML to plain text (PPTD often stores `<p><span style=…>` rich text). */
export function stripHtmlToText(html) {
    return parseRichText(html)
        .map((r) => r.text)
        .join("")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
/** CSS color that keeps 8-digit hex alpha (`#FFFFFFB3` → rgba). */
export function toCssColor(value, theme, fallback = "#000000") {
    const raw = resolveThemeColor(value, theme, fallback);
    const hex = toRgbHex(raw, theme, fallback);
    const a = colorAlpha(raw, theme);
    if (a == null || a >= 0.995)
        return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
/**
 * Models often put JSON-style \\n into YAML plain scalars.
 * Those two characters are not a newline until we unescape them.
 */
export function unescapePlainText(text) {
    return text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}
/**
 * Resolve text style chain: content fields > theme textStyles[style] > defaults.
 * `style` may be `"$pageTitle"` or `"pageTitle"`.
 */
export function resolveTextStyle(content, theme) {
    const styleKey = content.style?.replace(/^\$/, "");
    const fromTheme = styleKey && theme?.textStyles?.[styleKey]
        ? theme.textStyles[styleKey]
        : {};
    const runs = parseRichText(unescapePlainText(content.text ?? ""));
    const colorRaw = content.color ??
        fromTheme.color ??
        runs[0]?.color ??
        "#000000";
    const fontSize = content.fontSize ??
        (typeof fromTheme.fontSize === "number" ? fromTheme.fontSize : undefined) ??
        runs[0]?.fontSize ??
        18;
    const bold = content.bold ??
        (typeof fromTheme.bold === "boolean" ? fromTheme.bold : undefined) ??
        Boolean(runs[0]?.bold);
    const italic = content.italic ??
        (typeof fromTheme.italic === "boolean" ? fromTheme.italic : undefined) ??
        Boolean(runs[0]?.italic);
    const underline = content.underline ??
        (typeof fromTheme.underline === "boolean" ? fromTheme.underline : undefined) ??
        Boolean(runs[0]?.underline);
    const lineHeight = content.lineHeight ??
        (typeof fromTheme.lineHeight === "number"
            ? fromTheme.lineHeight
            : DEFAULT_TEXT_LINE_HEIGHT);
    const letterSpacing = content.letterSpacing ??
        (typeof fromTheme.letterSpacing === "number"
            ? fromTheme.letterSpacing
            : undefined);
    const highlightRaw = content.backgroundColor ??
        (typeof fromTheme.backgroundColor === "string"
            ? fromTheme.backgroundColor
            : undefined);
    const backgroundColor = highlightRaw
        ? toCssColor(highlightRaw, theme)
        : undefined;
    const themeFont = fromTheme.fontFamily;
    const fontFamily = resolveFontPair(content.fontFamily ?? themeFont);
    return {
        text: runs.map((r) => r.text).join(""),
        color: toCssColor(colorRaw, theme),
        colorHex: toRgbHex(colorRaw, theme),
        fontSize,
        fontFamily,
        bold,
        italic,
        underline,
        backgroundColor,
        lineHeight,
        letterSpacing,
        align: content.align ?? ["left", "top"],
        wrap: content.wrap !== false,
        list: content.list,
        href: content.href,
        runs,
    };
}
//# sourceMappingURL=theme.js.map