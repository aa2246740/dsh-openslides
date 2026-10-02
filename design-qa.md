# Open SlideStudio Design QA — 2026-08-20

## Scope

This audit compares the frozen official Kimi Slides editor child capture with the standalone
Open SlideStudio editor. It covers the same 1576 x 892 viewport, page 1 of the same local YU7
PPTD fixture, page rail open, comment mode active, and the first-use annotation prompt dismissed.
It does not treat Kimi account, payment, cloud collaboration, or disabled SDK export behavior as
product requirements.

## Comparison Inputs

- Reference: `docs/editor-oracle/baselines/kimi-v1-2026-08-20/editor-live/02-dismiss-annot.png`
- Implementation: `docs/design-qa/2026-08-20/microchrome-aligned-editor-comment.png`
- Full combined comparison: `docs/design-qa/2026-08-20/reference-vs-microchrome-aligned.png`
- Focused bottom-control comparison: `docs/design-qa/2026-08-20/reference-vs-bottom-final.png`
- Machine facts: `docs/design-qa/2026-08-20/microchrome-aligned-facts.json`
- Viewport: 1576 x 892 CSS pixels at device scale factor 1

## Measured Result

| Region | Frozen reference | Open SlideStudio | Result |
|---|---:|---:|---|
| Titlebar | 52 px | 52 px | exact |
| Toolbar | 52 px | 52 px | exact |
| Page rail | 192 px | 192 px | exact |
| First thumbnail | 167 x about 94 px | 167 x 93.9 px | exact at raster precision |
| Stage | x 192, y 104, 1384 x 788 px | x 192, y 104, 1384 x 788 px | exact |
| Slide | x 340, y 184, 1088 x 612 px | x 340, y 184, 1088 x 612 px | exact |
| Zoom | 113% | 113% | exact |
| Title | x 10, y 12, 252 x 28 px | x 10, y 12, 252 x 28 px | exact |
| Top actions | x 1337 / 1415 / 1494 / 1534 | x 1337 / 1415 / 1494 / 1534 | exact |
| Toolbar actions | x 7 / 146 / 202 / 238 / 1446 / 1534 | same | exact |
| Comment pill | about x 760, y 810, 248 x 48 px | x 760, y 810, 248 x 48 px | exact |

The slide background and overlay samples match at the inspected pixels. PPTD angle 0 now paints
left to right as the official contract specifies; the generated SVG vector is x1=0, y1=50,
x2=100, y2=50. The cover description paints as one idle-canvas line, matching the frozen editor,
while its editable paragraph structure remains in the document/edit path.

## Iteration History

| Severity | Finding | Resolution | Evidence |
|---|---|---|---|
| P0 | Full-slide gradient was emitted as an invalid raw CSS value in SVG `fill`, producing a black cover | Emit SVG `linearGradient` definitions with parsed RGBA stops and opacity | `background-diagnose-*`, `gradient-fixed-before-layout-*`, shape-paint unit test |
| P1 | A QA-added sample chart polluted the cover and could be mistaken for product output | Remove only the injected `chart-1`; retain the original eight-page fixture | fixture diff and all later captures |
| P1 | 46/42/106 px chrome caused a 142% slide and undersized rail | Freeze 52/52/192 px chrome and compute fit from real CSS padding | `before-facts.json`, `microchrome-aligned-facts.json` |
| P1 | Thumbnail painter was hard-coded to 128 px and left blank card area | Derive thumbnail scale from the live rail content width | final rail comparison |
| P1 | Comment-mode click changed a variable but did not set `.app.is-comment` until another render | Apply the visual state synchronously in `setCommentMode` | final comment-mode capture |
| P1 | PPTD gradient angles were interpreted as CSS angles | Convert PPTD clockwise-left-origin angles to CSS by +90 degrees | canvas-session test and final pixel samples |
| P1 | Decorative pill handle intercepted pointer input for speaker notes | Mark the handle non-interactive | complete hover regression |
| P2 | Top action order, title geometry, toolbar positions, zoom-fit label, and active washes differed | Match frozen coordinates; keep fit on the clickable percentage; move product-only theme/messages into the existing overflow | combined final comparison |
| P2 | Idle canvas preserved text newlines that the frozen renderer paints inline | Flatten display-only run breaks while preserving edit paragraphs | one-line machine fact and focused copy comparison |

## Intentional Product Differences

- Open SlideStudio branding and local navigation replace Kimi branding/account chrome.
- Export and Share are enabled because the standalone product implements honest local equivalents;
  the frozen SDK-mode reference showed them disabled.
- Theme and local Messages remain functional in the existing overflow menu instead of occupying
  non-reference top-toolbar positions.
- The production app contains no Kimi iframe or CDN resource.

## Interaction And Regression Evidence

- `verify-hover-chrome`: all hover feedback passed; frozen tooltips 全屏, 预览模式, 收起, 缩小,
  放大 passed with accessible descriptions.
- `verify-editor-ux`: text persistence, context-menu dismissal, percentage-to-fit zoom, marquee,
  and snap guides passed.
- `qa:all`: 20 local verification scripts plus oracle validation passed; external-model scripts
  were intentionally excluded by the consent gate.
- `gate:native`: build, 244 native tests, 108 oracle rows, and offline export smoke passed;
  the restored YU7 fixture remained eight pages.

## Remaining Boundary

Captured editor/comment geometry and paint pass this audit. Uncaptured dialog/menu combinations
and exact icon-glyph shapes still require state-by-state oracle evidence before claiming universal
pixel parity. Authentic end-to-end generation is a separate product gate and still requires the
user's explicit consent to send the synthetic QA brief to the already logged-in external provider.

Final result: passed
