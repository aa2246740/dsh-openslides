import pptxgenjs from "pptxgenjs";
import type PptxGenJS from "pptxgenjs";
import type {
  Deck,
  ExportOptions,
  ExportOutputType,
  ExportResult,
  Slide,
} from "./types.js";
import {
  buildSlideLayout,
  resolveLayoutInches,
  sortElementsByZ,
  sortSlides,
} from "./geometry.js";
import { createReportBuilder } from "./report.js";
import { firstFontFamily, mapBackground, normalizeHexColor } from "./style.js";
import { mapElement, type MapContext } from "./mappers.js";

/** CJS/ESM interop for pptxgenjs across Node and bundlers. */
function createPptx(): PptxGenJS {
  type Ctor = new () => PptxGenJS;
  const mod = pptxgenjs as unknown as Ctor | { default: Ctor };
  const Ctor = typeof mod === "function" ? mod : mod.default;
  return new Ctor();
}

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

function defaultOutputType(): ExportOutputType {
  if (typeof Blob !== "undefined" && typeof window !== "undefined") {
    return "blob";
  }
  return "arraybuffer";
}

function sanitizeFilename(title: string | undefined, fallback: string): string {
  const base = (title?.trim() || fallback).replace(
    /[<>:"/\\|?*\u0000-\u001f]/g,
    "_",
  );
  const cleaned = base.replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
  return cleaned.toLowerCase().endsWith(".pptx") ? cleaned : `${cleaned}.pptx`;
}

function assertDeck(deck: Deck): void {
  if (!deck || typeof deck !== "object") {
    throw new TypeError("exportDeckToPptx: deck is required");
  }
  if (!Array.isArray(deck.slides)) {
    throw new TypeError("exportDeckToPptx: deck.slides must be an array");
  }
}

function applyThemeFonts(pptx: PptxGenJS, deck: Deck): void {
  const heading = firstFontFamily(deck.theme?.fonts?.heading);
  const body = firstFontFamily(deck.theme?.fonts?.body);
  if (heading || body) {
    pptx.theme = {
      ...(heading ? { headFontFace: heading } : {}),
      ...(body ? { bodyFontFace: body } : {}),
    };
  }
}

function configureLayout(pptx: PptxGenJS, deck: Deck): void {
  const layout = resolveLayoutInches(deck.aspectRatio);
  if (layout.custom) {
    pptx.defineLayout({
      name: layout.name,
      width: layout.width,
      height: layout.height,
    });
    pptx.layout = layout.name;
  } else {
    pptx.layout = layout.name;
  }
}

function addSpeakerNotes(
  slide: PptxGenJS.Slide,
  notes: string | undefined,
): void {
  if (!notes?.trim()) return;
  const s = slide as PptxGenJS.Slide & { addNotes?: (t: string) => void };
  if (typeof s.addNotes === "function") {
    s.addNotes(notes);
  }
}

function exportSlide(
  pptx: PptxGenJS,
  deck: Deck,
  slide: Slide,
  slideIndex: number,
  report: ReturnType<typeof createReportBuilder>,
  options: ExportOptions,
): void {
  const layout = buildSlideLayout(slide, deck);
  const pptxSlide = pptx.addSlide();

  const bg = mapBackground(slide.background, report, {
    slideId: slide.id,
    slideIndex,
  });
  if (bg) {
    pptxSlide.background = bg;
  } else if (deck.theme?.colors?.background) {
    pptxSlide.background = {
      color: normalizeHexColor(deck.theme.colors.background, "FFFFFF"),
    };
  }

  addSpeakerNotes(pptxSlide, slide.notes);

  const ctx: MapContext = {
    slide: pptxSlide,
    pptx,
    layout,
    report,
    slideId: slide.id,
    slideIndex,
    theme: deck.theme,
    skipHidden: options.skipHidden !== false,
  };

  const elements = sortElementsByZ(slide.elements ?? []);
  for (const el of elements) {
    mapElement(el, ctx);
  }
}

/**
 * Export a PPTD `Deck` to an editable PPTX via pptxgenjs.
 *
 * Maps text, shapes, tables, charts, images, connectors, and SmartArt
 * (as shapes). Returns binary data plus an export report listing degradations
 * (missing images, gradient→solid, SmartArt→shapes, etc.).
 */
export async function exportDeckToPptx(
  deck: Deck,
  options: ExportOptions = {},
): Promise<ExportResult> {
  assertDeck(deck);

  const report = createReportBuilder();
  const pptx = createPptx();

  pptx.title = deck.title || "DSH SlideStudio Deck";
  pptx.author = options.author ?? "DSH SlideStudio";
  pptx.company = options.company ?? "DSH SlideStudio";
  pptx.subject =
    options.subject ??
    (deck.versionId
      ? `Exported from DSH SlideStudio (${deck.versionId})`
      : "Exported from DSH SlideStudio");
  pptx.revision = "1";

  configureLayout(pptx, deck);
  applyThemeFonts(pptx, deck);

  const slides = sortSlides(deck.slides);
  if (slides.length === 0) {
    report.warn("Deck has no slides; emitted a blank slide");
    pptx.addSlide();
  } else {
    slides.forEach((slide, index) => {
      exportSlide(pptx, deck, slide, index, report, options);
    });
  }

  if (deck.citations?.length && slides.length > 0) {
    const last = slides[slides.length - 1]!;
    if (!last.notes?.trim()) {
      report.warn(
        `${deck.citations.length} citation(s) present; attach to slide notes in IR for export`,
      );
    }
  }

  const outputType = options.output ?? defaultOutputType();
  const filename = sanitizeFilename(
    options.filename ?? deck.title,
    "open-slidestudio-deck.pptx",
  );

  const data = await pptx.write({
    outputType,
    compression: options.compression ?? true,
  });

  const built = report.build({
    deckId: deck.id,
    title: deck.title,
    versionId: deck.versionId,
    slideCount: Math.max(slides.length, 1),
  });

  return {
    data: data as ExportResult["data"],
    mimeType: PPTX_MIME,
    filename,
    report: built,
    outputType,
  };
}

/** Convenience: export as ArrayBuffer. */
export async function exportDeckToArrayBuffer(
  deck: Deck,
  options: Omit<ExportOptions, "output"> = {},
): Promise<ExportResult> {
  return exportDeckToPptx(deck, { ...options, output: "arraybuffer" });
}

/** Convenience: export as Blob (browser downloads). */
export async function exportDeckToBlob(
  deck: Deck,
  options: Omit<ExportOptions, "output"> = {},
): Promise<ExportResult> {
  return exportDeckToPptx(deck, { ...options, output: "blob" });
}
