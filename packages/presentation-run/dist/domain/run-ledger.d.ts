import { type CanonicalPlanPage } from "./page-plan.js";
export declare const RUN_LEDGER_REL: string;
/** Bump whenever rendered layout acceptance semantics change. */
export declare const RENDERED_LAYOUT_GATE_VERSION = "rendered-layout-gate-v8";
/** Bump whenever structural review rules change. */
export declare const STRUCTURAL_REVIEW_GATE_VERSION = "structural-review-gate-v6";
export type RunToolContext = Readonly<{
    commandId: string;
    contextEpochId: string;
}>;
export type ReferenceRequirement = Readonly<{
    sourceId: string;
    fileSha256: string;
    chunkIndexes: readonly number[];
    reason: "skill" | "pptd" | "category-guide" | "scenario" | "preset-design";
}>;
export type ReferenceChunkFact = Readonly<{
    type: "reference.chunk-returned";
    factId: string;
    at: string;
    contextEpochId: string;
    sourceId: string;
    fileSha256: string;
    chunkIndex: number;
    chunkSha256: string;
}>;
export type TodoFact = Readonly<{
    type: "todo.committed";
    factId: string;
    at: string;
    contextEpochId: string;
    todoSha256: string;
    itemCount: number;
    pageIds?: readonly string[];
    pagePlan?: readonly Readonly<{
        pageId: string;
        title: string;
        layoutFamily: string;
    }>[];
}>;
export type PageRevisionFact = Readonly<{
    type: "page.revision-committed";
    factId: string;
    at: string;
    contextEpochId: string;
    pageId: string;
    revision: number;
    pageSha256: string;
}>;
export type PageEditAuthorizationFact = Readonly<{
    type: "page.edit-authorized";
    factId: string;
    at: string;
    authorizationId: string;
    source: "editor-agent";
    pageId: string;
    revision: number;
    pageSha256: string;
    expiresAt: string;
}>;
export type PageEditAuthorizationInput = Readonly<{
    authorizationId: string;
    pageId: string;
    revision: number;
    pageSha256: string;
    ttlMs?: number;
}>;
export type PageLayoutIssue = Readonly<{
    code: string;
    severity: "error" | "warning";
    elementIds: readonly string[];
    detail: string;
}>;
export type RasterFact = Readonly<{
    type: "page.raster-committed";
    factId: string;
    at: string;
    pageId: string;
    revision: number;
    pageSha256: string;
    rasterSha256: string;
    src: string;
    width: number;
    height: number;
    layoutGateVersion?: string;
    layoutStatus: "pass" | "fail" | "unavailable";
    layoutIssues: readonly PageLayoutIssue[];
}>;
export type ImagePreparedFact = Readonly<{
    type: "page.image-result-prepared";
    factId: string;
    at: string;
    contextEpochId: string;
    pageId: string;
    revision: number;
    pageSha256: string;
    rasterSha256: string;
    deliveryToken: string;
}>;
export type ImageEmittedFact = Readonly<{
    type: "page.image-content-emitted";
    factId: string;
    at: string;
    contextEpochId: string;
    commandId: string;
    pageId: string;
    revision: number;
    pageSha256: string;
    rasterSha256: string;
    deliveryToken: string;
}>;
export type VisualReviewFact = Readonly<{
    type: "page.visual-review-recorded";
    factId: string;
    at: string;
    contextEpochId: string;
    pageId: string;
    revision: number;
    pageSha256: string;
    rasterSha256: string;
    deliveryToken: string;
    verdict: "pass" | "revise";
    issues: readonly string[];
}>;
export type StructuralReviewFact = Readonly<{
    type: "deck.structural-review-recorded";
    factId: string;
    at: string;
    reviewGateVersion?: string;
    pageRevisions: Readonly<Record<string, string>>;
    ok: boolean;
    issues: readonly string[];
}>;
export type DeckComposedFact = Readonly<{
    type: "deck.composed";
    factId: string;
    at: string;
    contextEpochId: string;
    title: string;
    deckSha256: string;
    pageRevisions: Readonly<Record<string, string>>;
}>;
export type WebSearchExecutedFact = Readonly<{
    type: "web-search.executed";
    factId: string;
    at: string;
    contextEpochId: string;
    commandId: string;
    queries: readonly string[];
    factCount: number;
    source: "pi-xai-hosted";
    ok: true;
}>;
export type ExportSucceededFact = Readonly<{
    type: "export.succeeded";
    factId: string;
    at: string;
    contextEpochId: string;
    commandId: string;
    artifactPath: string;
    artifactSha256: string;
    artifactBytes: number;
    reportPath: string;
    reportSha256: string;
    slideCount: number;
    materialFingerprint: string;
    producer: "agent-tool";
}>;
export type RunFact = ReferenceChunkFact | TodoFact | PageRevisionFact | PageEditAuthorizationFact | RasterFact | ImagePreparedFact | ImageEmittedFact | VisualReviewFact | StructuralReviewFact | DeckComposedFact | WebSearchExecutedFact | ExportSucceededFact;
export type RunLedgerV1 = Readonly<{
    schemaVersion: 1;
    runId: string;
    createdAt: string;
    updatedAt: string;
    sourcePack: Readonly<{
        manifestSha256: string;
        requirementsId: string;
        requirements: readonly ReferenceRequirement[];
        /** Immutable production acceptance policy. Optional only for pre-policy ledgers. */
        executionPolicy?: Readonly<{
            currentRenderedLayoutRequired: boolean;
            structuralReviewRequired: boolean;
        }>;
    }>;
    facts: readonly RunFact[];
}>;
export type PageEvidenceStatus = Readonly<{
    pageId: string;
    revision: number;
    pageSha256: string;
    raster: boolean;
    imageEmitted: boolean;
    visualReview: "pass" | "revise" | "missing";
    layout: "pass" | "fail" | "unavailable" | "missing";
}>;
export type RunLedgerInspection = Readonly<{
    initialized: boolean;
    contextEpochId?: string;
    referencesComplete: boolean;
    missingReferenceChunks: readonly {
        sourceId: string;
        chunkIndex: number;
    }[];
    todoCount: number;
    pages: readonly PageEvidenceStatus[];
    structuralReview: "pass" | "fail" | "missing";
    composeReady: boolean;
    composeBlockers: readonly string[];
    composed: boolean;
}>;
export declare function stableSha256(raw: unknown): string;
export declare function bytesSha256(bytes: Buffer): string;
export declare function readRunLedger(root: string): RunLedgerV1 | undefined;
export declare function ensureRunLedgerExecutionPolicy(root: string, executionPolicy: NonNullable<RunLedgerV1["sourcePack"]["executionPolicy"]>): RunLedgerV1 | undefined;
export declare function ensureRunLedger(root: string, sourcePack: RunLedgerV1["sourcePack"]): RunLedgerV1;
export declare function recordReferenceChunk(root: string, context: RunToolContext, input: Omit<ReferenceChunkFact, "type" | "factId" | "at" | "contextEpochId">): void;
export declare function recordTodo(root: string, context: RunToolContext, items: readonly unknown[]): readonly CanonicalPlanPage[];
export declare function recordPageRevision(root: string, context: RunToolContext, pageId: string, page: unknown): PageRevisionFact;
export declare function currentPageRevision(root: string, pageId: string): PageRevisionFact | undefined;
/**
 * Authorize one editor-originated Agent rewrite of an exact page revision.
 * The grant is deliberately short-lived and revision-bound: after the first
 * successful write changes the revision, the same grant cannot unlock another
 * write. Generation-time repaint protection therefore remains intact.
 */
export declare function authorizePageEdits(root: string, inputs: readonly PageEditAuthorizationInput[]): readonly PageEditAuthorizationFact[];
export declare function authorizePageEdit(root: string, input: PageEditAuthorizationInput): PageEditAuthorizationFact;
export type PageRewriteGate = Readonly<{
    allowed: boolean;
    pageId: string;
    revision?: number;
    reason: string;
}>;
export declare function pageRewriteGate(root: string, pageId: string): PageRewriteGate;
export declare function recordRaster(root: string, page: PageRevisionFact, input: Readonly<{
    bytes: Buffer;
    src: string;
    width: number;
    height: number;
    layoutStatus: RasterFact["layoutStatus"];
    layoutIssues: readonly PageLayoutIssue[];
}>): {
    fact: RasterFact;
    deliveryToken: string;
};
export declare function recordImagePrepared(root: string, context: RunToolContext, raster: RasterFact, deliveryToken: string): ImagePreparedFact;
export declare function recordImageEmitted(root: string, context: RunToolContext, deliveryToken: string): ImageEmittedFact;
export declare function recordVisualReview(root: string, context: RunToolContext, input: Readonly<{
    pageId: string;
    revision: number;
    deliveryToken: string;
    verdict: "pass" | "revise";
    issues: readonly string[];
}>, env?: NodeJS.ProcessEnv): VisualReviewFact;
export declare function recordStructuralReview(root: string, ok: boolean, issues: readonly string[]): StructuralReviewFact;
/** True when a vision reviewer is configured and a current page still lacks an image-backed pass. */
export declare function currentVisualReviewsMissing(root: string, pageCount: number, env?: NodeJS.ProcessEnv): boolean;
export declare function inspectRunLedger(root: string, contextEpochId?: string, env?: NodeJS.ProcessEnv, ledgerOverride?: RunLedgerV1): RunLedgerInspection;
export declare function requireReferencesComplete(root: string, contextEpochId: string): void;
export declare function readCommittedPagePlan(root: string): readonly CanonicalPlanPage[];
export declare function requireTodo(root: string): void;
export declare function requireComposeReady(root: string, contextEpochId: string, env?: NodeJS.ProcessEnv): RunLedgerInspection;
export declare function recordWebSearchExecuted(root: string, context: RunToolContext, input: {
    readonly queries: readonly string[];
    readonly factCount: number;
}): WebSearchExecutedFact;
export declare function recordCompose(root: string, context: RunToolContext, title: string): DeckComposedFact;
export declare function recordExportSucceeded(root: string, context: RunToolContext, input: Omit<ExportSucceededFact, "type" | "factId" | "at" | "contextEpochId">): ExportSucceededFact;
export declare function contextFromToolArgs(args: Record<string, unknown>): {
    context: RunToolContext;
    args: Record<string, unknown>;
};
//# sourceMappingURL=run-ledger.d.ts.map