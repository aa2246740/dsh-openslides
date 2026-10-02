import { isWaitAndResumeFault, rateLimitWaitMs } from "./agent-fault.js";
/**
 * Pause the same Hub session on a temporary 429, wait, then resume.
 * Token-plan / quota exhaustion is not handled here. Does not mint a new session.
 */
export class RateLimitResumeController {
    hooks;
    attempts = new Map();
    pending = new Map();
    stopped = new Set();
    resuming = new Set();
    constructor(hooks) {
        this.hooks = hooks;
    }
    operatorStop(sessionId) {
        this.stopped.add(sessionId);
        this.cancelWait(sessionId);
    }
    onUserTurn(sessionId) {
        this.stopped.delete(sessionId);
        this.cancelWait(sessionId);
    }
    onTurnSuccess(sessionId) {
        this.attempts.delete(sessionId);
        this.stopped.delete(sessionId);
        this.cancelWait(sessionId);
    }
    /** True while a Retry-After timer or same-session resume is in flight. */
    isWaiting(sessionId) {
        return this.pending.has(sessionId) || this.resuming.has(sessionId);
    }
    /** True after operatorStop until a user turn or successful turn clears it. */
    isStopped(sessionId) {
        return this.stopped.has(sessionId);
    }
    pauseAndResume(sessionId, fault, retryAfterMs) {
        if (!isWaitAndResumeFault(fault)) {
            this.cancelWait(sessionId);
            this.attempts.delete(sessionId);
            return false;
        }
        if (this.stopped.has(sessionId))
            return true;
        if (this.pending.has(sessionId) || this.resuming.has(sessionId))
            return true;
        const attempt = this.attempts.get(sessionId) ?? 0;
        const waitMs = rateLimitWaitMs(attempt, retryAfterMs);
        const nextAttempt = attempt + 1;
        this.attempts.set(sessionId, nextAttempt);
        this.arm(sessionId, waitMs, fault, nextAttempt);
        return true;
    }
    restore(sessionId, fault, wait) {
        if (!isWaitAndResumeFault(fault)) {
            this.cancelWait(sessionId);
            this.attempts.delete(sessionId);
            return false;
        }
        if (this.stopped.has(sessionId) || this.pending.has(sessionId))
            return true;
        if (wait?.attempt && wait.attempt > 0)
            this.attempts.set(sessionId, wait.attempt);
        const remaining = wait ? Math.max(0, wait.nextRetryAt - this.hooks.now()) : 0;
        const attempt = this.attempts.get(sessionId) ?? 1;
        this.arm(sessionId, remaining, fault, attempt);
        return true;
    }
    cancelWait(sessionId) {
        this.pending.get(sessionId)?.cancel();
        this.pending.delete(sessionId);
    }
    arm(sessionId, waitMs, fault, attempt) {
        const nextRetryAt = this.hooks.now() + waitMs;
        this.hooks.notePaused(sessionId, fault, { attempt, waitMs, nextRetryAt });
        const handle = this.hooks.schedule(waitMs, () => {
            this.pending.delete(sessionId);
            if (this.stopped.has(sessionId))
                return;
            this.resuming.add(sessionId);
            const done = () => this.resuming.delete(sessionId);
            try {
                const out = this.hooks.resume(sessionId);
                if (out && typeof out.then === "function") {
                    void out
                        .catch((error) => this.hooks.resumeFailed?.(sessionId, fault, error))
                        .finally(done);
                }
                else {
                    done();
                }
            }
            catch (error) {
                this.hooks.resumeFailed?.(sessionId, fault, error);
                done();
            }
        });
        this.pending.set(sessionId, handle);
    }
}
//# sourceMappingURL=rate-limit-resume.js.map