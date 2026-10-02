import type { Deck, Slide } from "../types/deck.js";
import type {
  TextElement,
  ShapeElement,
  ChartElement,
  TableElement,
  SmartArtElement,
  ConnectorElement,
  GroupElement,
  TextParagraph,
} from "../types/elements.js";
import type { ThemeTokens } from "../types/theme.js";
import { DEFAULT_SLIDE_SIZE } from "../types/geometry.js";
import { solidFill } from "../types/fill.js";
import { createId, nowIso } from "../id.js";

/** Consulting-style research theme for offline mock agent demos. */
export const SAMPLE_RESEARCH_THEME: ThemeTokens = {
  name: "Research Meridian",
  colors: {
    background: "#0B1F33",
    surface: "#FFFFFF",
    ink: "#0B1F33",
    muted: "#5A6B7D",
    accent: "#1F6FEB",
    primary: "#0B1F33",
    secondary: "#1F6FEB",
    success: "#1B7F5A",
    danger: "#C64545",
    chart: ["#1F6FEB", "#3D9B8F", "#E8A838", "#C64545", "#7B6CF0", "#5A6B7D"],
  },
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  radii: { sm: 6, md: 10, lg: 16 },
  spacing: 8,
};

function baseEl(partial: {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  name?: string;
}) {
  return {
    id: partial.id ?? createId("el"),
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    rotation: 0,
    opacity: 1,
    zIndex: partial.zIndex,
    name: partial.name,
  };
}

function para(
  text: string,
  opts?: {
    fontSize?: number;
    fontWeight?: number | string;
    color?: string;
    align?: TextParagraph["align"];
    bullet?: boolean;
  },
): TextParagraph {
  return {
    align: opts?.align ?? "left",
    runs: [
      {
        text,
        fontSize: opts?.fontSize ?? 18,
        fontWeight: opts?.fontWeight ?? 400,
        color: opts?.color ?? SAMPLE_RESEARCH_THEME.colors.ink,
      },
    ],
    ...(opts?.bullet ? { bullet: true } : {}),
  };
}

function textEl(
  fields: {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    name?: string;
    id?: string;
  },
  paragraphs: TextParagraph[],
): TextElement {
  return {
    kind: "text",
    ...baseEl(fields),
    paragraphs,
    verticalAlign: "top",
  };
}

function titleSlide(): Slide {
  const accentBar: ShapeElement = {
    kind: "shape",
    ...baseEl({ x: 0, y: 0, width: 24, height: 1080, zIndex: 0, name: "accent-bar" }),
    shape: "rect",
    fill: solidFill(SAMPLE_RESEARCH_THEME.colors.accent),
  };

  return {
    id: createId("slide"),
    order: 0,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#0B1F33"),
    layoutHint: "title",
    notes: "Opening title for market research briefing.",
    elements: [
      accentBar,
      textEl(
        { x: 120, y: 320, width: 1600, height: 120, zIndex: 1, name: "title" },
        [
          para("Global EV Market Outlook 2026", {
            fontSize: 56,
            fontWeight: 700,
            color: "#FFFFFF",
          }),
        ],
      ),
      textEl(
        { x: 120, y: 460, width: 1200, height: 60, zIndex: 2, name: "subtitle" },
        [
          para("Strategy briefing · Open SlideStudio sample deck", {
            fontSize: 24,
            color: "#A8C0D8",
          }),
        ],
      ),
      textEl(
        { x: 120, y: 920, width: 800, height: 40, zIndex: 3, name: "meta" },
        [
          para("Confidential · Research sample", {
            fontSize: 14,
            color: "#6B849C",
          }),
        ],
      ),
    ],
  };
}

function storyOverviewSlide(): Slide {
  // Offline-safe shape panel (no external image dependency for export/smoke).
  const sidePanel: ShapeElement = {
    kind: "shape",
    ...baseEl({
      x: 1100,
      y: 200,
      width: 640,
      height: 640,
      zIndex: 3,
      name: "hero-panel",
    }),
    shape: "roundRect",
    fill: solidFill("#E8F1FF"),
    cornerRadius: 24,
  };

  return {
    id: createId("slide"),
    order: 1,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#FFFFFF"),
    layoutHint: "agenda",
    notes: "Story map / agenda.",
    elements: [
      textEl(
        { x: 80, y: 60, width: 1000, height: 70, zIndex: 1, name: "heading" },
        [para("Story overview", { fontSize: 36, fontWeight: 700 })],
      ),
      textEl(
        { x: 80, y: 180, width: 800, height: 400, zIndex: 2, name: "bullets" },
        [
          para("Demand is shifting from early adopters to mainstream fleets", {
            fontSize: 22,
            bullet: true,
          }),
          para("Battery cost curves remain the primary margin driver", {
            fontSize: 22,
            bullet: true,
          }),
          para("Policy divergence across US / EU / CN shapes go-to-market", {
            fontSize: 22,
            bullet: true,
          }),
          para("Recommended focus: B2B charging + mid-range platforms", {
            fontSize: 22,
            bullet: true,
          }),
        ],
      ),
      sidePanel,
    ],
  };
}

function dataTableSlide(): Slide {
  const table: TableElement = {
    kind: "table",
    ...baseEl({ x: 80, y: 200, width: 1760, height: 520, zIndex: 2, name: "kpi-table" }),
    rows: 5,
    cols: 4,
    columnWidths: [440, 440, 440, 440],
    cells: [
      [
        { text: "Region", fontWeight: 700, fill: solidFill("#EEF4FC"), align: "center" },
        { text: "2024 share", fontWeight: 700, fill: solidFill("#EEF4FC"), align: "center" },
        { text: "2026E share", fontWeight: 700, fill: solidFill("#EEF4FC"), align: "center" },
        { text: "CAGR", fontWeight: 700, fill: solidFill("#EEF4FC"), align: "center" },
      ],
      [
        { text: "China", align: "center" },
        { text: "48%", align: "center" },
        { text: "46%", align: "center" },
        { text: "18%", align: "center" },
      ],
      [
        { text: "Europe", align: "center" },
        { text: "24%", align: "center" },
        { text: "27%", align: "center" },
        { text: "22%", align: "center" },
      ],
      [
        { text: "North America", align: "center" },
        { text: "16%", align: "center" },
        { text: "19%", align: "center" },
        { text: "25%", align: "center" },
      ],
      [
        { text: "Rest of world", align: "center" },
        { text: "12%", align: "center" },
        { text: "8%", align: "center" },
        { text: "12%", align: "center" },
      ],
    ],
  };

  return {
    id: createId("slide"),
    order: 2,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#FFFFFF"),
    layoutHint: "data",
    notes: "Regional share table.",
    elements: [
      textEl(
        { x: 80, y: 60, width: 1400, height: 70, zIndex: 1, name: "heading" },
        [para("Regional market share", { fontSize: 36, fontWeight: 700 })],
      ),
      table,
    ],
  };
}

function chartSlide(): Slide {
  const chart: ChartElement = {
    kind: "chart",
    ...baseEl({ x: 100, y: 180, width: 1720, height: 720, zIndex: 2, name: "sales-chart" }),
    chartType: "column",
    title: "Global BEV unit sales (M)",
    categories: ["2022", "2023", "2024", "2025E", "2026E"],
    series: [
      {
        name: "BEV sales",
        values: [7.3, 9.5, 12.1, 15.4, 18.8],
        color: SAMPLE_RESEARCH_THEME.colors.chart[0],
      },
      {
        name: "PHEV sales",
        values: [2.8, 3.4, 4.1, 4.6, 5.0],
        color: SAMPLE_RESEARCH_THEME.colors.chart[1],
      },
    ],
    showLegend: true,
    showDataLabels: false,
    yAxisTitle: "Million units",
  };

  return {
    id: createId("slide"),
    order: 3,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#FFFFFF"),
    layoutHint: "chart",
    notes: "Editable native chart for export.",
    elements: [
      textEl(
        { x: 80, y: 50, width: 1400, height: 70, zIndex: 1, name: "heading" },
        [para("Volume trajectory", { fontSize: 36, fontWeight: 700 })],
      ),
      chart,
    ],
  };
}

function timelineSlide(): Slide {
  const smart: SmartArtElement = {
    kind: "smartart",
    ...baseEl({ x: 80, y: 220, width: 1760, height: 520, zIndex: 2, name: "timeline" }),
    layout: "timeline",
    nodes: [
      { id: "n1", text: "Policy reset\n2023" },
      { id: "n2", text: "Cost parity\n2024–25", parentId: "n1" },
      { id: "n3", text: "Fleet tipping\n2025–26", parentId: "n2" },
      { id: "n4", text: "Software lock-in\n2026+", parentId: "n3" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
      { id: "e3", from: "n3", to: "n4" },
    ],
  };

  return {
    id: createId("slide"),
    order: 4,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#FFFFFF"),
    layoutHint: "timeline",
    notes: "Market phase timeline as SmartArt.",
    elements: [
      textEl(
        { x: 80, y: 60, width: 1400, height: 70, zIndex: 1, name: "heading" },
        [para("Market phases", { fontSize: 36, fontWeight: 700 })],
      ),
      smart,
    ],
  };
}

function smartArtProcessSlide(): Slide {
  const nodes = [
    { id: "p1", text: "Diagnose" },
    { id: "p2", text: "Prioritize", parentId: "p1" },
    { id: "p3", text: "Pilot", parentId: "p2" },
    { id: "p4", text: "Scale", parentId: "p3" },
  ];
  const edges = [
    { id: "pe1", from: "p1", to: "p2" },
    { id: "pe2", from: "p2", to: "p3" },
    { id: "pe3", from: "p3", to: "p4" },
  ];

  const process: SmartArtElement = {
    kind: "smartart",
    ...baseEl({ x: 120, y: 240, width: 1680, height: 400, zIndex: 2, name: "process" }),
    layout: "process",
    nodes,
    edges,
  };

  // Visual connectors between placeholder boxes (export maps SmartArt → shapes+connectors)
  const boxW = 280;
  const boxH = 120;
  const startX = 200;
  const y = 420;
  const gap = 160;
  const boxes: ShapeElement[] = nodes.map((n, i) => ({
    kind: "shape",
    ...baseEl({
      id: createId("shape"),
      x: startX + i * (boxW + gap),
      y,
      width: boxW,
      height: boxH,
      zIndex: 3,
      name: `process-box-${i}`,
    }),
    shape: "roundRect",
    cornerRadius: 12,
    fill: solidFill(i % 2 === 0 ? "#1F6FEB" : "#3D9B8F"),
    text: [
      {
        align: "center",
        runs: [{ text: n.text, fontSize: 22, fontWeight: 600, color: "#FFFFFF" }],
      },
    ],
  }));

  const connectors: ConnectorElement[] = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i]!;
    const b = boxes[i + 1]!;
    connectors.push({
      kind: "connector",
      ...baseEl({
        x: a.x + a.width,
        y: y + boxH / 2,
        width: gap,
        height: 2,
        zIndex: 4,
        name: `conn-${i}`,
      }),
      connectorType: "straight",
      start: { elementId: a.id, anchor: "e" },
      end: { elementId: b.id, anchor: "w" },
      stroke: { color: "#5A6B7D", width: 2 },
      endArrow: "triangle",
    });
  }

  const group: GroupElement = {
    kind: "group",
    ...baseEl({ x: 120, y: 360, width: 1680, height: 220, zIndex: 5, name: "process-visual" }),
    children: [...boxes, ...connectors],
  };

  return {
    id: createId("slide"),
    order: 5,
    size: { ...DEFAULT_SLIDE_SIZE },
    background: solidFill("#FFFFFF"),
    layoutHint: "smartart",
    notes: "Recommended engagement process.",
    elements: [
      textEl(
        { x: 80, y: 60, width: 1400, height: 70, zIndex: 1, name: "heading" },
        [para("How we engage", { fontSize: 36, fontWeight: 700 })],
      ),
      process,
      group,
    ],
  };
}

/**
 * Deterministic multi-slide research deck used by the mock agent and offline demos.
 * Includes title, agenda, table, chart, timeline SmartArt, and process/group/connectors.
 */
export function createSampleResearchDeck(title = "Global EV Market Outlook 2026"): Deck {
  const ts = nowIso();
  const slides = [
    titleSlide(),
    storyOverviewSlide(),
    dataTableSlide(),
    chartSlide(),
    timelineSlide(),
    smartArtProcessSlide(),
  ].map((s, i) => ({ ...s, order: i }));

  return {
    id: createId("deck"),
    title,
    aspectRatio: "16:9",
    theme: { ...SAMPLE_RESEARCH_THEME, colors: { ...SAMPLE_RESEARCH_THEME.colors, chart: [...SAMPLE_RESEARCH_THEME.colors.chart] } },
    slides,
    references: [
      {
        id: createId("ref"),
        name: "sample-brief.md",
        mimeType: "text/markdown",
        status: "parsed",
        parsedSummary: "Synthetic research brief for offline demo.",
      },
    ],
    citations: [
      {
        id: createId("cite"),
        title: "Synthetic EV volume series (demo)",
        accessedAt: ts,
        claimIds: ["volume-trajectory"],
      },
    ],
    versionId: createId("ver"),
    createdAt: ts,
    updatedAt: ts,
    meta: {
      source: "sampleResearchDeck",
      product: "Open SlideStudio",
    },
  };
}
