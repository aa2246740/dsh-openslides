import { z } from "zod";
import type { ThemeTokens, TypeScale } from "./theme-tokens.js";
import {
  mergeThemeTokens,
  type PartialThemeTokens,
} from "./theme-tokens.js";

/** Layout archetypes the composer may pick when building slides */
export type LayoutArchetypeId =
  | "title"
  | "section"
  | "agenda"
  | "two-column"
  | "three-column"
  | "kpi-row"
  | "chart-focus"
  | "table-focus"
  | "timeline"
  | "process"
  | "matrix"
  | "comparison"
  | "quote"
  | "closing"
  | "full-bleed-image"
  | "smartart";

export type LayoutZone = {
  /** Semantic role: title, body, evidence, chart, caption, kpis, … */
  role: string;
  /** Normalized geometry on the slide, origin top-left, 0–1 */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutArchetype = {
  id: LayoutArchetypeId;
  name: string;
  description: string;
  zones: LayoutZone[];
  preferredElements: string[];
};

export type AntiSlopSeverity = "must" | "should" | "avoid";

export type AntiSlopRule = {
  id: string;
  severity: AntiSlopSeverity;
  rule: string;
};

export type DesignDensity = "sparse" | "balanced" | "dense";
export type DesignMotion = "quiet" | "none";

/**
 * Explicit design contract consumed by compose tools and LLM prompts.
 * Taste lives here — not in free-form model prose.
 */
export type DesignContract = {
  version: string;
  name: string;
  intent: string;
  audience: string;
  /** PPTD-compatible theme tokens */
  tokens: ThemeTokens;
  /** Optional type scale (px @ 1920×1080) for prompt assembly */
  typeScale?: TypeScale;
  /** Outer slide margin in px at 1920×1080 reference */
  slideMargin?: number;
  /** Default inter-element gap in px */
  gap?: number;
  layoutArchetypes: LayoutArchetype[];
  antiSlopRules: AntiSlopRule[];
  density: DesignDensity;
  motion: DesignMotion;
  /** Free-form brand / client notes for the model */
  brandNotes?: string;
};

const colorString = z.string().min(1);

const themeTokensSchema = z.object({
  name: z.string().min(1),
  colors: z.object({
    background: colorString,
    surface: colorString,
    ink: colorString,
    muted: colorString,
    accent: colorString,
    primary: colorString,
    secondary: colorString,
    success: colorString.optional(),
    danger: colorString.optional(),
    warning: colorString.optional(),
    border: colorString.optional(),
    chart: z.array(colorString).min(1),
  }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    mono: z.string().optional(),
  }),
  radii: z
    .object({
      sm: z.number().nonnegative(),
      md: z.number().nonnegative(),
      lg: z.number().nonnegative(),
    })
    .optional(),
  spacing: z.number().positive().optional(),
});

const typeScaleSchema = z.object({
  display: z.number().positive(),
  h1: z.number().positive(),
  h2: z.number().positive(),
  h3: z.number().positive(),
  body: z.number().positive(),
  caption: z.number().positive(),
  footnote: z.number().positive(),
});

const layoutZoneSchema = z.object({
  role: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const layoutArchetypeSchema = z.object({
  id: z.enum([
    "title",
    "section",
    "agenda",
    "two-column",
    "three-column",
    "kpi-row",
    "chart-focus",
    "table-focus",
    "timeline",
    "process",
    "matrix",
    "comparison",
    "quote",
    "closing",
    "full-bleed-image",
    "smartart",
  ]),
  name: z.string().min(1),
  description: z.string(),
  zones: z.array(layoutZoneSchema).min(1),
  preferredElements: z.array(z.string()),
});

const antiSlopRuleSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["must", "should", "avoid"]),
  rule: z.string().min(1),
});

export const designContractSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  intent: z.string().min(1),
  audience: z.string().min(1),
  tokens: themeTokensSchema,
  typeScale: typeScaleSchema.optional(),
  slideMargin: z.number().nonnegative().optional(),
  gap: z.number().nonnegative().optional(),
  layoutArchetypes: z.array(layoutArchetypeSchema).min(1),
  antiSlopRules: z.array(antiSlopRuleSchema),
  density: z.enum(["sparse", "balanced", "dense"]),
  motion: z.enum(["quiet", "none"]),
  brandNotes: z.string().optional(),
});

export type DesignContractInput = z.input<typeof designContractSchema>;

/** Parse & validate unknown input into a DesignContract. Throws ZodError. */
export function parseDesignContract(input: unknown): DesignContract {
  return designContractSchema.parse(input) as DesignContract;
}

/** Safe parse — returns success flag instead of throwing. */
export function safeParseDesignContract(
  input: unknown,
):
  | { success: true; data: DesignContract }
  | { success: false; error: z.ZodError } {
  const result = designContractSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as DesignContract };
  }
  return { success: false, error: result.error };
}

/** Build a contract by overlaying partial token / metadata on a base. */
export function withContractOverrides(
  base: DesignContract,
  overrides: {
    name?: string;
    intent?: string;
    audience?: string;
    density?: DesignDensity;
    motion?: DesignMotion;
    brandNotes?: string;
    tokens?: PartialThemeTokens;
    typeScale?: TypeScale;
    slideMargin?: number;
    gap?: number;
    layoutArchetypes?: LayoutArchetype[];
    antiSlopRules?: AntiSlopRule[];
  },
): DesignContract {
  return {
    ...base,
    name: overrides.name ?? base.name,
    intent: overrides.intent ?? base.intent,
    audience: overrides.audience ?? base.audience,
    density: overrides.density ?? base.density,
    motion: overrides.motion ?? base.motion,
    brandNotes: overrides.brandNotes ?? base.brandNotes,
    tokens: overrides.tokens
      ? mergeThemeTokens(base.tokens, overrides.tokens)
      : base.tokens,
    typeScale: overrides.typeScale ?? base.typeScale,
    slideMargin: overrides.slideMargin ?? base.slideMargin,
    gap: overrides.gap ?? base.gap,
    layoutArchetypes: overrides.layoutArchetypes ?? base.layoutArchetypes,
    antiSlopRules: overrides.antiSlopRules ?? base.antiSlopRules,
  };
}

/** Extract PPTD-compatible ThemeTokens plain object from a contract. */
export function contractToThemeTokens(contract: DesignContract): ThemeTokens {
  return {
    name: contract.tokens.name,
    colors: { ...contract.tokens.colors, chart: [...contract.tokens.colors.chart] },
    fonts: { ...contract.tokens.fonts },
    radii: contract.tokens.radii ? { ...contract.tokens.radii } : undefined,
    spacing: contract.tokens.spacing,
  };
}
