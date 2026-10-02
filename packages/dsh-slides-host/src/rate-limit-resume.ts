import type { SliceError } from "./protocol.js";
import { isWaitAndResumeFault, rateLimitWaitMs } from "./agent-fault.js";

export type RateLimitResumeHooks = {
  now: () => number;
  schedule: (ms: number, fn: () => void) => { cancel: () => void };
  resume: (sessionId: string) => void | Promise<void>;
  notePaused: (
    sessionId: string,
    fault: SliceError,
    wait: { attempt: number; waitMs: number; nextRetryAt: number },
  ) => void;
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
export class RateLimitResumeController {
  private readonly attempts = new Map<string, number>();
  private readonly pending = new Map<string, { cancel: () => void }>();
  private readonly stopped = new Set<string>();
  private readonly resuming = new Set<string>();

  constructor(private readonly hooks: RateLimitResumeHooks) {}

  operatorStop(sessionId: string): void {
    this.stopped.add(sessionId);
    this.cancelWait(sessionId);
  }

  onUserTurn(sessionId: string): void {
    this.stopped.delete(sessionId);
    this.cancelWait(sessionId);
  }

  onTurnSuccess(sessionId: string): void {
    this.attempts.delete(sessionId);
    this.stopped.delete(sessionId);
    this.cancelWait(sessionId);
  }

  /** True while a Retry-After timer or same-session resume is in flight. */
  isWaiting(sessionId: string): boolean {
    return this.pending.has(sessionId) || this.resuming.has(sessionId);
  }

  /** True after operatorStop until a user turn or successful turn clears it. */
  isStopped(sessionId: string): boolean {
    return this.stopped.has(sessionId);
  }

  pauseAndResume(
    sessionId: string,
    fault: SliceError,
    retryAfterMs?: number,
  ): boolean {
    if (!isWaitAndResumeFault(fault)) {
      this.cancelWait(sessionId);
      this.attempts.delete(sessionId);
      return false;
    }
    if (this.stopped.has(sessionId)) return true;
    if (this.pending.has(sessionId) || this.resuming.has(sessionId)) return true;
    const attempt = this.attempts.get(sessionId) ?? 0;
    const waitMs = rateLimitWaitMs(attempt, retryAfterMs);
    const nextAttempt = attempt + 1;
    this.attempts.set(sessionId, nextAttempt);
    this.arm(sessionId, waitMs, fault, nextAttempt);
    return true;
  }

  restore(
    sessionId: string,
    fault: SliceError,
    wait?: { attempt: number; nextRetryAt: number },
  ): boolean {
    if (!isWaitAndResumeFault(fault)) {
      this.cancelWait(sessionId);
      this.attempts.delete(sessionId);
      return false;
    }
    if (this.stopped.has(sessionId) || this.pending.has(sessionId)) return true;
    if (wait?.attempt && wait.attempt > 0) this.attempts.set(sessionId, wait.attempt);
    const remaining = wait ? Math.max(0, wait.nextRetryAt - this.hooks.now()) : 0;
    const attempt = this.attempts.get(sessionId) ?? 1;
    this.arm(sessionId, remaining, fault, attempt);
    return true;
  }

  private cancelWait(sessionId: string): void {
    this.pending.get(sessionId)?.cancel();
    this.pending.delete(sessionId);
  }

  private arm(
    sessionId: string,
    waitMs: number,
    fault: SliceError,
    attempt: number,
  ): void {
    const nextRetryAt = this.hooks.now() + waitMs;
    this.hooks.notePaused(sessionId, fault, { attempt, waitMs, nextRetryAt });
    const handle = this.hooks.schedule(waitMs, () => {
      this.pending.delete(sessionId);
      if (this.stopped.has(sessionId)) return;
      this.resuming.add(sessionId);
      const done = () => this.resuming.delete(sessionId);
      try {
        const out = this.hooks.resume(sessionId);
        if (out && typeof (out as Promise<void>).then === "function") {
          void (out as Promise<void>)
            .catch((error) => this.hooks.resumeFailed?.(sessionId, fault, error))
            .finally(done);
        } else {
          done();
        }
      } catch (error) {
        this.hooks.resumeFailed?.(sessionId, fault, error);
        done();
      }
    });
    this.pending.set(sessionId, handle);
  }
}
