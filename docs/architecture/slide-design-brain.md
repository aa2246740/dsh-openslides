# Slide Design Brain — Ultimate Design as compose engine

**Status:** vertical slice shipped (compose path live)  
**Non-goal:** adopt nexu-io/open-design skills or their prompt packs (user: AI-slop risk).  
**Do adopt:** their *architecture ideas* only — `DESIGN.md` brand contract, multi-recipe layout catalog, anti-slop lint, claim/evidence/action where roles need it.

## Advisor consensus (Amend)

Fixed template boxes + LLM picking `layout`/`recipeId` is **not** a design brain. Keep scaffolding (recipes, DESIGN.slides.md), insert a real decision layer:

```
Brief
  → SlideDesignContract          (resolveDesignContract)
  → SlideIntent[]                (deriveSlideIntent)
  → RecipeSelection              (selectRecipe — scoring, not freeform)
  → CompositionPlan[]            (composeSlide)
  → PPTD compile                 (compileOutlineToDeckDetailed)
  → QualityReport                (lintCompositionPlans)
```

- **LLM** owns narrative content + soft hints (`role`, `focus`, `claim`, optional `recipeHint`).
- **Design brain** owns recipe selection, geometry, type scale, lint.
- **PPTD** remains the only editable deck IR (not HTML-as-truth).

## What we steal from open-design (architecture only)

| Pattern | Our mapping |
|---------|-------------|
| Brand contract before render | `resolveDesignContract` + `DESIGN.slides.md` |
| Theme ≠ layout | family tokens vs recipe catalog |
| Catalog with capabilities | `RecipeSpec.supports/requires/rejects/capacity` |
| Brief → direction → artifact → critique | pipeline stages + quality report in agent step |
| 1920 canvas + one focus | contract canvas + lint `missing-focus` |
| Checkable anti-slop | indigo ban, generic titles, recipe streak, empty cards |

**Rejected:** skill packs, HTML-as-truth, decorative FX defaults, freeform CSS from the model.

## Ultimate Design binding

| Ultimate Design | Runtime |
|-----------------|---------|
| Request Anchor | `SlideDesignContract.deckClaim/audience/density` |
| Content contract | `SlideIntent.role/focus/claim/evidence/action` |
| Taste Engine | `selectRecipe` score (rhythm, capacity, data-fit, repeat penalty) |
| Type personality | contract `typeScale` + family |
| Quality gates | `lintCompositionPlans` |
| branch-presentation | claim/evidence/action for thesis roles; cover/section/data different contracts |

## Core modules (`packages/design-brain`)

| File | Responsibility |
|------|----------------|
| `schema.ts` | SlideDesignContract, SlideIntent, CompositionPlan, QualityReport |
| `recipe-catalog.ts` | Declarative RecipeSpec catalog |
| `intent.ts` | deriveSlideIntent |
| `select-recipe.ts` | Deterministic selector + locked hint |
| `compose.ts` | CompositionPlan from zones + intent |
| `lint.ts` | Post-compose checkable rules |
| `contract-resolve.ts` | Brief → contract |
| `pipeline.ts` | `composeDeckPlans` entry |
| `recipes.ts` | Geometry + family tokens (scaffold) |

## Outline v2 (content-first)

- `role`, `focus`, `claim` preferred
- `recipeHint` soft; `recipeLocked` rare
- `recipeId` accepted as alias of hint (deprecated)
- Compiler path: `composeDeckPlans` → plan → PPTD elements

## Claims we still do **not** make

- “Consulting-quality” / McKinsey-grade until golden decks + repair loop pass
- Unlimited font shrink as overflow strategy (policy is shrink-once / fail later)

## Next (ordered)

1. Bounded repair (switch fallback recipe / shorten copy)
2. Text measure for overflow (not char estimates only)
3. Golden 6–10 page fixture + screenshots
4. Expand catalog only after vertical quality holds
