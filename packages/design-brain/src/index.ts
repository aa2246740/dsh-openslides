/**
 * @open-slidestudio/design-brain
 *
 * Contract-driven design system for multi-model slide composition.
 * Holds DesignContract (tokens, layout archetypes, anti-slop), assembles
 * vendor-neutral design prompts, and extracts themes from free-text hints.
 *
 * Does not depend on @open-slidestudio/pptd (ThemeTokens shape is mirrored).
 */

// Theme tokens (mirrored plain objects — compatible with pptd Deck.theme)
export type {
  ThemeColors,
  ThemeFonts,
  ThemeRadii,
  ThemeTokens,
  TypeScale,
  PartialThemeTokens,
} from "./theme-tokens.js";
export {
  themeTokensToPlain,
  mergeThemeTokens,
  toThemeTokens,
} from "./theme-tokens.js";

// Design contract
export type {
  LayoutArchetypeId,
  LayoutZone,
  LayoutArchetype,
  AntiSlopSeverity,
  AntiSlopRule,
  DesignDensity,
  DesignMotion,
  DesignContract,
  DesignContractInput,
} from "./contract.js";
export {
  designContractSchema,
  parseDesignContract,
  safeParseDesignContract,
  withContractOverrides,
  contractToThemeTokens,
} from "./contract.js";

// Defaults
export {
  defaultConsultingTheme,
  defaultConsultingContract,
  defaultLayoutArchetypes,
  defaultAntiSlopRules,
  defaultTypeScale,
} from "./defaults.js";

// Heuristic extraction
export type { ThemeHintExtraction } from "./extract.js";
export { extractThemeFromHints, contractFromHints } from "./extract.js";

// Prompt assembly
export {
  assembleDesignSystemPrompt,
  formatThemeTokensSummary,
} from "./prompt.js";

// Slide recipes (Ultimate Design → PPTD geometry)
export type {
  RecipeFamilyId,
  RecipeId,
  RecipeFamily,
  LayoutRecipe,
  TypeRole,
} from "./recipes.js";
export {
  RECIPE_FAMILIES,
  LAYOUT_RECIPES,
  recipeIdFromLayout,
  getRecipe,
  getFamily,
  sanitizeAccent,
} from "./recipes.js";

// Compose brain (Ultimate Design runtime for slides)
export type {
  SlideRole,
  Emphasis,
  DensityMode,
  TypeScalePx,
  Insets,
  QualityThresholds,
  SlideDesignContract,
  ContentShape,
  SlideIntent,
  OverflowPolicy,
  ComposedElementKind,
  ComposedElement,
  CompositionPlan,
  QualityIssue,
  QualityReport,
  RecipeSelection,
} from "./schema.js";
export type { RecipeSpec, RecipeCapacity } from "./recipe-catalog.js";
export {
  RECIPE_CATALOG,
  getRecipeSpec,
  listRecipeSpecs,
  familyColors,
} from "./recipe-catalog.js";
export { deriveSlideIntent } from "./intent.js";
export type { IntentInput } from "./intent.js";
export { selectRecipe } from "./select-recipe.js";
export type { SelectRecipeOptions } from "./select-recipe.js";
export { composeSlide } from "./compose.js";
export { lintCompositionPlans, formatQualityReport } from "./lint.js";
export type { LintableSlide } from "./lint.js";
export { resolveDesignContract } from "./contract-resolve.js";
export type { ResolveContractInput } from "./contract-resolve.js";
export { composeDeckPlans } from "./pipeline.js";
export type { PipelineSlideInput, ComposeDeckResult } from "./pipeline.js";
