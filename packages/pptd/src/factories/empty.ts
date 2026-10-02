import type { Deck, Slide } from "../types/deck.js";
import type { ThemeTokens } from "../types/theme.js";
import type { AspectRatio } from "../types/geometry.js";
import { DEFAULT_SLIDE_SIZE, sizeForAspectRatio } from "../types/geometry.js";
import { DEFAULT_THEME } from "../types/theme.js";
import { solidFill } from "../types/fill.js";
import { createId, nowIso } from "../id.js";
import { deepClone } from "../clone.js";

export type CreateEmptyDeckOptions = {
  title?: string;
  aspectRatio?: AspectRatio;
  theme?: ThemeTokens;
  /** When true, include a single blank slide (default true) */
  withSlide?: boolean;
  versionId?: string;
};

export function createEmptySlide(
  order = 0,
  opts?: { aspectRatio?: AspectRatio; background?: string; id?: string },
): Slide {
  const size = opts?.aspectRatio
    ? sizeForAspectRatio(opts.aspectRatio)
    : { ...DEFAULT_SLIDE_SIZE };
  return {
    id: opts?.id ?? createId("slide"),
    order,
    size,
    background: solidFill(opts?.background ?? "#FFFFFF"),
    elements: [],
  };
}

export function createEmptyDeck(options: CreateEmptyDeckOptions = {}): Deck {
  const aspectRatio = options.aspectRatio ?? "16:9";
  const theme = deepClone(options.theme ?? DEFAULT_THEME);
  const ts = nowIso();
  const withSlide = options.withSlide !== false;

  const slides = withSlide
    ? [createEmptySlide(0, { aspectRatio, background: theme.colors.surface })]
    : [];

  return {
    id: createId("deck"),
    title: options.title ?? "Untitled Deck",
    aspectRatio,
    theme,
    slides,
    references: [],
    citations: [],
    versionId: options.versionId ?? createId("ver"),
    createdAt: ts,
    updatedAt: ts,
  };
}
