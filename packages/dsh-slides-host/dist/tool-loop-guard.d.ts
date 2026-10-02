export declare const TOOL_INVALID_ARGS_LOOP_CODE = "tool-invalid-args-loop";
export declare const TOOL_INVALID_ARGS_LIMIT = 3;
type ToolLoopEvent = {
    readonly type?: string;
    readonly data?: unknown;
};
export type ToolLoopTrip = {
    readonly code: typeof TOOL_INVALID_ARGS_LOOP_CODE;
    readonly detail: string;
    readonly toolName: string;
    readonly count: number;
};
/**
 * Counts only consecutive equivalent SDK validation failures for one tool in
 * one turn. Array indices and duplicate copies of the same issue are ignored;
 * a new validation category resets the short-loop streak. A retry is a failure
 * in a later step — the model emitted a new message after seeing the previous
 * failure; all calls inside one step are a single decision and share a count.
 * It has no timers or awaits, so callers can synchronously cancel the active
 * Agent from the session/event listener without waiting on that same driver.
 */
export declare class ToolInvalidArgsLoopGuard {
    private readonly states;
    reset(sessionId: string): void;
    observe(sessionId: string, event: ToolLoopEvent): ToolLoopTrip | undefined;
}
export {};
//# sourceMappingURL=tool-loop-guard.d.ts.map