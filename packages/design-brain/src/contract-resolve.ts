/**
 * Resolve SlideDesignContract from brief + recipe family (Ultimate Design Request Anchor).
 */

import { getFamily, type RecipeFamilyId } from "./recipes.js";
import type { DensityMode, SlideDesignContract } from "./schema.js";

export type ResolveContractInput = {
  title?: string;
  audience?: string;
  recipeFamily?: string;
  density?: DensityMode;
  theme?: {
    primary?: string;
    accent?: string;
    background?: string;
    ink?: string;
  };
  deckClaim?: string;
};

const FORBIDDEN = [
  "#6366f1",
  "#4f46e5",
  "#4338ca",
  "#8b5cf6",
  "#7c3aed",
  "#a855f7",
];

function sanitizeAccent(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  if (FORBIDDEN.some((f) => f.toLowerCase() === hex.toLowerCase())) return fallback;
  return hex;
}

/**
 * Build an executable design contract for the compose pipeline.
 */
export function resolveDesignContract(input: ResolveContractInput): SlideDesignContract {
  const familyId = (input.recipeFamily as RecipeFamilyId) || "consulting-meridian";
  const family = getFamily(familyId);
  const accent = sanitizeAccent(input.theme?.accent, family.colors.accent);
  const primary = input.theme?.primary || family.colors.primary;
  const background = input.theme?.background || family.colors.background;
  const ink = input.theme?.ink || family.colors.ink;
  const density: DensityMode =
    input.density ||
    (familyId === "data-dense" ? "dense" : familyId === "editorial-ink" ? "airy" : "balanced");

  return {
    version: "1",
    name: family.name,
    deckClaim: input.deckClaim || input.title || "Untitled deck conclusion",
    audience: input.audience || "general business audience",
    canvas: {
      width: 1920,
      height: 1080,
      safeArea: { top: 64, right: 80, bottom: 64, left: 80 },
    },
    themeId: family.id,
    typePersonality:
      familyId === "editorial-ink"
        ? "editorial-display"
        : familyId === "data-dense"
          ? "analytical-compact"
          : "consulting-clear",
    typeScale: {
      display: family.typeScale.display.size,
      h1: family.typeScale.h1.size,
      h2: family.typeScale.h2.size,
      body: family.typeScale.body.size,
      caption: family.typeScale.caption.size,
    },
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
    density,
    visualPrinciples: [
      "one-focus-per-slide",
      "claim-before-decoration",
      "title-only-reading-tells-story",
      "vary-archetype-rhythm",
    ],
    forbiddenPatterns: [
      "default-indigo-accent",
      "emoji-as-icons",
      "invented-metrics",
      "lorem-ipsum",
      "card-wall-without-evidence",
      "shrink-font-to-fit-unlimited",
    ],
    qualityThresholds: {
      minBodyPx: density === "dense" ? 16 : 18,
      maxSameRecipeStreak: 2,
      maxTitleChars: 72,
      safeMarginPx: family.margin,
    },
    colors: {
      background,
      surface: family.colors.surface,
      ink,
      muted: family.colors.muted,
      accent,
      primary,
      chart: accent !== family.colors.accent ? [accent, ...family.colors.chart.slice(1)] : [...family.colors.chart],
    },
  };
}
