import type { SliceError } from "./protocol.js";
export type RateLimitResumeHooks = {
    now: () => number;
    schedule: (ms: number, fn: () => void) => {
        cancel: () => void;
    };
    resume: (sessionId: string) => void | Promise<void>;
    notePaused: (sessionId: string, fault: SliceError, wait: {
        attempt: number;
        waitMs: number;
        nextRetryAt: number;
    }) => void;
    /**
     * Resume threw — the session never restarted. Re-record the pause so the run
     * does not sit in an unowned busy state, and surface the resume failure.
     */
    resumeFailed?: (sessionId: string, fault: SliceError, error: unknown) => void;
};
/**
 * Pause the same Hub session on a temporary 429, wait, then resume.
 * Token-plan / quota exhaustion is not handled here. Does not mint a new session.
 */
export declare class RateLimitResumeController {
    private readonly hooks;
    private readonly attempts;
    private readonly pending;
    private readonly stopped;
    private readonly resuming;
    constructor(hooks: RateLimitResumeHooks);
    operatorStop(sessionId: string): void;
    onUserTurn(sessionId: string): void;
    onTurnSuccess(sessionId: string): void;
    /** True while a Retry-After timer or same-session resume is in flight. */
    isWaiting(sessionId: string): boolean;
    /** True after operatorStop until a user turn or successful turn clears it. */
    isStopped(sessionId: string): boolean;
    pauseAndResume(sessionId: string, fault: SliceError, retryAfterMs?: number): boolean;
    restore(sessionId: string, fault: SliceError, wait?: {
        attempt: number;
        nextRetryAt: number;
    }): boolean;
    private cancelWait;
    private arm;
}
//# sourceMappingURL=rate-limit-resume.d.ts.map