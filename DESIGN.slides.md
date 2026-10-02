---
name: Open SlideStudio Generated Decks
surface: presentation
version: 0.2.0
---

# DESIGN.slides.md — generated deck design brain

This contract is the **slide art-direction source of truth** for Open SlideStudio compose.
Product chrome remains in root `DESIGN.md`. This file is consumed by `packages/design-brain` and the LLM outline compiler.

## Request Anchor (default consulting)

- **Audience:** executives / operators who decide in 15–20 minutes  
- **Job:** one clear recommendation path with evidence  
- **Success:** title-only skim tells the story; every slide has claim + evidence  
- **Non-goals:** decorative FX, stock-photo wallpaper, AI indigo gradients, emoji icons  
- **Must preserve:** editable PPTD objects (text/shape/chart/table), 16:9 1920×1080  

## Taste (anti-slop locks)

| Lock | Rule |
|------|------|
| Accent | One accent max; never default indigo `#6366f1` family |
| Cards | No “rounded card + colored left border” AI tile |
| Hierarchy | Exactly **one** visual focus per slide |
| Type | Role-based scale (display/h1/h2/body/caption), not one size for all |
| Density | Live-presentable: short titles (≤10 CJK chars or ≤8 English words), ≤5 bullets |
| Rhythm | Vary recipes across deck — never all bullets |

## Type scale @ 1920×1080

| Role | px | Weight |
|------|-----|--------|
| display | 64–72 | 700 |
| h1 | 40–48 | 700 |
| h2 | 28–32 | 600 |
| body | 22–24 | 400 |
| caption | 16–18 | 400 |

CJK: prefer PingFang SC / Noto Sans SC stack; keep line-height ≥1.35 on body.

## Recipe families (v0)

1. **consulting-meridian** — deep ink covers, white body, one accent rule, data-forward  
2. **editorial-ink** — large type, sparse layout, quote strength  
3. **data-dense** — KPI row + chart + source footer  

## Per-slide rules (Ultimate Design presentation branch)

Every slide must declare:

- **claim** — conclusion title (not “Overview”)  
- **evidence** — bullets / chart / table that prove it  
- **action** — implication or next step (footer or last bullet)  

## Quality gates (compiler / lint)

- Fail if title empty or layout missing  
- Fail soft if >1 equal-weight text columns without grid  
- Fail soft if chart without unit/source note when numbers present  
- Reject indigo accent palette  

## Mapping from open-design (learn, don't import)

- Multi-theme packages → **recipe families**  
- Layout catalog → **recipeId geometry**  
- `craft/anti-ai-slop.md` ideas → **our** locks above (rewrite, not copy skill packs)  
- HTML deck templates → **not** our source of truth; PPTD remains  

## Implementation hooks

- `packages/design-brain` exports `getSlideDesignContract()`, recipes, lint  
- `compileOutlineToDeck` must take contract + recipeId  
- LLM outline v2 requires `recipeFamily`, per-slide `recipeId`, `claim`  
