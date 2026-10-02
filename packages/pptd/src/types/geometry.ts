/** Slide-local coordinates; origin top-left. */

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Rect = Point & Size;

/** Default 16:9 slide canvas (EMU-friendly pixels). */
export const DEFAULT_SLIDE_SIZE: Readonly<Size> = {
  width: 1920,
  height: 1080,
} as const;

export type AspectRatio = "16:9" | "4:3" | "portrait";

export function sizeForAspectRatio(aspect: AspectRatio): Size {
  switch (aspect) {
    case "4:3":
      return { width: 1440, height: 1080 };
    case "portrait":
      return { width: 1080, height: 1920 };
    case "16:9":
    default:
      return { width: DEFAULT_SLIDE_SIZE.width, height: DEFAULT_SLIDE_SIZE.height };
  }
}
