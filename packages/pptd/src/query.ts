import type { Deck, Slide } from "./types/deck.js";
import type { ElementKind, SlideElement } from "./types/elements.js";

export function getSlideById(deck: Deck, slideId: string): Slide | undefined {
  return deck.slides.find((s) => s.id === slideId);
}

export function getElementById(
  slide: Slide,
  elementId: string,
): SlideElement | undefined {
  const stack: SlideElement[] = [...slide.elements];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.id === elementId) return el;
    if (el.kind === "group") {
      for (const child of el.children) stack.push(child);
    }
  }
  return undefined;
}

export function findElement(
  deck: Deck,
  elementId: string,
): { slide: Slide; element: SlideElement } | undefined {
  for (const slide of deck.slides) {
    const element = getElementById(slide, elementId);
    if (element) return { slide, element };
  }
  return undefined;
}

export function listElements(
  slide: Slide,
  kind?: ElementKind,
): SlideElement[] {
  const out: SlideElement[] = [];
  const walk = (els: SlideElement[]) => {
    for (const el of els) {
      if (!kind || el.kind === kind) out.push(el);
      if (el.kind === "group") walk(el.children);
    }
  };
  walk(slide.elements);
  return out;
}

export function sortSlidesByOrder(deck: Deck): Slide[] {
  return [...deck.slides].sort((a, b) => a.order - b.order);
}
