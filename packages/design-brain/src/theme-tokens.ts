/**
 * Theme token shape mirrored from @open-slidestudio/pptd.
 * Intentionally does NOT import pptd (avoids package cycles).
 * Keep fields compatible with Deck.theme consumers.
 */

/** Mirrors pptd ThemeColors */
export type ThemeColors = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  primary: string;
  secondary: string;
  success?: string;
  danger?: string;
  warning?: string;
  border?: string;
  /** Ordered palette for chart series */
  chart: string[];
};

/** Mirrors pptd ThemeFonts */
export type ThemeFonts = {
  heading: string;
  body: string;
  mono?: string;
};

/** Mirrors pptd ThemeRadii */
export type ThemeRadii = {
  sm: number;
  md: number;
  lg: number;
};

/**
 * Plain ThemeTokens object suitable for deck.theme / exporters.
 * Shape mirrors packages/pptd ThemeTokens.
 */
export type ThemeTokens = {
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  radii?: ThemeRadii;
  /** Base spacing unit in px */
  spacing?: number;
};

/** Extended type scale used only inside design contracts / prompts */
export type TypeScale = {
  display: number;
  h1: number;
  h2: number;
  h3: number;
  body: number;
  caption: number;
  footnote: number;
};

export type PartialThemeTokens = {
  name?: string;
  colors?: Partial<Omit<ThemeColors, "chart">> & { chart?: string[] };
  fonts?: Partial<ThemeFonts>;
  radii?: Partial<ThemeRadii>;
  spacing?: number;
};

/** Serialize tokens to a JSON-safe plain object (structured clone). */
export function themeTokensToPlain(tokens: ThemeTokens): ThemeTokens {
  return structuredClone(tokens);
}

/** Merge partial tokens onto a base theme (base wins for missing fields). */
export function mergeThemeTokens(
  base: ThemeTokens,
  partial: PartialThemeTokens,
): ThemeTokens {
  return {
    name: partial.name ?? base.name,
    colors: {
      ...base.colors,
      ...partial.colors,
      chart: partial.colors?.chart ?? base.colors.chart,
    },
    fonts: {
      ...base.fonts,
      ...partial.fonts,
    },
    radii:
      base.radii || partial.radii
        ? {
            sm: partial.radii?.sm ?? base.radii?.sm ?? 8,
            md: partial.radii?.md ?? base.radii?.md ?? 12,
            lg: partial.radii?.lg ?? base.radii?.lg ?? 18,
          }
        : undefined,
    spacing: partial.spacing ?? base.spacing,
  };
}

/**
 * Map a ThemeTokens-like object into a minimal plain ThemeTokens clone
 * suitable for assigning to deck.theme (no extra design-brain fields).
 */
export function toThemeTokens(input: ThemeTokens): ThemeTokens {
  return themeTokensToPlain({
    name: input.name,
    colors: {
      background: input.colors.background,
      surface: input.colors.surface,
      ink: input.colors.ink,
      muted: input.colors.muted,
      accent: input.colors.accent,
      primary: input.colors.primary,
      secondary: input.colors.secondary,
      success: input.colors.success,
      danger: input.colors.danger,
      warning: input.colors.warning,
      border: input.colors.border,
      chart: [...input.colors.chart],
    },
    fonts: {
      heading: input.fonts.heading,
      body: input.fonts.body,
      mono: input.fonts.mono,
    },
    radii: input.radii
      ? { sm: input.radii.sm, md: input.radii.md, lg: input.radii.lg }
      : undefined,
    spacing: input.spacing,
  });
}
