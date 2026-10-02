/**
 * Slide layout recipes — geometry + type roles for 1920×1080.
 * Replaces one-size hardcoded compile boxes with named recipes.
 */

export type RecipeFamilyId =
  | "consulting-meridian"
  | "editorial-ink"
  | "data-dense";

export type RecipeId =
  | "cover-hero"
  | "section-break"
  | "claim-bullets"
  | "two-column-compare"
  | "chart-insight"
  | "table-matrix"
  | "timeline-milestones"
  | "quote-focus"
  | "closing-next";

export type TypeRole = "display" | "h1" | "h2" | "body" | "caption";

export type RecipeFamily = {
  id: RecipeFamilyId;
  name: string;
  colors: {
    background: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
    primary: string;
    chart: string[];
  };
  typeScale: Record<TypeRole, { size: number; weight: number }>;
  margin: number;
  forbiddenAccents: string[];
};

export type LayoutRecipe = {
  id: RecipeId;
  family: RecipeFamilyId;
  description: string;
  zones: {
    title: { x: number; y: number; w: number; h: number; role: TypeRole };
    body?: { x: number; y: number; w: number; h: number; role: TypeRole };
    media?: { x: number; y: number; w: number; h: number };
    accentBar?: { x: number; y: number; w: number; h: number };
    footer?: { x: number; y: number; w: number; h: number; role: TypeRole };
  };
};

const FORBIDDEN = [
  "#6366f1",
  "#4f46e5",
  "#4338ca",
  "#8b5cf6",
  "#7c3aed",
  "#a855f7",
];

export const RECIPE_FAMILIES: Record<RecipeFamilyId, RecipeFamily> = {
  "consulting-meridian": {
    id: "consulting-meridian",
    name: "Consulting Meridian",
    colors: {
      background: "#0B1F33",
      surface: "#FFFFFF",
      ink: "#0B1F33",
      muted: "#5A6B7D",
      accent: "#1F6FEB",
      primary: "#0B1F33",
      chart: ["#1F6FEB", "#3D9B8F", "#E8A838", "#C64545", "#5A6B7D"],
    },
    typeScale: {
      display: { size: 64, weight: 700 },
      h1: { size: 42, weight: 700 },
      h2: { size: 28, weight: 600 },
      body: { size: 22, weight: 400 },
      caption: { size: 16, weight: 400 },
    },
    margin: 96,
    forbiddenAccents: FORBIDDEN,
  },
  "editorial-ink": {
    id: "editorial-ink",
    name: "Editorial Ink",
    colors: {
      background: "#111111",
      surface: "#FAFAF8",
      ink: "#161616",
      muted: "#6B6B6B",
      accent: "#C5E803",
      primary: "#111111",
      chart: ["#161616", "#C5E803", "#6B6B6B", "#E8A838"],
    },
    typeScale: {
      display: { size: 72, weight: 700 },
      h1: { size: 48, weight: 700 },
      h2: { size: 30, weight: 600 },
      body: { size: 24, weight: 400 },
      caption: { size: 16, weight: 400 },
    },
    margin: 128,
    forbiddenAccents: FORBIDDEN,
  },
  "data-dense": {
    id: "data-dense",
    name: "Data Dense",
    colors: {
      background: "#0A1628",
      surface: "#F7F8FA",
      ink: "#122033",
      muted: "#667788",
      accent: "#0E9F6E",
      primary: "#0A1628",
      chart: ["#0E9F6E", "#1F6FEB", "#E8A838", "#C64545"],
    },
    typeScale: {
      display: { size: 56, weight: 700 },
      h1: { size: 36, weight: 700 },
      h2: { size: 24, weight: 600 },
      body: { size: 18, weight: 400 },
      caption: { size: 14, weight: 400 },
    },
    margin: 72,
    forbiddenAccents: FORBIDDEN,
  },
};

/** Default consulting geometry (16:9 1920×1080). */
export const LAYOUT_RECIPES: LayoutRecipe[] = [
  {
    id: "cover-hero",
    family: "consulting-meridian",
    description: "Full-bleed primary cover, one claim, optional subtitle",
    zones: {
      accentBar: { x: 0, y: 0, w: 16, h: 1080 },
      title: { x: 120, y: 360, w: 1600, h: 160, role: "display" },
      body: { x: 120, y: 540, w: 1400, h: 100, role: "h2" },
      footer: { x: 120, y: 960, w: 800, h: 40, role: "caption" },
    },
  },
  {
    id: "section-break",
    family: "consulting-meridian",
    description: "Sparse section title",
    zones: {
      accentBar: { x: 0, y: 0, w: 1920, h: 10 },
      title: { x: 120, y: 420, w: 1680, h: 120, role: "h1" },
      body: { x: 120, y: 560, w: 1400, h: 80, role: "body" },
    },
  },
  {
    id: "claim-bullets",
    family: "consulting-meridian",
    description: "Claim title + evidence bullets + action footer",
    zones: {
      title: { x: 100, y: 80, w: 1700, h: 90, role: "h1" },
      accentBar: { x: 100, y: 180, w: 96, h: 6 },
      body: { x: 100, y: 220, w: 1700, h: 680, role: "body" },
      footer: { x: 100, y: 960, w: 1600, h: 48, role: "caption" },
    },
  },
  {
    id: "two-column-compare",
    family: "consulting-meridian",
    description: "Two equal evidence columns",
    zones: {
      title: { x: 100, y: 72, w: 1700, h: 80, role: "h1" },
      body: { x: 100, y: 200, w: 820, h: 720, role: "body" },
      media: { x: 1000, y: 200, w: 820, h: 720 },
    },
  },
  {
    id: "chart-insight",
    family: "data-dense",
    description: "Conclusion title + chart + source caption",
    zones: {
      title: { x: 100, y: 64, w: 1700, h: 80, role: "h1" },
      media: { x: 100, y: 180, w: 1720, h: 720 },
      footer: { x: 100, y: 920, w: 1600, h: 48, role: "caption" },
    },
  },
  {
    id: "table-matrix",
    family: "data-dense",
    description: "Matrix table with claim title",
    zones: {
      title: { x: 100, y: 64, w: 1700, h: 80, role: "h1" },
      media: { x: 100, y: 180, w: 1720, h: 720 },
      footer: { x: 100, y: 920, w: 1600, h: 48, role: "caption" },
    },
  },
  {
    id: "timeline-milestones",
    family: "consulting-meridian",
    description: "Horizontal milestones",
    zones: {
      title: { x: 100, y: 64, w: 1700, h: 80, role: "h1" },
      media: { x: 100, y: 280, w: 1720, h: 560 },
      footer: { x: 100, y: 920, w: 1600, h: 48, role: "caption" },
    },
  },
  {
    id: "quote-focus",
    family: "editorial-ink",
    description: "Single large quote",
    zones: {
      accentBar: { x: 140, y: 280, w: 12, h: 360 },
      title: { x: 200, y: 300, w: 1500, h: 280, role: "h1" },
      footer: { x: 200, y: 640, w: 1200, h: 60, role: "caption" },
    },
  },
  {
    id: "closing-next",
    family: "consulting-meridian",
    description: "Closing recommendation + next steps",
    zones: {
      title: { x: 120, y: 340, w: 1680, h: 140, role: "display" },
      body: { x: 120, y: 520, w: 1600, h: 280, role: "body" },
      footer: { x: 120, y: 960, w: 800, h: 40, role: "caption" },
    },
  },
];

const LAYOUT_TO_RECIPE: Record<string, RecipeId> = {
  title: "cover-hero",
  section: "section-break",
  bullets: "claim-bullets",
  two_column: "two-column-compare",
  chart: "chart-insight",
  table: "table-matrix",
  timeline: "timeline-milestones",
  quote: "quote-focus",
  closing: "closing-next",
};

export function recipeIdFromLayout(layout?: string): RecipeId {
  if (!layout) return "claim-bullets";
  return LAYOUT_TO_RECIPE[layout] ?? "claim-bullets";
}

export function getRecipe(id: RecipeId): LayoutRecipe {
  const r = LAYOUT_RECIPES.find((x) => x.id === id);
  if (!r) return LAYOUT_RECIPES[2]!;
  return r;
}

export function getFamily(id: RecipeFamilyId = "consulting-meridian"): RecipeFamily {
  return RECIPE_FAMILIES[id] ?? RECIPE_FAMILIES["consulting-meridian"];
}

export function sanitizeAccent(hex: string | undefined, family: RecipeFamily): string {
  if (!hex) return family.colors.accent;
  const n = hex.toLowerCase();
  if (family.forbiddenAccents.some((f) => f.toLowerCase() === n)) {
    return family.colors.accent;
  }
  return hex;
}
