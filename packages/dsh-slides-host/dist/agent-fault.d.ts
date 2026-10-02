import type { SliceError } from "./protocol.js";
export declare function agentErrorPath(projectRoot: string): string;
export declare function rateLimitWaitPath(projectRoot: string): string;
export declare function readAgentError(projectRoot: string): SliceError | undefined;
/** A retained fault from a previous attempt is history, not this turn's result. */
export declare function readCurrentAgentError(projectRoot: string): SliceError | undefined;
export declare function recordAgentError(projectRoot: string, error: SliceError): void;
export declare function clearAgentError(projectRoot: string): void;
/** 15s, 30s, 60s, 2m, 5m. Further attempts cap at 15m. Not a fixed 60s hammer. */
export declare const RATE_LIMIT_BACKOFF_MS: readonly [15000, 30000, 60000, 120000, 300000];
export declare const RATE_LIMIT_BACKOFF_CAP_MS: number;
export type RateLimitWaitState = {
    readonly attempt: number;
    readonly waitMs: number;
    readonly nextRetryAt: number;
    readonly code: string;
};
export declare function readRateLimitWait(projectRoot: string): RateLimitWaitState | undefined;
export declare function writeRateLimitWait(projectRoot: string, wait: RateLimitWaitState): void;
export declare function clearRateLimitWait(projectRoot: string): void;
export declare function isPauseFault(error: SliceError): boolean;
export declare function isBoundedTripFault(error: SliceError): boolean;
/**
 * Temporary provider 429 only. Token-plan / quota exhaustion will not recover
 * by waiting; those stay paused for the operator to switch model or top up.
 */
export declare function isWaitAndResumeFault(error: SliceError): boolean;
/** 401/403 empty or rejected key. Do not wait-and-retry. */
export declare function isHardProviderFault(error: SliceError): boolean;
/** MiniMax China token-plan 2056. Pause for the user; do not auto-retry. */
export declare function isMinimaxTokenPlanExhausted(detail: string): boolean;
/** CN 401/403 may switch to OpenRouter. Temporary 429 waits; 2056 does not. */
export declare function isOpenRouterFailoverFault(error: SliceError): boolean;
/** OpenRouter 401/403/unavailable may use MiniMax CN. OpenRouter 429 does not. */
export declare function isMinimaxCnFailoverFault(error: SliceError): boolean;
export declare function classifyAgentError(error: unknown): SliceError;
/**
 * Honor HTTP Retry-After / OpenRouter retry_after_seconds.
 * Returns milliseconds, capped at 15 minutes.
 */
export declare function parseRetryAfterMs(source: unknown, now?: number): number | undefined;
/**
 * Wait before resuming the same Hub session.
 * Honor Retry-After when present; otherwise 15s, 30s, 60s, 2m, 5m, cap 15m.
 * `attempt` is 0-based.
 */
export declare function rateLimitWaitMs(attempt: number, retryAfterMs?: number): number;
export declare class AgentFaults {
    private readonly pending;
    note(sessionId: string, error: SliceError, projectRoot?: string): void;
    clear(sessionId: string, projectRoot?: string): void;
    settle(sessionId: string, projectRoot: string, phaseKind: string): void;
}
//# sourceMappingURL=agent-fault.d.ts.map