# Generated decks × official iframe A/B

**Date:** 2026-08-15  
**Question:** Can we generate several direction decks, then feed the **same PPTD** into the official neo-ppt iframe?  
**Answer:** **Yes.** Official iframe is a renderer. Parent Penpal `setPPTD` + `getImages` is enough. All four generated decks connected (`官方已连接 · <title>`) and painted.

Not production. Production remains `kimiRuntime: false`.

## Method

1. `node scripts/native-generate.mjs` (playbook brain, `--no-export`) → YAML PPTD v2  
2. Copy into `docs/editor-oracle/runs/iframe-compare/generated/`  
3. `npm run oracle:compare` → `http://127.0.0.1:55180/?project=ab-consulting`  
4. `npm run oracle:compare:ab` captures official iframe (composited in the parent stage) + native stage  

Host never ships. Official child is `https://www.kimi.com/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local`.

## Decks

| Id | Title | Design / category | Primary | Cover | Evidence |
|----|-------|-------------------|---------|-------|----------|
| `ab-consulting` | 华北区域渠道增长复盘 | `consulting/pine-green-strategy` · `analysis-decision` | `#04512C` | `ab-consulting-p1-full.png` | `ab-consulting-p4-full.png` |
| `ab-academic` | Transformer 注意力机制导论 | `academic/deep-blue-atlas` · `academic-research` | `#203D74` | `ab-academic-p1-full.png` | `ab-academic-p4-full.png` |
| `ab-promo` | 夏季限定系列发布 | `promotion/cream-collage` · `brand-creative` | `#2657D7` on `#F3E8D4` | `ab-promo-p1-full.png` | `ab-promo-p4-full.png` |
| `ab-work` | 边缘推理平台路线图 | `work/electric-violet-business` · `tech-engineering` | `#5114F6` | `ab-work-p1-full.png` | `ab-work-p4-full.png` |

Finance `black-gold-ledger` was generated then dropped: `extractPalette` prefers green/blue structural hexes, so the ledger collapsed to pine-adjacent green. Content still differed; the visual direction did not.

## What matched

- Official neo-ppt accepted every generated YAML (`setPPTD` + 5 pages).
- Cover layout: left color rail + mint rule + title + design-system kicker + page number. Colors track the four palettes.
- Evidence layout: chapter kicker `02 证据`, title, bar chart + two-column table, footer disclaimer.
- After adding Y ticks / grid / X labels to the native bar painter, chart *structure* is in the same family as official (0–5 grid, A/B/C/D).

## What still differs (not 1:1)

| Surface | Official iframe | Native compare pane |
|---------|-----------------|---------------------|
| Chrome | Full neo-ppt editor (导出 / 74% zoom / bottom insert pill) | Stage only |
| Type | Official wrap + MiSans at 74% | Native scale-to-stage; wrap can sit differently |
| Chart | Axes + grid + theme bars | Same idea now; bar gap / tick type still off |
| Table | Value column sometimes clips at 74% zoom | `项` / `值` + A–D numbers fully visible |
| Silhouette | `ab-generate/silhouette.json` mean **0.53** | Compare-host crop: official stage includes editor chrome. **Not** a missing-page score. |

Pixel 1:1 is **not claimed**.

## Honest content limit

These are **playbook / deterministic** decks, not official Agent research:

- Cover subtitle is `Open SlideStudio · <design-system-id>`
- Evidence title is `证据位：待补真实序列`
- Chart is placeholder A/B/C/D = 3/5/2/4

Use this A/B to judge **paint**, not generate quality. Intranet LLM / Pi can replace the brain later; the iframe path stays the same (`setPPTD` of whatever YAML we wrote).

## Reproduce

```bash
npm run oracle:compare
# http://127.0.0.1:55180/?project=ab-consulting
# also: ab-academic  ab-promo  ab-work
npm run oracle:compare:ab
```
