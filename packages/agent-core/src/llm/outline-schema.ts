/**
 * Compact outline schema for LLM generation.
 * Models produce content + soft design hints; design-brain selects recipes & geometry.
 */

export type OutlineChart = {
  type?: "bar" | "column" | "line" | "area" | "pie" | "doughnut";
  title?: string;
  categories: string[];
  series: Array<{ name: string; values: number[]; color?: string }>;
};

export type OutlineTable = {
  headers: string[];
  rows: string[][];
};

export type OutlineSlide = {
  /** Legacy layout enum — used only as a soft role hint */
  layout?:
    | "title"
    | "section"
    | "bullets"
    | "two_column"
    | "chart"
    | "table"
    | "timeline"
    | "quote"
    | "closing";
  /**
   * Soft recipe hint (NOT binding). Design-brain selects the real recipe
   * unless recipeLocked is true.
   */
  recipeHint?: string;
  /** @deprecated prefer recipeHint — still accepted as soft hint */
  recipeId?: string;
  /** When true, force recipeHint/recipeId */
  recipeLocked?: boolean;
  /** Narrative role: cover|section|thesis|evidence|comparison|process|data|quote|decision|closing */
  role?: string;
  /** One audience takeaway for this slide */
  focus?: string;
  /** Conclusion title / claim (prefer over generic titles) */
  claim?: string;
  evidence?: string;
  action?: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  quote?: string;
  attribution?: string;
  timeline?: Array<{ label: string; detail: string }>;
  chart?: OutlineChart;
  table?: OutlineTable;
  notes?: string;
};

export type DeckOutline = {
  title: string;
  audience?: string;
  /** consulting-meridian | editorial-ink | data-dense */
  recipeFamily?: string;
  theme?: {
    primary?: string;
    accent?: string;
    background?: string;
    ink?: string;
  };
  slides: OutlineSlide[];
};

export const OUTLINE_SYSTEM_PROMPT = `You are the content composer for Open SlideStudio.
You produce structured CONTENT and narrative INTENT for a design-brain compiler.
You do NOT choose final pixel geometry — the design brain selects recipes and layout.
Return ONLY valid JSON (no markdown) matching this schema:

{
  "title": string,
  "audience": string,
  "recipeFamily": "consulting-meridian"|"editorial-ink"|"data-dense",
  "theme": { "primary"?: "#hex", "accent"?: "#hex", "background"?: "#hex", "ink"?: "#hex" },
  "slides": [
    {
      "role": "cover"|"section"|"thesis"|"evidence"|"comparison"|"process"|"data"|"quote"|"decision"|"closing",
      "focus": string,
      "claim": string,
      "evidence"?: string,
      "action"?: string,
      "recipeHint"?: "cover-hero"|"section-break"|"claim-bullets"|"two-column-compare"|"chart-insight"|"table-matrix"|"timeline-milestones"|"quote-focus"|"closing-next",
      "layout"?: "title"|"section"|"bullets"|"two_column"|"chart"|"table"|"timeline"|"quote"|"closing",
      "title": string,
      "subtitle"?: string,
      "bullets"?: string[],
      "left"?: string[],
      "right"?: string[],
      "quote"?: string,
      "attribution"?: string,
      "timeline"?: [{ "label": string, "detail": string }],
      "chart"?: {
        "type": "column"|"bar"|"line"|"area"|"pie"|"doughnut",
        "title"?: string,
        "categories": string[],
        "series": [{ "name": string, "values": number[] }]
      },
      "table"?: { "headers": string[], "rows": string[][] },
      "notes"?: string
    }
  ]
}

Hard rules (Ultimate Design / anti-slop content contract):
- title and claim MUST be conclusions the audience should remember — never "Overview" / "Introduction" / "Agenda".
- Every slide needs role + focus. claim is required for thesis/evidence/decision slides.
- ONE idea per slide. Vary roles across the deck (not all thesis).
- First slide: role=cover. Last: role=closing when deck has 3+ slides.
- Include ≥1 data slide (chart or table) and ≥1 process/timeline OR comparison when the brief has numbers or steps.
- Prefer short titles. Bullets ≤12 words (or ≤18 CJK chars), max 5.
- recipeHint is optional soft preference only — do not invent custom recipe names.
- NEVER use indigo/purple AI accent (#6366f1, #8b5cf6, etc.). Accent must be intentional.
- No emoji icons. No lorem. No invented "10×" metrics without a note.
- Charts: 3–6 categories, 1–3 series, realistic numbers + units in claim/title when possible.
- Output language: match the user prompt (Chinese or English).
- Never mention being an AI. Never use KIMI branding.
`;
