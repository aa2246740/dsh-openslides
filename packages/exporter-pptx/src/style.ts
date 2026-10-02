import type PptxGenJS from "pptxgenjs";
import type { Fill, Shadow, Stroke, TextAlign, TextRun, VerticalAlign } from "./types.js";
import type { ReportBuilder } from "./report.js";
import type { SlideLayout } from "./geometry.js";

/** Strip # and expand short hex; returns 6-char uppercase RGB without #. */
export function normalizeHexColor(
  input: string | undefined,
  fallback = "000000",
): string {
  if (!input || typeof input !== "string") return fallback;
  let c = input.trim();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.startsWith("rgb")) {
    const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) {
      const r = Math.round(Number(m[1]));
      const g = Math.round(Number(m[2]));
      const b = Math.round(Number(m[3]));
      return [r, g, b]
        .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    }
  }
  if (/^[0-9a-fA-F]{3}$/.test(c)) {
    c = c
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(c)) return c.toUpperCase();
  if (/^[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 6).toUpperCase();
  return fallback;
}

/** Opacity 0–1 → pptx transparency 0–100 (0 = opaque). */
export function opacityToTransparency(
  opacity: number | undefined,
): number | undefined {
  if (opacity === undefined || Number.isNaN(opacity)) return undefined;
  const o = Math.max(0, Math.min(1, opacity));
  if (o >= 0.999) return undefined;
  return Math.round((1 - o) * 100);
}

export type MappedFill = {
  fill?: PptxGenJS.ShapeFillProps;
  solidColor?: string;
};

export function mapFill(
  fill: Fill | undefined,
  report: ReportBuilder | null,
  ctx: { slideId: string; slideIndex: number; elementId?: string },
): MappedFill {
  if (!fill || fill.type === "none") {
    return { fill: { type: "none" } };
  }

  if (fill.type === "solid") {
    const color = normalizeHexColor(fill.color, "FFFFFF");
    return {
      solidColor: color,
      fill: { type: "solid", color },
    };
  }

  if (fill.type === "gradient") {
    const first = fill.stops?.[0]?.color;
    const last = fill.stops?.[fill.stops.length - 1]?.color;
    const color = normalizeHexColor(first ?? last, "CCCCCC");
    report?.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: ctx.elementId,
      kind: "gradient-as-solid",
      reason: "pptxgenjs solid fill only; gradient stops collapsed to first stop",
      fallback: `solid #${color}`,
    });
    return {
      solidColor: color,
      fill: { type: "solid", color },
    };
  }

  if (fill.type === "image") {
    report?.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      elementId: ctx.elementId,
      kind: "unsupported-fill",
      reason: "image fill requires resolved asset; not mapped as shape fill",
      fallback: "no fill",
    });
    return { fill: { type: "none" } };
  }

  return { fill: { type: "none" } };
}

export function mapStroke(
  stroke: Stroke | undefined,
): PptxGenJS.ShapeLineProps | undefined {
  if (!stroke) return undefined;
  if (stroke.width !== undefined && stroke.width <= 0) {
    return { color: "FFFFFF", width: 0, transparency: 100 };
  }
  const color = normalizeHexColor(stroke.color, "000000");
  const width = stroke.width ?? 1;
  const dashMap: Record<string, PptxGenJS.ShapeLineProps["dashType"]> = {
    solid: "solid",
    dashed: "dash",
    dotted: "sysDot",
    dash: "dash",
    dot: "sysDot",
  };
  return {
    color,
    width,
    dashType: dashMap[stroke.dash ?? "solid"] ?? "solid",
  };
}

export function mapShadow(
  shadow: Shadow | undefined,
): PptxGenJS.ShadowProps | undefined {
  if (!shadow) return undefined;
  const offsetX = shadow.offsetX ?? 0;
  const offsetY = shadow.offsetY ?? 0;
  const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
  const angle =
    offset === 0
      ? 0
      : (((Math.atan2(offsetY, offsetX) * 180) / Math.PI) + 360) % 360;
  return {
    type: "outer",
    color: normalizeHexColor(shadow.color, "000000"),
    blur: shadow.blur ?? 4,
    offset: Math.min(200, offset * 0.75),
    angle,
    opacity: 0.35,
  };
}

export function mapAlign(
  align: TextAlign | undefined,
): PptxGenJS.HAlign | undefined {
  if (!align) return undefined;
  return align;
}

export function mapVAlign(
  valign: VerticalAlign | undefined,
): PptxGenJS.VAlign | undefined {
  if (!valign) return undefined;
  return valign;
}

export function isBold(weight: number | string | undefined): boolean {
  if (weight === undefined) return false;
  if (weight === "bold") return true;
  if (weight === "normal") return false;
  if (typeof weight === "number") return weight >= 600;
  const n = Number(weight);
  return !Number.isNaN(n) && n >= 600;
}

export function mapTextRun(
  run: TextRun,
  defaults?: { fontFace?: string; color?: string; fontSize?: number },
): Partial<PptxGenJS.TextPropsOptions> {
  // TextPropsOptions (not TextBaseProps) owns hyperlink / charSpacing in pptxgenjs 3.12
  const out: Partial<PptxGenJS.TextPropsOptions> = {};
  const fontFace = run.fontFamily ?? defaults?.fontFace;
  if (fontFace) out.fontFace = firstFontFamily(fontFace);
  const fontSize = run.fontSize ?? defaults?.fontSize;
  if (fontSize !== undefined) out.fontSize = fontSize;
  if (run.italic) out.italic = true;
  if (run.underline) out.underline = { style: "sng" };
  if (isBold(run.fontWeight)) out.bold = true;
  const color = run.color ?? defaults?.color;
  if (color) out.color = normalizeHexColor(color);
  if (run.href) out.hyperlink = { url: run.href };
  if (run.letterSpacing !== undefined) out.charSpacing = run.letterSpacing;
  return out;
}

/** pptxgen wants a single face name; strip CSS stacks. */
export function firstFontFamily(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first || undefined;
}

export function mapBackground(
  fill: Fill | undefined,
  report: ReportBuilder,
  ctx: { slideId: string; slideIndex: number },
): PptxGenJS.BackgroundProps | undefined {
  if (!fill || fill.type === "none") return undefined;
  if (fill.type === "solid") {
    return { color: normalizeHexColor(fill.color, "FFFFFF") };
  }
  if (fill.type === "gradient") {
    const color = normalizeHexColor(fill.stops?.[0]?.color, "FFFFFF");
    report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      kind: "gradient-as-solid",
      reason: "slide background gradient collapsed to solid",
      fallback: `solid #${color}`,
    });
    return { color };
  }
  if (fill.type === "image") {
    report.addDegradation({
      slideId: ctx.slideId,
      slideIndex: ctx.slideIndex,
      kind: "unsupported-fill",
      reason: `background image asset "${fill.assetId}" not resolved`,
      fallback: "white background",
    });
    return { color: "FFFFFF" };
  }
  return { color: "FFFFFF" };
}

export function looksLikeDataUrl(src: string): boolean {
  return /^data:/i.test(src);
}

export function looksLikeBase64(src: string): boolean {
  return (
    src.length > 64 &&
    !src.includes("/") &&
    !src.includes("\\") &&
    !src.includes(" ") &&
    /^[A-Za-z0-9+/=\s]+$/.test(src.slice(0, 200))
  );
}

export function ensureDataUrl(src: string, mime = "image/png"): string {
  if (looksLikeDataUrl(src)) return src;
  if (src.includes(";base64,")) return src.startsWith("data:") ? src : `data:${src}`;
  return `data:${mime};base64,${src}`;
}

export function resolveImageSource(
  src: string | undefined,
): { kind: "data" | "path"; value: string } | null {
  if (!src || !src.trim()) return null;
  const s = src.trim();
  if (looksLikeDataUrl(s) || looksLikeBase64(s)) {
    return { kind: "data", value: ensureDataUrl(s) };
  }
  // HTTP(S) only — relative/local files need an asset registry or data URLs.
  // Passing non-existent paths into pptxgenjs throws ENOENT during write.
  if (/^https?:\/\//i.test(s)) {
    return { kind: "path", value: s };
  }
  // asset ids / relative media paths — missing without a loader
  if (
    s.startsWith("file:") ||
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(s)
  ) {
    return null;
  }
  if (!s.includes(".") && s.length < 64) {
    return null;
  }
  if (s.length > 32) {
    return { kind: "data", value: ensureDataUrl(s) };
  }
  return null;
}

/** Corner radius in px → pptx rectRadius 0–1 relative to min side. */
export function mapCornerRadius(
  cornerRadiusPx: number | undefined,
  el: { width: number; height: number },
  _layout: SlideLayout,
): number | undefined {
  if (cornerRadiusPx === undefined || cornerRadiusPx <= 0) return undefined;
  const minSide = Math.min(el.width, el.height) || 1;
  return Math.max(0, Math.min(1, cornerRadiusPx / minSide));
}
