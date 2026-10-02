# Taste execution contract

Status: **superseded as a production gate** by the ADR-0008 revision (DSH kernel,
`docs/adr/0009`). The committed design-contract visa, the rendered full-deck
overview (`render_deck`), and the nine-axis taste decision (`review_deck`)
described below are Pi-era ceremony — the DSH tool surface has no such steps, so
they cannot be required gates. Keep this file as the design rationale record;
`TASTE_GATE_LIMITS`-style measurable structural checks inside `review_pages`
remain valid. The `writePiRuntime` / `runPiHand` names below are freeze-fixture
aliases in `@open-slidestudio/agent-harness`.

## Problem

The strict run already proves exact OpenKimi text reads, Pi-authored PPTD pages, current page
rasters, image delivery, per-page visual decisions, rendered-layout checks, structural review,
and compose. It does not yet prove that Pi received the selected art direction or judged the
deck as one visual sequence.

Two observed gaps caused the first real deck to pass while looking generic:

1. A brief containing a local style hint such as `深蓝`, `字体`, or `16:9` was classified as a
   complete user design system. That removed the selected OpenKimi `design.md` from the exact
   source requirements.
2. Review was page-local. There was no selected theme preview, Pi-authored design contract,
   full-deck overview, or deck-level taste decision before compose.

## Caller usage

The existing strict facade remains the caller boundary:

```ts
writePiRuntime(root, {
  brief,
  categoryId,
  designSystemId,
  editorBaseUrl,
  strictExecution: true,
});

await runPiHand(toolName, toolArgs, root);
```

Callers do not coordinate source verification, contract persistence, image delivery, overview
composition, staleness, or compose predicates. Those policies remain behind `runPiHand` and
the one append-only `RunLedger`.

The model-facing strict sequence is:

```text
think
-> list_references
-> read_reference for every exact text chunk
-> view_design_reference for the selected exact preview image
-> commit_design for a task-specific, non-renderable design contract
-> write_todo bound to the contract slide plan
-> write_page / render_page / review_page for every current page
-> review_pages for deterministic structure and facts
-> render_deck for one current full-deck overview
-> review_deck for a grounded nine-axis taste decision
-> compose_deck
```

After a context restart, exact text/image receipts are required again. The current Pi context
must also receive the exact committed design contract through `read_design` or commit it in
that context before deck review and compose.

## Frozen decisions

| Choice | Decision |
|---|---|
| Reference basis | Every fresh strict run has one selected OpenKimi `design.md` plus its matching exact preview image. |
| User style input | Color, font, ratio, and layout hints override conflicting contract rules; they never erase the reference basis. |
| Context budget | Only the selected preview is delivered in v1. The other 43 previews and examples stay out of context. |
| Design author | Pi authors the design contract and every PPTD page. The host validates and rejects; it does not select page geometry or repaint. |
| Document SSOT | YAML PPTD v2 remains the only renderable deck model. The design contract stores intent and review criteria, not elements or page copy. |
| Workflow authority | RunLedger remains the sole mutable gate authority. JSON reports, logs, contract files, and PNGs are artifacts. |
| Visual QA | Current per-page review remains mandatory and is followed by a current full-deck overview review. |
| Taste decision | A pass must ground every required axis in observations, contract rules, and current page ids. Empty self-approval is invalid. |
| Browser | Overview and `render_page` use the repository-pinned Playwright runtime at `.runtime/playwright` (`npm run setup:browser` / `dsh:slides` auto-ensure). `~/.codex/playwright-runtime` is a seed fallback only. No system-Chrome fallback. |
| Export | The taste gate does not change native editable PPTX ownership and never inserts the overview as a slide image. |

## Domain shape

```ts
type LayoutFamily =
  | "cover"
  | "toc"
  | "section-divider"
  | "editorial-asymmetric"
  | "chart-led"
  | "table-led"
  | "matrix"
  | "comparison"
  | "process-diagram"
  | "timeline"
  | "map"
  | "annotated-image"
  | "statement"
  | "modular-list"
  | "decision"
  | "conclusion"
  | "appendix";

type DesignContractDraft = Readonly<{
  audience: string;
  scene: string;
  purpose: string;
  designRead: string;
  necessaryJudgment: Readonly<{
    removeOrDemote: readonly string[];
    mustRemain: readonly string[];
    inevitableRelationships: readonly string[];
  }>;
  tasteDials: Readonly<{
    visualVariance: number;
    informationDensity: number;
    brandDistinction: number;
    typeExpressiveness: number;
    experimentRisk: number;
  }>;
  typeSystem: Readonly<{
    personality: string;
    title: string;
    body: string;
    data: string;
    mixedScript: string;
  }>;
  palette: Readonly<{
    background: string;
    text: string;
    primary: string;
    accent: string;
    neutral: string;
    areaRules: readonly string[];
  }>;
  grid: string;
  densityRules: readonly string[];
  chartGrammar: readonly string[];
  visualMemory: Readonly<{
    feature: string;
    recurrence: string;
    avoid: string;
  }>;
  referenceUse: Readonly<{
    adopt: readonly string[];
    adapt: readonly string[];
    doNotCopy: readonly string[];
  }>;
  antiDefaultLocks: readonly string[];
  slidePlan: readonly Readonly<{
    pageId: string;
    title: string;
    narrativeJob: string;
    layoutFamily: LayoutFamily;
    focalPoint: string;
  }>[];
  userOverrides: readonly Readonly<{ quote: string; effect: string }>[];
}>;

type CommittedDesignContract = Readonly<{
  schemaVersion: 1;
  briefSha256: string;
  categoryId: string;
  designSystemId: string;
  references: readonly Readonly<{
    sourceId: string;
    sha256: string;
    role: "selected-design" | "selected-preview";
  }>[];
  draft: DesignContractDraft;
  contractSha256: string;
}>;
```

The contract parser owns these invariants:

- every durable taste field is non-empty;
- palette values are valid hex colors and area rules are explicit;
- slide ids are unique and every layout family is from the closed vocabulary;
- decks with six or more slides use at least four layout families;
- one layout family may not appear on more than two adjacent slides;
- slide plans, todo ids, and `write_page.pageType` agree;
- quoted overrides occur verbatim in the brief;
- reference ids and hashes are supplied from verified host evidence, never trusted from model arguments;
- the contract contains no PPTD elements, bounds, page body copy, or exporter instructions.

## Visual evidence

The selected preview, each page raster, and the deck overview use the same checked image-content
adapter. Each payload names a subject, safe relative path, MIME type, byte hash, delivery token,
and current-context identity. The extension records emission only after it has constructed the
actual Pi image content block from bytes whose hash matches the prepared fact.

The deck overview is rendered from every current, verified page raster in todo order. It adds
only neutral gutters and `P1...Pn` labels. It is stored under `_agent/overviews/`, is never part
of PPTD or PPTX, and binds:

```text
contractSha256
+ ordered pageId/revision/pageSha256/rasterSha256/pageReviewFactId
+ structural review fact and gate versions
= deckSnapshotSha256
```

## Deck review contract

Since `structural-review-gate-v5`, the strict `review_pages` path also enforces a measurable
objective layer before the model judges anything. `TASTE_GATE_LIMITS` in `layout-qa.ts` pins
the thresholds; `reviewSkillPages({ tasteGates: true })` runs them on every taste-gated page:

- type scale: content-page titles ≥ 20pt, cover/closing titles ≥ 28pt, supporting copy ≥ 11pt
  (bottom footer/page-number chrome is exempt);
- density budget: ≤ 900 copy characters, ≤ 48 visible elements, summed element coverage ≤ 1.35
  per content page;
- chart composition: ≤ 2 visible charts per page, each ≥ 200×140;
- editorial whitespace: no text element within 12pt of the left/right slide edge.

These gates are necessary, not sufficient: a page that passes them can still fail the model's
grounded nine-axis review, and the model's verdict is never upgraded because the numbers pass.
The objective layer exists so the known failure modes of the first real deck (14pt titles, 9pt
supporting copy, three-chart pileups, edge-clung text) can never again pass structural review.

`review_deck` requires all nine axes:

1. hierarchy;
2. composition;
3. typography;
4. color;
5. evidence and chart legibility;
6. layout-family variety;
7. cross-slide rhythm;
8. reference fidelity;
9. remaining AI defaults.

Each axis has `verdict`, non-empty `observations`, current `pageIds`, and applicable
`contractRules`. The review also records a strongest page, weakest page, observed visual-memory
feature, summary, remaining-AI-default list, and revision actions.

A deck pass requires every axis to pass, an empty remaining-default list, no revision actions,
and non-empty grounded evidence. A revise decision requires named page ids and repair actions.
The host validates completeness and identity; it never changes a model judgment from revise to
pass and never repairs a page.

## Ledger and gates

New strict runs declare the taste gate version in their ledger source-pack metadata. Historical
v1 ledgers without that marker remain readable and frozen; they are not silently presented as
taste-accepted runs. Fresh strict runs cannot omit the marker.

New facts are additive and idempotent:

```text
design.reference-image-prepared / emitted
design.contract-committed / returned
deck.overview-prepared / emitted
deck.taste-review-recorded
```

Todo, overview, taste review, and compose facts bind the current contract and ordered page
snapshot. Staleness is derived from hash identity; historical facts are never deleted.

`compose_deck` for a taste-gated run requires:

1. every exact text chunk returned in the active context;
2. selected preview bytes emitted in the active context;
3. a valid committed design contract;
4. the contract committed or returned in the active context;
5. a todo bound to the contract and slide plan;
6. every current page raster emitted and visually passed in the active context;
7. every rendered-layout gate passed;
8. a passing structural review for the current page snapshot;
9. a current overview emitted in the active context;
10. a current, grounded deck taste pass;
11. no later contract/page/todo/gate-version change.

External artifact writes use an idempotent command receipt: input hash, deterministic artifact
path when available, prepared delivery token, completed result hash, and replay information.
An identical retry returns or completes the recorded effect; a conflicting retry fails closed.
Atomic temp-write and rename protect the ledger and contract/overview artifacts.

## Module map

```text
openkimi-visual-pack.ts   exact preview manifest, safe bytes, design id mapping
design-contract.ts        Pi-authored intent schema, validation, canonical artifact
deck-overview.ts          pinned-browser contact-sheet composition, no judgment
pi-image-content.ts       exact bytes -> verified Pi image content for all subjects
run-ledger.ts             sole facts, current snapshot, blockers, compose seal
pi-hands.ts               existing deep execution facade and tool semantics
pi-hands extension        TypeBox boundary, context identity, actual image emission
pi-brain.ts               one Pi session, blocker-driven resume, derived reports
PPTD v2                   unchanged deck content authority
exporter-native           unchanged editable PPTX path
```

## Synthesis decision

Candidate A is the base because it closes the gaps through existing deep seams and can land in
independent slices. Candidate B's universal `TasteRun.execute(raw)` command processor was
rejected for this checkout: it exposes transport-shaped `unknown/details` values, duplicates the
existing execution role during migration, and expands the collision surface across a heavily
modified worktree.

Three Candidate B ideas are grafted into the base:

- the active context must receive the committed contract;
- artifact-producing commands carry explicit replay receipts;
- a taste pass contains grounded observations, applicable contract rules, and an explicit
  remaining-AI-default list.

The following are deferred: supplemental previews, a separate critic model, contract amendment
UX after todo, and target-PowerPoint raster review. They are not prerequisites for restoring the
OpenKimi text/preview/overview loop and must not delay it.

## Verification

- exact manifest coverage and byte reassembly for all 44 previews;
- regression proving local style hints cannot remove selected `design.md` or preview;
- contract field, reference, override, layout-family, and non-renderable-boundary tests;
- current-context preview/contract/overview receipt tests;
- page or contract change invalidates structural, overview, taste, and compose evidence;
- empty or stale deck taste passes fail;
- pinned-runtime overview tests and explicit no-system-Chrome fallback;
- strict Pi tool-flow integration;
- full existing native test/build suite;
- one real style-hinted provider run, full overview inspection, and editable native PPTX proof.
