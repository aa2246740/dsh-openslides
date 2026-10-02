/**
 * Compose intermediate types — Ultimate Design as slide design brain.
 * LLM emits intent/content; selector+composer decide geometry; PPTD is IR.
 */

export type SlideRole =
  | "cover"
  | "section"
  | "thesis"
  | "evidence"
  | "comparison"
  | "process"
  | "data"
  | "quote"
  | "decision"
  | "closing";

export type Emphasis = "statement" | "visual" | "data" | "balanced";

export type DensityMode = "airy" | "balanced" | "dense";

export type TypeScalePx = {
  display: number;
  h1: number;
  h2: number;
  body: number;
  caption: number;
};

export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type QualityThresholds = {
  /** Minimum body font size before lint fails (px @ 1920) */
  minBodyPx: number;
  /** Max consecutive slides with same recipe */
  maxSameRecipeStreak: number;
  /** Title soft max characters (CJK ~ half visual width; use loosely) */
  maxTitleChars: number;
  /** Safe margin from slide edge */
  safeMarginPx: number;
};

/** Deck-level design contract resolved before compose (Ultimate Design Request Anchor + tokens). */
export type SlideDesignContract = {
  version: "1";
  name: string;
  /** One-sentence deck conclusion */
  deckClaim: string;
  audience: string;
  canvas: { width: 1920; height: 1080; safeArea: Insets };
  themeId: string;
  typePersonality: string;
  typeScale: TypeScalePx;
  spacingScale: number[];
  density: DensityMode;
  visualPrinciples: string[];
  forbiddenPatterns: string[];
  qualityThresholds: QualityThresholds;
  colors: {
    background: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
    primary: string;
    chart: string[];
  };
};

export type ContentShape = {
  textLength: number;
  itemCount: number;
  hasData: boolean;
  hasImage: boolean;
  hasTimeline: boolean;
  hasComparison: boolean;
  hasQuote: boolean;
};

/** Per-slide narrative intent — LLM fills content; role/focus drive recipe selection. */
export type SlideIntent = {
  role: SlideRole;
  /** One thing the audience should remember from this slide */
  focus: string;
  claim?: string;
  evidence?: string[];
  action?: string;
  contentShape: ContentShape;
  emphasis: Emphasis;
  /** Soft hint from LLM or author — not binding unless recipeLocked */
  recipeHint?: string;
  recipeLocked?: boolean;
  title: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  quote?: string;
  attribution?: string;
  timeline?: Array<{ label: string; detail: string }>;
  chart?: {
    type?: string;
    title?: string;
    categories: string[];
    series: Array<{ name: string; values: number[]; color?: string }>;
  };
  table?: { headers: string[]; rows: string[][] };
  notes?: string;
};

export type OverflowPolicy = "truncate" | "shrink-once" | "split" | "fail";

export type ComposedElementKind =
  | "bg"
  | "accent-bar"
  | "title"
  | "subtitle"
  | "body"
  | "footer"
  | "card"
  | "chart"
  | "table"
  | "marker"
  | "quote";

export type ComposedElement = {
  id: string;
  kind: ComposedElementKind;
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Type role for text */
  typeRole?: keyof TypeScalePx;
  fill?: string;
  shape?: "rect" | "roundRect" | "ellipse";
  text?: string | string[];
  bullet?: boolean;
  chart?: SlideIntent["chart"];
  table?: SlideIntent["table"];
};

export type CompositionPlan = {
  recipeId: string;
  recipeFamily: string;
  hierarchy: string[];
  elements: ComposedElement[];
  readingOrder: string[];
  overflowPolicy: OverflowPolicy;
  rationale: string[];
  focus: string;
  role: SlideRole;
};

export type QualityIssue = {
  code: string;
  severity: "error" | "warning";
  slideIndex?: number;
  message: string;
  repairable: boolean;
};

export type QualityReport = {
  score: number;
  errors: QualityIssue[];
  warnings: QualityIssue[];
  repairable: boolean;
};

export type RecipeSelection = {
  recipeId: string;
  score: number;
  rationale: string[];
  usedHint: boolean;
  locked: boolean;
};
