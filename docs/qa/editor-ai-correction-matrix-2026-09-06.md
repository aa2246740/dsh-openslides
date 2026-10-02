# Editor Agent correction matrix — 2026-09-06

## Scope and evidence boundary

The initial matrix used the live product endpoints at `127.0.0.1:13080` and
`127.0.0.1:55200` without restarting either process. After the cross-tab defect
was fixed, the coordinated candidate restart was followed by a focused live
recheck on the same session. The audit created a disposable, fictional two-page
project and used the configured AMD `DeepSeek-V4-Flash` route. No provider
credential or raw request header is included in the artifacts.

- Session: `fd52437c-9a1e-44e3-a9ed-055743e415b8`
- Project: `output/dsh-slices/创建一份严格只有2页的中文虚构测试演示星屿邮局协作演练-fd52437c`
- Final consolidated ledger: `output/agent-first-audit/editor-ai-correction-matrix-ledger.json`
- Deployed raster recheck: `output/agent-first-audit/editor-ai-raster-live-recheck.json`
- Completed correction ledger carried into the consolidated run:
  `/tmp/oss-editor-ai-correction-matrix-fd52437c-r3/editor-ai-correction-matrix-ledger.json`

The matrix treats `applied` as a server-owned result. A completed model turn is
not enough: the script reads the persisted project, checks the authorized
delta, and calls `/api/reviews/ai-lock/verify`. A no-op or scope violation is a
failure. Visual quality of the resulting slides is outside this API audit and
is handled by the separate native UI acceptance.

## Real model and collaboration results

| Scenario | Result | Concrete evidence |
| --- | --- | --- |
| Independent two-page generation | Pass | Real provider created exactly `cover` and `rules`; both were persisted before correction tests began. |
| Multi-element comment | Pass | Scope contained exactly `secLabel` and `title`. The real turn called `read_page`, then `edit_elements`; `cover` advanced revision 4 → 5. Verify reported both target IDs changed, with no other element, metadata, order, or page delta. |
| Whole-page comment | Pass | The real turn called `read_page`, then `write_page`; `rules` advanced revision 4 → 5 while `cover` stayed unchanged. Verify committed the comment as `applied`. |
| Whole-deck workspace edit | Pass | One real turn read both pages and called `write_page` for each; `cover` and `rules` advanced revision 5 → 6. The deck lock authorized both exact page revisions and verify found no scope violation. |
| Stop and restore | Pass | A production turn was accepted, immediately stopped through `/slides/sessions/:id/stop`, returned the expected operator-paused state, restored its lock-owned snapshot, and matched both pre-turn page file hashes before unlock. |
| Preflight failure recovery | Pass | A deliberately stale but structurally valid page authorization returned HTTP 409 `stale_editor_edit` before model start. The snapshot was restored, the comment was written as `failed`, and the lock was released. |
| Stale selected target | Pass | After an external editor mutation, acquiring the old element comment returned `REVIEW_SCOPE_STALE` with an explicit reselect/create-new-comment recovery instruction. The old comment was not rebound. |
| Deleted selected target | Pass | After deleting the bound element, lock acquisition returned `REVIEW_TARGET_MISSING` and the exact missing ID (`pageno`). The old comment was not widened to page scope. |
| Final lifecycle | Pass | Session was idle and `_agent/ai-review-lock.v1.json` was absent. The shared editor was returned to the harmless fixture after the run. |

An earlier multi-element attempt intentionally remains evidence of honest
failure handling. Its comment described only the range while the turn text
contained the desired replacement strings. The model called `edit_elements`
with the original elements unchanged and claimed success; the tool reported
the page was already current, and verify rejected it with
`AI_REVIEW_NO_TARGET_CHANGE`. The comment was recorded as `failed`, never
`applied`. The corrected test places the requested text changes in the review
comment itself, matching the product contract, and then passed.

## Cross-tab defect and deployed fix

The live matrix found one failure. While the shared editor was showing
`fixtures/okp-yu7-ppt`, the deck-scoped review lock, snapshot, writes and verify
all stayed on the explicit QA root, but `/api/health.project` changed to the QA
root after the real Agent turn. Project bytes were not cross-written; the
process-global editor selection was still replaced.

The trigger is background page rasterization. `page-raster.ts` opens
`index.html?project=...`; the page bootstrap calls the ordinary `/api/open`,
which assigns global `projectPath`. The deployed fix now marks raster pages
with `X-OpenSlides-Project-View: isolated`. The server responds by opening a
temporary canvas session for that response and leaves global `projectPath` and
`session`, `sessionDiskRevision`, and per-project navigation memory unchanged.
The HTTP regression performs a persisted edit on the original global project
after the isolated open, so a hidden revision-pointer change is also detected.

After the coordinated restart, the existing fictional session ran one real,
read-only Agent turn whose only tool was `render_page`. The deployed live
evidence shows:

- `cover` and `rules` stayed at revision 6 with identical pre/post SHA-256.
- The foreground editor stayed on its disposable fixture project, page 0, with
  the same selected element (`meta-top`).
- A subsequent `setText` on that selection returned HTTP 200, changed the page
  file SHA-256, and survived reopening the same project.

The final consolidated ledger is 12 pass, 0 fail, 0 fatal. It retains the
pre-fix live failure inside `observedBeforeFix` rather than erasing that
history. Package evidence is also green:

- `apps/native-web` full suite: 67/67 pass, including the new isolated-open HTTP test.
- `packages/presentation-run` full suite: 207/207 pass, including pinned
  Playwright 1.61.1 / Chromium revision 1228 page-raster tests.
- `packages/canvas-session`: 37/37 pass.

## Adjacent clipboard boundary fixed during the sweep

The same acceptance sweep confirmed that external `text/plain` paste reached
`{cmd:"insert",kind:"text",text}` but the server discarded `text` and inserted
the placeholder. The candidate now performs one atomic insert/undo/persist with
the supplied string. Explicit text is limited to 20,000 UTF-16 code units;
non-string input returns `INVALID_INSERT_TEXT`, and over-limit input returns
`INSERT_TEXT_TOO_LONG` with `maxLength: 20000`. Both rejection paths leave the
page file unchanged.

Focused evidence: native command persistence 2/2 pass; the separate browser QA
reported the full external text in the new element, zero stale-shape delta, and
no browser errors. The backend is included in the deployed candidate; a
separate post-restart clipboard UI replay was not part of this raster recheck.

## Reproduction

The script can create its own disposable session, or reuse one through
`QA_SESSION_ID`. A stopped reusable session is accepted when it already owns
exactly two pages. `QA_RESUME_AFTER_REAL_EDITS=1` plus `QA_PRIOR_LEDGER` resumes
the recovery/negative half without repeating credentialed correction turns.
The script writes only its QA project and its output ledger, renews active
locks, restores protected snapshots on expected stop/failure paths, and does
not print credentials.
