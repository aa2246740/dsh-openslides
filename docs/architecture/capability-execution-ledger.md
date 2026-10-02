# Capability execution ledger

> **Partially superseded by the ADR-0008 revision (DSH kernel).** The RunLedger
> (`_agent/run-ledger.v1.json`), content-hash binding, current-revision gating,
> and fail-closed compose below remain the production record. Removed with the
> Pi→DSH cutover: the `DeckOverviewPreparedOrEmitted` / `DeckTasteReviewRecorded`
> facts and the `render_deck` / `review_deck` tool steps (the DSH tool surface
> has no such steps — keeping them as gates would deadlock every run), and
> "Pi extension/Pi-authored/Pi review" phrasing — read those as the DSH
> `PresentationRun` tool host and the selected provider model.

## Scope

This design covers the first production slice of ADR 0008:

- exact OpenKimi manifest and source chunks;
- exact selected theme preview and Pi-authored design contract;
- current-context source read receipts;
- page revision, native raster, image delivery, Pi review, and DOM layout receipts;
- executable per-page exhibit and locked-numeric contracts;
- current full-deck overview, grounded taste decision, and compose gating derived from those receipts;
- truthful provenance.

Final PPTX target rendering extends the same ledger in a later slice. Until then, PPTX export remains editable but `exported-unverified`.

## Public interface

```ts
export function verifyOpenKimiPack(repoRoot: string): VerifiedOpenKimiPack;

export function executeRunCommand(input: Readonly<{
  root: string;
  rawCommand: unknown;
  context: ExtensionOwnedContext;
  ports: RunPorts;
}>): Promise<RunCommandResult>;

export function inspectRun(root: string): RunInspection;
```

The Pi extension owns `commandId` and `contextEpochId`. Model arguments cannot select or override either value.

## Source contract

The checked manifest covers every regular file below the pinned vendor root. Each entry contains:

```ts
type SourceManifestEntry = Readonly<{
  sourceId: string;
  relativePath: string;
  byteLength: number;
  sha256: string;
  chunks: readonly {
    index: number;
    byteStart: number;
    byteEndExclusive: number;
    sha256: string;
  }[];
}>;
```

Chunk ranges are contiguous, non-overlapping original byte slices. Runtime reads verify the current file and chunk hashes before decoding the entire slice as UTF-8. There is no decoded-string cap, summary, ellipsis, or fallback excerpt.

The baseline requirement resolver distinguishes:

```ts
type DesignDirection =
  | { kind: "self-directed" }
  | { kind: "user-design" }
  | { kind: "preset"; sourceId: string };
```

A brief containing a document type such as `经营月报` resolves as a report before generic brand or campaign terms. Product strict runs always resolve one checked preset `design.md` and matching preview as the reference basis. Explicit user colors and layout requirements remain verbatim overrides inside the task contract; they do not remove either selected source.

## Ledger facts

The first schema stores an append-only fact list in `_agent/run-ledger.v1.json`.

```ts
type RunFact =
  | ReferenceChunkReturned
  | DesignReferenceImagePreparedOrEmitted
  | DesignContractCommittedOrReturned
  | TodoCommitted
  | PageRevisionCommitted
  | PageRasterCommitted
  | ImageResultPrepared
  | ImageContentEmitted
  | PageVisualReviewRecorded
  | DeckStructuralReviewRecorded
  | DeckOverviewPreparedOrEmitted
  | DeckTasteReviewRecorded
  | DeckComposed;
```

All downstream facts bind to content hashes. Only facts that match the current persisted page revision are eligible. Old facts stay in history but do not satisfy current gates.

The ledger is written through a project-local lock and atomic rename. Deterministic fact IDs suppress identical facts. Image base64 is reconstructed from the checked raster file and is not stored in JSON. Exact command-result replay is a later hardening step, not a current acceptance claim.

## Tool flow

```text
list_references
  -> read_reference for every required chunk
  -> view_design_reference returns exact checked JPEG image content
  -> commit_design stores a non-renderable task contract
  -> write_todo
  -> write_page
  -> render_page returns DOM layout diagnostics + text + PNG image content
  -> review_page returns the delivery token and approve or revise
  -> review_pages runs deterministic structural checks
  -> render_deck returns the current ordered contact sheet as image content
  -> review_deck records the grounded nine-axis taste decision
  -> compose_deck seals current PPTD pages
```

`review_page` is the model's visual decision. `review_pages` is deterministic QA. One cannot satisfy the other.

`write_todo` commits an exhibit contract for every page. Explicit declarations, legacy outline
wording, and the matching `【第N页】` source section are additive. The structural review rejects a
page when a promised table, chart, diagram, KPI-card set, or comparison-card set is absent as
editable PPTD elements. A label that merely says “漏斗” or prose that describes a waterfall does
not satisfy the contract. Combination charts require at least two series types and an explicit
secondary-axis series.

For structured scripts, every locked numeric fact must remain on its own page. Equivalent display
formatting such as `19.0` to `19` is allowed; rounding, spelling the number approximately, moving it
to another page, or losing a negative sign is not. Chart and table cells participate in this check.

`compose_deck` requires every todo page to have, for its current revision:

- a persisted Pi-authored page;
- a native raster;
- a real image result prepared and causally confirmed in the current context epoch;
- an approving Pi review;
- a passing structural report;
- a passing DOM layout report.
- a matching selected preview and current-context contract receipt;
- a current full-deck overview emitted to Pi;
- a grounded nine-axis deck taste pass with no remaining AI defaults.

The same structural report contains exhibit-contract and locked-fact failures, so a visually tidy
but semantically incomplete deck cannot reach compose.

## Interruption and recovery

Provider completion is not the durability boundary. Every accepted source, design, todo, page,
raster, review, and compose fact is committed to the project before the next model turn. A provider
403/429, expired login, timeout, overload, agent stop, or host-process loss therefore leaves an
incomplete run, not a disposable run.

`generate-checkpoint.json` is an atomic, secret-redacted resume pointer. If the process dies before
that pointer is renamed into place, the host may reconstruct only the pointer from the checked
`_agent/runtime.json` and RunLedger; it does not reconstruct chat or page content. Resume keeps the
same project path and may use the restored provider or another provider selected by the user.
The streaming endpoint publishes that project path before the first provider turn, and the Hub
stores the secret-free pointer outside the tab session. A dropped connection or process exit therefore
does not depend on receiving a final pause event. A same-provider model failover reads the ledger again
before creating its prompt; cross-provider failover remains an explicit user choice.

A new Pi session receives a new `contextEpochId`. It must read every required exact source chunk,
emit the selected preview, and return the existing design contract with `read_design` before it can
continue. The durable todo and page revisions remain in place. Rewriting a page creates a new
revision and invalidates that page's raster/review plus downstream structural, overview, taste, and
compose evidence. Already passing revisions can therefore be reused without pretending the new
model inherited the previous model's private context.

## Editable chart contract

The PPTD chart model preserves each series type and whether it belongs to the primary or secondary
value axis. The native canvas and PPTX exporter consume the same metadata. Bar-line combinations
therefore remain editable and expose two value axes; they are not flattened to the first series
type or replaced with a bitmap.

## Text and layout contract

`@open-slidestudio/pptd-v2` owns the shared text contract:

```ts
type TextLayoutContractV1 = Readonly<{
  version: "pptd-text-layout-v1";
  paragraphBreaks: "preserve";
  whiteSpace: "pre-wrap";
  contentInsetPx: 0;
  defaultLineHeight: 1.2;
  footerZoneTop: number;
}>;
```

The native idle renderer no longer replaces LF with spaces. Edit mode and idle mode use the same whitespace behavior. The exporter preserves LF, applies zero text inset, and maps the same line-height multiplier where the PPTX library supports it.

The Playwright raster port waits for fonts, takes the PNG, and reads DOM metrics from the same page. Every raster fact records the current layout-gate version, so a changed rule invalidates older passes on resume. First-slice hard failures are limited to high-confidence defects:

- horizontal or vertical text overflow;
- an element outside the slide;
- non-footer text inside the explicit footer reserve;
- a footer role whose box starts above the footer reserve;
- fonts not ready, which makes measurement invalid.

An explicit `layoutRole: footer` survives write/parse/save. For older OpenKimi PPTD, only clearly named footer, page-number, source, or disclaimer text that starts in the canonical footer reserve is interpreted as a footer. Merely spilling body text into the reserve is never inferred as a footer.

Text collision and small gaps are warnings until normal and failing fixtures calibrate reliable thresholds.

## Honest states

The product may report:

- exact sources returned;
- PNG bytes emitted through Pi's image content interface;
- Pi returned a review decision in the next turn with the matching delivery token;
- deterministic native layout checks passed;
- current PPTD pages were composed.

It may not claim that the provider's private vision stack processed the image. It may not claim final PPTX visual acceptance until target-rendered PPTX pages have separate delivery and review receipts.

## Migration

1. Generate and verify the complete vendor manifest without changing vendor files.
2. Add the ledger in the Pi tool path. Existing historical state remains readable but unverified.
3. Replace `read_playbook` with exact source tools and delete the prompt rule that keeps vendor originals unread.
4. Return actual image content and add causal page review.
5. Move compose and authentic-generation status to ledger gates.
6. Unify text layout and add DOM diagnostics.
7. Enforce page-specific exhibit and locked-fact contracts in the structural gate.
8. Add target PPTX render and review facts to this ledger.
9. Stop writing legacy evidence files after all callers use the ledger.

## Scrap conditions

Scrap this design instead of adding bypasses if implementation needs a second authoritative execution state, if page content must be copied into the ledger, or if production can reach compose without the current content hashes satisfying every gate.
