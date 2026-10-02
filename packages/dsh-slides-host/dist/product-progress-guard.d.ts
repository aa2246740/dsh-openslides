export declare const REPEATED_BUSINESS_REJECTION_CODE = "repeated-business-rejection";
export declare const REPEATED_INVALID_ARGS_CODE = "repeated-invalid-args";
export declare const PLANNING_NO_PROGRESS_BUDGET_CODE = "planning-no-progress-budget";
export declare const PRODUCTION_NO_PROGRESS_BUDGET_CODE = "production-no-progress-budget";
export declare const DEFAULT_REPEATED_BUSINESS_REJECTION_LIMIT = 3;
export declare const DEFAULT_REPEATED_INVALID_ARGS_LIMIT = 8;
export declare const DEFAULT_PLANNING_NO_PROGRESS_LIMIT = 64;
export declare const DEFAULT_PRODUCTION_NO_PROGRESS_LIMIT = 32;
export type ProductProgressPhase = "planning" | "production";
export type PersistentPageRevision = Readonly<{
    pageId: string;
    revision: number;
    pageSha256: string;
}>;
export type PersistentProductSnapshot = Readonly<{
    phase: ProductProgressPhase;
    pageCount: number;
    pageRevisionFingerprint: string;
    completionEvidenceFingerprint: string;
    completionEvidence: readonly string[];
    ledgerRevisions: readonly PersistentPageRevision[];
    diskPages: readonly Readonly<{
        pageId: string;
        pageSha256: string;
    }>[];
}>;
export type ProductProgressEvent = Readonly<{
    type?: string;
    data?: unknown;
}>;
export type ProductProgressConfig = Readonly<{
    repeatedBusinessRejectionLimit?: number;
    repeatedInvalidArgsLimit?: number;
    planningNoProgressLimit?: number;
    productionNoProgressLimit?: number;
    readOnlyTools?: readonly string[];
}>;
export type BusinessRejectionStreak = Readonly<{
    toolName: string;
    rejectionFingerprint: string;
    count: number;
}>;
export type InvalidArgsStreak = Readonly<{
    toolName: string;
    signature: string;
    count: number;
    /** Model step of the latest failure; siblings from that step are one decision. */
    lastStep?: number;
}>;
export type ProductProgressCheckpoint = Readonly<{
    version: 1;
    phase: ProductProgressPhase;
    phaseEpoch: string;
    pageRevisionFingerprint: string;
    completionEvidenceFingerprint: string;
    seenCompletionEvidence: readonly string[];
    noProgressCount: number;
    pendingCalls: Readonly<Record<string, string>>;
    /** Model step that issued each pending call, when the event carries one. */
    pendingCallSteps?: Readonly<Record<string, number>>;
    rejectionStreak?: BusinessRejectionStreak;
    invalidArgsStreak?: InvalidArgsStreak;
    trippedCode?: ProductProgressTrip["code"];
}>;
export type ProductProgressTrip = Readonly<{
    code: typeof REPEATED_BUSINESS_REJECTION_CODE | typeof REPEATED_INVALID_ARGS_CODE | typeof PLANNING_NO_PROGRESS_BUDGET_CODE | typeof PRODUCTION_NO_PROGRESS_BUDGET_CODE;
    detail: string;
    phase: ProductProgressPhase;
    phaseEpoch: string;
    pageRevisionFingerprint: string;
    count: number;
    limit: number;
    toolName?: string;
    rejectionFingerprint?: string;
}>;
export type ProductProgressObservation = Readonly<{
    event: ProductProgressEvent;
    phase: ProductProgressPhase;
    phaseEpoch: string;
    /**
     * Fingerprint sampled from the persisted page ledger after this event has
     * completed. A claimed tool outcome is deliberately not page progress.
     */
    pageRevisionFingerprint: string;
    /** Semantic, persistent milestones; command ids and context epochs are excluded. */
    completionEvidenceFingerprint: string;
    completionEvidence: readonly string[];
}>;
export type ProductProgressReduction = Readonly<{
    checkpoint: ProductProgressCheckpoint;
    trip?: ProductProgressTrip;
}>;
export declare const EMPTY_COMPLETION_EVIDENCE_FINGERPRINT: string;
/**
 * Creates an order-independent fingerprint from the current persisted page
 * revisions. Callers must read these rows from the durable ledger, not infer
 * them from a tool's claimed outcome.
 */
export declare function persistentPageRevisionFingerprint(revisions: readonly PersistentPageRevision[]): string;
/**
 * Returns semantic completion milestones from durable product state.
 * Context epochs, command ids, timestamps and delivery tokens are deliberately
 * absent so replaying the same read/review cannot refresh the budget.
 */
export declare function persistentCompletionEvidence(projectRoot: string): readonly string[];
/**
 * Samples both sources that make a page durable: the latest revision fact in
 * the run ledger and the page body currently readable from disk. Including
 * both prevents a tool's claimed `outcome=written` from becoming progress and
 * also detects a disk/ledger mismatch instead of silently trusting either one.
 */
export declare function readPersistentProductSnapshot(projectRoot: string): PersistentProductSnapshot;
export declare function createProductProgressCheckpoint(input: Readonly<{
    phase: ProductProgressPhase;
    phaseEpoch: string;
    pageRevisionFingerprint: string;
    completionEvidenceFingerprint?: string;
    completionEvidence?: readonly string[];
}>): ProductProgressCheckpoint;
/**
 * Pure, replayable reducer for product-level no-progress detection. It does not
 * replace the SDK INVALID_ARGS guard: those failures never enter the business
 * rejection fingerprint, but still spend the broader phase no-progress budget.
 */
export declare function reduceProductProgress(current: ProductProgressCheckpoint, observation: ProductProgressObservation, options?: ProductProgressConfig): ProductProgressReduction;
type ProductProgressSessionGuardOptions = Readonly<{
    config?: ProductProgressConfig;
    sample?: (projectRoot: string) => PersistentProductSnapshot;
}>;
/** Stateful adapter for the DSH session event stream; the decision logic above
 * remains a pure reducer and every checkpoint is JSON-serializable. */
export declare class ProductProgressSessionGuard {
    private readonly checkpoints;
    private readonly config;
    private readonly sample;
    constructor(options?: ProductProgressSessionGuardOptions);
    reset(sessionId: string): void;
    checkpoint(sessionId: string): ProductProgressCheckpoint | undefined;
    observe(sessionId: string, projectRoot: string, event: ProductProgressEvent): ProductProgressTrip | undefined;
}
export {};
//# sourceMappingURL=product-progress-guard.d.ts.map