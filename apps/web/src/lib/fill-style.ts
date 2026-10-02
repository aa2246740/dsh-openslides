import type { Fill, Stroke } from "@open-slidestudio/pptd";

export function fillToCss(fill: Fill | undefined): string {
  if (!fill || fill.type === "none") return "transparent";
  if (fill.type === "solid") return fill.color;
  if (fill.type === "gradient") {
    const angle = fill.angle ?? 90;
    const stops = fill.stops
      .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
      .join(", ");
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  // image fill: soft placeholder
  return "#e8e8e8";
}

export function strokeToCss(stroke: Stroke | undefined): {
  border?: string;
  outline?: string;
} {
  if (!stroke || stroke.width <= 0) return {};
  const dash =
    stroke.dash === "dashed"
      ? "dashed"
      : stroke.dash === "dotted"
        ? "dotted"
        : "solid";
  return {
    border: `${stroke.width}px ${dash} ${stroke.color}`,
  };
}

export function shadowToCss(shadow: {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
} | undefined): string | undefined {
  if (!shadow) return undefined;
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`;
}
