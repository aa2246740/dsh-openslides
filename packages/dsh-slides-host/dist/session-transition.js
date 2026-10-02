import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readAgentError, recordAgentError } from "./agent-fault.js";
const ATTEMPT_REL = path.join("_agent", "attempt.v1.json");
const locks = new Map();
export class SessionTransitionConflict extends Error {
    status = 409;
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function attemptPath(projectRoot) {
    return path.join(projectRoot, ATTEMPT_REL);
}
export function readAttempt(projectRoot) {
    const file = attemptPath(projectRoot);
    if (!fs.existsSync(file))
        return undefined;
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof parsed.attemptId === "string" && parsed.attemptId && typeof parsed.startedAt === "string") {
            return {
                attemptId: parsed.attemptId,
                startedAt: parsed.startedAt,
                ...(typeof parsed.recoveringFrom === "string" ? { recoveringFrom: parsed.recoveringFrom } : {}),
            };
        }
    }
    catch {
        /* ignore corrupt attempt files */
    }
    return undefined;
}
export function beginAttempt(projectRoot, previousFault) {
    const attemptId = crypto.randomUUID();
    const record = {
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
export function parseModelSelection(raw) {
    if (raw == null)
        return undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("modelSelection must be an object");
    }
    const rec = raw;
    const provider = typeof rec.provider === "string" ? rec.provider.trim() : "";
    const model = typeof rec.model === "string" ? rec.model.trim() : "";
    if (!provider || !model)
        throw new Error("modelSelection requires provider and model");
    const reasoningEffort = typeof rec.reasoningEffort === "string" ? rec.reasoningEffort.trim() : "";
    return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) };
}
export function parseExpectedAttemptId(raw) {
    if (raw == null || raw === "")
        return undefined;
    if (typeof raw !== "string" || !raw.trim())
        throw new Error("expectedAttemptId must be a string");
    return raw.trim();
}
export function assertExpectedAttempt(projectRoot, expected) {
    if (!expected)
        return;
    const current = projectRoot ? readAttempt(projectRoot)?.attemptId ?? null : null;
    if (current !== expected) {
        throw new SessionTransitionConflict("attempt_conflict", "expectedAttemptId does not match the current session attempt");
    }
}
export async function withSessionTransition(sessionId, work) {
    const previous = locks.get(sessionId) ?? Promise.resolve();
    let release;
    const held = new Promise((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => held);
    locks.set(sessionId, queued);
    await previous;
    try {
        return await work();
    }
    finally {
        release();
        if (locks.get(sessionId) === queued)
            locks.delete(sessionId);
    }
}
export function markFaultRecovering(projectRoot) {
    const fault = readAgentError(projectRoot);
    if (!fault)
        return undefined;
    recordAgentError(projectRoot, { ...fault, recovering: true });
    return { ...fault, recovering: true };
}
//# sourceMappingURL=session-transition.js.map