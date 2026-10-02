/**
 * Declarative recipe catalog — capability + constraints, not only fixed boxes.
 * Geometry zones remain the starting composition scaffold; selector uses supports/rejects.
 */

import {
  LAYOUT_RECIPES,
  RECIPE_FAMILIES,
  type LayoutRecipe,
  type RecipeFamilyId,
  type RecipeId,
} from "./recipes.js";
import type { SlideRole } from "./schema.js";

export type RecipeCapacity = {
  minItems: number;
  maxItems: number;
  maxTitleLines: number;
  prefersData: boolean;
  allowsEmptyBody: boolean;
};

export type RecipeSpec = {
  id: RecipeId;
  family: RecipeFamilyId;
  description: string;
  supports: SlideRole[];
  requires: {
    minItems?: number;
    needsChart?: boolean;
    needsTable?: boolean;
    needsTimeline?: boolean;
    needsQuote?: boolean;
    needsComparison?: boolean;
  };
  rejects: {
    maxItems?: number;
    forbidWhenNoEvidence?: boolean;
    forbidWhenHasChart?: boolean;
  };
  capacity: RecipeCapacity;
  zones: LayoutRecipe["zones"];
  fallbackRecipeIds: RecipeId[];
  /** Base preference score when role matches */
  baseScore: number;
};

const byId = (id: RecipeId): LayoutRecipe => {
  const r = LAYOUT_RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`Missing layout recipe ${id}`);
  return r;
};

function spec(
  id: RecipeId,
  partial: Omit<RecipeSpec, "id" | "family" | "zones" | "description"> & {
    description?: string;
  },
): RecipeSpec {
  const layout = byId(id);
  return {
    id,
    family: layout.family,
    description: partial.description ?? layout.description,
    supports: partial.supports,
    requires: partial.requires,
    rejects: partial.rejects,
    capacity: partial.capacity,
    zones: layout.zones,
    fallbackRecipeIds: partial.fallbackRecipeIds,
    baseScore: partial.baseScore,
  };
}

/** Full declarative catalog (9 recipes). */
export const RECIPE_CATALOG: RecipeSpec[] = [
  spec("cover-hero", {
    supports: ["cover"],
    requires: {},
    rejects: { maxItems: 4, forbidWhenHasChart: true },
    capacity: {
      minItems: 0,
      maxItems: 2,
      maxTitleLines: 3,
      prefersData: false,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["section-break"],
    baseScore: 100,
  }),
  spec("section-break", {
    supports: ["section"],
    requires: {},
    rejects: { maxItems: 3, forbidWhenHasChart: true },
    capacity: {
      minItems: 0,
      maxItems: 2,
      maxTitleLines: 2,
      prefersData: false,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["claim-bullets"],
    baseScore: 95,
  }),
  spec("claim-bullets", {
    supports: ["thesis", "evidence", "decision"],
    requires: { minItems: 1 },
    rejects: { maxItems: 6 },
    capacity: {
      minItems: 1,
      maxItems: 5,
      maxTitleLines: 2,
      prefersData: false,
      allowsEmptyBody: false,
    },
    fallbackRecipeIds: ["two-column-compare", "section-break"],
    baseScore: 80,
  }),
  spec("two-column-compare", {
    supports: ["comparison", "evidence", "thesis"],
    requires: { needsComparison: true, minItems: 2 },
    rejects: { maxItems: 10 },
    capacity: {
      minItems: 2,
      maxItems: 8,
      maxTitleLines: 2,
      prefersData: false,
      allowsEmptyBody: false,
    },
    fallbackRecipeIds: ["claim-bullets"],
    baseScore: 85,
  }),
  spec("chart-insight", {
    supports: ["data", "evidence"],
    requires: { needsChart: true },
    rejects: {},
    capacity: {
      minItems: 0,
      maxItems: 2,
      maxTitleLines: 2,
      prefersData: true,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["table-matrix", "claim-bullets"],
    baseScore: 90,
  }),
  spec("table-matrix", {
    supports: ["data", "evidence", "comparison"],
    requires: { needsTable: true },
    rejects: {},
    capacity: {
      minItems: 0,
      maxItems: 2,
      maxTitleLines: 2,
      prefersData: true,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["chart-insight", "claim-bullets"],
    baseScore: 88,
  }),
  spec("timeline-milestones", {
    supports: ["process", "evidence"],
    requires: { needsTimeline: true, minItems: 2 },
    rejects: {},
    capacity: {
      minItems: 2,
      maxItems: 6,
      maxTitleLines: 2,
      prefersData: false,
      allowsEmptyBody: false,
    },
    fallbackRecipeIds: ["claim-bullets"],
    baseScore: 87,
  }),
  spec("quote-focus", {
    supports: ["quote"],
    requires: { needsQuote: true },
    rejects: { forbidWhenHasChart: true },
    capacity: {
      minItems: 0,
      maxItems: 1,
      maxTitleLines: 4,
      prefersData: false,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["claim-bullets"],
    baseScore: 92,
  }),
  spec("closing-next", {
    supports: ["closing", "decision"],
    requires: {},
    rejects: { forbidWhenHasChart: true },
    capacity: {
      minItems: 0,
      maxItems: 5,
      maxTitleLines: 2,
      prefersData: false,
      allowsEmptyBody: true,
    },
    fallbackRecipeIds: ["claim-bullets"],
    baseScore: 96,
  }),
];

export function getRecipeSpec(id: string): RecipeSpec | undefined {
  return RECIPE_CATALOG.find((r) => r.id === id);
}

export function listRecipeSpecs(): RecipeSpec[] {
  return RECIPE_CATALOG.slice();
}

export function familyColors(familyId: RecipeFamilyId = "consulting-meridian") {
  return RECIPE_FAMILIES[familyId] ?? RECIPE_FAMILIES["consulting-meridian"];
}
