export declare const AGENT_TRACE_REL: string;
export declare const AGENT_TRACE_DETAIL_MAX = 8192;
export type AgentTraceKind = "message" | "reasoning" | "tool" | "result" | "turn"
/** Read compatibility for trace rows written before the v2 projection. */
 | "think";
export type AgentTraceStatus = "running" | "complete" | "failed" | "cancelled" | "needs-attention";
export type AgentTraceRow = {
    readonly id: string;
    readonly at: string;
    readonly seq?: number;
    readonly turn?: number;
    readonly step?: number;
    readonly kind: AgentTraceKind;
    readonly status: AgentTraceStatus;
    readonly name?: string;
    readonly callId?: string;
    readonly detail?: string;
    readonly truncated?: true;
    /** Deltas append to the row sharing this stable id; snapshots replace it. */
    readonly detailMode?: "append" | "replace";
    readonly pageId?: string;
    /** Transient native stream cursor, never confused with durable Session seq. */
    readonly stream?: {
        readonly attemptId: string;
        readonly revision: number;
        readonly index: number;
    };
    /** Legacy v1 aliases retained in the reader contract, never written by v2. */
    readonly text?: string;
    readonly ok?: boolean;
};
type SessionEventLike = {
    readonly type?: string;
    readonly seq?: number;
    readonly time?: number;
    readonly data?: unknown;
};
type PublicDetail = {
    detail?: string;
    truncated?: true;
};
export declare function redactText(value: string): string;
/** Same public-text boundary for live snapshots and durable assistant blocks. */
export declare function publicAssistantDetail(text: string): PublicDetail;
/** Project one exact committed DSH Session event into display-safe trace rows. */
export declare function traceRowsFromSessionEvent(event: SessionEventLike): AgentTraceRow[];
export declare function appendAgentTrace(projectRoot: string, rows: readonly AgentTraceRow[]): void;
export {};
//# sourceMappingURL=agent-trace.d.ts.map