import type {
  AntiSlopRule,
  DesignContract,
  LayoutArchetype,
} from "./contract.js";
import type { ThemeTokens, TypeScale } from "./theme-tokens.js";

/**
 * Default consulting visual system — restrained strategy-deck language:
 * deep navy primary, white stage, clear type hierarchy.
 * No third-party trademarks in names or copy.
 */
export function defaultConsultingTheme(): ThemeTokens {
  return {
    name: "Consulting Classic",
    colors: {
      background: "#FFFFFF",
      surface: "#F6F6F6",
      ink: "#111111",
      muted: "#5C5C5C",
      accent: "#0B3D5C",
      primary: "#111111",
      secondary: "#1F6B8A",
      success: "#2F6F4E",
      danger: "#A33B3B",
      warning: "#B07A1A",
      border: "#E7E7E7",
      chart: [
        "#0B3D5C",
        "#1F6B8A",
        "#4D9CFF",
        "#6B8F71",
        "#C47B3A",
        "#8B6B9E",
        "#B0B7C3",
      ],
    },
    fonts: {
      heading: "Inter, system-ui, 'Segoe UI', sans-serif",
      body: "Inter, system-ui, 'Segoe UI', sans-serif",
      mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    },
    radii: {
      sm: 4,
      md: 8,
      lg: 12,
    },
    spacing: 8,
  };
}

export function defaultTypeScale(): TypeScale {
  return {
    display: 56,
    h1: 40,
    h2: 28,
    h3: 22,
    body: 18,
    caption: 14,
    footnote: 12,
  };
}

/** Shared layout archetypes for research / consulting decks */
export function defaultLayoutArchetypes(): LayoutArchetype[] {
  return [
    {
      id: "title",
      name: "Title",
      description: "Cover: large title, optional subtitle, client/date footer.",
      zones: [
        { role: "eyebrow", x: 0.07, y: 0.28, w: 0.55, h: 0.06 },
        { role: "title", x: 0.07, y: 0.36, w: 0.7, h: 0.22 },
        { role: "subtitle", x: 0.07, y: 0.6, w: 0.55, h: 0.1 },
        { role: "footer", x: 0.07, y: 0.88, w: 0.86, h: 0.05 },
      ],
      preferredElements: ["text", "shape", "image"],
    },
    {
      id: "section",
      name: "Section divider",
      description: "Chapter break with short title and optional index number.",
      zones: [
        { role: "index", x: 0.07, y: 0.38, w: 0.12, h: 0.1 },
        { role: "title", x: 0.2, y: 0.4, w: 0.65, h: 0.14 },
      ],
      preferredElements: ["text", "shape"],
    },
    {
      id: "agenda",
      name: "Agenda",
      description: "Numbered agenda / contents list.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.7, h: 0.1 },
        { role: "list", x: 0.07, y: 0.24, w: 0.7, h: 0.62 },
      ],
      preferredElements: ["text"],
    },
    {
      id: "two-column",
      name: "Two column",
      description: "Left narrative / right evidence or mirror columns.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "left", x: 0.07, y: 0.24, w: 0.4, h: 0.62 },
        { role: "right", x: 0.53, y: 0.24, w: 0.4, h: 0.62 },
      ],
      preferredElements: ["text", "shape", "image", "chart"],
    },
    {
      id: "three-column",
      name: "Three column",
      description: "Equal cards or pillars — max three primary ideas.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "col1", x: 0.07, y: 0.24, w: 0.26, h: 0.58 },
        { role: "col2", x: 0.37, y: 0.24, w: 0.26, h: 0.58 },
        { role: "col3", x: 0.67, y: 0.24, w: 0.26, h: 0.58 },
      ],
      preferredElements: ["text", "shape", "image"],
    },
    {
      id: "kpi-row",
      name: "KPI row",
      description: "3–4 headline metrics with labels and optional delta.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "kpis", x: 0.07, y: 0.28, w: 0.86, h: 0.28 },
        { role: "body", x: 0.07, y: 0.62, w: 0.86, h: 0.24 },
      ],
      preferredElements: ["text", "shape"],
    },
    {
      id: "chart-focus",
      name: "Chart focus",
      description: "Dominant chart with takeaway callout.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.55, h: 0.1 },
        { role: "takeaway", x: 0.65, y: 0.08, w: 0.28, h: 0.12 },
        { role: "chart", x: 0.07, y: 0.24, w: 0.86, h: 0.58 },
        { role: "source", x: 0.07, y: 0.9, w: 0.86, h: 0.04 },
      ],
      preferredElements: ["chart", "text"],
    },
    {
      id: "table-focus",
      name: "Table focus",
      description: "Structured comparison table with header row emphasis.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "table", x: 0.07, y: 0.22, w: 0.86, h: 0.62 },
        { role: "source", x: 0.07, y: 0.9, w: 0.86, h: 0.04 },
      ],
      preferredElements: ["table", "text"],
    },
    {
      id: "timeline",
      name: "Timeline",
      description: "Horizontal process / roadmap milestones.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "timeline", x: 0.07, y: 0.32, w: 0.86, h: 0.42 },
        { role: "notes", x: 0.07, y: 0.8, w: 0.86, h: 0.1 },
      ],
      preferredElements: ["shape", "text", "connector"],
    },
    {
      id: "process",
      name: "Process steps",
      description: "3–5 sequential steps with connectors.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "steps", x: 0.07, y: 0.28, w: 0.86, h: 0.5 },
      ],
      preferredElements: ["smartart", "shape", "text", "connector"],
    },
    {
      id: "matrix",
      name: "2×2 matrix",
      description: "Quadrant framework with axis labels.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "matrix", x: 0.18, y: 0.22, w: 0.64, h: 0.62 },
      ],
      preferredElements: ["shape", "text"],
    },
    {
      id: "comparison",
      name: "Comparison",
      description: "Before/after or option A vs B.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "left", x: 0.07, y: 0.24, w: 0.4, h: 0.58 },
        { role: "right", x: 0.53, y: 0.24, w: 0.4, h: 0.58 },
      ],
      preferredElements: ["text", "shape", "table"],
    },
    {
      id: "quote",
      name: "Quote / insight",
      description: "Large insight statement with attribution.",
      zones: [
        { role: "quote", x: 0.12, y: 0.32, w: 0.76, h: 0.28 },
        { role: "attribution", x: 0.12, y: 0.64, w: 0.5, h: 0.08 },
      ],
      preferredElements: ["text", "shape"],
    },
    {
      id: "closing",
      name: "Closing",
      description: "Next steps / thank-you / contact.",
      zones: [
        { role: "title", x: 0.07, y: 0.32, w: 0.7, h: 0.14 },
        { role: "body", x: 0.07, y: 0.5, w: 0.6, h: 0.2 },
        { role: "footer", x: 0.07, y: 0.88, w: 0.86, h: 0.05 },
      ],
      preferredElements: ["text"],
    },
    {
      id: "full-bleed-image",
      name: "Full-bleed image",
      description: "Background image with overlay title (use sparingly).",
      zones: [
        { role: "image", x: 0, y: 0, w: 1, h: 1 },
        { role: "title", x: 0.07, y: 0.4, w: 0.6, h: 0.18 },
      ],
      preferredElements: ["image", "text", "shape"],
    },
    {
      id: "smartart",
      name: "SmartArt / diagram",
      description: "Node graph with connectors; editable nodes.",
      zones: [
        { role: "title", x: 0.07, y: 0.08, w: 0.86, h: 0.1 },
        { role: "diagram", x: 0.07, y: 0.24, w: 0.86, h: 0.62 },
      ],
      preferredElements: ["smartart", "connector", "shape", "text"],
    },
  ];
}

/** Anti-slop rules for presentation content quality */
export function defaultAntiSlopRules(): AntiSlopRule[] {
  return [
    {
      id: "as-01",
      severity: "must",
      rule: "Emit structured PPTD elements (text, shape, chart, table, smartart) — never a full-slide raster as the primary content.",
    },
    {
      id: "as-02",
      severity: "must",
      rule: "One primary idea per slide; title is a conclusion sentence, not a topic label.",
    },
    {
      id: "as-03",
      severity: "must",
      rule: "Respect the theme token palette; do not invent neon gradients or random brand colors.",
    },
    {
      id: "as-04",
      severity: "must",
      rule: "Keep body copy scannable: short bullets, ≤6 bullets per list, ≤2 lines per bullet when possible.",
    },
    {
      id: "as-05",
      severity: "should",
      rule: "Prefer charts/tables/timelines for quantitative claims over long prose.",
    },
    {
      id: "as-06",
      severity: "should",
      rule: "Align to a consistent margin and column grid across the deck; reuse title y-position.",
    },
    {
      id: "as-07",
      severity: "avoid",
      rule: "Avoid generic AI marketing card grids, glassmorphism stacks, and decorative 3D blobs.",
    },
    {
      id: "as-08",
      severity: "avoid",
      rule: "Avoid walls of text, tiny unreadable labels, and low-contrast gray-on-gray.",
    },
    {
      id: "as-09",
      severity: "avoid",
      rule: "Avoid clip-art style icons with mismatched styles; prefer simple geometric markers.",
    },
    {
      id: "as-10",
      severity: "must",
      rule: "Charts must carry real series data suitable for native edit-data export — no chart-as-image.",
    },
    {
      id: "as-11",
      severity: "should",
      rule: "Cite sources for researched facts in footnotes or speaker notes.",
    },
    {
      id: "as-12",
      severity: "must",
      rule: "Do not use third-party product trademarks in generated slide copy unless the user brief requires them as subject matter.",
    },
  ];
}

/** Full default consulting design contract */
export function defaultConsultingContract(): DesignContract {
  return {
    version: "1.0.0",
    name: "Consulting Classic",
    intent:
      "Produce clarity-first research and strategy decks with consulting polish: decisive titles, evidence-backed charts, restrained color, and editable structure.",
    audience:
      "Executives, clients, and operators reviewing strategy or research findings",
    tokens: defaultConsultingTheme(),
    typeScale: defaultTypeScale(),
    slideMargin: 64,
    gap: 24,
    layoutArchetypes: defaultLayoutArchetypes(),
    antiSlopRules: defaultAntiSlopRules(),
    density: "balanced",
    motion: "quiet",
    brandNotes:
      "Neutral professional workbench aesthetic. White stage, deep navy accent, Inter/system type. Content carries emphasis — chrome stays quiet.",
  };
}
