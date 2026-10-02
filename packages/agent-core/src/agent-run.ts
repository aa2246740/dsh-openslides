/**
 * AgentRun state machine — owns status, steps, event fan-out, cancel, result.
 */

import type { Deck } from "@open-slidestudio/pptd";
import { nowIso, type ToolEvent, type ToolEventListener } from "./events.js";
import type { LlmProvider } from "./provider.js";
import { resolveRunMode } from "./provider.js";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRunStatus,
  AgentStep,
  CreateAgentRunOptions,
} from "./types.js";
import { isTerminalStatus } from "./types.js";
import { abortError, createId, isAbortError } from "./util.js";

export class AgentRun {
  readonly id: string;
  readonly input: AgentRunInput;
  readonly provider: LlmProvider;
  readonly mode: "generate" | "refine" | "pin-batch";

  private _status: AgentRunStatus = "draft";
  private _steps: AgentStep[] = [];
  private _result: AgentRunResult | undefined;
  private _error: string | undefined;
  private _deck: Deck | undefined;
  private readonly listeners = new Set<ToolEventListener>();
  private readonly eventLog: ToolEvent[] = [];
  private readonly abortController: AbortController;
  private externalSignal?: AbortSignal;
  private onExternalAbort?: () => void;
  private runPromise: Promise<AgentRunResult> | undefined;
  private resolveDone!: (result: AgentRunResult) => void;
  private rejectDone!: (err: Error) => void;
  private readonly donePromise: Promise<AgentRunResult>;

  constructor(
    input: AgentRunInput,
    provider: LlmProvider,
    options: { signal?: AbortSignal; id?: string } = {},
  ) {
    this.id = options.id ?? input.requestId ?? createId("run");
    this.input = input;
    this.provider = provider;
    this.mode = resolveRunMode(input);
    this.abortController = new AbortController();
    this.externalSignal = options.signal;

    this.donePromise = new Promise<AgentRunResult>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    // Prevent unhandled rejection if nobody awaits
    this.donePromise.catch(() => undefined);
  }

  get status(): AgentRunStatus {
    return this._status;
  }

  get steps(): readonly AgentStep[] {
    return this._steps;
  }

  get result(): AgentRunResult | undefined {
    return this._result;
  }

  get error(): string | undefined {
    return this._error;
  }

  get deck(): Deck | undefined {
    return this._deck ?? this._result?.deck;
  }

  get events(): readonly ToolEvent[] {
    return this.eventLog;
  }

  /** Subscribe to live tool events. Returns unsubscribe. */
  subscribe(listener: ToolEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Promise that resolves with the final result or rejects on failure/cancel. */
  wait(): Promise<AgentRunResult> {
    return this.donePromise;
  }

  /** Start the provider pipeline (idempotent). */
  start(): Promise<AgentRunResult> {
    if (this.runPromise) return this.runPromise;
    if (isTerminalStatus(this._status) && this._status !== "draft") {
      if (this._result) return Promise.resolve(this._result);
      return Promise.reject(new Error(this._error ?? `Run already ${this._status}`));
    }

    this.runPromise = this.execute();
    // Absorb when auto-started without awaiting start() (wait() is the public await surface)
    this.runPromise.catch(() => undefined);
    return this.runPromise;
  }

  cancel(reason = "Cancelled by user"): void {
    if (isTerminalStatus(this._status) && this._status !== "needs_input") {
      return;
    }
    this.abortController.abort(reason);
  }

  private async execute(): Promise<AgentRunResult> {
    this.bindExternalSignal();
    this.setStatus("queued");

    const signal = this.abortController.signal;
    const ctx = {
      runId: this.id,
      input: this.input,
      signal,
      mode: this.mode,
      priorDeck: this.input.baseDeck,
    };

    try {
      for await (const event of this.provider.run(ctx)) {
        if (signal.aborted) {
          throw abortError();
        }
        this.handleEvent(event);
      }

      if (!this._result) {
        throw new Error("Provider finished without a result");
      }

      // Attach authoritative steps to result
      this._result = {
        ...this._result,
        steps: this._steps.map((s) => ({ ...s })),
      };

      if (this._status !== "ready") {
        this.setStatus("ready");
      }

      this.resolveDone(this._result);
      return this._result;
    } catch (err) {
      if (isAbortError(err) || signal.aborted) {
        this.setStatus("cancelled");
        this._error = "Agent run cancelled";
        this.emit({
          type: "error",
          message: this._error,
          code: "cancelled",
          at: nowIso(),
        });
        const cancelErr = abortError();
        this.rejectDone(cancelErr);
        throw cancelErr;
      }

      const message = err instanceof Error ? err.message : String(err);
      this._error = message;
      this.setStatus("failed");
      this.emit({
        type: "error",
        message,
        code: "provider_error",
        at: nowIso(),
      });
      const failErr = err instanceof Error ? err : new Error(message);
      this.rejectDone(failErr);
      throw failErr;
    } finally {
      this.unbindExternalSignal();
    }
  }

  private handleEvent(event: ToolEvent): void {
    switch (event.type) {
      case "run_status":
        this.setStatus(event.status, false);
        break;
      case "tool_started": {
        const step: AgentStep = {
          id: event.stepId,
          tool: event.tool,
          label: event.label,
          target: event.target,
          status: "running",
          startedAt: event.at,
        };
        this._steps = [...this._steps, step];
        this.emit({ type: "step_snapshot", steps: this._steps, at: event.at });
        break;
      }
      case "tool_progress": {
        this._steps = this._steps.map((s) =>
          s.id === event.stepId ? { ...s, summary: event.message } : s,
        );
        break;
      }
      case "tool_completed": {
        this._steps = this._steps.map((s) =>
          s.id === event.stepId
            ? {
                ...s,
                status: "completed",
                summary: event.summary,
                completedAt: event.at,
                durationMs: event.durationMs,
              }
            : s,
        );
        this.emit({ type: "step_snapshot", steps: this._steps, at: event.at });
        break;
      }
      case "tool_failed": {
        this._steps = this._steps.map((s) =>
          s.id === event.stepId
            ? {
                ...s,
                status: "failed",
                error: event.error,
                completedAt: event.at,
                durationMs: event.durationMs,
              }
            : s,
        );
        this.emit({ type: "step_snapshot", steps: this._steps, at: event.at });
        break;
      }
      case "deck_ready":
        this._deck = event.deck;
        break;
      case "done":
        this._result = event.result;
        this._deck = event.result.deck;
        break;
      case "needs_input":
        this.setStatus("needs_input", false);
        break;
      default:
        break;
    }

    this.emit(event);
  }

  private setStatus(status: AgentRunStatus, emitEvent = true): void {
    if (this._status === status) return;
    // Do not regress out of terminal states except draft→*
    if (isTerminalStatus(this._status) && this._status !== "draft") {
      return;
    }
    this._status = status;
    if (emitEvent) {
      this.emit({ type: "run_status", status, at: nowIso() });
    }
  }

  private emit(event: ToolEvent): void {
    this.eventLog.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the run
      }
    }
  }

  private bindExternalSignal(): void {
    if (!this.externalSignal) return;
    if (this.externalSignal.aborted) {
      this.abortController.abort();
      return;
    }
    this.onExternalAbort = () => this.abortController.abort();
    this.externalSignal.addEventListener("abort", this.onExternalAbort, {
      once: true,
    });
  }

  private unbindExternalSignal(): void {
    if (this.externalSignal && this.onExternalAbort) {
      this.externalSignal.removeEventListener("abort", this.onExternalAbort);
    }
  }
}

export function createAgentRunInternal(
  input: AgentRunInput,
  provider: LlmProvider,
  options: CreateAgentRunOptions = {},
): AgentRun {
  return new AgentRun(input, provider, {
    signal: options.signal,
    id: input.requestId,
  });
}
