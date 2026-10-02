import type { Deck } from "../types/deck.js";
import type {
  ApplyResult,
  Command,
  BatchCommand,
  UpdateElementCommand,
  DeleteElementCommand,
  DeleteSlideCommand,
  UpdateSlideCommand,
  UpdateThemeCommand,
  UpdateDeckMetaCommand,
  ReplaceAssetCommand,
  UpdateChartDataCommand,
  UpdateSmartArtCommand,
  SetReferencesCommand,
  SetCitationsCommand,
} from "../types/commands.js";
import type {
  ChartElement,
  ImageElement,
  SmartArtElement,
  SlideElement,
} from "../types/elements.js";
import { deepClone } from "../clone.js";
import {
  PptdError,
  cloneElement,
  cloneSlide,
  findElementIndex,
  findSlideIndex,
  getElement,
  getSlide,
  mapSlide,
  renumberOrders,
  touchDeck,
} from "./helpers.js";

function applyAddElement(deck: Deck, cmd: Extract<Command, { type: "addElement" }>): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  if (slide.elements.some((e) => e.id === cmd.element.id)) {
    throw new PptdError("ELEMENT_EXISTS", `Element already exists: ${cmd.element.id}`);
  }
  const index =
    cmd.index === undefined
      ? slide.elements.length
      : Math.max(0, Math.min(cmd.index, slide.elements.length));
  const next = mapSlide(deck, cmd.slideId, (s) => {
    const elements = s.elements.slice();
    elements.splice(index, 0, cloneElement(cmd.element));
    return { ...s, elements };
  });
  return { deck: next, command: { ...cmd, index } };
}

function applyUpdateElement(deck: Deck, cmd: UpdateElementCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const before = cloneElement(getElement(slide, cmd.elementId));
  const safePatch = { ...cmd.patch };

  const next = mapSlide(deck, cmd.slideId, (s) => {
    const elements = s.elements.map((el) => {
      if (el.id !== cmd.elementId) return el;
      return { ...el, ...safePatch, id: el.id, kind: el.kind } as SlideElement;
    });
    return { ...s, elements };
  });

  const enriched: UpdateElementCommand = {
    ...cmd,
    before,
  };
  return { deck: next, command: enriched };
}

function applyDeleteElement(deck: Deck, cmd: DeleteElementCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const beforeIndex = findElementIndex(slide, cmd.elementId);
  const before = cloneElement(slide.elements[beforeIndex]!);
  const next = mapSlide(deck, cmd.slideId, (s) => ({
    ...s,
    elements: s.elements.filter((e) => e.id !== cmd.elementId),
  }));
  const enriched: DeleteElementCommand = { ...cmd, before, beforeIndex };
  return { deck: next, command: enriched };
}

function applyAddSlide(deck: Deck, cmd: Extract<Command, { type: "addSlide" }>): ApplyResult {
  if (deck.slides.some((s) => s.id === cmd.slide.id)) {
    throw new PptdError("SLIDE_EXISTS", `Slide already exists: ${cmd.slide.id}`);
  }
  const index =
    cmd.index === undefined
      ? deck.slides.length
      : Math.max(0, Math.min(cmd.index, deck.slides.length));
  const slides = deck.slides.slice();
  slides.splice(index, 0, cloneSlide(cmd.slide));
  const next = touchDeck({ ...deck, slides: renumberOrders(slides) });
  return { deck: next, command: { ...cmd, index } };
}

function applyDeleteSlide(deck: Deck, cmd: DeleteSlideCommand): ApplyResult {
  const beforeIndex = findSlideIndex(deck, cmd.slideId);
  const before = cloneSlide(deck.slides[beforeIndex]!);
  const slides = deck.slides.filter((s) => s.id !== cmd.slideId);
  if (slides.length === deck.slides.length) {
    throw new PptdError("SLIDE_NOT_FOUND", `Slide not found: ${cmd.slideId}`);
  }
  const next = touchDeck({ ...deck, slides: renumberOrders(slides) });
  const enriched: DeleteSlideCommand = { ...cmd, before, beforeIndex };
  return { deck: next, command: enriched };
}

function applyReorderSlide(
  deck: Deck,
  cmd: Extract<Command, { type: "reorderSlide" }>,
): ApplyResult {
  const fromIndex = findSlideIndex(deck, cmd.slideId);
  if (fromIndex !== cmd.fromIndex) {
    // Prefer id as source of truth; allow fromIndex mismatch by using actual index
  }
  const toIndex = Math.max(0, Math.min(cmd.toIndex, deck.slides.length - 1));
  if (fromIndex === toIndex) {
    return {
      deck,
      command: { ...cmd, fromIndex, toIndex },
    };
  }
  const slides = deck.slides.slice();
  const [moved] = slides.splice(fromIndex, 1);
  if (!moved) {
    throw new PptdError("SLIDE_NOT_FOUND", `Slide not found: ${cmd.slideId}`);
  }
  slides.splice(toIndex, 0, moved);
  const next = touchDeck({ ...deck, slides: renumberOrders(slides) });
  return {
    deck: next,
    command: { ...cmd, fromIndex, toIndex },
  };
}

function applyUpdateSlide(deck: Deck, cmd: UpdateSlideCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const before: UpdateSlideCommand["before"] = {};
  if (cmd.patch.background !== undefined) before.background = deepClone(slide.background);
  if (cmd.patch.notes !== undefined) before.notes = slide.notes;
  if (cmd.patch.layoutHint !== undefined) before.layoutHint = slide.layoutHint;
  if (cmd.patch.size !== undefined) before.size = deepClone(slide.size);

  const next = mapSlide(deck, cmd.slideId, (s) => ({
    ...s,
    ...cmd.patch,
  }));
  return { deck: next, command: { ...cmd, before } };
}

function applyUpdateTheme(deck: Deck, cmd: UpdateThemeCommand): ApplyResult {
  const before = deepClone(deck.theme);
  const next = touchDeck({ ...deck, theme: deepClone(cmd.theme) });
  const enriched: UpdateThemeCommand = { ...cmd, before };
  return { deck: next, command: enriched };
}

function applyUpdateDeckMeta(deck: Deck, cmd: UpdateDeckMetaCommand): ApplyResult {
  const before: UpdateDeckMetaCommand["before"] = {};
  if (cmd.patch.title !== undefined) before.title = deck.title;
  if (cmd.patch.aspectRatio !== undefined) before.aspectRatio = deck.aspectRatio;
  if (cmd.patch.meta !== undefined) before.meta = deepClone(deck.meta);

  const next = touchDeck({
    ...deck,
    ...(cmd.patch.title !== undefined ? { title: cmd.patch.title } : {}),
    ...(cmd.patch.aspectRatio !== undefined ? { aspectRatio: cmd.patch.aspectRatio } : {}),
    ...(cmd.patch.meta !== undefined ? { meta: deepClone(cmd.patch.meta) } : {}),
  });
  return { deck: next, command: { ...cmd, before } };
}

function applyReplaceAsset(deck: Deck, cmd: ReplaceAssetCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const el = getElement(slide, cmd.elementId);
  if (el.kind !== "image") {
    throw new PptdError("INVALID_ELEMENT", `replaceAsset requires image element: ${cmd.elementId}`);
  }
  const beforeSrc = el.src;
  const next = mapSlide(deck, cmd.slideId, (s) => ({
    ...s,
    elements: s.elements.map((e) =>
      e.id === cmd.elementId && e.kind === "image"
        ? ({ ...e, src: cmd.src } satisfies ImageElement)
        : e,
    ),
  }));
  return { deck: next, command: { ...cmd, beforeSrc } };
}

function applyUpdateChartData(deck: Deck, cmd: UpdateChartDataCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const el = getElement(slide, cmd.elementId);
  if (el.kind !== "chart") {
    throw new PptdError("INVALID_ELEMENT", `updateChartData requires chart: ${cmd.elementId}`);
  }
  const before = {
    categories: deepClone(el.categories),
    series: deepClone(el.series),
    chartType: el.chartType,
  };
  const next = mapSlide(deck, cmd.slideId, (s) => ({
    ...s,
    elements: s.elements.map((e) => {
      if (e.id !== cmd.elementId || e.kind !== "chart") return e;
      const updated: ChartElement = {
        ...e,
        ...(cmd.categories !== undefined ? { categories: deepClone(cmd.categories) } : {}),
        ...(cmd.series !== undefined ? { series: deepClone(cmd.series) } : {}),
        ...(cmd.chartType !== undefined ? { chartType: cmd.chartType } : {}),
      };
      return updated;
    }),
  }));
  return { deck: next, command: { ...cmd, before } };
}

function applyUpdateSmartArt(deck: Deck, cmd: UpdateSmartArtCommand): ApplyResult {
  const slide = getSlide(deck, cmd.slideId);
  const el = getElement(slide, cmd.elementId);
  if (el.kind !== "smartart") {
    throw new PptdError("INVALID_ELEMENT", `updateSmartArt requires smartart: ${cmd.elementId}`);
  }
  const before = {
    nodes: deepClone(el.nodes),
    edges: deepClone(el.edges),
    layout: el.layout,
  };
  const next = mapSlide(deck, cmd.slideId, (s) => ({
    ...s,
    elements: s.elements.map((e) => {
      if (e.id !== cmd.elementId || e.kind !== "smartart") return e;
      const updated: SmartArtElement = {
        ...e,
        ...(cmd.nodes !== undefined ? { nodes: deepClone(cmd.nodes) } : {}),
        ...(cmd.edges !== undefined ? { edges: deepClone(cmd.edges) } : {}),
        ...(cmd.layout !== undefined ? { layout: cmd.layout } : {}),
      };
      return updated;
    }),
  }));
  return { deck: next, command: { ...cmd, before } };
}

function applySetReferences(deck: Deck, cmd: SetReferencesCommand): ApplyResult {
  const before = deepClone(deck.references);
  const next = touchDeck({ ...deck, references: deepClone(cmd.references) });
  return { deck: next, command: { ...cmd, before } };
}

function applySetCitations(deck: Deck, cmd: SetCitationsCommand): ApplyResult {
  const before = deepClone(deck.citations);
  const next = touchDeck({ ...deck, citations: deepClone(cmd.citations) });
  return { deck: next, command: { ...cmd, before } };
}

function applyBatch(deck: Deck, cmd: BatchCommand): ApplyResult {
  let current = deck;
  const applied: Command[] = [];
  for (const child of cmd.commands) {
    const result = applyCommand(current, child);
    current = result.deck;
    applied.push(result.command);
  }
  return {
    deck: current,
    command: { ...cmd, commands: applied },
  };
}

/**
 * Apply a command to a deck immutably.
 * Returns a new deck and a command enriched with `before*` snapshots for undo.
 */
export function applyCommand(deck: Deck, command: Command): ApplyResult {
  switch (command.type) {
    case "addElement":
      return applyAddElement(deck, command);
    case "updateElement":
      return applyUpdateElement(deck, command);
    case "deleteElement":
      return applyDeleteElement(deck, command);
    case "addSlide":
      return applyAddSlide(deck, command);
    case "deleteSlide":
      return applyDeleteSlide(deck, command);
    case "reorderSlide":
      return applyReorderSlide(deck, command);
    case "updateSlide":
      return applyUpdateSlide(deck, command);
    case "updateTheme":
      return applyUpdateTheme(deck, command);
    case "updateDeckMeta":
      return applyUpdateDeckMeta(deck, command);
    case "replaceAsset":
      return applyReplaceAsset(deck, command);
    case "updateChartData":
      return applyUpdateChartData(deck, command);
    case "updateSmartArt":
      return applyUpdateSmartArt(deck, command);
    case "setReferences":
      return applySetReferences(deck, command);
    case "setCitations":
      return applySetCitations(deck, command);
    case "batch":
      return applyBatch(deck, command);
    default: {
      const _exhaustive: never = command;
      throw new PptdError("UNKNOWN_COMMAND", `Unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Apply a sequence of commands; each step enriches undo data.
 */
export function applyCommands(deck: Deck, commands: Command[]): ApplyResult {
  return applyCommand(deck, {
    id: "batch_apply",
    type: "batch",
    actor: "system",
    timestamp: new Date().toISOString(),
    commands,
  });
}
