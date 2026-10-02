# Open SlideStudio native editor human audit — worker ledger

Date: 2026-09-05
Checkout: `/Users/wu/Documents/ChatGPT/openslides/latest`
Baseline revision: `a2ef06ddbc6791e866083058269f080071be1b3b`
Runtime used by this worker: pinned Playwright 1.61.1 / Chromium Headless Shell revision 1228, isolated native server on port 55481, scratch copies of `fixtures/okp-yu7-ppt`.

## Evidence boundary

- **Runtime-proven** means a real pointer/keyboard sequence ran through the native editor and its disk-backed API. The probe does not call editor commands directly or mutate application state through test-only APIs.
- **Native-CUA observed** means the root agent exercised the visible editor through Codex native CUA. This worker inspected the saved screenshot but did not replay that interaction.
- **Code-inferred** means the behavior follows from current handlers/model code or unreachable markup. It is not presented as a runtime result.
- The final broad office run completed all 15 steps and exercised all 102 semantic editor action IDs with no browser errors. The fixture has no live DSH conversation, so its Agent step proves honest no-session recovery; credentialed provider behavior remains a separate boundary.

## Verdict

The editor has a broad real authoring surface, and the allowlist/dead-button gate is internally consistent, but the original human sequence audit exposed four data-integrity failures that single-control checks missed. Table edit → page switch, table edit → export, notes typing → immediate page switch, and add page → undo all failed on the baseline. They pass after the transaction and page-index fixes. A new palette sequence then exposed a fifth real defect: the visible **线框** icon filter produced an empty grid despite 163 regular icons in the bundled catalog. The corrected style-aware filter now passes.

The remaining acceptance blockers are credentialed Agent-session behavior, native fullscreen/presenter edge cases, exported-PPTX editability in an office application, and an explicit product decision for the editor-only clipboard. The three dormant duplicate surfaces found in the baseline were removed during this audit.

## Exact control ledger

There are three useful totals; combining them into one number would be misleading:

1. **102 distinct editor action IDs** in the server allowlist. The server has 104 total IDs, of which two belong to Create Hub rather than the editor (`chrome.createhub.topic.fill`, `chrome.createhub.submit.generate`). See `apps/native-web/src/server.mjs:176-281`.
2. **62 static interactive HTML nodes** in the current editor shell: 54 buttons, 5 inputs, 2 textareas, and 1 summary. The baseline had 74; this audit removed 13 dormant/unreachable nodes: 7 animation-timeline controls, 4 legacy chart-dialog controls, and 2 legacy messages-pop controls.
3. Runtime-created instances depend on the document and selected element. On the eight-page YU7 fixture the inventory includes 9 rail buttons (8 pages + add), 4 rail context actions, 36 table-size cells, 15 shape categories, 177 visible shape choices, 3 line presets, 5 icon categories, and up to 96 icons in the active filter. Version rows, comments, attachment-removal buttons, chart rows/columns, and contextual toolbar controls vary with content.

The 102 action IDs are exhaustive at the semantic-command level:

| Family | Count | Actions |
| --- | ---: | --- |
| Page/chrome | 25 | Page navigate, rail toggle, add, delete, duplicate, reorder; undo, redo, versions open/snapshot/restore/preview; zoom in/out/fit; export open/PPTX/PNG; play/fullscreen; notes toggle; keyboard help; comment pin; Agent workspace toggle/refine |
| Insert | 9 | Text, shape, image, table, chart, line, icon, More, SmartArt |
| Selection | 2 | Tab traversal, clear |
| Text | 14 | Content; bold, italic, underline; font size/family/color; horizontal/vertical alignment; line height; letter spacing; highlight; list/numbering; link; wrap |
| Geometry/arrange | 13 | Bounds; forward/backward; six align variants; two distribute variants; horizontal/vertical flip; rotation; opacity; delete; duplicate |
| Shape | 4 | Kind, adjustment, fill, border |
| Image | 5 | Crop, mask, fit, replace, rebuild |
| Line | 4 | Curve, points, label, arrowheads |
| Icon | 2 | Color, icon name/style |
| Chart | 7 | Data, type, series color, axes, title, labels, legend |
| Table | 8 | Cell content, row/column add/delete, merge, cell fill, cell alignment |
| SmartArt | 3 | Add/delete node, layout |
| Object state | 5 | Lock, visibility, group, ungroup, shadow |
| Theme/notes/context | 4 | Theme color, page background, notes content, context-menu open |
| **Total** | **102** | |

`scripts/qa/dead-button-audit.mjs` currently reports 94 literal UI action IDs, 104 allowlisted IDs, zero unauthorized/dead IDs, and ten allowlisted IDs absent as literals. Eight of those ten are legitimate editor gestures/dynamic commands: page navigation, workspace refine, context-menu open, line-point editing, table-cell editing, text editing, selection clear, and Tab traversal. The other two are Create Hub.

## Surface-by-surface inventory and coverage

| Surface | Visible controls/actions | Current evidence | Residual gap |
| --- | --- | --- | --- |
| AI workspace | Close; progress toggle; expandable action log; three prompt suggestions; target preview; work brief; add/remove up to six attachments; send; dynamic turn/tool expansion; cancel/stop/later/retry; version-before-edit link | Workspace toggle, no-session recovery, attachment lifecycle, scope confirmation, cancel/retry, and review scaffolding have specialized runtime scripts. | **Blocked for full acceptance:** no credentialed DSH Agent session in the broad run. Must run current-page, selected-object, and whole-deck targets against a real provider; concurrent navigation during live updates; failure/stop/automatic restore; and lock release. |
| Title bar | Document-title/back link; versions menu, save snapshot, preview row, restore, return latest; export; share; play; fullscreen | Final office and shell runs prove exact snapshot selection, atomic read-only preview, restore, failed-restore retention/retry, explicit export format selection, and one download per action. | Native fullscreen and presenter first/last-page behavior remain untested; exported PPTX has not been reopened in an office application. |
| Page rail | Grid/list view; expand/collapse; page buttons; drag reorder; context up/down/copy/delete; add | Office step 1 passed. New table → rail and notes → rail sequences pass. | Drag reorder followed by undo/redo and page duplicate followed by undo/redo remain untested as one continuous human sequence. |
| History/zoom/keyboard | Undo, redo, zoom −/fit/+; `?`; Esc hierarchy; Tab/Shift-Tab; arrows/Shift-arrows; Delete; Cmd/Ctrl D/G/Shift-G/C/X/V/B/I/U/Shift-L/K/Z/Shift-Z | Office step 1 covered zoom/history/help. New probe proves table edit → undo → redo and Meta-C → context-menu paste. | OS-level clipboard interoperability is absent by design; IME/composition input and every shortcut combination still need dedicated coverage. |
| Insert pill/More | Edit, comment, text, shape, image, table, chart, AI, More, notes; theme, formula, SmartArt | Office steps 2–12 cover all insert action IDs. Root removed duplicated chart and messages entries from More. | Formula is implemented as a text insertion preset, not a mathematical object. Confirm that product labeling is intentional. |
| Shape/line/icon libraries | Shape/line/icon tabs; search; 15 shape categories; 177 choices; 3 line presets; icon search; solid/regular/brands; 5 icon categories; up to 96 choices per view | New probe passes search/category/tab/preset/style/category insertion. It caught and then revalidated the regular-icon bug. | Catalog cap of 96 per view makes search/category essential; add an accessibility check for focus order and announced names across the virtual catalog. |
| Context toolbar: text | Comment; font/family/size; bold/italic/underline; line height; tracking; highlight; text color; alignment; bullets; numbering; link; wrap; common opacity/layer/more controls | Office text step passed and persisted after reload. | Immediate text edit → export/version/Agent uses the same settlement function but only table boundaries were independently regressed. Add text-specific boundary cases and Chinese IME composition. |
| Context toolbar: shape | Kind/adjustment; solid/gradient/theme fill; border color/width/none; opacity; layer; flip; shadow; rotation; X/Y/W/H; duplicate/delete/lock/hide | Office shape step passed. | Theme-swatch choice variants and border-none state are observed through a shared action ID, not each option. |
| Context toolbar: image | Crop start/done/reset; five masks; replace; rebuild; contain/cover/fill; common transforms | Office image steps passed, including editable rebuild. | File chooser cancellation and unsupported/corrupt image errors are not covered. |
| Context toolbar: line | Label; color; width; solid/dash/dot; start/end markers; sharp/round/smooth; Bézier points | Office line step passed; point drag exercised. | Every marker/style combination is not combinatorially tested. |
| Context toolbar: table | Cell edit; keyboard traversal; add/delete row/column; merge; fill; left/center/right alignment | Office table step passed. New boundary and undo/redo sequences pass. | Immediate cell edit → version snapshot and → Agent submit still need explicit probes. |
| Context toolbar: chart | Data grid; close; cell/category/series rename; TSV/CSV paste validation; add/delete rows/columns; bar/line/area/pie; series colors; X/Y/secondary axes; title; labels; legend | Office chart data and formatting steps passed and persisted after reload. | Existing test waits 450 ms before closing. Add edit → immediate close → reopen and export to prove the last cell is not dropped. |
| Context toolbar: multi-select/SmartArt | Six align choices; horizontal/vertical distribute; group/ungroup; SmartArt add/delete node and three layouts | Office arrange/group and SmartArt steps passed. | Keyboard Cmd-G/Shift-Cmd-G is not separately runtime-proven. |
| Comments/AI review | Comment placement, edit/save/resolve; AI consent/send/cancel/retry; status; pre-edit version; automatic restore | Office comment step passed; specialized review tests exist. | Real-provider Agent review remains pending; verify lock renewal uncertainty and all rollback branches with a real session. |
| Notes | Toggle and textarea | Office waits through normal autosave. New immediate navigation probe proves page binding. | Add immediate export, version snapshot, and Agent submit variants. |
| Share/present/export | Copy local link; start slideshow; fullscreen; next/previous/Esc; choose PPTX/PNG; embed font; scope; download/retry/cancel | Final office/shell runs prove format tabs are side-effect-free, scope text and font-option visibility update, Download emits exactly one PPTX/PNG, signatures and PNG 960×540 dimensions are valid, and presentation starts/navigates/exits. | Native fullscreen and presenter first/last-page behavior remain untested; exported PPTX editability in an office application is not proven. |

## Findings

### F1 — pending table edit was lost or left stale UI at navigation/export boundaries

**Severity:** P1 data integrity. **Status:** fixed and runtime-proven.

Before the fix, typing into a table cell and immediately clicking page 2 updated the server page index but left the page-1 DOM active. Opening Export left the disk/model cell as `列 A` while the UI showed `AUDIT_TABLE_EXPORT`. The old global pointer handler committed text only; table editing was local until a table-specific action (`apps/native-web/public/app.js:932-944`, `4438-4461`).

`settlePendingEdits()` now commits text/table/notes and waits for a capture-phase commit before navigation, structure changes, presentation, notes, insert, undo/redo, export, versions, review, or Agent submit (`apps/native-web/public/app.js:946-966`, `3680-3695`, `4003-4011`, `4204-4212`, `7068-7083`).

![Baseline table edit stuck on page 1 after selecting page 2](evidence/editor-human-audit-2026-09-05-before/01-table-edit-is-committed-before-rail-navigation.png)

### F2 — notes debounce could lose text or write it to the wrong page

**Severity:** P1 data integrity. **Status:** fixed and runtime-proven.

The original 300 ms timer read the current model when it fired. Immediate rail navigation could clear page-1 notes or apply them to page 2. Pending notes now capture their originating page and fail closed if the page changes unexpectedly (`apps/native-web/public/app.js:44-45`, `946-956`). The runtime probe reloads both pages and proves page 1 contains `AUDIT_NOTES_PAGE_ONE` while page 2 remains empty.

![Baseline notes sequence after immediate navigation](evidence/editor-human-audit-2026-09-05-before/03-notes-autosave-remains-bound-to-the-page-where-typing-occurred.png)

### F3 — add-page undo left an invalid current page

**Severity:** P0 crash/invalid session. **Status:** fixed by the canvas-session owner and runtime-proven by this probe.

Baseline add-last-page → undo returned `/api/model` 500 with `Cannot read properties of undefined (reading 'page')`. The after run returns a valid `pageIndex=0, pageCount=8`. This worker did not change `packages/canvas-session`; the evidence proves the shared final build, not authorship.

![Baseline add-page undo invalid model](evidence/editor-human-audit-2026-09-05-before/04-undo-after-adding-the-last-page-keeps-a-valid-current-page.png)

### F4 — icon “线框” was a visible empty control

**Severity:** P1 dead visible feature. **Status:** fixed and runtime-proven.

The bundled catalog contains 163 `far` entries, but `renderIconGrid` filtered on each entry's `defaultName` prefix, which is `fas:*` even when `styles` also contains `far`. The visible 线框 button therefore showed an empty grid. The corrected code filters by `styles.includes(iconStyle)` and inserts the selected prefix (`apps/native-web/public/app.js:4705-4739`). The after probe sees 96 regular icons in the capped view and inserts one successfully.

![Regular icon filter populated after the style-aware fix](evidence/editor-human-audit-2026-09-05-after-icon-fix/02-shape-library-filters.png)

### F5 — export format tabs performed downloads before the user pressed Download

**Severity:** P1 misleading/destructive action. **Status:** fixed and runtime-proven.

Native CUA observed that clicking 图片 immediately downloaded page 2 while Download remained visible and the PPTX-only font option remained on screen. The baseline screenshot records the ambiguous state (`output/human-audit/03-export.png`). The current handlers only update format/scope; `#export-download` is the sole normal trigger (`apps/native-web/public/app.js:4226-4260`). The final shell run proves tab clicks issue zero export requests, PNG hides the font option, scope labels distinguish page/deck, and each explicit Download yields one valid file.

![Baseline export state after selecting image](../../output/human-audit/03-export.png)

### F6 — element clipboard is editor-session-only

**Severity:** P2 product limitation. **Status:** code-inferred limitation; same-session path runtime-proven.

Cmd-C/X/V and the canvas context menu share `CanvasSession.clipboard`, an in-memory array (`packages/canvas-session/src/index.ts:50-65`, `1482-1503`). The new probe proves keyboard copy → context-menu paste and context-menu duplicate within one session. There is no serialization to the OS clipboard or project, so paste across tabs/apps/reopen cannot work. The only `navigator.clipboard` call is Share-link copy (`apps/native-web/public/app.js:4018-4023`). Product copy/help should say “editor clipboard” or the implementation should add a typed clipboard payload plus safe text/image fallback.

![Same-session keyboard and context-menu clipboard result](evidence/editor-human-audit-2026-09-05-after-icon-fix/03-keyboard-context-clipboard.png)

### F7 — three dormant duplicate surfaces were removed from production markup

**Severity:** P2 maintenance and future dead-button risk. **Status:** resolved; source-verified.

- The unreachable `#messages-pop` and its two buttons were removed.
- The unused four-control legacy `#chart-dialog` was removed; `#chart-overlay` is the single chart-data editor.
- The two hidden animation launch buttons and five hidden timeline controls were removed. Optional runtime helpers remain null-safe for playback/model compatibility but expose no production controls.

This is the exact reduction from the 74-node baseline to the 62-node static inventory after adding the reachable notes-close control.

### F8 — the first settlement fix did not survive rejected saves or in-flight navigation

**Severity:** P1 data integrity. **Status:** fixed and fault-injection-proven.

The first happy-path fix cleared text/table/notes state before persistence completed and masked the rejected command tail. A rejected rich-text save could therefore emit an unhandled page error and still navigate; a rejected notes save lost its buffer; notes typed while an earlier navigation was in flight could land on the later page. Commit state now clears only after success, remains retryable after rejection, blocks later boundary commands, and notes carry their capture-time `pageIndex` to the targeted server setter. The preserved baseline is `evidence/editor-human-audit-2026-09-05-fault-before/report.json`; the final proof is `evidence/editor-human-audit-2026-09-05-fault-after-final/report.json`.

### F9 — version preview and restore used unstable completion/selection signals

**Severity:** P1 state integrity. **Status:** fixed and runtime-proven.

Preview exposed `#history-bar` before awaiting the version-list refresh and final read-only render, so callers and users could observe a history label while editable chrome was still visible. Its canvas used `previewModel`, but the title, page count, rail thumbnails, and notes still used the live model; this produced a mixed state such as “只读 V2” beside later live-draft notes. Tests also selected the first dynamic preview row and toggled a menu whose open state depended on the prior snapshot action; they could restore V1 instead of the snapshot just created. Stored rows now expose their stable version ID, tests bind to the POST response ID, and the history bar appears only after the complete preview render. Title, page count, rail, per-page notes, and fit size now use the same immutable version data. Notes have a visible read-only treatment, authoring controls are visibly disabled, and rail clicks navigate only among preview page models without writing the live session. Returning to latest restores its original page and notes. Restore disables duplicate submission, keeps the preview and target after an HTTP failure, reports the error, and allows retry. The final shell report records the injected failure/retry invariant; the office version-content report proves V2 page 1 → page 2 → page 1 notes, current-draft return, and exact restore.

## Human sequence steps and health

| Step | Sequence | Before | Current health |
| ---: | --- | --- | --- |
| 1 | Insert 2×2 table, type, immediately click page 2 | Failed: stale page-1 DOM | Pass |
| 2 | Insert table, type, immediately open Export | Failed: model kept old cell | Pass |
| 3 | Type page-1 notes, immediately click page 2, reload both | Failed: page-1 notes empty | Pass |
| 4 | Add final page, immediately undo, read model | Failed: HTTP 500 | Pass |
| 5 | Type table cell, undo, redo | Not previously covered | Pass: `列 A` then `AUDIT_TABLE_UNDO_REDO` |
| 6 | Shape search/category → line preset → regular icon filter/category | Failed during expanded audit: regular grid empty | Pass after icon fix |
| 7 | Meta-C selected shape → right-click Paste → right-click Duplicate | Not previously covered | Pass: shape count +2 |
| 8 | Inject first rich-text save failure, click page 2 twice | Failed before: navigated and emitted page error | Pass: first navigation blocked, second retry persists |
| 9 | Inject first notes save failure, click page 2 twice | Failed before: buffer lost | Pass: first navigation blocked, second retry saves original page |
| 10 | Delay page navigation, type into still-visible notes, open Export | Failed before: notes written to page 2 | Pass: page 1 has sentinel, page 2 remains empty |

Latest report: `docs/qa/evidence/editor-human-audit-2026-09-05-final-transaction-clean/report.json` (SHA-256 `c2fa651a235feee83fccc01c6df1d149211120cd146e2e0bcd6110f88312cc55`). It records ten passes, no unexpected browser/page errors, and separately classifies the two intentionally injected HTTP 500 console messages.

## Coverage matrix: evidence, not script-name mentions

| Workflow | Runtime proof in this run/current broad run | Code-only or pending |
| --- | --- | --- |
| Selection/arrange | Office shape/multi-select steps passed; context copy/paste passed | Full keyboard matrix, marquee edge cases |
| Text entry/format | Office text step passed and persisted | IME; immediate text → all external boundaries |
| Undo/redo | Office structure history passed; add-page validity and table edit transaction passed | Reorder/duplicate/delete chains; undo after Agent restore |
| Page switching | Office rail navigation passed; table and notes immediate-switch cases passed | Switching during active Agent live write |
| Clipboard | Same-session keyboard/context-menu passed | OS/cross-tab/reopen unsupported |
| Charts | Office data validation/paste/type/style/reload steps passed | Immediate final-cell close/export |
| Save/reopen | Office text/chart persistence; table/notes probe reloads | Multi-page mixed edit + close/reopen; crash during write |
| Versions | Exact snapshot ID preview/restore, atomic read-only UI, notes restoration, failed restore retention and retry all pass | Crash during restore persistence remains untested |
| Export | Table edit is on disk before dialog; side-effect-free format choice, explicit scope, one-download action, PPTX/PNG signatures and PNG dimensions pass | PPTX reopen/editability in an office application |
| Present/share | Share URL and presentation start/next/Esc pass; fullscreen dispatch is browser-stubbed | Native fullscreen and first/last-page edges |
| Agent | Static/runtime scaffolding and specialized mock tests exist | Real session and recovery matrix blocked in broad run |

## Recommended consolidation order

1. Keep the completed duplicate removal: one comments entry, one Agent entry, and one spreadsheet-style chart overlay.
2. Keep animation UI absent until an explicit feature module/flag has an oracle-backed accepted surface.
3. Keep `settlePendingEdits()` as the single edit-transaction boundary. Add every future navigation/export/version/Agent entry point to one declarative boundary list and test it with a common table/text/notes matrix.
4. Decide the clipboard contract. If it remains session-only, label it. If cross-app paste is required, serialize a versioned element MIME payload while preserving safe plain-text/image fallback.
5. Split the monolithic office acceptance into required independent stages. A missing Agent session should skip/block only the Agent stage, while export/presentation/version results still complete and report independently.

## Verification run

- `node --check apps/native-web/public/app.js` — pass.
- `node --check scripts/qa/editor-human-audit.mjs` — pass.
- `git diff --check -- apps/native-web/public/app.js scripts/qa/editor-human-audit.mjs docs/qa` — pass.
- `node scripts/qa/dead-button-audit.mjs` — pass: 94 literal UI IDs, 104 allowlisted, zero dead/unauthorized IDs.
- `QA_PORT=55481 QA_OUT=docs/qa/evidence/editor-human-audit-2026-09-05-final-transaction-clean node scripts/qa/editor-human-audit.mjs` — ten of ten pass, no unexpected browser/page errors.
- `QA_PORT=55488 QA_OUT=output/human-audit/shell-version-final-verified node scripts/qa/editor-shell-human-audit.mjs` — nine of nine pass, including atomic preview and injected restore failure → retained preview → successful retry.
- `QA_PORT=55488 QA_OUT=output/human-audit/office-final-verified node scripts/qa/editor-office-acceptance.mjs` — 15 steps pass, all 102 semantic editor action IDs exercised, no browser errors.

## Final root acceptance addendum

The root native-CUA pass found and fixed a missing notes-close control and an insertion-toolbar overlap with the open notes panel. There are now 62 static interactive nodes (54 buttons, 5 inputs, 2 textareas, 1 summary): 74 original nodes minus 13 dormant nodes plus the notes-close button. The final shell suite has 10 passing cases, including close/save/reopen and a toolbar-versus-notes geometry assertion. The root also verified old-version page navigation, read-only historical notes, and restoration of live page/notes. See `editor-human-audit-2026-09-05.md` for the integrated final verdict. The extra five-case boundary suite proves focused table snapshot, chart immediate close/reopen/export, text export, page history chains, corrupt-image rejection and valid image insert/replace. Native OS chooser cancellation and IME remain unproven.
