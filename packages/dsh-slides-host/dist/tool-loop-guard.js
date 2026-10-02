import { createHash } from "node:crypto";
export const TOOL_INVALID_ARGS_LOOP_CODE = "tool-invalid-args-loop";
export const TOOL_INVALID_ARGS_LIMIT = 3;
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function callIdFromResult(data) {
    const message = record(data.message);
    const source = record(message?.source);
    if (typeof source?.callId === "string" && source.callId)
        return source.callId;
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const value of content) {
        const block = record(value);
        if (block?.type === "tool-result" && typeof block.toolCallId === "string" && block.toolCallId) {
            return block.toolCallId;
        }
    }
    return undefined;
}
function toolResultErrorText(data) {
    const message = record(data.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const texts = [];
    for (const value of content) {
        const block = record(value);
        if (block?.type !== "tool-result")
            continue;
        const children = Array.isArray(block.content) ? block.content : [];
        for (const child of children) {
            const item = record(child);
            if (item?.type === "text" && typeof item.text === "string" && item.text.trim()) {
                texts.push(item.text);
            }
        }
    }
    return texts.length ? texts.join("; ") : undefined;
}
function normalizedValidationIssues(message) {
    const withoutPrefix = message
        .replace(/^\s*Error:\s*/i, "")
        .replace(/^\s*invalid arguments(?:\s+for\s+tool\s+[^:]+)?\s*:\s*/i, "");
    const issues = withoutPrefix
        .split(/;|\r?\n/)
        .map((issue) => issue
        // Array position is not an error category. It changes whenever the model
        // rearranges otherwise identical page elements.
        .replace(/\[\s*\d+\s*\]/g, "[]")
        .replace(/\s+/g, " ")
        .trim())
        .filter(Boolean);
    return [...new Set(issues)].sort();
}
function invalidArgsFingerprint(data, error) {
    // Newer SDKs may put the validation message directly on data.error. The
    // current journal shape stores it in the tool-result text instead. Both are
    // durable SDK output, not an assistant's self-description of the failure.
    const direct = typeof error.message === "string" && error.message.trim()
        ? error.message
        : typeof error.detail === "string" && error.detail.trim()
            ? error.detail
            : undefined;
    const message = direct ?? toolResultErrorText(data);
    const code = typeof error.code === "string" ? error.code : "INVALID_ARGS";
    const name = typeof error.name === "string" ? error.name : "ToolArgsError";
    const canonical = message
        ? { code, name, issues: normalizedValidationIssues(message) }
        // Old SDK events without any durable message still receive a stable,
        // bounded fallback. ProductProgressGuard independently counts every
        // INVALID_ARGS toward its 32/64 no-progress budget.
        : { code, name, issues: ["message-unavailable"] };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
/**
 * Counts only consecutive equivalent SDK validation failures for one tool in
 * one turn. Array indices and duplicate copies of the same issue are ignored;
 * a new validation category resets the short-loop streak. A retry is a failure
 * in a later step — the model emitted a new message after seeing the previous
 * failure; all calls inside one step are a single decision and share a count.
 * It has no timers or awaits, so callers can synchronously cancel the active
 * Agent from the session/event listener without waiting on that same driver.
 */
export class ToolInvalidArgsLoopGuard {
    states = new Map();
    reset(sessionId) {
        this.states.delete(sessionId);
    }
    observe(sessionId, event) {
        const data = record(event.data);
        if (event.type === "turn/start") {
            this.states.set(sessionId, {
                turn: typeof data?.turn === "number" ? data.turn : undefined,
                seq: 0,
                calls: new Map(),
                tripped: false,
            });
            return undefined;
        }
        if (event.type === "turn/end") {
            this.reset(sessionId);
            return undefined;
        }
        const state = this.states.get(sessionId) ?? {
            seq: 0,
            calls: new Map(),
            tripped: false,
        };
        this.states.set(sessionId, state);
        if (event.type === "tool/call") {
            const callId = typeof data?.callId === "string" ? data.callId : "";
            const toolName = typeof data?.name === "string" ? data.name : "";
            if (callId && toolName) {
                state.seq += 1;
                state.calls.set(callId, {
                    toolName,
                    issuedSeq: state.seq,
                    ...(typeof data?.step === "number" ? { step: data.step } : {}),
                });
            }
            return undefined;
        }
        if (event.type !== "tool/result")
            return undefined;
        const callId = data ? callIdFromResult(data) : undefined;
        const pending = callId ? state.calls.get(callId) : undefined;
        const toolName = pending?.toolName;
        const issuedSeq = pending?.issuedSeq ?? state.seq;
        if (callId)
            state.calls.delete(callId);
        const error = record(data?.error);
        const invalidArgs = error?.code === "INVALID_ARGS";
        state.seq += 1;
        const resultSeq = state.seq;
        if (!invalidArgs || !toolName) {
            // A read/render between retries is not a repaired write. Only a result
            // from that same tool can clear its validation failure streak.
            if (toolName === state.streak?.toolName)
                state.streak = undefined;
            return undefined;
        }
        const errorFingerprint = invalidArgsFingerprint(data, error);
        const sameStreak = state.streak?.toolName === toolName &&
            state.streak.errorFingerprint === errorFingerprint;
        // A retry is a call the model issued after it could have seen the previous
        // identical failure — a later step (each step is one model decision).
        // Journal sequence order cannot express this: the runtime commits parallel
        // tool calls in maxParallelToolCalls-sized chunks interleaved with results,
        // so same-batch siblings routinely carry issuedSeq > lastResultSeq even
        // though the model emitted all of them in a single message.
        const issuedStep = pending?.step ??
            (typeof data?.step === "number" ? data.step : undefined);
        const lastStep = state.streak?.lastStep;
        const retryAfterSeen = sameStreak && (issuedStep !== undefined && lastStep !== undefined
            ? issuedStep > lastStep
            : issuedSeq > (state.streak?.lastResultSeq ?? 0));
        const count = retryAfterSeen
            ? (state.streak?.count ?? 0) + 1
            : sameStreak
                ? (state.streak?.count ?? 1)
                : 1;
        state.streak = {
            toolName,
            errorFingerprint,
            count,
            lastResultSeq: resultSeq,
            ...(issuedStep !== undefined ? { lastStep: issuedStep } : {}),
        };
        if (count < TOOL_INVALID_ARGS_LIMIT || state.tripped)
            return undefined;
        state.tripped = true;
        return {
            code: TOOL_INVALID_ARGS_LOOP_CODE,
            toolName,
            count,
            detail: `连续 ${count} 次调用 ${toolName} 出现相同参数错误，Agent 已暂停。请修正输入或提示后重试。`,
        };
    }
}
//# sourceMappingURL=tool-loop-guard.js.map