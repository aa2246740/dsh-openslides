import type { Deck, Slide } from "../types/deck.js";
import type { SlideElement } from "../types/elements.js";
import { deepClone } from "../clone.js";
import { nowIso } from "../id.js";

export class PptdError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PptdError";
    this.code = code;
  }
}

export function touchDeck(deck: Deck): Deck {
  return { ...deck, updatedAt: nowIso() };
}

export function findSlideIndex(deck: Deck, slideId: string): number {
  const idx = deck.slides.findIndex((s) => s.id === slideId);
  if (idx < 0) {
    throw new PptdError("SLIDE_NOT_FOUND", `Slide not found: ${slideId}`);
  }
  return idx;
}

export function getSlide(deck: Deck, slideId: string): Slide {
  return deck.slides[findSlideIndex(deck, slideId)]!;
}

export function findElementIndex(slide: Slide, elementId: string): number {
  const idx = slide.elements.findIndex((e) => e.id === elementId);
  if (idx < 0) {
    throw new PptdError("ELEMENT_NOT_FOUND", `Element not found: ${elementId}`);
  }
  return idx;
}

export function getElement(slide: Slide, elementId: string): SlideElement {
  return slide.elements[findElementIndex(slide, elementId)]!;
}

export function mapSlide(
  deck: Deck,
  slideId: string,
  mapFn: (slide: Slide) => Slide,
): Deck {
  const idx = findSlideIndex(deck, slideId);
  const slides = deck.slides.slice();
  slides[idx] = mapFn(slides[idx]!);
  return touchDeck({ ...deck, slides });
}

export function renumberOrders(slides: Slide[]): Slide[] {
  return slides.map((s, i) => (s.order === i ? s : { ...s, order: i }));
}

export function cloneElement<T extends SlideElement>(el: T): T {
  return deepClone(el);
}

export function cloneSlide(slide: Slide): Slide {
  return deepClone(slide);
}
