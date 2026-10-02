import type { Deck } from "../types/deck.js";
import type { Command, ElementPatch } from "../types/commands.js";
import type { ChartElement, ImageElement, SmartArtElement } from "../types/elements.js";
import { deepClone } from "../clone.js";
import {
  PptdError,
  cloneElement,
  cloneSlide,
  findSlideIndex,
  getElement,
  getSlide,
  mapSlide,
  renumberOrders,
  touchDeck,
} from "./helpers.js";

/**
 * Reverse a previously applied command (must include `before*` snapshots from applyCommand).
 */
export function undoCommand(deck: Deck, command: Command): Deck {
  switch (command.type) {
    case "addElement": {
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        elements: s.elements.filter((e) => e.id !== command.element.id),
      }));
    }

    case "updateElement": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateElement missing before snapshot");
      }
      const restored = cloneElement(command.before);
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === command.elementId ? restored : e)),
      }));
    }

    case "deleteElement": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "deleteElement missing before snapshot");
      }
      const restored = cloneElement(command.before);
      const insertAt =
        command.beforeIndex === undefined
          ? undefined
          : command.beforeIndex;
      return mapSlide(deck, command.slideId, (s) => {
        if (s.elements.some((e) => e.id === restored.id)) {
          return s;
        }
        const elements = s.elements.slice();
        if (insertAt === undefined || insertAt >= elements.length) {
          elements.push(restored);
        } else {
          elements.splice(Math.max(0, insertAt), 0, restored);
        }
        return { ...s, elements };
      });
    }

    case "addSlide": {
      const slides = deck.slides.filter((s) => s.id !== command.slide.id);
      return touchDeck({ ...deck, slides: renumberOrders(slides) });
    }

    case "deleteSlide": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "deleteSlide missing before snapshot");
      }
      const restored = cloneSlide(command.before);
      const slides = deck.slides.slice();
      const insertAt =
        command.beforeIndex === undefined ? slides.length : command.beforeIndex;
      slides.splice(Math.max(0, Math.min(insertAt, slides.length)), 0, restored);
      return touchDeck({ ...deck, slides: renumberOrders(slides) });
    }

    case "reorderSlide": {
      // Undo by swapping back toIndex → fromIndex
      const currentIndex = findSlideIndex(deck, command.slideId);
      const target = command.fromIndex;
      if (currentIndex === target) return deck;
      const slides = deck.slides.slice();
      const [moved] = slides.splice(currentIndex, 1);
      if (!moved) {
        throw new PptdError("SLIDE_NOT_FOUND", `Slide not found: ${command.slideId}`);
      }
      slides.splice(Math.max(0, Math.min(target, slides.length)), 0, moved);
      return touchDeck({ ...deck, slides: renumberOrders(slides) });
    }

    case "updateSlide": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateSlide missing before snapshot");
      }
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        ...deepClone(command.before),
      }));
    }

    case "updateTheme": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateTheme missing before snapshot");
      }
      return touchDeck({ ...deck, theme: deepClone(command.before) });
    }

    case "updateDeckMeta": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateDeckMeta missing before snapshot");
      }
      return touchDeck({
        ...deck,
        ...(command.before.title !== undefined ? { title: command.before.title } : {}),
        ...(command.before.aspectRatio !== undefined
          ? { aspectRatio: command.before.aspectRatio }
          : {}),
        ...(command.before.meta !== undefined ? { meta: deepClone(command.before.meta) } : {}),
      });
    }

    case "replaceAsset": {
      if (command.beforeSrc === undefined) {
        throw new PptdError("MISSING_UNDO", "replaceAsset missing beforeSrc");
      }
      const slide = getSlide(deck, command.slideId);
      const el = getElement(slide, command.elementId);
      if (el.kind !== "image") {
        throw new PptdError("INVALID_ELEMENT", `replaceAsset undo requires image: ${command.elementId}`);
      }
      const src = command.beforeSrc;
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        elements: s.elements.map((e) =>
          e.id === command.elementId && e.kind === "image"
            ? ({ ...e, src } satisfies ImageElement)
            : e,
        ),
      }));
    }

    case "updateChartData": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateChartData missing before snapshot");
      }
      const b = command.before;
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        elements: s.elements.map((e) => {
          if (e.id !== command.elementId || e.kind !== "chart") return e;
          const restored: ChartElement = {
            ...e,
            categories: deepClone(b.categories),
            series: deepClone(b.series),
            chartType: b.chartType,
          };
          return restored;
        }),
      }));
    }

    case "updateSmartArt": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateSmartArt missing before snapshot");
      }
      const b = command.before;
      return mapSlide(deck, command.slideId, (s) => ({
        ...s,
        elements: s.elements.map((e) => {
          if (e.id !== command.elementId || e.kind !== "smartart") return e;
          const restored: SmartArtElement = {
            ...e,
            nodes: deepClone(b.nodes),
            edges: deepClone(b.edges),
            layout: b.layout,
          };
          return restored;
        }),
      }));
    }

    case "setReferences": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "setReferences missing before snapshot");
      }
      return touchDeck({ ...deck, references: deepClone(command.before) });
    }

    case "setCitations": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "setCitations missing before snapshot");
      }
      return touchDeck({ ...deck, citations: deepClone(command.before) });
    }

    case "batch": {
      // Undo children in reverse order
      let current = deck;
      for (let i = command.commands.length - 1; i >= 0; i--) {
        const child = command.commands[i];
        if (!child) continue;
        current = undoCommand(current, child);
      }
      return current;
    }

    default: {
      const _exhaustive: never = command;
      throw new PptdError("UNKNOWN_COMMAND", `Unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Produce the inverse command that would undo `command` when applied with applyCommand.
 * Prefer undoCommand for history stacks; this is useful for explicit inverse logs.
 */
export function invertCommand(command: Command): Command {
  const base = {
    id: `inv_${command.id}`,
    actor: command.actor,
    timestamp: new Date().toISOString(),
    requestId: command.requestId,
  } as const;

  switch (command.type) {
    case "addElement":
      return {
        ...base,
        type: "deleteElement",
        slideId: command.slideId,
        elementId: command.element.id,
        before: cloneElement(command.element),
        beforeIndex: command.index,
      };
    case "deleteElement": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "deleteElement missing before for invert");
      }
      return {
        ...base,
        type: "addElement",
        slideId: command.slideId,
        element: cloneElement(command.before),
        index: command.beforeIndex,
      };
    }
    case "updateElement": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateElement missing before for invert");
      }
      // Prefer undoCommand for history; invert emits a best-effort full field patch.
      const before = command.before;
      const { kind: _k, id: _i, ...rest } = before as typeof before & {
        kind: string;
        id: string;
      };
      void _k;
      void _i;
      return {
        ...base,
        type: "updateElement",
        slideId: command.slideId,
        elementId: command.elementId,
        patch: rest as ElementPatch,
        before: undefined,
      };
    }
    case "addSlide":
      return {
        ...base,
        type: "deleteSlide",
        slideId: command.slide.id,
        before: cloneSlide(command.slide),
        beforeIndex: command.index,
      };
    case "deleteSlide": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "deleteSlide missing before for invert");
      }
      return {
        ...base,
        type: "addSlide",
        slide: cloneSlide(command.before),
        index: command.beforeIndex,
      };
    }
    case "reorderSlide":
      return {
        ...base,
        type: "reorderSlide",
        slideId: command.slideId,
        fromIndex: command.toIndex,
        toIndex: command.fromIndex,
      };
    case "updateSlide": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateSlide missing before for invert");
      }
      return {
        ...base,
        type: "updateSlide",
        slideId: command.slideId,
        patch: deepClone(command.before),
      };
    }
    case "updateTheme": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateTheme missing before for invert");
      }
      return {
        ...base,
        type: "updateTheme",
        theme: deepClone(command.before),
      };
    }
    case "updateDeckMeta": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateDeckMeta missing before for invert");
      }
      return {
        ...base,
        type: "updateDeckMeta",
        patch: deepClone(command.before),
      };
    }
    case "replaceAsset": {
      if (command.beforeSrc === undefined) {
        throw new PptdError("MISSING_UNDO", "replaceAsset missing beforeSrc for invert");
      }
      return {
        ...base,
        type: "replaceAsset",
        slideId: command.slideId,
        elementId: command.elementId,
        src: command.beforeSrc,
      };
    }
    case "updateChartData": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateChartData missing before for invert");
      }
      return {
        ...base,
        type: "updateChartData",
        slideId: command.slideId,
        elementId: command.elementId,
        categories: deepClone(command.before.categories),
        series: deepClone(command.before.series),
        chartType: command.before.chartType,
      };
    }
    case "updateSmartArt": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "updateSmartArt missing before for invert");
      }
      return {
        ...base,
        type: "updateSmartArt",
        slideId: command.slideId,
        elementId: command.elementId,
        nodes: deepClone(command.before.nodes),
        edges: deepClone(command.before.edges),
        layout: command.before.layout,
      };
    }
    case "setReferences": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "setReferences missing before for invert");
      }
      return {
        ...base,
        type: "setReferences",
        references: deepClone(command.before),
      };
    }
    case "setCitations": {
      if (!command.before) {
        throw new PptdError("MISSING_UNDO", "setCitations missing before for invert");
      }
      return {
        ...base,
        type: "setCitations",
        citations: deepClone(command.before),
      };
    }
    case "batch":
      return {
        ...base,
        type: "batch",
        commands: [...command.commands].reverse().map(invertCommand),
      };
    default: {
      const _exhaustive: never = command;
      throw new PptdError("UNKNOWN_COMMAND", `Unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
