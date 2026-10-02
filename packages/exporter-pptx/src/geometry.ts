import type { AspectRatio, Deck, Size, Slide } from "./types.js";

/** Standard PowerPoint 16:9 layout in inches. */
export const LAYOUT_16x9 = { name: "LAYOUT_16x9", width: 10, height: 5.625 };
export const LAYOUT_4x3 = { name: "LAYOUT_4x3", width: 10, height: 7.5 };
export const LAYOUT_PORTRAIT = {
  name: "OSS_PORTRAIT",
  width: 5.625,
  height: 10,
};

export type SlideLayout = {
  name: string;
  widthIn: number;
  heightIn: number;
  widthPx: number;
  heightPx: number;
};

const DEFAULT_PX_16x9: Size = { width: 1920, height: 1080 };
const DEFAULT_PX_4x3: Size = { width: 1440, height: 1080 };
const DEFAULT_PX_PORTRAIT: Size = { width: 1080, height: 1920 };

export function resolveSlidePixelSize(
  slide: Slide,
  aspect: AspectRatio | undefined,
): Size {
  if (slide.size?.width && slide.size?.height) {
    return { width: slide.size.width, height: slide.size.height };
  }
  switch (aspect) {
    case "4:3":
      return { ...DEFAULT_PX_4x3 };
    case "portrait":
      return { ...DEFAULT_PX_PORTRAIT };
    case "16:9":
    default:
      return { ...DEFAULT_PX_16x9 };
  }
}

export function resolveLayoutInches(aspect: AspectRatio | undefined): {
  name: string;
  width: number;
  height: number;
  custom: boolean;
} {
  switch (aspect) {
    case "4:3":
      return { ...LAYOUT_4x3, custom: false };
    case "portrait":
      return {
        name: LAYOUT_PORTRAIT.name,
        width: LAYOUT_PORTRAIT.width,
        height: LAYOUT_PORTRAIT.height,
        custom: true,
      };
    case "16:9":
    default:
      return { ...LAYOUT_16x9, custom: false };
  }
}

export function buildSlideLayout(slide: Slide, deck: Deck): SlideLayout {
  const px = resolveSlidePixelSize(slide, deck.aspectRatio);
  const inches = resolveLayoutInches(deck.aspectRatio);
  return {
    name: inches.name,
    widthIn: inches.width,
    heightIn: inches.height,
    widthPx: px.width,
    heightPx: px.height,
  };
}

export type BoxInches = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
};

/** Convert PPTD top-left pixel coords to pptxgen inches. */
export function pxBoxToInches(
  el: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  layout: SlideLayout,
): BoxInches {
  const sx = layout.widthIn / layout.widthPx;
  const sy = layout.heightIn / layout.heightPx;
  return {
    x: el.x * sx,
    y: el.y * sy,
    w: Math.max(el.width * sx, 0.01),
    h: Math.max(el.height * sy, 0.01),
    rotate: el.rotation && el.rotation !== 0 ? el.rotation : undefined,
  };
}

export function pxToInchesX(px: number, layout: SlideLayout): number {
  return px * (layout.widthIn / layout.widthPx);
}

export function pxToInchesY(px: number, layout: SlideLayout): number {
  return px * (layout.heightIn / layout.heightPx);
}

/** Sort slides by order then stable index. */
export function sortSlides(slides: Slide[]): Slide[] {
  return slides
    .map((s, index) => ({ s, index }))
    .sort((a, b) => {
      const ao = a.s.order ?? a.index;
      const bo = b.s.order ?? b.index;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map(({ s }) => s);
}

/** Sort elements by zIndex ascending (paint order). */
export function sortElementsByZ<T extends { zIndex?: number }>(
  elements: T[],
): T[] {
  return elements
    .map((el, index) => ({ el, index }))
    .sort((a, b) => {
      const az = a.el.zIndex ?? a.index;
      const bz = b.el.zIndex ?? b.index;
      if (az !== bz) return az - bz;
      return a.index - b.index;
    })
    .map(({ el }) => el);
}
