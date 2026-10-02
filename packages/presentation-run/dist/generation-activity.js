import fs from "node:fs";
import path from "node:path";
import { inspectRunLedger, readRunLedger, } from "./domain/run-ledger.js";
import { projectExecution } from "./execution.js";
import { resolveProjectPageIdentities } from "./domain/page-identity.js";
import { inspectProjectCapabilities } from "./capabilities.js";
function pageFrom(fact) {
    if ("pageId" in fact) {
        return {
            pageId: fact.pageId,
            ...(typeof fact.revision === "number" ? { revision: fact.revision } : {}),
        };
    }
    return {};
}
function eventFor(fact) {
    const page = pageFrom(fact);
    switch (fact.type) {
        case "reference.chunk-returned":
            return { id: fact.factId, type: fact.type, at: fact.at, label: "已读取参考资料", status: "complete" };
        case "todo.committed":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已建立页面计划",
                status: "complete",
                detail: `${fact.itemCount} 页`,
            };
        case "page.revision-committed":
            return { id: fact.factId, type: fact.type, at: fact.at, label: "已写入页面", status: "complete", ...page };
        case "page.edit-authorized":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已授权编辑器 Agent 修改",
                status: "complete",
                detail: `仅限 ${fact.pageId} revision ${fact.revision}`,
                ...page,
            };
        case "page.raster-committed":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已渲染页面",
                status: fact.layoutStatus === "fail" ? "needs-attention" : "complete",
                detail: fact.layoutStatus === "fail" ? "布局检查需要修订" : undefined,
                ...page,
            };
        case "page.image-result-prepared":
            return { id: fact.factId, type: fact.type, at: fact.at, label: "已准备页面预览", status: "complete", ...page };
        case "page.image-content-emitted":
            return { id: fact.factId, type: fact.type, at: fact.at, label: "已展示页面预览", status: "complete", ...page };
        case "page.visual-review-recorded":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已完成页面视觉检查",
                status: fact.verdict === "revise" ? "needs-attention" : "complete",
                detail: fact.issues.length ? fact.issues.join("；") : undefined,
                ...page,
            };
        case "deck.structural-review-recorded":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已完成结构检查",
                status: fact.ok ? "complete" : "needs-attention",
                detail: fact.issues.length ? fact.issues.join("；") : undefined,
            };
        case "deck.composed":
            return { id: fact.factId, type: fact.type, at: fact.at, label: "已完成整稿", status: "complete", detail: fact.title };
        case "export.succeeded":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已导出演示文稿",
                status: "complete",
                detail: `${fact.slideCount} 页 · ${fact.artifactPath}`,
            };
        case "web-search.executed":
            return {
                id: fact.factId,
                type: fact.type,
                at: fact.at,
                label: "已完成网页检索",
                status: "complete",
                detail: fact.queries.join("；"),
            };
    }
}
function stageStatus(state, label, detail) {
    const id = label === "规划" ? "plan" : label === "生成页面" ? "pages" : label === "检查" ? "review" : "compose";
    return { id, label, status: state, detail };
}
export function generationActivityFromLedger(ledger, inspection) {
    const factEvents = ledger?.facts.map(eventFor) ?? [];
    if (!ledger) {
        return {
            phase: "awaiting-project",
            stages: [
                stageStatus("active", "规划", "等待生成任务初始化"),
                stageStatus("pending", "生成页面", "等待页面计划"),
                stageStatus("pending", "检查", "等待页面生成"),
                stageStatus("pending", "合稿", "等待检查完成"),
            ],
            events: factEvents,
        };
    }
    const planned = inspection.todoCount > 0;
    const drafted = inspection.pages.length > 0;
    const reviewNeedsAttention = inspection.structuralReview === "fail" ||
        inspection.pages.some((page) => page.layout === "fail" || page.visualReview === "revise");
    const latestEditorAuthorization = ledger
        ? [...ledger.facts]
            .reverse()
            .find((fact) => fact.type === "page.edit-authorized")
        : undefined;
    const editorEditCompleted = Boolean(latestEditorAuthorization &&
        inspection.pages.some((page) => page.pageId === latestEditorAuthorization.pageId &&
            page.revision === latestEditorAuthorization.revision + 1 &&
            page.pageSha256 !== latestEditorAuthorization.pageSha256 &&
            page.raster &&
            page.layout === "pass"));
    const reviewed = inspection.composeReady || inspection.composed || editorEditCompleted;
    const completed = inspection.composed || editorEditCompleted;
    const phase = completed
        ? "complete"
        : reviewed || reviewNeedsAttention
            ? "reviewing"
            : drafted
                ? "generating"
                : planned
                    ? "generating"
                    : "planning";
    return {
        phase,
        updatedAt: ledger.updatedAt,
        stages: [
            stageStatus(planned || completed ? "complete" : "active", "规划", planned ? `已规划 ${inspection.todoCount} 页` : completed ? "已完成整稿" : "正在建立页面计划"),
            stageStatus(drafted ? "complete" : planned ? "active" : "pending", "生成页面", drafted ? `已持久化 ${inspection.pages.length} 页` : "等待页面写入"),
            stageStatus(reviewed ? "complete" : reviewNeedsAttention ? "needs-attention" : drafted ? "active" : "pending", "检查", reviewed
                ? editorEditCompleted && !inspection.composed
                    ? "本次 Agent 修改已完成渲染与布局检查"
                    : "结构与合稿检查已通过"
                : reviewNeedsAttention
                    ? "存在需要修订的检查项"
                    : drafted
                        ? "正在检查页面布局与可读性"
                        : "等待页面生成"),
            stageStatus(completed ? "complete" : reviewed ? "active" : "pending", "合稿", completed
                ? editorEditCompleted && !inspection.composed
                    ? "可回放本次 Agent 修改与修改前版本"
                    : "可回放已完成的生成历程"
                : reviewed
                    ? "等待写入完整演示文稿"
                    : "等待检查完成"),
        ],
        events: factEvents,
    };
}
/** Reads only durable artifacts, so completed runs remain replayable after a server restart. */
export function inspectGenerationActivity(root) {
    return inspectGenerationActivitySnapshot(root).activity;
}
/**
 * Reads the ledger once and derives the UI activity plus inspection from that
 * same immutable fact snapshot. This avoids exposing a mixed old/new response
 * while the generator atomically appends its next fact.
 */
const HANDS_LOG_REL = path.join("_agent", "hands-log.jsonl");
const AGENT_TRACE_REL = path.join("_agent", "agent-trace.jsonl");
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
function readJsonl(file) {
    if (!fs.existsSync(file))
        return [];
    const rows = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.trim())
            continue;
        try {
            rows.push(JSON.parse(line));
        }
        catch {
            /* skip a broken line */
        }
    }
    return rows;
}
const TRACE_DETAIL_MAX = 8_192;
const TRACE_BASE64ISH = /^[A-Za-z0-9+/=_-]+$/;
/**
 * Trace deltas can split a credential at arbitrary byte boundaries. Sanitize
 * the folded value as well as each persisted row so a split Bearer/token value
 * cannot become visible when the UI joins those rows.
 */
function redactTraceDetail(text) {
    if (/^data:[^,]*;base64,/i.test(text.trim()))
        return "[redacted binary data]";
    if (text.length >= 256 && !/\s/.test(text.trim()) && TRACE_BASE64ISH.test(text.trim())) {
        return "[redacted binary data]";
    }
    return text
        .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/gi, "[redacted credential]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
        .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[redacted credential]")
        .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie)\s*[=:]\s*)([^\s,;&]+)/gi, "$1[redacted]")
        .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)=)[^&#\s]+/gi, "$1[redacted]")
        // A previous delta may already have redacted the credential prefix while
        // the current delta carries the remaining token characters.
        .replace(/(Bearer \[redacted\])(?:[A-Za-z0-9._~+\/-]+=*)/gi, "$1")
        .replace(/(\[redacted credential\])(?:[A-Za-z0-9_-]+)/gi, "$1");
}
function boundTraceDetail(text, max = TRACE_DETAIL_MAX) {
    const normalized = redactTraceDetail(text).replace(/\r\n?/g, "\n");
    if (!normalized.trim())
        return {};
    if (normalized.length <= max)
        return { detail: normalized };
    return { detail: `${normalized.slice(0, max - 1)}…`, truncated: true };
}
function pageIdFromHands(row) {
    const summary = typeof row.summary === "string" ? row.summary : "";
    if (row.name === "write_page" || row.name === "render_page" || row.name === "review_page") {
        const token = summary.split("·")[0]?.trim();
        if (token && !/execution gate/i.test(token))
            return token;
    }
    try {
        const args = typeof row.args === "string" ? asRecord(JSON.parse(row.args)) : undefined;
        const id = args?.id ?? args?.pageId;
        if (typeof id === "string" && id.trim())
            return id.trim();
    }
    catch {
        /* truncated args */
    }
    return undefined;
}
function traceKind(value) {
    if (value === "message" || value === "reasoning" || value === "tool" ||
        value === "result" || value === "turn" || value === "think")
        return value;
    return undefined;
}
function traceStatus(row, kind) {
    const value = row.status;
    if (value === "running" || value === "complete" || value === "failed" ||
        value === "cancelled" || value === "needs-attention")
        return value;
    if (kind === "result")
        return row.ok === false ? "failed" : "complete";
    if (kind === "tool")
        return "running";
    return "complete";
}
function traceLabel(kind, status, name) {
    if (kind === "message")
        return status === "running" ? "正在输出" : "回复";
    if (kind === "reasoning" || kind === "think")
        return status === "running" ? "正在思考" : "思考";
    if (kind === "tool")
        return name ? `调用 ${name}` : "调用工具";
    if (kind === "result") {
        if (status === "failed")
            return name ? `${name} 失败` : "工具失败";
        if (status === "cancelled")
            return name ? `${name} 已停止` : "工具已停止";
        return name ? `${name} 完成` : "工具完成";
    }
    if (name === "step")
        return status === "running" ? "步骤开始" : "步骤结束";
    if (status === "failed")
        return "本轮失败";
    if (status === "cancelled")
        return "本轮已停止";
    if (status === "needs-attention")
        return "本轮需要处理";
    return status === "running" ? "本轮开始" : "本轮完成";
}
function eventFromTraceRow(row, index) {
    const rawKind = traceKind(row.kind);
    if (!rawKind)
        return undefined;
    // The v1 writer labeled ordinary assistant message text as "think". Keep
    // those rows visible without continuing the old claim that it was reasoning.
    const kind = rawKind === "think" ? "message" : rawKind;
    const at = typeof row.at === "string" ? row.at : new Date(0).toISOString();
    const name = typeof row.name === "string" ? row.name : undefined;
    const rawDetail = typeof row.detail === "string"
        ? row.detail
        : typeof row.text === "string"
            ? row.text
            : "";
    const bounded = boundTraceDetail(rawDetail);
    const pageId = typeof row.pageId === "string" ? row.pageId : undefined;
    const callId = typeof row.callId === "string" ? row.callId : undefined;
    const status = traceStatus(row, rawKind);
    const legacyId = `trace-${rawKind}-${index}-${name ?? callId ?? at}`;
    const id = typeof row.id === "string" && row.id ? row.id : legacyId;
    const event = {
        id,
        type: `agent.${kind}`,
        at,
        label: traceLabel(kind, status, name),
        status,
        ...bounded,
        ...(row.truncated === true ? { truncated: true } : {}),
        kind,
        ...(name ? { name } : {}),
        ...(callId ? { callId } : {}),
        ...(pageId ? { pageId } : {}),
        ...(typeof row.turn === "number" ? { turn: row.turn } : {}),
        ...(typeof row.step === "number" ? { step: row.step } : {}),
    };
    return {
        event,
        detailMode: row.detailMode === "append" ? "append" : "replace",
    };
}
/** Fold append-only v2 deltas/snapshots, while still accepting v1 trace rows. */
export function generationActivityEventsFromTraceRows(rows) {
    const events = [];
    const positions = new Map();
    const settleRunning = (matches, status) => {
        events.forEach((event, index) => {
            if (event.status !== "running" || !matches(event))
                return;
            const kind = event.kind;
            if (!kind || kind === "ledger")
                return;
            events[index] = {
                ...event,
                status,
                label: traceLabel(kind, status, event.name),
            };
        });
    };
    rows.forEach((value, index) => {
        const projected = eventFromTraceRow(asRecord(value) ?? {}, index);
        if (!projected)
            return;
        let priorIndex = positions.get(projected.event.id);
        // Some providers use different content indexes for streamed chunks and
        // the terminal assistant/message snapshot. Reconcile only when the
        // turn/step/kind identifies one unambiguous running block.
        if (priorIndex === undefined && projected.detailMode === "replace" &&
            (projected.event.kind === "message" || projected.event.kind === "reasoning") &&
            projected.event.status !== "running") {
            const candidates = [];
            events.forEach((event, eventIndex) => {
                if (event.status === "running" &&
                    event.kind === projected.event.kind &&
                    event.turn === projected.event.turn &&
                    event.step === projected.event.step) {
                    candidates.push(eventIndex);
                }
            });
            if (candidates.length === 1)
                priorIndex = candidates[0];
        }
        if (priorIndex === undefined) {
            positions.set(projected.event.id, events.length);
            events.push(projected.event);
        }
        else {
            const prior = events[priorIndex];
            const combined = projected.detailMode === "append"
                ? boundTraceDetail(`${prior.detail ?? ""}${projected.event.detail ?? ""}`)
                : { detail: projected.event.detail, truncated: projected.event.truncated };
            events[priorIndex] = {
                ...prior,
                ...projected.event,
                id: prior.id,
                at: prior.at,
                ...(combined.detail === undefined ? { detail: undefined } : { detail: combined.detail }),
                ...(prior.truncated || combined.truncated || projected.event.truncated
                    ? { truncated: true }
                    : { truncated: undefined }),
            };
            // A reconciled snapshot keeps the first stable id canonical while also
            // accepting any later row that uses the terminal snapshot id.
            positions.set(projected.event.id, priorIndex);
        }
        const lifecycle = projected.event;
        if (lifecycle.kind !== "turn" || lifecycle.status === "running")
            return;
        if (lifecycle.name === "step" && lifecycle.turn !== undefined && lifecycle.step !== undefined) {
            settleRunning((event) => event.kind !== "turn" && event.turn === lifecycle.turn && event.step === lifecycle.step, lifecycle.status);
            return;
        }
        if (lifecycle.name === "turn" && lifecycle.turn !== undefined) {
            settleRunning((event) => event.kind !== "turn" && event.turn === lifecycle.turn, lifecycle.status);
        }
    });
    return events;
}
function eventFromHandsRow(row, index) {
    const name = typeof row.name === "string" ? row.name : "";
    if (!name)
        return undefined;
    if (name === "render_page")
        return undefined;
    const at = typeof row.at === "string" ? row.at : new Date(0).toISOString();
    const ok = row.ok !== false;
    const summary = typeof row.summary === "string" ? row.summary : "";
    const detail = typeof row.detail === "string" ? row.detail : summary;
    return {
        id: `hands-${index}-${name}-${at}`,
        type: `tool.${name}`,
        at,
        label: ok ? `调用 ${name}` : `${name} 失败`,
        status: ok ? "complete" : "needs-attention",
        detail: boundTraceDetail(detail || summary).detail,
        kind: "tool",
        name,
        pageId: pageIdFromHands(row),
    };
}
/** Hands-log + session trace, so 生成历程 shows thinking and tool calls, not only ledger labels. */
export function readProduceTraceEvents(root) {
    const trace = generationActivityEventsFromTraceRows(readJsonl(path.join(root, AGENT_TRACE_REL)));
    if (trace.length)
        return trace;
    return readJsonl(path.join(root, HANDS_LOG_REL))
        .map((row, index) => eventFromHandsRow(asRecord(row) ?? {}, index))
        .filter((row) => Boolean(row));
}
export function inspectGenerationActivitySnapshot(root) {
    const ledger = readRunLedger(root);
    const inspection = inspectRunLedger(root, undefined, process.env, ledger);
    const activity = generationActivityFromLedger(ledger, inspection);
    const live = readProduceTraceEvents(root);
    const capability = inspectProjectCapabilities(root);
    const execution = projectExecution({
        ledger, inspection, identity: resolveProjectPageIdentities(root), capability,
    });
    return {
        inspection,
        activity: live.length ? { ...activity, events: live } : activity,
        execution,
    };
}
//# sourceMappingURL=generation-activity.js.map