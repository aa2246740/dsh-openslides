# Generated editable PPTX acceptance — 2026-09-06

## What the product currently exports

There are two PPTX paths with different evidence:

1. The DSH `export_deck` tool calls `presentation-run/exportEditablePptx(projectRoot)`. It reloads the PPTD project, runs the native exporter, writes `_agent/export/<title>.pptx`, and writes the complete `_agent/export/export-report.json`. This is the durable artifact expected at the end of an Agent generation.
2. Native web `POST /api/export` with `{ "format": "pptx" }` reopens the current disk project and returns PPTX bytes with a reduced base64url `X-Export-Report`. It is a user download path and does not create the durable Agent export report. It currently depends on process-global editor project state, so it is not safe evidence for two concurrent tabs until that API is project-bound.

The read-only acceptance script never calls either export path. It accepts only an already-produced project and existing durable export artifacts:

```bash
node scripts/qa/audit-generated-editable-pptx.mjs \
  --project '/absolute/path/to/project' \
  --expected-pages 8
```

Exit codes are `0` for artifact pass, `2` for not ready, and `1` for a failed gate. Official project and ledger inspectors create a coordination lock, so the script copies the project to a disposable temporary snapshot before invoking them. It never creates, repairs, or removes a file in the user project.

## Required gates

### Complete source and current compose

- Exactly eight manifest pages, not a completed cover plus seven planned ids.
- Every planned page id maps to exactly one current page; no extra page exists outside the current todo.
- Every page has non-empty native PPTD elements and at least one editable non-image element.
- Current persisted page hashes match current ledger revisions.
- Every current revision has deterministic rendered layout `pass`.
- Current structural review is `pass`, `composeReady=true`, no compose blocker remains, and `deck.composed` matches the current revision snapshot.

### Existing durable export

- `_agent/export/export-report.json` exists and points to a contained `.pptx` file.
- Report `ok=true`, `slideCount=8`, `nativeCoverage=1`, no failed editable chart, no degradation, and no `full-page-raster` or equivalent reason.
- Reported byte count equals the file byte count.
- The PPTX ZIP passes CRC reading and contains `[Content_Types].xml`, `ppt/presentation.xml`, and exactly eight slide parts.
- Every internal slide relationship resolves to an OOXML part.
- Per slide, editable OOXML object count (`p:sp`, `p:graphicFrame`, `p:cxnSp`) is no lower than the source non-image element count; picture count is no lower than source image count.
- No slide consists only of `p:pic`. Full-slide picture geometry is recorded separately, while a full-bleed image plus independently editable text/shapes is not mislabeled as a rasterized slide.

The exporter currently defines `report.ok` more loosely than formal acceptance: `shape-as-rect` and similar soft degradations can leave `ok=true`. This script deliberately requires `degradations=[]` because a geometry substitution can remain editable while changing the teaching diagram.

## Honest review status for MiniMax-M3

The current `236942c8…` binding records `modelInputModalities: []`, so project capability inspection reports `vision.mode=none`. In this mode the ledger correctly requires current deterministic layout and structural review but does not require or invent model visual-review passes. The script emits:

```text
visualStatus: not-assessed
overallStatus: artifact-pass-visual-unassessed
```

An artifact can therefore pass machine structure/export gates without being called visually accepted. Human screenshot review remains a separate acceptance item.

## Current read-only snapshot: session 236942c8

At the checked snapshot the project had 3 of 8 pages, no structural review, no current compose, and no export report. It was correctly classified `not-ready`. The current third page also had a deterministic layout failure: `footer-outside-footer-zone`.

The third-page teaching geometry needs revision before human visual acceptance:

- `p3_square_a`, `p3_square_b`, and `p3_square_c` all use identical `[200, 200]` dimensions even though their labels claim areas 9, 16, and 25. If square size is the visual explanation, side lengths should be proportional to 3:4:5 and areas to 9:16:25.
- Each colored square contains one diagonal line from its upper-left to lower-right. These are not 3×3, 4×4, and 5×5 grids and do not explain the stated number of unit squares.
- The page text states the correct equation, but the geometry does not encode it. Structural layout checks cannot validate this educational meaning, especially with a text-only model.

No page or runtime file was changed while gathering this evidence.

### Fifth-page 3-4-5 triangle geometry

The later six-page snapshot confirms the visible overrun is primarily authored geometry, not the native canvas moving a valid endpoint:

- The hypotenuse uses `bounds=[120,155,320,240]`, `viewBox=[320,240]`, `points="0,240 320,0"`. Its canvas endpoints are therefore `(120,395)` and `(440,155)`.
- The horizontal leg uses `bounds=[120,395,220,5]`, `points="0,5 220,5"`, giving endpoints `(120,400)` and `(340,400)`.
- The vertical leg uses `bounds=[340,155,5,240]`, `points="5,0 5,240"`, giving endpoints `(345,155)` and `(345,395)`.

The upper hypotenuse endpoint is 95 px to the right of the vertical leg. The other nominal joints are also offset by 5 px because the thin line boxes use their far edge. In addition, the labelled legs `a=3` and `b=4` are drawn approximately 240 px vertical by 220 px horizontal, not in a 3:4 ratio.

Native web constructs `<svg viewBox="0 0 width height">` from the element bounds and sends `linePoints` directly to the SVG path. Here every stored `viewBox` equals its bounds dimensions, so no renderer rescaling explains the 95 px overrun. The screenshot is faithful to the model-authored coordinates; the page needs an Agent geometry rewrite with three shared endpoints.

There is a separate PPTX export defect: `exporter-native/mapLine` currently ignores `points` and `viewBox`, then chooses a horizontal or vertical PowerPoint line from the bounds aspect ratio. The current diagonal hypotenuse would export as a horizontal line. This does not cause the native screenshot problem, but editable PPTX acceptance must not pass until diagonal/polyline geometry is preserved or explicitly reported as a degradation.

### Eighth-page CTA rectangle rendering

The visible CTA displacement is a shape-name compatibility defect, not evidence that the declared text bounds moved. The current page stores `p8_cta_box_outline` as `shapeName="rectangle"` with `bounds=[600,120,300,200]`. The native shape catalog names this preset `rect`. An unknown name falls through `shapePath` to the generic polygon spanning only 10%–90% of the width and 18%–82% of the height. The displayed outline is therefore approximately `(630,156)` through `(870,284)`, despite the element's larger declared box.

The CTA text starts at x=620; its label starts at y=140 and its description extends to y=310. Those text boxes necessarily protrude left of and above or below the rendered fallback polygon. The current native raster shows exactly this inset outline, so the screenshot is consistent with the renderer's unknown-shape fallback. Alias `rectangle` to canonical `rect` before asking an Agent to tune CTA coordinates.

The editable PPTX exporter has different fallback behavior: it exports unknown `rectangle` as a full-bounds rectangle and records `shape-as-rect`. Until the alias is normalized consistently, Web and PPTX output can disagree even when the source bounds are unchanged.

## Remaining global API risk and minimum reliable repair

The generation-activity endpoint is now request-bound, but `/api/model`, `/api/command`, `/api/reviews`, `/api/versions`, `/api/export`, `/api/media`, `/media/*`, and the beginning of review-lock acquisition still resolve through process-global `projectPath` or `session`. A second tab can switch those globals between a first tab's read and write/export request.

The minimum reliable repair is one shared request-context function that resolves `{project, optional sessionId}` and returns a project-specific canvas session from `Map<absoluteProjectRoot, session>`. Each project API must receive that context instead of reading globals. Review-lock acquisition must take the resolved root explicitly and verify its session binding before writing the lock. `projectPath/session` can remain only as a legacy default when no project identity is supplied.

Acceptance for that later repair should interleave two projects through open → model → command → review lock → version → export, then prove every response and disk mutation remains under its requested root. Fixing only `/api/export` would protect downloads but leave edits and rollback operations cross-tab unsafe.
