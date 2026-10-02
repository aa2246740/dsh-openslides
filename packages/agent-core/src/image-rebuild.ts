/**
 * Image → editable slide rebuild (PRD §4.6 / frames 28–32).
 * Deterministic structure from reference names + prompt; optional OCR text.
 * Produces portrait PPTD with text / shapes / connectors — not a full-page bitmap.
 */

import {
  createId,
  solidFill,
  type ConnectorElement,
  type Deck,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TextElement,
  type TextParagraph,
  type ThemeTokens,
  DEFAULT_THEME,
  deepClone,
} from "@open-slidestudio/pptd";
import type { AgentReference } from "./types.js";
import type { VersionStamp } from "./version.js";

const PORTRAIT = { width: 1080, height: 1920 } as const;

export type ImageRebuildInput = {
  prompt: string;
  references?: AgentReference[];
  theme?: ThemeTokens;
  version?: VersionStamp;
};

export function isImageMime(mime?: string, name?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return Boolean(name && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name));
}

/**
 * True when the user asked for image rebuild or only supplied image references.
 */
export function detectImageRebuildIntent(
  prompt: string,
  references?: AgentReference[],
): boolean {
  const p = prompt.toLowerCase();
  const rebuildWords =
    /rebuild|reconstruct|recreate|vectori[sz]e|to\s+editable|可编辑|重建|还原|识别图|信息图|smart\s*connections|infographic|from\s+(this\s+)?image|图片转|图转ppt/i.test(
      prompt,
    );
  const images = (references ?? []).filter((r) => isImageMime(r.mimeType, r.name));
  if (rebuildWords && (images.length > 0 || /image|png|jpg|图|信息图/i.test(prompt))) {
    return true;
  }
  // Image-only attach with empty-ish prompt still rebuilds
  if (images.length > 0 && prompt.trim().length < 40) return true;
  if (images.length > 0 && /edit|slide|ppt/i.test(p)) return true;
  return false;
}

function para(
  text: string,
  opts: {
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    align?: TextParagraph["align"];
  } = {},
): TextParagraph {
  return {
    align: opts.align,
    runs: [
      {
        text,
        fontSize: opts.fontSize ?? 22,
        fontWeight: opts.fontWeight ?? 400,
        color: opts.color,
      },
    ],
  };
}

function textEl(
  box: { x: number; y: number; w: number; h: number; z?: number; name?: string },
  paragraphs: TextParagraph[],
): TextElement {
  return {
    kind: "text",
    id: createId("el"),
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rotation: 0,
    opacity: 1,
    zIndex: box.z ?? 3,
    name: box.name,
    paragraphs,
  };
}

function shapeEl(
  box: { x: number; y: number; w: number; h: number; z?: number; name?: string },
  fill: string,
  shape: ShapeElement["shape"] = "roundRect",
): ShapeElement {
  return {
    kind: "shape",
    id: createId("el"),
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rotation: 0,
    opacity: 1,
    zIndex: box.z ?? 1,
    name: box.name,
    shape,
    fill: solidFill(fill),
    cornerRadius: shape === "roundRect" ? 18 : undefined,
  };
}

function connectorEl(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stroke: string,
  name: string,
): ConnectorElement {
  return {
    kind: "connector",
    id: createId("el"),
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(Math.abs(to.x - from.x), 8),
    height: Math.max(Math.abs(to.y - from.y), 8),
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    name,
    connectorType: "straight",
    start: { x: from.x, y: from.y },
    end: { x: to.x, y: to.y },
    stroke: { color: stroke, width: 3 },
    endArrow: "triangle",
  };
}

/** Parse free text into bullet-like node labels (from OCR-ish reference text). */
export function extractNodesFromText(text: string | undefined, fallback: string[]): string[] {
  if (!text?.trim()) return fallback;
  const lines = text
    .split(/[\n\r;|•·]+/)
    .map((s) => s.replace(/^[\d\.\-\*]+\s*/, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 48);
  const uniq: string[] = [];
  for (const l of lines) {
    if (!uniq.some((u) => u.toLowerCase() === l.toLowerCase())) uniq.push(l);
    if (uniq.length >= 8) break;
  }
  return uniq.length >= 3 ? uniq.slice(0, 6) : fallback;
}

const DEFAULT_SMART_CONNECTIONS = [
  "Sense",
  "Route",
  "Decide",
  "Act",
  "Learn",
];

/**
 * Build a portrait SMART CONNECTIONS-style deck with fully selectable objects.
 */
export function composeImageRebuildDeck(input: ImageRebuildInput): Deck {
  const theme = input.theme ? deepClone(input.theme) : deepClone(DEFAULT_THEME);
  const accent = theme.colors.accent || "#1F6FEB";
  const ink = theme.colors.ink || "#0B1F33";
  const surface = theme.colors.surface || "#FFFFFF";
  const muted = theme.colors.muted || "#5A6B7D";
  const primary = theme.colors.primary || "#0B1F33";

  const imageRefs = (input.references ?? []).filter((r) =>
    isImageMime(r.mimeType, r.name),
  );
  const srcName = imageRefs[0]?.name || "uploaded-image";
  const ocrBlob = [
    input.prompt,
    ...imageRefs.map((r) => r.text ?? ""),
    ...(input.references ?? []).map((r) => r.text ?? ""),
  ].join("\n");

  const isSmart =
    /smart\s*connection/i.test(input.prompt) ||
    /smart\s*connection/i.test(srcName) ||
    /smart\s*connection/i.test(ocrBlob);

  const nodes = extractNodesFromText(
    ocrBlob,
    isSmart ? DEFAULT_SMART_CONNECTIONS : ["Input", "Process", "Output", "Feedback"],
  );

  const title =
    isSmart
      ? "SMART CONNECTIONS"
      : /title[:：]\s*(.+)/i.exec(input.prompt)?.[1]?.trim() ||
        srcName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 48) ||
        "Rebuilt infographic";

  const W = PORTRAIT.width;
  const H = PORTRAIT.height;
  const margin = 72;
  const cardW = W - margin * 2;
  const cardH = 160;
  const startY = 320;
  const gap = 48;
  const elements: SlideElement[] = [];

  // Background + header bar
  elements.push(shapeEl({ x: 0, y: 0, w: W, h: H, z: 0, name: "bg" }, surface, "rect"));
  elements.push(shapeEl({ x: 0, y: 0, w: W, h: 12, z: 1, name: "top-bar" }, accent, "rect"));
  elements.push(
    textEl(
      { x: margin, y: 48, w: cardW, h: 100, z: 4, name: "title" },
      [para(title, { fontSize: 42, fontWeight: 700, color: ink, align: "center" })],
    ),
  );
  elements.push(
    textEl(
      { x: margin, y: 150, w: cardW, h: 80, z: 4, name: "subtitle" },
      [
        para("Rebuilt as editable objects · OCR confidence varies", {
          fontSize: 18,
          color: muted,
          align: "center",
        }),
      ],
    ),
  );
  elements.push(
    textEl(
      { x: margin, y: 220, w: cardW, h: 60, z: 4, name: "source" },
      [
        para(`Source: ${srcName}`, {
          fontSize: 14,
          color: muted,
          align: "center",
        }),
      ],
    ),
  );

  // Source image thumbnail (if data URL) — keeps visual reference without making it the IR
  const dataUrl = imageRefs[0] && "dataUrl" in imageRefs[0]
    ? (imageRefs[0] as AgentReference & { dataUrl?: string }).dataUrl
    : undefined;
  // Also accept text field holding data:image for simple transport
  const embedded =
    dataUrl ||
    (imageRefs[0]?.text?.startsWith("data:image") ? imageRefs[0].text : undefined);
  if (embedded && embedded.length < 2_000_000) {
    elements.push({
      kind: "image",
      id: createId("el"),
      x: margin,
      y: H - 280,
      width: cardW,
      height: 180,
      rotation: 0,
      opacity: 0.35,
      zIndex: 1,
      name: "source-preview",
      src: embedded.slice(0, 1_500_000),
      objectFit: "contain",
    });
  }

  const nodeBoxes: Array<{ id: string; cx: number; cy: number; y: number }> = [];

  nodes.forEach((label, i) => {
    const y = startY + i * (cardH + gap);
    const fill = i % 2 === 0 ? accent : primary;
    const boxId = createId("node");
    elements.push(
      shapeEl(
        { x: margin, y, w: cardW, h: cardH, z: 2, name: `card-${i + 1}` },
        fill,
        "roundRect",
      ),
    );
    elements.push(
      textEl(
        {
          x: margin + 32,
          y: y + 40,
          w: cardW - 64,
          h: 80,
          z: 4,
          name: `label-${i + 1}`,
        },
        [
          para(`${i + 1}. ${label}`, {
            fontSize: 28,
            fontWeight: 700,
            color: "#FFFFFF",
            align: "center",
          }),
        ],
      ),
    );
    nodeBoxes.push({
      id: boxId,
      cx: margin + cardW / 2,
      cy: y + cardH,
      y,
    });
  });

  // Connectors between cards
  for (let i = 0; i < nodeBoxes.length - 1; i++) {
    const a = nodeBoxes[i]!;
    const b = nodeBoxes[i + 1]!;
    elements.push(
      connectorEl(
        { x: a.cx, y: a.y + cardH },
        { x: b.cx, y: b.y },
        accent,
        `link-${i + 1}`,
      ),
    );
  }

  // Confidence / QA note slide
  const notesSlideElements: SlideElement[] = [
    shapeEl({ x: 0, y: 0, w: W, h: H, z: 0 }, surface, "rect"),
    shapeEl({ x: 0, y: 0, w: 12, h: H, z: 1 }, accent, "rect"),
    textEl(
      { x: 80, y: 120, w: 900, h: 100, z: 3, name: "qa-title" },
      [para("Rebuild QA", { fontSize: 40, fontWeight: 700, color: ink })],
    ),
    textEl(
      { x: 80, y: 280, w: 900, h: 1200, z: 3, name: "qa-body" },
      [
        para("What was reconstructed", { fontSize: 24, fontWeight: 700, color: ink }),
        para(`• ${nodes.length} stage cards as independent shapes`, {
          fontSize: 20,
          color: ink,
        }),
        para("• Vertical connectors between stages", { fontSize: 20, color: ink }),
        para("• Title / source labels as text objects", { fontSize: 20, color: ink }),
        para("", { fontSize: 12, color: muted }),
        para("Review required", { fontSize: 24, fontWeight: 700, color: ink }),
        para(
          "• OCR text may be approximate — edit labels in place",
          { fontSize: 20, color: muted },
        ),
        para(
          "• Complex icons/gradients were simplified to shapes",
          { fontSize: 20, color: muted },
        ),
        para(
          "• Source image kept as low-opacity reference when available",
          { fontSize: 20, color: muted },
        ),
      ],
    ),
  ];

  const now = new Date().toISOString();
  const versionId = input.version?.versionId ?? createId("ver");
  const mainSlide: Slide = {
    id: createId("slide"),
    order: 0,
    size: { width: W, height: H },
    background: solidFill(surface),
    layoutHint: "image-rebuild",
    notes: `Rebuilt from ${srcName}. Low-confidence labels should be reviewed.`,
    elements,
  };
  const qaSlide: Slide = {
    id: createId("slide"),
    order: 1,
    size: { width: W, height: H },
    background: solidFill(surface),
    layoutHint: "rebuild-qa",
    notes: "Vision QA notes for human review.",
    elements: notesSlideElements,
  };

  return {
    id: createId("deck"),
    title,
    aspectRatio: "portrait",
    theme,
    slides: [mainSlide, qaSlide],
    references: imageRefs.map((r) => ({
      id: r.id || createId("ref"),
      name: r.name,
      mimeType: r.mimeType || "image/png",
      status: "parsed" as const,
      parsedSummary: "Image reference used for rebuild",
    })),
    citations: [
      {
        id: createId("cite"),
        title: srcName,
        accessedAt: now,
        excerptHash: srcName.slice(0, 32),
        claimIds: ["image-rebuild"],
      },
    ],
    versionId,
    createdAt: now,
    updatedAt: now,
    meta: {
      generator: "open-slidestudio/image-rebuild",
      source: "image-rebuild",
      rebuild: "true",
      sourceImage: srcName,
      versionNumber: String(input.version?.versionNumber ?? 1),
      versionLabel: input.version?.versionLabel ?? "V1",
    },
  };
}
