/**
 * Public, redacted produce trace for the editor generation-history view.
 * The private Session jsonl remains in DSH home; this projection lives beside
 * the PPTD project and contains only display-safe model/tool lifecycle facts.
 */
import fs from "node:fs";
import path from "node:path";
export const AGENT_TRACE_REL = path.join("_agent", "agent-trace.jsonl");
export const AGENT_TRACE_DETAIL_MAX = 8_192;
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
const SECRET_KEY = /(?:^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|credential|authorization|cookie|private[_-]?key)(?:$|[_-])/i;
const BASE64ISH = /^[A-Za-z0-9+/=_-]+$/;
function isSecretKey(key) {
    const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return SECRET_KEY.test(key) ||
        /(?:apikey|accesstoken|refreshtoken|token|secret|password|passwd|credential|authorization|cookie|privatekey)$/.test(compact);
}
export function redactText(value) {
    if (/^data:[^,]*;base64,/i.test(value.trim()))
        return "[redacted binary data]";
    if (value.length >= 256 && !/\s/.test(value.trim()) && BASE64ISH.test(value.trim())) {
        return "[redacted binary data]";
    }
    return value
        .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/gi, "[redacted credential]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
        .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[redacted credential]")
        .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie)\s*[=:]\s*)([^\s,;&]+)/gi, "$1[redacted]")
        .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)=)[^&#\s]+/gi, "$1[redacted]");
}
function redactValue(value, key, seen = new WeakSet()) {
    if (key && isSecretKey(key))
        return "[redacted]";
    if (typeof value === "string")
        return redactText(value);
    if (value === null || typeof value !== "object")
        return value;
    if (seen.has(value))
        return "[redacted circular value]";
    seen.add(value);
    if (Array.isArray(value))
        return value.map((item) => redactValue(item, undefined, seen));
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
        result[childKey] = redactValue(child, childKey, seen);
    }
    return result;
}
function boundDetail(text, max = AGENT_TRACE_DETAIL_MAX, preserveWhitespace = false) {
    const safe = redactText(text).replace(/\r\n?/g, "\n");
    const detail = preserveWhitespace ? safe : safe.trim();
    if (!detail || (!preserveWhitespace && !detail.trim()))
        return {};
    if (detail.length <= max)
        return { detail };
    return { detail: `${detail.slice(0, max - 1)}…`, truncated: true };
}
/** Same public-text boundary for live snapshots and durable assistant blocks. */
export function publicAssistantDetail(text) {
    return boundDetail(text, AGENT_TRACE_DETAIL_MAX, true);
}
function detailFromJson(raw) {
    if (!raw.trim())
        return {};
    try {
        const safe = redactValue(JSON.parse(raw));
        return boundDetail(JSON.stringify(safe, null, 2));
    }
    catch {
        return boundDetail(raw);
    }
}
function pageIdFromArgs(args) {
    try {
        const rec = asRecord(JSON.parse(args));
        const id = rec?.id ?? rec?.pageId;
        if (typeof id === "string" && id.trim())
            return id.trim();
    }
    catch {
        /* incomplete model arguments */
    }
    return undefined;
}
function eventAt(event) {
    return typeof event.time === "number" && Number.isFinite(event.time)
        ? new Date(event.time).toISOString()
        : new Date().toISOString();
}
function eventFields(event, data) {
    return {
        at: eventAt(event),
        ...(typeof event.seq === "number" ? { seq: event.seq } : {}),
        ...(typeof data?.turn === "number" ? { turn: data.turn } : {}),
        ...(typeof data?.step === "number" ? { step: data.step } : {}),
    };
}
function assistantId(turn, step, index, kind) {
    return `assistant:${String(turn ?? "?")}:${String(step ?? "?")}:${String(index ?? "?")}:${kind}`;
}
function toolId(callId) {
    return `tool:${callId}`;
}
function resultId(callId) {
    return `result:${callId}`;
}
function resultText(block) {
    const content = Array.isArray(block.content) ? block.content : [];
    const parts = [];
    for (const part of content) {
        const row = asRecord(part);
        if (row?.type === "text" && typeof row.text === "string") {
            const raw = row.text.trim();
            if (!raw)
                continue;
            try {
                parts.push(JSON.stringify(redactValue(JSON.parse(raw)), null, 2));
            }
            catch {
                parts.push(redactText(raw));
            }
        }
        else if (typeof row?.type === "string") {
            parts.push(`[${row.type} content omitted]`);
        }
    }
    return boundDetail(parts.join("\n"));
}
function resultReportsFailure(block) {
    const content = Array.isArray(block.content) ? block.content : [];
    for (const part of content) {
        const row = asRecord(part);
        if (row?.type !== "text" || typeof row.text !== "string")
            continue;
        try {
            const parsed = asRecord(JSON.parse(row.text));
            if (parsed?.ok === false)
                return true;
        }
        catch {
            /* Plain-text tool results have no structured failure assertion. */
        }
    }
    return false;
}
function reasonDetail(reason) {
    const kind = typeof reason?.kind === "string" ? reason.kind : "unknown";
    if (kind === "completed")
        return { detail: "Turn completed" };
    if (kind === "aborted") {
        const cause = asRecord(reason?.reason);
        const causeKind = typeof cause?.kind === "string" ? cause.kind : "cancelled";
        const hookReason = typeof cause?.reason === "string" ? `: ${cause.reason}` : "";
        return boundDetail(`Turn cancelled (${causeKind}${hookReason})`);
    }
    if (kind === "error") {
        const error = asRecord(reason?.error);
        const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
        const message = typeof error?.message === "string" ? error.message : "Turn failed";
        return boundDetail(`${code}: ${message}`);
    }
    if (kind === "blocked")
        return { detail: "Turn blocked" };
    if (kind === "max-tokens")
        return { detail: "Turn reached the output limit" };
    if (kind === "interrupted")
        return { detail: "Turn interrupted during restart or recovery" };
    return boundDetail(`Turn ended: ${kind}`);
}
function reasonStatus(reason) {
    switch (reason?.kind) {
        case "completed": return "complete";
        case "aborted":
        case "interrupted": return "cancelled";
        case "error": return "failed";
        default: return "needs-attention";
    }
}
/** Project one exact committed DSH Session event into display-safe trace rows. */
export function traceRowsFromSessionEvent(event) {
    const type = event.type ?? "";
    const data = asRecord(event.data);
    const common = eventFields(event, data);
    if (type === "turn/start" && typeof data?.turn === "number") {
        return [{
                id: `turn:${data.turn}`,
                ...common,
                kind: "turn",
                status: "running",
                name: "turn",
                detail: "Turn started",
                detailMode: "replace",
            }];
    }
    if (type === "turn/end" && typeof data?.turn === "number") {
        const reason = asRecord(data.reason);
        return [{
                id: `turn:${data.turn}`,
                ...common,
                kind: "turn",
                status: reasonStatus(reason),
                name: "turn",
                ...reasonDetail(reason),
                detailMode: "replace",
            }];
    }
    if ((type === "step/start" || type === "step/end") &&
        typeof data?.turn === "number" && typeof data.step === "number") {
        return [{
                id: `step:${data.turn}:${data.step}`,
                ...common,
                kind: "turn",
                status: type === "step/start" ? "running" : "complete",
                name: "step",
                detail: type === "step/start" ? `Step ${data.step} started` : `Step ${data.step} completed`,
                detailMode: "replace",
            }];
    }
    if (type === "assistant/chunk") {
        const chunk = asRecord(data?.chunk);
        const index = chunk?.index;
        if ((chunk?.type === "text-delta" || chunk?.type === "reasoning-delta") &&
            typeof chunk.text === "string" && chunk.text) {
            const kind = chunk.type === "reasoning-delta" ? "reasoning" : "message";
            return [{
                    id: assistantId(data?.turn, data?.step, index, kind),
                    ...common,
                    kind,
                    status: "running",
                    ...boundDetail(chunk.text, AGENT_TRACE_DETAIL_MAX, true),
                    detailMode: "append",
                }];
        }
        if (chunk?.type === "tool-call-delta" && typeof chunk.id === "string" && chunk.id) {
            const args = typeof chunk.argumentsDelta === "string" ? chunk.argumentsDelta : "";
            return [{
                    id: toolId(chunk.id),
                    ...common,
                    kind: "tool",
                    status: "running",
                    callId: chunk.id,
                    ...(typeof chunk.name === "string" && chunk.name ? { name: chunk.name } : {}),
                    ...boundDetail(args),
                    detailMode: "append",
                }];
        }
        return [];
    }
    if (type === "assistant/message") {
        const message = asRecord(data?.message);
        const content = Array.isArray(message?.content) ? message.content : [];
        const status = data?.interrupted === true ? "cancelled" : "complete";
        const rows = [];
        content.forEach((value, index) => {
            const block = asRecord(value);
            if ((block?.type !== "text" && block?.type !== "reasoning") || typeof block.text !== "string")
                return;
            const kind = block.type === "reasoning" ? "reasoning" : "message";
            const detail = boundDetail(block.text, AGENT_TRACE_DETAIL_MAX, true);
            if (!detail.detail?.trim())
                return;
            rows.push({
                id: assistantId(data?.turn, data?.step, index, kind),
                ...common,
                kind,
                status,
                ...detail,
                detailMode: "replace",
            });
        });
        return rows;
    }
    if (type === "tool/call") {
        const name = typeof data?.name === "string" ? data.name : "";
        const callId = typeof data?.callId === "string" ? data.callId : "";
        if (!name || !callId)
            return [];
        const args = typeof data?.arguments === "string" ? data.arguments : "";
        return [{
                id: toolId(callId),
                ...common,
                kind: "tool",
                status: "running",
                name,
                callId,
                ...detailFromJson(args),
                detailMode: "replace",
                pageId: pageIdFromArgs(args),
            }];
    }
    if (type === "tool/result") {
        const message = asRecord(data?.message);
        const source = asRecord(message?.source);
        const blocks = Array.isArray(message?.content) ? message.content : [];
        const toolResult = blocks.map(asRecord).find((block) => block?.type === "tool-result");
        const blockCallId = typeof toolResult?.toolCallId === "string" ? toolResult.toolCallId : "";
        const sourceCallId = typeof source?.callId === "string" ? source.callId : "";
        const callId = blockCallId || sourceCallId;
        if (!callId || !toolResult)
            return [];
        const failed = toolResult.isError === true || Boolean(data?.error) || resultReportsFailure(toolResult);
        return [{
                id: resultId(callId),
                ...common,
                kind: "result",
                status: failed ? "failed" : "complete",
                callId,
                ...resultText(toolResult),
                detailMode: "replace",
            }];
    }
    return [];
}
export function appendAgentTrace(projectRoot, rows) {
    if (!rows.length)
        return;
    const file = path.join(projectRoot, AGENT_TRACE_REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}
//# sourceMappingURL=agent-trace.js.map