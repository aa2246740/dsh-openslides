import type {
  Actor,
  AddElementCommand,
  AddSlideCommand,
  BatchCommand,
  Command,
  DeleteElementCommand,
  DeleteSlideCommand,
  ElementPatch,
  ReorderSlideCommand,
  ReplaceAssetCommand,
  SetCitationsCommand,
  SetReferencesCommand,
  UpdateChartDataCommand,
  UpdateDeckMetaCommand,
  UpdateElementCommand,
  UpdateSlideCommand,
  UpdateSmartArtCommand,
  UpdateThemeCommand,
} from "../types/commands.js";
import type { SlideElement, ChartSeries, SmartArtNode, SmartArtEdge, ChartType, SmartArtLayout } from "../types/elements.js";
import type { Slide, Reference, Citation, Deck } from "../types/deck.js";
import type { ThemeTokens } from "../types/theme.js";
import type { Fill } from "../types/fill.js";
import type { Size } from "../types/geometry.js";
import { createId, nowIso } from "../id.js";

function base(actor: Actor = "user", requestId?: string) {
  return {
    id: createId("cmd"),
    actor,
    timestamp: nowIso(),
    ...(requestId ? { requestId } : {}),
  };
}

export function cmdAddElement(
  slideId: string,
  element: SlideElement,
  opts?: { index?: number; actor?: Actor; requestId?: string },
): AddElementCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "addElement",
    slideId,
    element,
    ...(opts?.index !== undefined ? { index: opts.index } : {}),
  };
}

export function cmdUpdateElement(
  slideId: string,
  elementId: string,
  patch: ElementPatch,
  opts?: { actor?: Actor; requestId?: string },
): UpdateElementCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateElement",
    slideId,
    elementId,
    patch,
  };
}

export function cmdDeleteElement(
  slideId: string,
  elementId: string,
  opts?: { actor?: Actor; requestId?: string },
): DeleteElementCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "deleteElement",
    slideId,
    elementId,
  };
}

export function cmdAddSlide(
  slide: Slide,
  opts?: { index?: number; actor?: Actor; requestId?: string },
): AddSlideCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "addSlide",
    slide,
    ...(opts?.index !== undefined ? { index: opts.index } : {}),
  };
}

export function cmdDeleteSlide(
  slideId: string,
  opts?: { actor?: Actor; requestId?: string },
): DeleteSlideCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "deleteSlide",
    slideId,
  };
}

export function cmdReorderSlide(
  slideId: string,
  fromIndex: number,
  toIndex: number,
  opts?: { actor?: Actor; requestId?: string },
): ReorderSlideCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "reorderSlide",
    slideId,
    fromIndex,
    toIndex,
  };
}

export function cmdUpdateSlide(
  slideId: string,
  patch: Partial<Pick<Slide, "background" | "notes" | "layoutHint" | "size">>,
  opts?: { actor?: Actor; requestId?: string },
): UpdateSlideCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateSlide",
    slideId,
    patch,
  };
}

export function cmdUpdateTheme(
  theme: ThemeTokens,
  opts?: { actor?: Actor; requestId?: string },
): UpdateThemeCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateTheme",
    theme,
  };
}

export function cmdUpdateDeckMeta(
  patch: Partial<Pick<Deck, "title" | "aspectRatio" | "meta">>,
  opts?: { actor?: Actor; requestId?: string },
): UpdateDeckMetaCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateDeckMeta",
    patch,
  };
}

export function cmdReplaceAsset(
  slideId: string,
  elementId: string,
  src: string,
  opts?: { actor?: Actor; requestId?: string },
): ReplaceAssetCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "replaceAsset",
    slideId,
    elementId,
    src,
  };
}

export function cmdUpdateChartData(
  slideId: string,
  elementId: string,
  data: {
    categories?: string[];
    series?: ChartSeries[];
    chartType?: ChartType;
  },
  opts?: { actor?: Actor; requestId?: string },
): UpdateChartDataCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateChartData",
    slideId,
    elementId,
    ...data,
  };
}

export function cmdUpdateSmartArt(
  slideId: string,
  elementId: string,
  data: {
    nodes?: SmartArtNode[];
    edges?: SmartArtEdge[];
    layout?: SmartArtLayout;
  },
  opts?: { actor?: Actor; requestId?: string },
): UpdateSmartArtCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "updateSmartArt",
    slideId,
    elementId,
    ...data,
  };
}

export function cmdSetReferences(
  references: Reference[],
  opts?: { actor?: Actor; requestId?: string },
): SetReferencesCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "setReferences",
    references,
  };
}

export function cmdSetCitations(
  citations: Citation[],
  opts?: { actor?: Actor; requestId?: string },
): SetCitationsCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "setCitations",
    citations,
  };
}

export function cmdBatch(
  commands: Command[],
  opts?: { actor?: Actor; requestId?: string },
): BatchCommand {
  return {
    ...base(opts?.actor, opts?.requestId),
    type: "batch",
    commands,
  };
}

/** Convenience: patch slide background fill */
export function cmdSetBackground(
  slideId: string,
  background: Fill,
  opts?: { actor?: Actor; requestId?: string },
): UpdateSlideCommand {
  return cmdUpdateSlide(slideId, { background }, opts);
}

/** Convenience: resize slide canvas */
export function cmdSetSlideSize(
  slideId: string,
  size: Size,
  opts?: { actor?: Actor; requestId?: string },
): UpdateSlideCommand {
  return cmdUpdateSlide(slideId, { size }, opts);
}
