/**
 * Design previews come from the pinned OpenKimi visual pack as tall JPEG
 * strips: N deck pages (1920×1080 each) stacked flush, e.g. 1920×8640.
 * The DSH attachment store rejects per-side pixels above its limit, and a
 * downscaled strip is unreadable — so split the strip back into full-page
 * tiles through the same pinned Chromium pipeline that page rasters use.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { pinnedPlaywrightRuntimePath } from "@open-slidestudio/presentation-run";

/**
 * Long edge for the sample page sent to the produce model.
 * Session 83a2b098 attached nine 1920×1080 tiles from extra/xuan-paper-annual
 * and grok-4.6 answered with 493 identical write_page skeletons in one step.
 * One 720px tile is enough for the taste gate to count the preview as seen.
 */
export const PREVIEW_MAX_DIMENSION = 720;

/** OpenKimi Hub previews are tall strips. Never attach the whole strip. */
export const MAX_DESIGN_PREVIEW_ATTACHMENTS = 1;

export function designPreviewTileCount(size: {
  readonly width: number;
  readonly height: number;
}): number {
  if (size.height <= size.width) return 1;
  const tileHeight = Math.round((size.width * 9) / 16);
  if (tileHeight <= 0 || size.height <= tileHeight) return 1;
  return Math.ceil(size.height / tileHeight);
}

export function designPreviewAttachmentPlan(size: {
  readonly width: number;
  readonly height: number;
}): {
  readonly stripTiles: number;
  readonly attachCount: number;
  readonly longEdge: number;
} {
  const stripTiles = designPreviewTileCount(size);
  return {
    stripTiles,
    attachCount: Math.min(MAX_DESIGN_PREVIEW_ATTACHMENTS, stripTiles),
    longEdge: PREVIEW_MAX_DIMENSION,
  };
}

/** Read pixel dimensions from a JPEG SOF marker, or undefined if unknown. */
export function jpegDimensions(
  bytes: Buffer,
): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let off = 2;
  while (off + 9 < bytes.length) {
    const marker = bytes[off];
    if (marker === undefined) return undefined;
    if (marker !== 0xff) {
      off += 1;
      continue;
    }
    const type = bytes[off + 1];
    if (type === undefined) return undefined;
    // SOF0-SOF15 except DHT (C4), JPG (C8), DAC (CC) carry dimensions.
    if (type >= 0xc0 && type <= 0xcf && type !== 0xc4 && type !== 0xc8 && type !== 0xcc) {
      return {
        height: bytes.readUInt16BE(off + 5),
        width: bytes.readUInt16BE(off + 7),
      };
    }
    if (type === 0xd8 || (type >= 0xd0 && type <= 0xd7)) {
      off += 2;
      continue;
    }
    off += 2 + bytes.readUInt16BE(off + 2);
  }
  return undefined;
}

type ScaledPage = {
  setContent: (html: string, opts?: Record<string, unknown>) => Promise<void>;
  evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg: A) => Promise<T>;
  close: () => Promise<void>;
};

type RuntimeModule = {
  verifyPinnedRuntime?: () => unknown;
  launchPinnedChromium?: (opts?: { headless?: boolean }) => Promise<{
    newPage: (opts: { viewport: { width: number; height: number } }) => Promise<ScaledPage>;
    close: () => Promise<void>;
  }>;
};

async function withPinnedPage<T>(
  run: (page: ScaledPage) => Promise<T>,
  failurePrefix: string,
): Promise<T> {
  const runtimeFile = pinnedPlaywrightRuntimePath();
  if (!fs.existsSync(runtimeFile)) {
    throw new Error(`${failurePrefix}: pinned Playwright runtime missing at ${runtimeFile}`);
  }
  const runtime = (await import(pathToFileURL(runtimeFile).href)) as RuntimeModule;
  if (typeof runtime.launchPinnedChromium !== "function") {
    throw new Error("pinned Playwright runtime API mismatch: launchPinnedChromium missing");
  }
  const browser = await runtime.launchPinnedChromium({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    try {
      return await run(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Long edge cap for a single tile when the store refuses full resolution. */
export async function scaleJpegToFit(
  bytes: Buffer,
  maxDimension = 1080,
): Promise<Buffer> {
  const size = jpegDimensions(bytes);
  if (!size || Math.max(size.width, size.height) <= maxDimension) return bytes;
  return withPinnedPage(async (page) => {
    const dataUrl = await page.evaluate(
      async (input: { src: string; max: number }) => {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("preview JPEG failed to decode"));
          img.src = input.src;
        });
        const scale = input.max / Math.max(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d context unavailable");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85);
      },
      { src: `data:image/jpeg;base64,${bytes.toString("base64")}`, max: maxDimension },
    );
    const scaled = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    if (scaled.length < 64) throw new Error("scaled preview came back empty");
    return scaled;
  }, "cannot downscale the design preview");
}

/**
 * Split a preview strip into page tiles. Caps how many tiles are produced so
 * a 8–9 page OpenKimi strip cannot flood the next LLM request.
 */
export async function splitPreviewForAttachment(
  bytes: Buffer,
  maxTiles = MAX_DESIGN_PREVIEW_ATTACHMENTS,
): Promise<Buffer[]> {
  const size = jpegDimensions(bytes);
  if (!size || size.height <= size.width) return [bytes];
  const tileHeight = Math.round((size.width * 9) / 16);
  if (tileHeight <= 0 || size.height <= tileHeight) return [bytes];
  const count = Math.min(
    Math.max(1, Math.floor(maxTiles)),
    Math.ceil(size.height / tileHeight),
  );
  return withPinnedPage(async (page) => {
    const tiles: Buffer[] = [];
    for (let i = 0; i < count; i += 1) {
      const dataUrl = await page.evaluate(
        async (input: { src: string; i: number; tileHeight: number; width: number; height: number }) => {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("preview JPEG failed to decode"));
            img.src = input.src;
          });
          const top = Math.min(input.i * input.tileHeight, input.height);
          const h = Math.max(1, Math.min(input.tileHeight, input.height - top));
          const canvas = document.createElement("canvas");
          canvas.width = input.width;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas 2d context unavailable");
          ctx.drawImage(img, 0, top, input.width, h, 0, 0, input.width, h);
          return canvas.toDataURL("image/jpeg", 0.85);
        },
        { src: `data:image/jpeg;base64,${bytes.toString("base64")}`, i, tileHeight, width: size.width, height: size.height },
      );
      const tile = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      if (tile.length < 64) throw new Error(`preview tile ${i + 1}/${count} came back empty`);
      tiles.push(tile);
    }
    return tiles;
  }, "cannot split the design preview strip");
}
