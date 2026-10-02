import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentTraceRow } from "./agent-trace.js";
export type SessionLiveEnvelope = {
    version: 1;
    sessionId: string;
    epoch: string;
    cursor: number;
    snapshot?: true;
    rows: readonly AgentTraceRow[];
};
/** Publish scoped public facts; live text snapshots are retained for late viewers. */
export declare function publishSessionLive(sessionId: string, rows: readonly AgentTraceRow[]): void;
export declare function sessionLiveSubscriberCount(sessionId: string): number;
/** Caller must authorize the product session before attaching. */
export declare function attachSessionLive(sessionId: string, req: IncomingMessage, res: ServerResponse): void;
export declare function closeSessionLive(): void;
//# sourceMappingURL=session-live.d.ts.map