import type { SliceError } from "./protocol.js";
export declare class SessionTransitionConflict extends Error {
    readonly status: 409;
    readonly code: string;
    constructor(code: string, message: string);
}
export type AttemptRecord = Readonly<{
    attemptId: string;
    startedAt: string;
    recoveringFrom?: string;
}>;
export type ModelSelectionInput = Readonly<{
    provider: string;
    model: string;
    reasoningEffort?: string;
}>;
export declare function attemptPath(projectRoot: string): string;
export declare function readAttempt(projectRoot: string): AttemptRecord | undefined;
export declare function beginAttempt(projectRoot: string, previousFault?: SliceError): AttemptRecord;
export declare function parseModelSelection(raw: unknown): ModelSelectionInput | undefined;
export declare function parseExpectedAttemptId(raw: unknown): string | undefined;
export declare function assertExpectedAttempt(projectRoot: string | undefined, expected?: string): void;
export declare function withSessionTransition<T>(sessionId: string, work: () => Promise<T>): Promise<T>;
export declare function markFaultRecovering(projectRoot: string): SliceError | undefined;
//# sourceMappingURL=session-transition.d.ts.map