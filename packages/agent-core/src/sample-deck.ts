/**
 * Prompt-aware sample deck compose for the mock agent.
 * Prefer PPTD factories; stamp version metadata for the harness.
 */

import {
  createSampleResearchDeck,
  deepClone,
  solidFill,
  type ChartElement,
  type Citation,
  type Deck,
  type Reference,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TableCell,
  type TextElement,
  type ThemeTokens,
} from "@open-slidestudio/pptd";
import { createId } from "./util.js";
import { nextVersion, type VersionStamp } from "./version.js";

const SLIDE_W = 1920;
const SLIDE_H = 1080;

export interface ComposeSampleDeckOptions {
  title: string;
  prompt: string;
  theme: ThemeTokens;
  version?: VersionStamp;
  referenceNames?: string[];
  /**
   * When true (default), start from createSampleResearchDeck and re-theme;
   * when false, use the lightweight built-in multi-slide compose.
   */
  usePptdSample?: boolean;
}

export function composeSampleDeck(opts: ComposeSampleDeckOptions): Deck {
  const version = opts.version ?? nextVersion();
  const useSample = opts.usePptdSample !== false;

  if (useSample) {
    return stampVersion(
      customizeResearchSample(createSampleResearchDeck(opts.title), opts),
      version,
      opts,
    );
  }

  return stampVersion(buildInlineDeck(opts), version, opts);
}

/**
 * Apply a refinement instruction and bump version metadata on the deck.
 */
export function applyRefinement(
  base: Deck,
  instruction: string,
  version: VersionStamp,
): Deck {
  const now = new Date().toISOString();
  const deck = deepClone(base);
  deck.versionId = version.versionId;
  deck.updatedAt = now;
  deck.meta = {
    ...(deck.meta ?? {}),
    versionNumber: String(version.versionNumber),
    versionLabel: version.versionLabel,
    lastRefinement: instruction.slice(0, 500),
    refinedAt: now,
  };

  const noteSlide: Slide = {
    id: createId("slide"),
    order: deck.slides.length,
    size: { width: SLIDE_W, height: SLIDE_H },
    background: solidFill(deck.theme.colors.background),
    layoutHint: "section",
    notes: instruction,
    elements: [
      textBox({
        id: createId("el"),
        x: 120,
        y: 120,
        w: 1680,
        h: 80,
        text: "Refinement applied",
        fontSize: 40,
        bold: true,
        color: deck.theme.colors.ink,
        z: 1,
      }),
      textBox({
        id: createId("el"),
        x: 120,
        y: 240,
        w: 1680,
        h: 600,
        text: instruction,
        fontSize: 22,
        color: deck.theme.colors.muted,
        z: 2,
      }),
    ],
  };

  deck.slides = [...deck.slides.map((s, i) => ({ ...s, order: i })), noteSlide];
  return deck;
}

function customizeResearchSample(
  deck: Deck,
  opts: ComposeSampleDeckOptions,
): Deck {
  const now = new Date().toISOString();
  deck.title = opts.title;
  deck.theme = deepClone(opts.theme);
  deck.updatedAt = now;

  if (opts.referenceNames?.length) {
    const refs: Reference[] = opts.referenceNames.map((name) => ({
      id: createId("ref"),
      name,
      mimeType: "application/octet-stream",
      status: "parsed",
      parsedSummary: `Referenced material: ${name}`,
    }));
    deck.references = [...deck.references, ...refs];
    for (const ref of refs) {
      deck.citations.push({
        id: createId("cite"),
        title: ref.name,
        fileRef: ref.id,
        accessedAt: now,
        excerptHash: simpleHash(ref.name),
      });
    }
  }

  deck.citations = [
    {
      id: createId("cite"),
      title: "User brief",
      accessedAt: now,
      excerptHash: simpleHash(opts.prompt.slice(0, 240)),
      claimIds: ["brief"],
    },
    ...deck.citations,
  ];

  deck.meta = {
    ...(deck.meta ?? {}),
    generator: "open-slidestudio/agent-core",
    promptExcerpt: opts.prompt.slice(0, 200),
  };

  return deck;
}

function stampVersion(
  deck: Deck,
  version: VersionStamp,
  opts: ComposeSampleDeckOptions,
): Deck {
  const now = new Date().toISOString();
  deck.versionId = version.versionId;
  deck.updatedAt = now;
  deck.meta = {
    ...(deck.meta ?? {}),
    versionNumber: String(version.versionNumber),
    versionLabel: version.versionLabel,
    generator: "open-slidestudio/agent-core",
    promptExcerpt: opts.prompt.slice(0, 200),
  };
  return deck;
}

function buildInlineDeck(opts: ComposeSampleDeckOptions): Deck {
  const theme = opts.theme;
  const now = new Date().toISOString();

  const slides: Slide[] = [
    titleSlide(opts.title, extractSubtitle(opts.prompt), theme),
    agendaSlide(theme),
    insightSlide(
      "Executive summary",
      [
        "This deck is structured PPTD (text, shapes, chart, table, SmartArt).",
        "Agent steps (Think / Read / Todo / Terminal / Edit) stay visible in the timeline.",
        "Refine in chat or edit objects directly — both paths share the same IR.",
        "Export targets native editable PowerPoint objects, not full-page rasters.",
      ],
      theme,
      2,
    ),
    chartSlide(theme),
    tableSlide(theme),
    processSlide(theme),
    nextStepsSlide(opts.prompt, theme),
  ];

  const citations: Citation[] = [
    {
      id: createId("cite"),
      title: "User brief",
      accessedAt: now,
      excerptHash: simpleHash(opts.prompt.slice(0, 240)),
      claimIds: ["brief"],
    },
  ];

  const references: Reference[] = (opts.referenceNames ?? []).map((name) => ({
    id: createId("ref"),
    name,
    mimeType: "application/octet-stream",
    status: "parsed",
    parsedSummary: `Referenced material: ${name}`,
  }));

  return {
    id: createId("deck"),
    title: opts.title,
    aspectRatio: "16:9",
    theme,
    slides,
    references,
    citations,
    versionId: createId("ver"),
    createdAt: now,
    updatedAt: now,
    meta: {
      generator: "open-slidestudio/agent-core",
      source: "inlineCompose",
    },
  };
}

function extractSubtitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned || "Research-backed narrative deck";
  return `${cleaned.slice(0, 117).trimEnd()}…`;
}

function slideShell(
  order: number,
  layoutHint: string,
  theme: ThemeTokens,
  elements: SlideElement[],
  notes?: string,
): Slide {
  return {
    id: createId("slide"),
    order,
    size: { width: SLIDE_W, height: SLIDE_H },
    background: solidFill(theme.colors.background),
    layoutHint,
    notes,
    elements,
  };
}

function titleSlide(title: string, subtitle: string, theme: ThemeTokens): Slide {
  const elements: SlideElement[] = [
    shape({
      id: createId("el"),
      x: 0,
      y: 0,
      w: 24,
      h: SLIDE_H,
      fill: theme.colors.accent,
      z: 0,
    }),
    textBox({
      id: createId("el"),
      x: 120,
      y: 360,
      w: 1680,
      h: 120,
      text: title,
      fontSize: 52,
      bold: true,
      color: theme.colors.ink,
      z: 1,
    }),
    textBox({
      id: createId("el"),
      x: 120,
      y: 500,
      w: 1400,
      h: 120,
      text: subtitle,
      fontSize: 22,
      color: theme.colors.muted,
      z: 2,
    }),
    textBox({
      id: createId("el"),
      x: 120,
      y: 960,
      w: 800,
      h: 40,
      text: "DSH SlideStudio · Structured deck",
      fontSize: 16,
      color: theme.colors.muted,
      z: 3,
    }),
  ];
  return slideShell(0, "title", theme, elements, "Title slide");
}

function agendaSlide(theme: ThemeTokens): Slide {
  const items = [
    "Context & objectives",
    "Key findings",
    "Evidence & metrics",
    "Operating model",
    "Next steps",
  ];
  const elements: SlideElement[] = [
    headerBar("Agenda", theme),
    ...items.map((item, i) =>
      textBox({
        id: createId("el"),
        x: 160,
        y: 240 + i * 100,
        w: 1400,
        h: 72,
        text: `${String(i + 1).padStart(2, "0")}   ${item}`,
        fontSize: 28,
        color: theme.colors.ink,
        z: 2 + i,
      }),
    ),
  ];
  return slideShell(1, "agenda", theme, elements);
}

function insightSlide(
  title: string,
  bullets: string[],
  theme: ThemeTokens,
  order: number,
): Slide {
  const elements: SlideElement[] = [
    headerBar(title, theme),
    ...bullets.map((b, i) =>
      textBox({
        id: createId("el"),
        x: 140,
        y: 260 + i * 140,
        w: 1640,
        h: 120,
        text: b,
        fontSize: 24,
        color: theme.colors.ink,
        z: 2 + i,
        bullet: true,
      }),
    ),
  ];
  return slideShell(order, "two-column", theme, elements);
}

function chartSlide(theme: ThemeTokens): Slide {
  const chart: ChartElement = {
    id: createId("el"),
    kind: "chart",
    chartType: "column",
    title: "Relative impact (illustrative)",
    x: 140,
    y: 260,
    width: 1640,
    height: 680,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    name: "Impact chart",
    showLegend: true,
    categories: ["Speed", "Quality", "Editability", "Traceability", "Export"],
    series: [
      {
        name: "Structured IR",
        values: [86, 90, 95, 92, 88],
        color: theme.colors.accent,
      },
      {
        name: "Image-only",
        values: [70, 55, 20, 35, 40],
        color: theme.colors.chart[3] ?? "#94A3B8",
      },
    ],
  };
  return slideShell(3, "chart-focus", theme, [headerBar("Evidence snapshot", theme), chart], "Chart is structured data, not a bitmap.");
}

function tableSlide(theme: ThemeTokens): Slide {
  const header = ["Dimension", "Generate", "Refine", "Export"];
  const body = [
    ["Source of truth", "PPTD IR", "PPTD IR", "PPTD IR"],
    ["Agent tools", "Visible steps", "Scoped edits", "N/A"],
    ["Versions", "V1 snapshot", "Bump Vn", "From version"],
    ["Charts", "Native series", "Edit data", "Editable chart"],
  ];
  const colW = [460, 393, 393, 394];
  const cells: TableCell[][] = [
    header.map((text) => ({
      text,
      fontWeight: 700,
      fill: solidFill(theme.colors.surface),
      color: theme.colors.ink,
    })),
    ...body.map((row) =>
      row.map((text) => ({
        text,
        color: theme.colors.ink,
        fontSize: 18,
      })),
    ),
  ];

  return slideShell(4, "table-focus", theme, [
    headerBar("Decision matrix", theme),
    {
      id: createId("el"),
      kind: "table",
      x: 140,
      y: 280,
      width: 1640,
      height: 560,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      name: "Decision matrix",
      rows: cells.length,
      cols: header.length,
      columnWidths: colW,
      cells,
    },
  ]);
}

function processSlide(theme: ThemeTokens): Slide {
  const labels = ["Brief", "Plan", "Compose", "Validate", "Ship"];
  const nodes = labels.map((text) => ({
    id: createId("node"),
    text,
    parentId: null as string | null,
  }));
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const prev = nodes[i - 1];
    if (node && prev) node.parentId = prev.id;
  }
  const edges = nodes.slice(1).map((n, i) => ({
    id: createId("edge"),
    from: nodes[i]!.id,
    to: n.id,
  }));

  return slideShell(5, "process", theme, [
    headerBar("Delivery process", theme),
    {
      id: createId("el"),
      kind: "smartart",
      layout: "process",
      x: 140,
      y: 320,
      width: 1640,
      height: 420,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      name: "Process",
      nodes,
      edges,
    },
  ]);
}

function nextStepsSlide(prompt: string, theme: ThemeTokens): Slide {
  const steps = [
    "Review structured objects on each slide in the editor.",
    "Refine via chat (version bumps) or edit elements directly.",
    "Export PPTX when the narrative and data are ready.",
    `Original brief retained for traceability: “${truncate(prompt, 80)}”`,
  ];
  return insightSlide("Next steps", steps, theme, 6);
}

function headerBar(title: string, theme: ThemeTokens): TextElement {
  return textBox({
    id: createId("el"),
    x: 120,
    y: 100,
    w: 1680,
    h: 90,
    text: title,
    fontSize: 40,
    bold: true,
    color: theme.colors.ink,
    z: 1,
  });
}

function textBox(opts: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  bold?: boolean;
  color: string;
  z: number;
  bullet?: boolean;
}): TextElement {
  return {
    id: opts.id,
    kind: "text",
    x: opts.x,
    y: opts.y,
    width: opts.w,
    height: opts.h,
    rotation: 0,
    opacity: 1,
    zIndex: opts.z,
    paragraphs: [
      {
        bullet: opts.bullet ? { level: 0, style: "disc" } : false,
        runs: [
          {
            text: opts.text,
            fontWeight: opts.bold ? 700 : 400,
            fontSize: opts.fontSize,
            color: opts.color,
          },
        ],
        align: "left",
      },
    ],
    verticalAlign: "top",
  };
}

function shape(opts: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  z: number;
}): ShapeElement {
  return {
    id: opts.id,
    kind: "shape",
    shape: "rect",
    x: opts.x,
    y: opts.y,
    width: opts.w,
    height: opts.h,
    rotation: 0,
    opacity: 1,
    zIndex: opts.z,
    fill: solidFill(opts.fill),
  };
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}
