/**
 * Vertical compose pipeline: intent → select → compose → lint.
 * This is the design brain entry used by agent-core.
 */

import { composeSlide } from "./compose.js";
import { resolveDesignContract, type ResolveContractInput } from "./contract-resolve.js";
import { deriveSlideIntent, type IntentInput } from "./intent.js";
import { formatQualityReport, lintCompositionPlans } from "./lint.js";
import { selectRecipe } from "./select-recipe.js";
import type {
  CompositionPlan,
  QualityReport,
  SlideDesignContract,
  SlideIntent,
} from "./schema.js";

export type PipelineSlideInput = IntentInput;

export type ComposeDeckResult = {
  contract: SlideDesignContract;
  intents: SlideIntent[];
  plans: CompositionPlan[];
  quality: QualityReport;
  qualitySummary: string;
};

/**
 * Run full design-brain compose for a deck outline (content only).
 */
export function composeDeckPlans(
  slides: PipelineSlideInput[],
  contractInput: ResolveContractInput = {},
): ComposeDeckResult {
  const contract = resolveDesignContract({
    ...contractInput,
    title: contractInput.title || slides[0]?.title,
  });

  const intents: SlideIntent[] = [];
  const plans: CompositionPlan[] = [];
  const priorRecipeIds: string[] = [];

  slides.forEach((raw, index) => {
    const intent = deriveSlideIntent({
      ...raw,
      index,
      slideCount: slides.length,
    });
    intents.push(intent);

    const selection = selectRecipe(intent, { priorRecipeIds });
    const plan = composeSlide(intent, contract, selection);
    plans.push(plan);
    priorRecipeIds.push(plan.recipeId);
  });

  const quality = lintCompositionPlans(
    plans.map((plan, i) => ({
      plan,
      bodyFontPx: contract.typeScale.body,
      titleText: intents[i]?.claim || intents[i]?.title,
    })),
    contract,
  );

  return {
    contract,
    intents,
    plans,
    quality,
    qualitySummary: formatQualityReport(quality),
  };
}
