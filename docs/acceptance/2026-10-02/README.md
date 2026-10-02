# Hosted model synchronization and local generation acceptance

## Problem and fix

The hosted plugin intersected a private `slides-model-catalog.json` / credential
store with the Harness adapter catalog. Native custom providers disappeared
unless separately imported. Generation also required duplicate credentials in
the isolated Slides home. The hosted path now reads every registered provider
and model directly from `ctx.llm`, invalidates its cache on
`llm/adapters-updated`, and lets the selected adapter resolve its credentials.
Unknown model IDs are still rejected. The standalone product retains its
isolated-home credential checks. Existing generation-route restrictions remain
in place; listing a model does not override them.

A provider call failure no longer removes its models from the hosted picker.
It remains listed with degraded status. The default health selection comes from
the same live roster as the picker.

Other observed fixes:

- Read the active `profileContext.home` when embedded in Harness.
- Locate checkout/design resources relative to installed modules, independently
  of the launch cwd; refresh palettes when the resource root changes.
- Make Personal optional in client metadata, matching the existing fallback UI.
- Declare the local package as a bundle so package installation activates it.
- Do not interpret `403` embedded in a provider trace ID as an HTTP auth error.

## Verification

DSH 0.2.0-rc.2, macOS; native Codex browser interaction and screenshots.
Two separate temporary Homes, one with Personal 0.2.7 and one without Personal.
After those generation tests, the user authorized a normal Desktop restart.
The installed plugin was then verified in the actual Desktop Personal UI.

| Check | Observed result |
| --- | --- |
| Personal entry | Loads the full editor and native custom model list |
| Independent sidebar entry | Loads without Personal; MiniMax completed and exported a separate 1-page action card |
| MiniMax M3.1 Flash Preview (`minimax-code-m3.1`) | Completed a 3-page Chinese deck and editable PPTX export |
| Editable content | Export report: 3 slides, native coverage 1, one native editable chart, no degradations |
| SWE-2 (`devin/swe-2`) | Selected successfully; PPT intent requests failed twice with upstream `invalid_argument` |
| SWE-2 minimal gateway request | HTTP 200 and `OK`; does not prove PPT generation works |
| Main Desktop activation | Passed after normal restart: official catalog 44, Slides catalog 44, 15 providers, missing 0, extra 0; existing MiniMax deck opened in Personal |

The MiniMax brief requested a fictional community book exchange plan, monthly
simulated values 120/180/260, three action steps, no web research or images.
The agent finished in approximately 6m24s from durable session creation to turn
completion. It produced a native chart and native table. No image-review model
was configured; there is no claimed automated visual-review pass. No reliable
billing total was supplied, so this is not a cost comparison or a broad model
benchmark.

PPTX SHA-256:
`6f054107f51eaa8f962a517a85e09d66749b06baaac045a947e4c9be4362e700`

## Actual Desktop verification

The current Host returned the same 44 provider/model identity pairs from
`session/modelCatalog` and `/slides/models`. This is a live catalog check,
not a claim that all 44 models passed generation. The screenshots below show
the installed Personal picker and the reopened MiniMax chart page.

![Actual Desktop model picker](desktop-models-synced.png)

![Actual Desktop MiniMax deck](desktop-minimax-deck.png)

## Screenshots

Personal and model discovery:

![Personal model list](personal-models.png)

Independent entry with SWE-2 selected:

![Independent entry](standalone-entry.png)

MiniMax chart in the actual editor:

![MiniMax generated chart](minimax-chart.png)

MiniMax also completed a separate generation from the independent sidebar:

![Independent MiniMax generation](minimax-standalone.png)

Three-page editable export:

![PPTX export](minimax-export.png)

## Automated checks and remaining boundaries

- `npm run test:dsh-contract`: bundle, Host and client tests pass, including hosted
  roster/health parity, unknown-model rejection, retained generation restrictions,
  and trace-ID error classification.
- Targeted theme-pack tests: 35 passed, including launch-cwd and cache-root changes.
- Full presentation-run suite: 271/272 passed. The unchanged catalog test expects
  the absent vendored `vendor/open-kimi-ppt/git-pre-wipe/theme.md` file.
- DSHX's whole-repository compatibility audit finds pre-existing legacy
  `assistant/chunk` handling/fixtures; full bounded server hot-reload acceptance
  is not claimed.
