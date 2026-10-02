---
name: open-slidestudio
description: Produce an editable YAML PPTD v2 deck in Open SlideStudio. Use for generate, slides, PPT, PPTD, or presentation tasks on this host.
---

# Produce

Open-kimi produce, on this host. Tools already registered. The host writes PPTX later.

Read `_agent/capability.md` first. Hands you do not have stay unused.

## Steps

1. **Brief.** Read `_agent/brief.txt`. Read `_agent/attachments.md` if it exists. Done when you can name purpose (create), audience, and the one job of the deck. If this is a 经营月报/年报/周报 and the brief has no company name and no numeric facts, **stop**. Do not write_todo, write_page, or compose_deck. Tell the host 要数据. Labeling invented KPIs as 示意/演示占位 is still fabricating.

2. **Original OpenKimi sources.** Call `list_references`, then call `read_reference` for every listed chunk. The chunks are the exact original bytes from OpenKimi's `SKILL.md`, `reference/pptd.md`, category catalog, selected scenario, and selected preset when one applies. Do not skip, summarize, or substitute them. `write_todo` stays locked until every required chunk was returned in this Pi context.

3. **Design basis.** Call `view_design_reference`; inspect the attached exact preview together with the selected `design.md`. Then call `commit_design` with the task's audience, scene, purpose, necessary judgment, 1–5 taste dials, type roles, palette-area rules, grid, density, chart grammar, one recurring visual-memory feature, reference use, anti-default locks, verbatim user overrides, `adoptedSourceIds` of a matching catalog pack, and the complete slide plan. A color, font, ratio, or layout hint is an override inside this contract; the selected reference remains the basis. For six or more pages, plan at least four layout families and repeat no family more than twice in a row. Done when `commit_design` returns the contract hash and every page has a unique id, narrative job, focal point, and layout family. Host does not pick a preset and does not fill `Theme.colors`.

4. **Outline.** `write_todo` — copy each committed `pageId`, `title`, and `layoutFamily` exactly. Add a note and exact `exhibits` list. Copy every chart, table, funnel, gauge, pyramid, matrix, timeline, KPI-card, and comparison-card requirement from the corresponding brief page. Use `none` only when that page truly requests no exhibit. Done when the todo and committed slide plan match one-for-one and every page has one reader task plus a complete editable-exhibit contract.

5. **Media.** Use the original image rules you just read. If capability says search or generate is on, use it when the brief needs a place, product, or person to be seen. Done when files exist in `media/` or the committed plan uses a valid no-image composition.

6. **Pages.** Apply the exact PPTD, scenario, selected-design, and committed-contract rules. Call `write_page` once per todo item with the COMPLETE `elements[]` array; it replaces the whole page and never appends elements. Its `id` and `pageType` must equal the committed page id and layout family. Put every bounds/style/fill/line/alignment/layoutRole field inside its owning element. When the native render reports `layoutStatus=pass`, move to the next todo page and do not repaint the passing revision unless `review_pages` names it as failing or `review_page` / `review_deck` explicitly says `revise`. Vary composition deliberately around each page's focal point instead of repeating one skeleton. After adopt, every color MUST be official `#RRGGBB` or a `Theme.colors` `$token` that already resolves to that pack's PART B 【Color Palette】 hex. Prefer pack hexes. Host does not fill `Theme.colors`; empty-create `$primary` is `#2563EB` and is not a pack color. Never host navy `#06223F`. Never 澄光 memory chrome (`#FDC356`) on another pack. Never omit shape fill expecting a default; omitted fill is no paint and must not become white — set an explicit pack fill. Done when disk has the planned `.page` files, each with a conclusion hierarchy, every requested exhibit, and only support that serves the focal point. Charts and tables stay editable. Every non-waterfall/non-scatter chart chooses explicit pack `#RRGGBB` colors. Set `series[i].fill` or `colors[i]` for each series. A pie must set `colors` with one swatch per data row because one `series.fill` cannot color its slices. Diagram systems use contributing editable shapes and labels with the matching `exhibitRole`.

7. **Page review.** `render_page` every current page revision. Inspect the returned PNG, then call `review_page` with the exact page id, revision, and token. A `revise` verdict names every visible repair; change the page before rendering again. After every current revision passes, call `review_pages` for deterministic structural QA. It rejects unfulfilled exhibits and locked facts dropped from their page. Keep exact values such as `7.9%`, `105.4%`, and `+1.1pct`. Done when every current page has a same-context visual pass, rendered-layout pass, and the current structural review passes.

8. **Deck review.** Call `render_deck`; inspect the attached full-deck overview in todo order. Call `review_deck` with the exact token and all nine axes: hierarchy, composition, typography, color, evidence legibility, layout variety, cross-slide rhythm, reference fidelity, and remaining AI defaults. Ground every axis in visible observations, current page ids, and applicable contract rules. A pass has an empty `remainingAiDefaults` list and no revision actions. A revise verdict names page-specific actions; repair those pages, repeat page review and structural QA, then render and review the new deck snapshot. Done when the current snapshot has a grounded taste pass.

9. **Compose.** `compose_deck` from the reviewed pages. Done when the tool returns ok for the same contract and deck snapshot.

A chat blob or a one-shot `_agent/skill-deck.json` is not produce.

## Craft

Every page: one reader task, one focal point, one evidence grammar, and support that serves it. Use scale, alignment, whitespace, and color-area discipline to establish hierarchy. Facts you cannot source stay 占位. The selected OpenKimi design is a reference basis; verbatim user requirements override conflicts inside the committed contract. Keep intentional footer text inside the footer reserve with `layoutRole: "footer"`; body text stays above it.

Copy the adopted pack's official PART A/B rules as write_page requirements (Host does not paint them):

- Body titles are assertion-sentence conclusions, with a one-line scope/definition subtitle stating what the page covers and how to read it.
- Body pages carry a chapter breadcrumb/tab bar so a single page can be located in the storyline.
- Source/footnote line at bottom left and page number at bottom right; never omit them or use them as decoration.
- After adopt, colors are pack PART B hexes or `$token`s that already resolve to that pack. Host will not paint YAML or rebind `Theme.colors`.
