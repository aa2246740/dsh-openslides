import { type RunLedgerInspection, type RunLedgerV1 } from "./domain/run-ledger.js";
import type { ExecutionProjection } from "./types.js";
/** A persisted, presentation-safe event for the generation-history UI. */
export type GenerationActivityEvent = Readonly<{
    id: string;
    type: string;
    at: string;
    label: string;
    status: "running" | "complete" | "failed" | "cancelled" | "needs-attention";
    pageId?: string;
    revision?: number;
    detail?: string;
    truncated?: boolean;
    kind?: "message" | "reasoning" | "tool" | "result" | "turn" | "ledger" | "think";
    name?: string;
    callId?: string;
    turn?: number;
    step?: number;
}>;
export type GenerationActivityStage = Readonly<{
    id: "plan" | "pages" | "review" | "compose";
    label: string;
    status: "pending" | "active" | "complete" | "needs-attention";
    detail: string;
}>;
export type GenerationActivity = Readonly<{
    /** Derived only from durable project artifacts; never an in-memory agent claim. */
    phase: "awaiting-project" | "planning" | "generating" | "reviewing" | "complete";
    updatedAt?: string;
    stages: readonly GenerationActivityStage[];
    events: readonly GenerationActivityEvent[];
}>;
export type GenerationActivitySnapshot = Readonly<{
    inspection: RunLedgerInspection;
    activity: GenerationActivity;
    execution?: ExecutionProjection;
}>;
export declare function generationActivityFromLedger(ledger: RunLedgerV1 | undefined, inspection: RunLedgerInspection): GenerationActivity;
/** Reads only durable artifacts, so completed runs remain replayable after a server restart. */
export declare function inspectGenerationActivity(root: string): GenerationActivity;
/** Fold append-only v2 deltas/snapshots, while still accepting v1 trace rows. */
export declare function generationActivityEventsFromTraceRows(rows: readonly unknown[]): GenerationActivityEvent[];
/** Hands-log + session trace, so 生成历程 shows thinking and tool calls, not only ledger labels. */
export declare function readProduceTraceEvents(root: string): GenerationActivityEvent[];
export declare function inspectGenerationActivitySnapshot(root: string): GenerationActivitySnapshot;
//# sourceMappingURL=generation-activity.d.ts.map