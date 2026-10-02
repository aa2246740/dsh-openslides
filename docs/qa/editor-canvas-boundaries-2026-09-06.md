# Editor canvas secondary-boundary QA — 2026-09-06

## Scope and method

`scripts/qa/editor-canvas-boundaries.mjs` launches the repository's native-web server on an owned random localhost port, copies `fixtures/okp-yu7-ppt` into disposable projects, and drives the real editor UI with the pinned Playwright runtime. Every mutation is checked at the HTTP response, `/api/model`, PPTD file, and reload boundary where persistence matters. Direct invalid-command probes use the same server session and compare the target page SHA before and after rejection.

The run does not open a user project, reuse the deployed service, or call an Agent/model. Runtime evidence is written outside the repository under `QA_OUT`; the final run command is:

```sh
QA_OUT=/tmp/oss-canvas-boundaries-final node scripts/qa/editor-canvas-boundaries.mjs
```

## Covered behavior

| Area | Scenario | Required evidence |
| --- | --- | --- |
| Text lists | bullet on; number replaces bullet; number off; bullet off | command payload, one-valued model field, PPTD field removal, reload without list DOM |
| Links | cancel; safe HTTPS; blank clear; dangerous `javascript:` | cancel sends no command; safe/clear persist; dangerous input sends no UI command; direct API returns 400 and page SHA does not change |
| Table merge | single cell; vertical; rectangular; partial overlap | single disabled plus API rejection; valid spans persist/reload; partial overlap returns 400 and preserves the original merge |
| Table fill | one cell; switch to a different cell | only the active cell changes; the second selection loads its own fill; both independent colors persist/reload |
| Image crop | toolbar complete/reset; menu complete/reset | real crop-handle pointer drag, command response, PPTD crop, crop-mode exit, reset and reload |
| Runtime | console/page errors | expected 400 network diagnostic is separated from unexpected console/page failures |

## Defects reproduced before the backend fix

The first complete run produced 16 passes and 3 product failures in `/tmp/oss-canvas-boundaries-run2/editor-canvas-boundaries-ledger.json`:

1. `javascript:alert(1)` returned HTTP 200 and was stored unchanged in both `model.href` and PPTD `content.href`.
2. Merging one cell returned HTTP 200 and stored `rowSpan: 1` plus `colSpan: 1`.
3. A merge over `(0,0)–(1,1)` followed by `(0,1)–(1,2)` returned HTTP 200 and left two intersecting span regions.

## Backend correction

`packages/canvas-session/src/index.ts` now validates link and merge inputs before `pushUndo`:

- Link parsing uses `new URL(value, "https://slidestudio.invalid/")`, matching the browser contract. It accepts `http`, `https`, `mailto`, `tel`, relative paths, and fragment links. It rejects malformed URLs, ASCII control characters, and all other protocols before session mutation.
- A one-cell merge is rejected before session mutation.
- A requested merge that partially intersects an existing merged region is rejected before session mutation.
- A requested merge that fully contains existing merged regions is valid: contained old span markers are removed, then one canonical span is written at the new origin.

The native-web command route already operates on a cloned candidate session and only persists after the canvas command succeeds. The browser QA confirms the rejected direct API calls return HTTP 400 and keep the exact page-file SHA unchanged.

## Verification

- `npm test -w @open-slidestudio/canvas-session`: **36/36 passed**. New regression cases cover dangerous, malformed, and control-character URLs; safe absolute and relative links; single-cell rejection; partial-overlap rejection; and full-containment normalization. Rejection checks compare the entire session, including undo history, before and after.
- Final browser run `/tmp/oss-canvas-boundaries-final/editor-canvas-boundaries-ledger.json`: **19/19 passed**, 0 failed, 0 fatal. Dangerous-link UI and direct API protection, single-cell UI and direct API protection, overlap rejection, valid merge persistence, list/link/fill persistence, and all four crop paths passed.
- The overlap path returned the expected HTTP 400, kept the original merged region and exact page SHA, retained the 2×2 cell selection and open table panel, and showed `无法合并：所选范围与已有合并单元格部分重叠，请重新选择完整区域。`. There were no unexpected console or page errors. Chromium's generic failed-resource message for the intentionally rejected 400 is recorded separately as one expected browser diagnostic.

## Files

- Production: `packages/canvas-session/src/index.ts`
- Package regression: `packages/canvas-session/src/session.test.ts`
- Browser/persistence QA: `scripts/qa/editor-canvas-boundaries.mjs`
- This report: `docs/qa/editor-canvas-boundaries-2026-09-06.md`

`npm test -w @open-slidestudio/canvas-session` rebuilt `packages/canvas-session/dist`; deployment must sync that rebuilt package output. No server restart, deployment, user-project edit, or model request was performed by this QA task.
