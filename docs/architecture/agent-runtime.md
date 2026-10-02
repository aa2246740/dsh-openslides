# Generate runtime — the agent directs, the host is hands

> Production kernel is DSH (`docs/adr/0009-dsh-is-the-single-agent-kernel.md`). Hub generate is `POST /slides/sessions`. Page tools run inside `PresentationRun`. `createPiBrain` / `runPiHand` are freeze fixtures, not the product path.

open-kimi-ppt is a **skill**. Open SlideStudio is the product. **The agent is the director.** Produce is exact required source reads → agent-authored plan → one-page write/render/review loops → structural review → `compose_deck`. (The rendered deck-overview / nine-axis taste-review ceremony was removed by the ADR-0008 revision — the DSH tool surface has no `render_deck` / `review_deck`; see notes below where the Pi-era text still mentions them.)

The host must not paint remaining pages after `agent_end`. Host exhibit painters (`exhibit-paint.ts`, `createHostBrain`) are offline / test only. Official Kimi iframe / `export_images.py` / `export_pptx.py` stay out.

`compose_deck` finalizes pages already written with `write_page`. `role` + `bullets` is an IR fallback and is labeled `IR fallback`. It is not “the skill ran.”

See `docs/architecture/independent-harness.md` for the OpenKimi contrast and the gap list.

## Law

1. YAML PPTD v2 is disk SSOT. Prefer `pages[].elements`. Do not invent a second deck JSON as SSOT.
2. Advertise a **capability card** before design. Search / generate / vision / raster are facts.
3. Image source priority: configured search port → configured generate port → **official no-image layouts**. Media is optional.
4. Visual loop is native and causal: `write_page` → `render_page` (Playwright screenshot of editor `#slide`) → real image content delivered to the model → `review_page`. A rewrite invalidates the old raster and review. Official iframe stays out. Vision-capable models only; text-only models owe plan, coverage, rendered layout, and structural review (ADR-0008).
5. ~~Taste gate~~ — removed by the ADR-0008 revision. There is no `render_deck` / `review_deck` on the DSH tool surface; do not require a full-deck overview or nine-axis decision.
6. For vision models, missing raster, image delivery, stale page review, font failure, text overflow, slide overflow, or footer intrusion blocks compose.
7. No provider login: block normal creation. Non-transient failed loop: pause or fail. Do not host-paint or template-fill a fake deck.
8. Production: zero Kimi iframe / CDN / official export scripts.
9. Research is pluggable: attachments → optional intranet URL → classroom_common or an honest gap. No public-web default.

## Runtime boundary

| Surface | Runtime |
|------|--------|
| Normal Create Hub | DSH `POST /slides/sessions` + MiniMax China. `createPiBrain` is not the product path. |
| Page tools | `PresentationRun` domain execute (`runDomainHand`). No HandsPort, no Pi SDK. |
| Developer fixtures/tests | `createPlaybookBrain` / `createAgentBrain` / `createPiBrain` remain in `@open-slidestudio/agent-harness`. `/api/generate` returns 410. |

## Tools the model may call

`think` → exact `list_references` / `read_reference` → `commit_design` → `write_todo` → optional media → per-page `write_page` / `render_page` / `review_page` loop → `review_pages` → `compose_deck`

`list_references` and `read_reference` expose a checked, byte-exact OpenKimi source pack. The result starts with `requiredReferenceChunks`, `missingReferenceChunks`, and `next`, before the optional catalog. Chunking is transport only. Every baseline chunk must be returned before `commit_design` or `write_todo`; a design/scenario newly named by `adoptedSourceIds` becomes an additional candidate requirement and every one of its checked chunks must already have a receipt. The Host calls this preflight before recording an adopted source or `todo.committed`, so rejection has no partial plan side effect.

Gate failures are repair instructions, not opaque counts. A rejected `compose_deck` returns `error=compose_not_ready`, one `next` action, exact missing chunk/page arrays, and the original blockers. Failed layout, visual revise, and structural-fail states direct the Agent back to the named page repair; missing rasters/tokens direct it to `render_page`. Repeating the rejected gate without satisfying `next` is not progress.

`review_page` follows the receipt law: wait for the matching `render_page`, copy its complete token, use `issues=[]` for `pass`, and use concrete unresolved defects for `revise`. (Pi-era paragraph about `render_deck`/`review_deck` tokens removed — those tools do not exist on the DSH surface.)

Page count follows the brief and attachments. A classroom lesson is usually 6. A 月报 / 复盘 follows `【第N页】` count. The host must not pad or crop that count.

`search_image` / `generate_image` are hands. If those ports are NO, use official no-image layouts and do not write `src`. If the agent writes `src`, the file must exist.

Blocked: shell, iframe, arbitrary HTTP, official export scripts, host-finish painters after `agent_end`, one-shot deck dumps, and compose without current evidence for every page.

## Editor Agent scope

The editor resolves the human's target before it creates a version, acquires a lock, or sends a DSH turn. With no scope words, a request targets the current page even when objects are selected. `elements` requires an explicit selected-object phrase and a non-empty current selection. Explicit Chinese page numbers and ranges resolve to stable page IDs as `pages`; a page set that covers the whole deck becomes `deck` and keeps the whole-deck confirmation. Explicit whole-document wording also becomes `deck`.

Invalid, out-of-range, contradictory, or exclusion-only wording is shown beside the composer and is not sent. The browser sends the same exact page revisions to the native lock and `editorEdit.pages`. The native lock records `targetPageIds`; PresentationRun rejects every `write_page` outside that set, and final verification compares every target and non-target page plus deck order, title, and theme against the lock baseline. A page subset never receives whole-deck authority.

For a direct page-background color request, the native server may add `backgroundColorOverride: true` to the persisted page/page-set/deck scope. That narrow flag only permits a valid canonical `background.color` on an authorized page to differ from the adopted palette. It does not relax element colors, theme metadata, structure, page revision CAS, or the exact page-set guard.

## Config

| Env | Role |
|-----|------|
| `SLIDESTUDIO_LLM_BASE_URL` + optional `_API_KEY` / `_MODEL` | Legacy/dev ports and image rebuild only; never a normal generation kernel |
| `SLIDESTUDIO_LLM_IMAGE=0` | Disable vision / image rebuild |
| `SLIDESTUDIO_RESEARCH_URL` | Intranet search |
| `SLIDESTUDIO_IMAGE_SEARCH_URL` / `_KEY` | Image search POST `{ query }` |
| `SLIDESTUDIO_IMAGE_BASE_URL` or `SLIDESTUDIO_IMAGE=1` | Image generate. Chat URL alone is **not** generate |
| `SLIDESTUDIO_EDITOR_URL` | Native editor for `#slide` raster (Hub default `:55200`) |
| `SLIDESTUDIO_PI_BIN` / `_MODEL` / `_PROVIDER` | `@open-slidestudio/agent-harness` freeze fixtures only — not read by the DSH product path |
| `SLIDES_DSH_PORT` / `SLIDES_EDITOR_PORT` / `DSH_HOME` | Kernel/Hub port (13080), editor sidecar port (55200), isolated DSH home (`<repo>/.dsh/home`) — see `.env.example` |

See OOP-26 (harness/brain split), OOP-96 (this runtime), `docs/architecture/independent-harness.md`.
