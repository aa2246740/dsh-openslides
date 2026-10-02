# Generation contract repair and runtime acceptance

## Scope and runtime

This repair targets the independent Open SlideStudio at `127.0.0.1:13080`, with the native editor on 55200. Source worktree: `/Users/wu/Documents/ChatGPT/openslides/latest`. Active runtime: `/Users/wu/orca/projects/openkimi-slides`. DSH.app was not changed.

Original failed session `b7c22a8e-d286-4cec-849a-9dd63be69adf` remains available. A clean MiniMax-M3 session `236942c8-fb07-4dc5-a75e-9c02fbf916a5` is the real eight-page generation and correction acceptance case.

## Findings and repairs

1. Tool input declared an incomplete page structure. The shared PPTD contract now publishes all seven element kinds, field types, tuple lengths, root metadata and supported shape names. Execution validates that same contract before project mutation. Valid native pages retain their metadata and styles rather than losing fields in legacy conversion.
2. Local argument-envelope compatibility executed an unwrapped copy but replayed the original malformed assistant call as successful. This could reinforce malformed history. It was removed; undeclared envelopes fail with explicit feedback. Historical evidence establishes amplification, not the exact original upstream cause.
3. A three-error guard treated different corrections as one repeated error. It now fingerprints error categories and paths, allowing different corrections while retaining a separate phase-wide no-progress budget. Type errors report the actual received type without exposing arbitrary values.
4. AMD Qwen rejected the `developer` role before normal generation. An exact provider/endpoint/model compatibility declaration sends `system`; repeated local model import preserves it. Other AMD routes are unchanged.
5. `rectangle` was accepted but rendered as an inset unknown shape in the Web and differently in PPTX. The shared shape catalog now owns aliases, renderer and exporter resolve them together, and new writes reject unsupported names.
6. Headless layout feedback used viewport-scaled coordinates despite native page coordinates in model inputs. Raster QA now uses native slide dimensions; a real Chromium test checks 495/500 logical footer feedback instead of 568.3/574.1.
7. Editable export silently reduced non-axis lines and omitted shape rotation. It now emits native custom geometry, preserves supported line transforms/style and shape rotation/flip, and reports unsupported geometry as a hard failure. Artifact verification compares actual OOXML coordinates and rotation, not just object counts or reported success.
8. Model-visible tool availability now uses the same session capability resolver as execution guards. Each request hides unavailable visual review, design-reference preview, image search and image generation; static registration no longer implies availability. Current-revision editor authorization is described explicitly so models do not invent visual-review failures to unlock human-requested edits.
9. Generation status polling used a process-global project. The endpoint now validates request project/session binding, and every frontend poll carries that binding. Broader multi-project canvas state isolation remains separate work; this record does not claim all editor flows have been re-audited.

## Model evidence

The reports in `output/model-tool-args/experiment-summary.md` and adjacent JSON files distinguish raw provider SSE, DSH parsed calls and successful tool execution.

- AMD DeepSeek-V4-Flash-Vision-Exp and ordinary DeepSeek-V4-Flash produced top-level tool parameters in controlled clean/product comparisons.
- MiniMax-M3 did the same. In actual production, numeric text failures were numeric values in the assistant call, identical to execution input; the model's claim that the validator changed quoted strings was not supported.
- AMD Qwen's original request failed on message role. With the model-level compatibility declaration, both comparison contexts produced normal tool calls.
- One Vision clean run stopped without a tool call; a frozen-schema repeat succeeded. This is recorded as a non-deterministic no-tool result, not hidden or reclassified as success.
- Free routes behind a local gateway were identified as forwarding to opencode.ai. Automatic approval rejected transmitting product context to that additional destination. No such requests were made, and that comparison remains untested.

## Acceptance evidence

Affected test suites passed: Host 162, PPTD 63, exporter 28, native raster 18 and bundle 5, plus generation project-binding tests.

The actual MiniMax session generated all eight pages, performed current-revision page checks, composed and exported the deck. Human full-size inspection identified and sent back genuine content errors: equal-size area squares, non-closed triangle diagrams and exposed layout units. Corrections are made by the product Agent using version-bound editor authorization; the host never writes substitute slide content.

`output/tool-contract-repair/final-eight-page-audit.json` is the artifact gate. It checks page identity/revisions, current composition, export consistency, ZIP/CRC/relationships, native object retention, line geometry numbers and shape rotation. `artifact-pass-visual-unassessed` means the text-only model did not claim visual review. Human visual acceptance is recorded separately after inspecting the final eight page rasters.

The final second-page correction is complete. Root inspected all eight full-size page rasters and rechecked corrected pages in the actual native editor. The final artifact gate passes, including 24 editable line geometries, all source/OOXML coordinate checks, one rotated shape, current composition and zero degradations. The retained final PPTX is 865,972 bytes with SHA-256 `77ae60b0fd38b3d6ffbf5f8ca9acb6b948092f291d73a08d7e2ec7d3353dfef2`. Final live tool-availability verification also passed: formal header seq8630 selected MiniMax-M3 with 15 tools, omitting review_page/view_design_reference/search_image while retaining configured generate_image and deterministic completion tools. The final turn called only inspect_capabilities (seq8637/8638), ended normally at seq8659, and left the deck/export bytes and hashes unchanged. Independent service is idle and ready for user testing.
