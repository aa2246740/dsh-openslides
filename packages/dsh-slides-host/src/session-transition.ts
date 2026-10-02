import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SliceError } from "./protocol.js";
import { readAgentError, recordAgentError } from "./agent-fault.js";

const ATTEMPT_REL = path.join("_agent", "attempt.v1.json");
const locks = new Map<string, Promise<void>>();

export class SessionTransitionConflict extends Error {
  readonly status = 409 as const;
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
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

export function attemptPath(projectRoot: string): string {
  return path.join(projectRoot, ATTEMPT_REL);
}

export function readAttempt(projectRoot: string): AttemptRecord | undefined {
  const file = attemptPath(projectRoot);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AttemptRecord>;
    if (typeof parsed.attemptId === "string" && parsed.attemptId && typeof parsed.startedAt === "string") {
      return {
        attemptId: parsed.attemptId,
        startedAt: parsed.startedAt,
        ...(typeof parsed.recoveringFrom === "string" ? { recoveringFrom: parsed.recoveringFrom } : {}),
      };
    }
  } catch {
    /* ignore corrupt attempt files */
  }
  return undefined;
}

export function beginAttempt(projectRoot: string, previousFault?: SliceError): AttemptRecord {
  const attemptId = crypto.randomUUID();
  const record: AttemptRecord = {
    attemptId,
    startedAt: new Date().toISOString(),
    ...(previousFault?.attemptId ? { recoveringFrom: previousFault.attemptId } : {}),
  };
  fs.mkdirSync(path.join(projectRoot, "_agent"), { recursive: true });
  fs.writeFileSync(attemptPath(projectRoot), `${JSON.stringify(record, null, 2)}\n`);
  if (previousFault) {
    recordAgentError(projectRoot, { ...previousFault, recovering: true });
  }
  return record;
}

export function parseModelSelection(raw: unknown): ModelSelectionInput | undefined {
  if (raw == null) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("modelSelection must be an object");
  }
  const rec = raw as Record<string, unknown>;
  const provider = typeof rec.provider === "string" ? rec.provider.trim() : "";
  const model = typeof rec.model === "string" ? rec.model.trim() : "";
  if (!provider || !model) throw new Error("modelSelection requires provider and model");
  const reasoningEffort = typeof rec.reasoningEffort === "string" ? rec.reasoningEffort.trim() : "";
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) };
}

export function parseExpectedAttemptId(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("expectedAttemptId must be a string");
  return raw.trim();
}

export function assertExpectedAttempt(projectRoot: string | undefined, expected?: string): void {
  if (!expected) return;
  const current = projectRoot ? readAttempt(projectRoot)?.attemptId ?? null : null;
  if (current !== expected) {
    throw new SessionTransitionConflict(
      "attempt_conflict",
      "expectedAttemptId does not match the current session attempt",
    );
  }
}

export async function withSessionTransition<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => held);
  locks.set(sessionId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(sessionId) === queued) locks.delete(sessionId);
  }
}

export function markFaultRecovering(projectRoot: string): SliceError | undefined {
  const fault = readAgentError(projectRoot);
  if (!fault) return undefined;
  recordAgentError(projectRoot, { ...fault, recovering: true });
  return { ...fault, recovering: true };
}
