import type { AssistantStreamFrame } from "@deepseek-ai/dsh-agent";
import { publicAssistantDetail, type AgentTraceRow } from "./agent-trace.js";

/** One attempt belongs to one session. Frame revision is an ordering cursor, NOT identity. */
type Attempt = {
  id: string;
  turn: number;
  step: number;
  revision: number;
  nextIndex: number;
  rows: Map<string, AgentTraceRow>;
  texts: Map<string, string>;
  dirty: Set<string>;
};

/** Actual model deltas become idempotent, short-interval text snapshots.
 * No synthetic typing, provider monkey-patch, or inference from a busy flag.
 * Snapshots also make late subscription/reconnection safe: no missing prefix.
 */
export class AgentStreamBridge {
  private readonly attempts = new Map<string, Attempt>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly publish: (sessionId: string, rows: readonly AgentTraceRow[]) => void,
    private readonly flushMs = 40,
  ) {}

  handleFrame(sessionId: string, frame: AssistantStreamFrame): void {
    if (frame.type === "start") {
      this.closeAttempt(sessionId, "cancelled");
      this.attempts.set(sessionId, {
        id: frame.attemptId, turn: frame.turn, step: frame.step,
        revision: frame.revision, nextIndex: 0,
        rows: new Map(), texts: new Map(), dirty: new Set(),
      });
      return;
    }
    const attempt = this.attempts.get(sessionId);
    if (!attempt || attempt.id !== frame.attemptId || frame.revision <= attempt.revision) return;
    // A gap means the prefix is untrustworthy. End the partial rather than
    // append unrelated text; durable session settlement remains the fallback.
    if (frame.revision !== attempt.revision + 1 || frame.index !== attempt.nextIndex) {
      this.closeAttempt(sessionId, "cancelled");
      return;
    }
    attempt.revision = frame.revision;
    if (frame.type === "end") {
      const status = frame.outcome.kind === "committed" && frame.outcome.eventType === "assistant/message"
        ? "complete" : "cancelled";
      this.closeAttempt(sessionId, status);
      return;
    }
    attempt.nextIndex += 1; // Includes tool/usage/block frames, even when not rendered here.
    const chunk = frame.chunk;
    const delta = chunk.type === "reasoning-delta" || chunk.type === "text-delta";
    const end = chunk.type === "block-end" && (chunk.block.type === "reasoning" || chunk.block.type === "text");
    if (!delta && !end) return;
    const kind = delta
      ? chunk.type === "reasoning-delta" ? "reasoning" : "message"
      : chunk.type === "block-end" && chunk.block.type === "reasoning" ? "reasoning" : "message";
    const blockIndex = "index" in chunk ? chunk.index : 0;
    const id = `assistant:${attempt.turn}:${attempt.step}:${blockIndex}:${kind}`;
    const content = delta ? chunk.text : chunk.type === "block-end" && "text" in chunk.block ? chunk.block.text : "";
    const text = delta ? `${attempt.texts.get(id) ?? ""}${content}` : content;
    attempt.texts.set(id, text);
    const prior = attempt.rows.get(id);
    attempt.rows.set(id, {
      id, at: prior?.at ?? new Date(frame.time).toISOString(), turn: attempt.turn, step: attempt.step,
      kind, status: delta ? "running" : "complete", detailMode: "replace",
      ...publicAssistantDetail(text),
      stream: { attemptId: attempt.id, revision: frame.revision, index: frame.index },
    });
    attempt.dirty.add(id);
    if (!this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.flushMs);
      this.timer.unref?.();
    }
  }

  /** Durable settlement wins over live text and cannot be followed by delayed deltas. */
  settle(sessionId: string, rows: readonly AgentTraceRow[]): AgentTraceRow[] {
    this.flush(sessionId);
    const attempt = this.attempts.get(sessionId);
    if (!attempt) return [...rows];
    return rows.map(row => {
      if ((row.kind !== "reasoning" && row.kind !== "message") || row.turn !== attempt.turn || row.step !== attempt.step) return row;
      const direct = attempt.rows.get(row.id);
      const candidates = [...attempt.rows.values()].filter(live => live.kind === row.kind);
      const prior = direct ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!prior) return row;
      const settled = { ...prior, ...row, id: prior.id, at: prior.at, stream: prior.stream };
      attempt.rows.set(prior.id, settled);
      attempt.dirty.delete(prior.id);
      return settled;
    });
  }

  flush(sessionId?: string): void {
    for (const [id, attempt] of this.attempts) {
      if (sessionId && sessionId !== id) continue;
      const rows = [...attempt.dirty].map(key => attempt.rows.get(key)!).filter(Boolean);
      attempt.dirty.clear();
      if (rows.length) this.publish(id, rows);
    }
  }

  disposeSession(sessionId: string): void { this.closeAttempt(sessionId, "cancelled"); }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const id of [...this.attempts.keys()]) this.closeAttempt(id, "cancelled");
  }

  private closeAttempt(sessionId: string, status: "complete" | "cancelled"): void {
    const attempt = this.attempts.get(sessionId);
    if (!attempt) return;
    for (const [id, row] of attempt.rows) {
      if (row.status !== "running") continue;
      attempt.rows.set(id, { ...row, status, detailMode: "replace" });
      attempt.dirty.add(id);
    }
    this.flush(sessionId);
    this.attempts.delete(sessionId);
  }
}
