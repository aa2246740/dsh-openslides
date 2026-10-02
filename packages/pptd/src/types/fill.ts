/** Paint / stroke primitives shared by backgrounds and elements. */

export type GradientStop = {
  /** 0–1 */
  offset: number;
  color: string;
};

export type SolidFill = {
  type: "solid";
  color: string;
};

export type GradientFill = {
  type: "gradient";
  /** Degrees; 0 = left→right */
  angle?: number;
  stops: GradientStop[];
};

export type ImageFill = {
  type: "image";
  assetId: string;
  fit?: "cover" | "contain" | "fill";
};

export type NoneFill = {
  type: "none";
};

export type Fill = SolidFill | GradientFill | ImageFill | NoneFill;

export type StrokeDash = "solid" | "dashed" | "dotted";

export type Stroke = {
  color: string;
  width: number;
  dash?: StrokeDash;
};

export type Shadow = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
};

export function solidFill(color: string): SolidFill {
  return { type: "solid", color };
}

export function noneFill(): NoneFill {
  return { type: "none" };
}
