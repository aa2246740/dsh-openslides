/**
 * Deterministic recipe selector — taste as scoring, not adjectives.
 */

import { getRecipeSpec, listRecipeSpecs, type RecipeSpec } from "./recipe-catalog.js";
import type { RecipeSelection, SlideIntent } from "./schema.js";
import type { RecipeId } from "./recipes.js";

export type SelectRecipeOptions = {
  /** Recipe ids used on previous slides (for rhythm) */
  priorRecipeIds?: string[];
};

function hardReject(spec: RecipeSpec, intent: SlideIntent): string | null {
  const { contentShape: s } = intent;
  if (!spec.supports.includes(intent.role)) {
    return `role ${intent.role} not in supports`;
  }
  if (spec.requires.needsChart && !intent.chart?.categories?.length) {
    return "needs chart data";
  }
  if (spec.requires.needsTable && !intent.table?.headers?.length) {
    return "needs table";
  }
  if (spec.requires.needsTimeline && !s.hasTimeline) {
    return "needs timeline";
  }
  if (spec.requires.needsQuote && !s.hasQuote && !intent.quote) {
    return "needs quote";
  }
  if (spec.requires.needsComparison && !s.hasComparison && !(intent.left?.length || intent.right?.length)) {
    // soft: comparison can still be allowed with enough bullets
    if ((intent.bullets?.length ?? 0) < 4) return "needs comparison columns";
  }
  if (spec.requires.minItems != null && s.itemCount < spec.requires.minItems) {
    if (!spec.capacity.allowsEmptyBody) return `minItems ${spec.requires.minItems}`;
  }
  if (spec.rejects.maxItems != null && s.itemCount > spec.rejects.maxItems) {
    return `too many items (>${spec.rejects.maxItems})`;
  }
  if (spec.rejects.forbidWhenHasChart && intent.chart?.categories?.length) {
    return "forbid chart on this recipe";
  }
  if (spec.rejects.forbidWhenNoEvidence && s.itemCount === 0 && !s.hasData) {
    return "needs evidence";
  }
  return null;
}

function scoreSpec(
  spec: RecipeSpec,
  intent: SlideIntent,
  prior: string[],
): { score: number; reasons: string[] } {
  const reject = hardReject(spec, intent);
  if (reject) return { score: -1, reasons: [`reject: ${reject}`] };

  let score = spec.baseScore;
  const reasons: string[] = [`role-match ${intent.role}`];

  // Evidence / data fit
  if (spec.capacity.prefersData && intent.contentShape.hasData) {
    score += 15;
    reasons.push("data-fit");
  }
  if (spec.id === "two-column-compare" && intent.contentShape.hasComparison) {
    score += 12;
    reasons.push("comparison-fit");
  }
  if (spec.id === "timeline-milestones" && intent.contentShape.hasTimeline) {
    score += 12;
    reasons.push("timeline-fit");
  }
  if (spec.id === "quote-focus" && intent.contentShape.hasQuote) {
    score += 12;
    reasons.push("quote-fit");
  }

  // Density / capacity comfort
  const items = intent.contentShape.itemCount;
  if (items >= spec.capacity.minItems && items <= spec.capacity.maxItems) {
    score += 8;
    reasons.push("capacity-ok");
  } else if (items > spec.capacity.maxItems) {
    score -= 20;
    reasons.push("over-capacity");
  }

  // Focus strength: short claim titles score higher for sparse recipes
  const titleLen = (intent.claim || intent.title).length;
  if (titleLen <= 40 && (spec.id === "cover-hero" || spec.id === "section-break" || spec.id === "quote-focus")) {
    score += 5;
    reasons.push("tight-claim");
  }

  // Rhythm: penalize consecutive same recipe
  const last = prior[prior.length - 1];
  if (last === spec.id) {
    score -= 35;
    reasons.push("repeat-penalty");
  }
  const streak = countTrailing(prior, spec.id);
  if (streak >= 1) {
    score -= streak * 10;
    reasons.push(`streak-${streak + 1}`);
  }

  // Soft hint boost (never sole decision unless locked)
  if (intent.recipeHint === spec.id) {
    score += 18;
    reasons.push("hint-boost");
  }

  // Prefer non-bullets when content is richer
  if (spec.id === "claim-bullets" && intent.contentShape.hasData) {
    score -= 25;
    reasons.push("bullets-weak-for-data");
  }

  return { score, reasons };
}

function countTrailing(prior: string[], id: string): number {
  let n = 0;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i] === id) n++;
    else break;
  }
  return n;
}

/**
 * Select best recipe for intent. Honors recipeLocked + valid hint.
 */
export function selectRecipe(
  intent: SlideIntent,
  opts: SelectRecipeOptions = {},
): RecipeSelection {
  const prior = opts.priorRecipeIds ?? [];

  if (intent.recipeLocked && intent.recipeHint) {
    const locked = getRecipeSpec(intent.recipeHint);
    if (locked) {
      return {
        recipeId: locked.id,
        score: 999,
        rationale: ["locked-by-author", intent.recipeHint],
        usedHint: true,
        locked: true,
      };
    }
  }

  const catalog = listRecipeSpecs();
  let best: { spec: RecipeSpec; score: number; reasons: string[] } | null = null;

  for (const spec of catalog) {
    const { score, reasons } = scoreSpec(spec, intent, prior);
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { spec, score, reasons };
    }
  }

  if (!best) {
    // Absolute fallback
    const fb = getRecipeSpec("claim-bullets") ?? catalog[0]!;
    return {
      recipeId: fb.id,
      score: 0,
      rationale: ["fallback-claim-bullets", "no-candidate-passed-hard-filters"],
      usedHint: false,
      locked: false,
    };
  }

  // Try fallbacks if score is weak
  if (best.score < 40) {
    for (const fid of best.spec.fallbackRecipeIds) {
      const fb = getRecipeSpec(fid);
      if (!fb) continue;
      const { score, reasons } = scoreSpec(fb, intent, prior);
      if (score > best.score) {
        best = { spec: fb, score, reasons: [...reasons, `fallback-from-${best.spec.id}`] };
      }
    }
  }

  return {
    recipeId: best.spec.id as RecipeId,
    score: best.score,
    rationale: best.reasons,
    usedHint: intent.recipeHint === best.spec.id,
    locked: false,
  };
}
