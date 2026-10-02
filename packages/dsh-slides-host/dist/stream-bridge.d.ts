import type { AssistantStreamFrame } from "@deepseek-ai/dsh-agent";
import { type AgentTraceRow } from "./agent-trace.js";
/** Actual model deltas become idempotent, short-interval text snapshots.
 * No synthetic typing, provider monkey-patch, or inference from a busy flag.
 * Snapshots also make late subscription/reconnection safe: no missing prefix.
 */
export declare class AgentStreamBridge {
    private readonly publish;
    private readonly flushMs;
    private readonly attempts;
    private timer;
    constructor(publish: (sessionId: string, rows: readonly AgentTraceRow[]) => void, flushMs?: number);
    handleFrame(sessionId: string, frame: AssistantStreamFrame): void;
    /** Durable settlement wins over live text and cannot be followed by delayed deltas. */
    settle(sessionId: string, rows: readonly AgentTraceRow[]): AgentTraceRow[];
    flush(sessionId?: string): void;
    disposeSession(sessionId: string): void;
    dispose(): void;
    private closeAttempt;
}
//# sourceMappingURL=stream-bridge.d.ts.map