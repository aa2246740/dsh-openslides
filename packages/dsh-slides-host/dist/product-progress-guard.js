import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listSourceReceipts, inspectRunLedger, persistPageKey, readRunLedger, stableSha256, } from "@open-slidestudio/presentation-run";
import { loadProject } from "@open-slidestudio/pptd-v2";
export const REPEATED_BUSINESS_REJECTION_CODE = "repeated-business-rejection";
export const REPEATED_INVALID_ARGS_CODE = "repeated-invalid-args";
export const PLANNING_NO_PROGRESS_BUDGET_CODE = "planning-no-progress-budget";
export const PRODUCTION_NO_PROGRESS_BUDGET_CODE = "production-no-progress-budget";
export const DEFAULT_REPEATED_BUSINESS_REJECTION_LIMIT = 3;
export const DEFAULT_REPEATED_INVALID_ARGS_LIMIT = 8;
export const DEFAULT_PLANNING_NO_PROGRESS_LIMIT = 64;
export const DEFAULT_PRODUCTION_NO_PROGRESS_LIMIT = 32;
const DEFAULT_READ_ONLY_TOOLS = [
    "inspect_capabilities",
    "list_references",
    "read_page",
    "read_reference",
];
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function positiveInteger(value, fallback, field) {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < 1) {
        throw new Error(`${field} must be a positive integer`);
    }
    return resolved;
}
function parseConfig(config) {
    return {
        repeatedBusinessRejectionLimit: positiveInteger(config.repeatedBusinessRejectionLimit, DEFAULT_REPEATED_BUSINESS_REJECTION_LIMIT, "repeatedBusinessRejectionLimit"),
        repeatedInvalidArgsLimit: positiveInteger(config.repeatedInvalidArgsLimit, DEFAULT_REPEATED_INVALID_ARGS_LIMIT, "repeatedInvalidArgsLimit"),
        planningNoProgressLimit: positiveInteger(config.planningNoProgressLimit, DEFAULT_PLANNING_NO_PROGRESS_LIMIT, "planningNoProgressLimit"),
        productionNoProgressLimit: positiveInteger(config.productionNoProgressLimit, DEFAULT_PRODUCTION_NO_PROGRESS_LIMIT, "productionNoProgressLimit"),
        readOnlyTools: new Set(config.readOnlyTools ?? DEFAULT_READ_ONLY_TOOLS),
    };
}
function assertBoundary(phaseEpoch, pageRevisionFingerprint, completionEvidenceFingerprint) {
    if (!phaseEpoch.trim())
        throw new Error("phaseEpoch must be non-empty");
    if (!/^[a-f0-9]{64}$/i.test(pageRevisionFingerprint)) {
        throw new Error("pageRevisionFingerprint must be a 64-character sha256");
    }
    if (!/^[a-f0-9]{64}$/i.test(completionEvidenceFingerprint)) {
        throw new Error("completionEvidenceFingerprint must be a 64-character sha256");
    }
}
function normalizeCompletionEvidence(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
function completionEvidenceFingerprint(values) {
    return stableSha256({ schemaVersion: 1, evidence: normalizeCompletionEvidence(values) });
}
export const EMPTY_COMPLETION_EVIDENCE_FINGERPRINT = stableSha256({
    schemaVersion: 1,
    evidence: [],
});
/**
 * Creates an order-independent fingerprint from the current persisted page
 * revisions. Callers must read these rows from the durable ledger, not infer
 * them from a tool's claimed outcome.
 */
export function persistentPageRevisionFingerprint(revisions) {
    const normalized = revisions.map((revision) => {
        if (!revision.pageId.trim())
            throw new Error("pageId must be non-empty");
        if (!Number.isInteger(revision.revision) || revision.revision < 1) {
            throw new Error(`revision for ${revision.pageId} must be a positive integer`);
        }
        if (!/^[a-f0-9]{64}$/i.test(revision.pageSha256)) {
            throw new Error(`pageSha256 for ${revision.pageId} must be a 64-character sha256`);
        }
        return {
            pageId: revision.pageId,
            revision: revision.revision,
            pageSha256: revision.pageSha256.toLowerCase(),
        };
    }).sort((left, right) => left.pageId.localeCompare(right.pageId));
    for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index - 1].pageId === normalized[index].pageId) {
            throw new Error(`duplicate pageId ${normalized[index].pageId}`);
        }
    }
    return stableSha256(normalized);
}
function completionEvidenceKey(kind, value) {
    return `${kind}:${stableSha256(value)}`;
}
function readSuccessfulExportEvidence(projectRoot) {
    try {
        const marker = path.join(projectRoot, "_agent", "export", "export-report.json");
        const report = record(JSON.parse(fs.readFileSync(marker, "utf8")));
        const src = typeof report?.src === "string" ? report.src.trim() : "";
        if (report?.ok !== true || !src)
            return undefined;
        const artifact = path.resolve(projectRoot, src);
        const relative = path.relative(projectRoot, artifact);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(artifact).isFile()) {
            return undefined;
        }
        const artifactSha256 = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
        return completionEvidenceKey("export:ready", {
            src: relative.replace(/\\/g, "/"),
            artifactSha256,
            bytes: fs.statSync(artifact).size,
            slideCount: report.slideCount,
            nativeCoverage: report.nativeCoverage,
        });
    }
    catch {
        return undefined;
    }
}
/**
 * Returns semantic completion milestones from durable product state.
 * Context epochs, command ids, timestamps and delivery tokens are deliberately
 * absent so replaying the same read/review cannot refresh the budget.
 */
export function persistentCompletionEvidence(projectRoot) {
    const ledger = readRunLedger(projectRoot);
    if (!ledger)
        return [];
    const evidence = new Set();
    const status = inspectRunLedger(projectRoot, undefined, process.env, ledger);
    for (const requirement of ledger.sourcePack.requirements) {
        for (const chunkIndex of requirement.chunkIndexes) {
            const fact = ledger.facts.find((candidate) => candidate.type === "reference.chunk-returned" &&
                candidate.sourceId === requirement.sourceId &&
                candidate.fileSha256 === requirement.fileSha256 &&
                candidate.chunkIndex === chunkIndex);
            if (fact?.type !== "reference.chunk-returned")
                continue;
            evidence.add(completionEvidenceKey("reference:required-chunk", {
                sourceId: fact.sourceId,
                fileSha256: fact.fileSha256.toLowerCase(),
                chunkIndex: fact.chunkIndex,
                chunkSha256: fact.chunkSha256.toLowerCase(),
            }));
        }
    }
    if (status.referencesComplete && ledger.sourcePack.requirements.length > 0) {
        evidence.add("reference:requirements-complete");
    }
    if (status.todoCount > 0)
        evidence.add("todo:committed");
    for (const page of status.pages) {
        const identity = {
            pageId: page.pageId,
            revision: page.revision,
            pageSha256: page.pageSha256.toLowerCase(),
        };
        if (page.raster)
            evidence.add(completionEvidenceKey("page:raster-current", identity));
        if (page.imageEmitted)
            evidence.add(completionEvidenceKey("page:image-emitted-current", identity));
        if (page.layout === "pass")
            evidence.add(completionEvidenceKey("page:layout-pass-current", identity));
        if (page.visualReview === "pass") {
            evidence.add(completionEvidenceKey("page:visual-review-pass-current", identity));
        }
    }
    const currentPageIdentity = status.pages.map((page) => ({
        pageId: page.pageId,
        revision: page.revision,
        pageSha256: page.pageSha256.toLowerCase(),
    }));
    if (status.structuralReview === "pass") {
        evidence.add(completionEvidenceKey("deck:structural-review-pass-current", currentPageIdentity));
    }
    if (status.composeReady)
        evidence.add(completionEvidenceKey("deck:compose-ready", currentPageIdentity));
    if (status.composed)
        evidence.add(completionEvidenceKey("deck:composed-current", currentPageIdentity));
    for (const receipt of listSourceReceipts(projectRoot)) {
        const rank = ["available", "consulted", "adopted", "executed"].indexOf(receipt.state);
        for (let index = 1; index <= rank; index += 1) {
            evidence.add(completionEvidenceKey(`source:${["available", "consulted", "adopted", "executed"][index]}`, {
                sourceId: receipt.sourceId,
            }));
        }
    }
    const exported = readSuccessfulExportEvidence(projectRoot);
    if (exported)
        evidence.add(exported);
    return [...evidence].sort();
}
/**
 * Samples both sources that make a page durable: the latest revision fact in
 * the run ledger and the page body currently readable from disk. Including
 * both prevents a tool's claimed `outcome=written` from becoming progress and
 * also detects a disk/ledger mismatch instead of silently trusting either one.
 */
export function readPersistentProductSnapshot(projectRoot) {
    const latestRevisions = new Map();
    const ledger = readRunLedger(projectRoot);
    for (const fact of ledger?.facts ?? []) {
        if (fact.type === "page.revision-committed" &&
            typeof fact.pageId === "string" &&
            Number.isInteger(fact.revision) &&
            typeof fact.pageSha256 === "string") {
            latestRevisions.set(fact.pageId, {
                pageId: fact.pageId,
                revision: fact.revision,
                pageSha256: fact.pageSha256,
            });
        }
    }
    const ledgerRevisions = [...latestRevisions.values()]
        .sort((left, right) => left.pageId.localeCompare(right.pageId));
    const project = loadProject(projectRoot);
    const diskPages = project.pages.map((loaded) => {
        const pageId = persistPageKey(loaded.path);
        const detached = JSON.parse(JSON.stringify(loaded.page));
        return {
            pageId,
            pageSha256: stableSha256({ ...detached, id: pageId }),
        };
    }).sort((left, right) => left.pageId.localeCompare(right.pageId));
    for (let index = 1; index < diskPages.length; index += 1) {
        if (diskPages[index - 1].pageId === diskPages[index].pageId) {
            throw new Error(`duplicate persisted pageId ${diskPages[index].pageId}`);
        }
    }
    const pageCount = diskPages.length;
    const completionEvidence = persistentCompletionEvidence(projectRoot);
    return {
        phase: pageCount > 0 || ledgerRevisions.length > 0 ? "production" : "planning",
        pageCount,
        pageRevisionFingerprint: stableSha256({
            schemaVersion: 1,
            pageCount,
            ledgerRevisions,
            diskPages,
        }),
        completionEvidenceFingerprint: completionEvidenceFingerprint(completionEvidence),
        completionEvidence,
        ledgerRevisions,
        diskPages,
    };
}
export function createProductProgressCheckpoint(input) {
    const completionEvidence = normalizeCompletionEvidence(input.completionEvidence ?? []);
    const evidenceFingerprint = input.completionEvidenceFingerprint ??
        completionEvidenceFingerprint(completionEvidence);
    if (evidenceFingerprint !== completionEvidenceFingerprint(completionEvidence)) {
        throw new Error("completion evidence does not match its fingerprint");
    }
    assertBoundary(input.phaseEpoch, input.pageRevisionFingerprint, evidenceFingerprint);
    return {
        version: 1,
        phase: input.phase,
        phaseEpoch: input.phaseEpoch,
        pageRevisionFingerprint: input.pageRevisionFingerprint.toLowerCase(),
        completionEvidenceFingerprint: evidenceFingerprint.toLowerCase(),
        seenCompletionEvidence: completionEvidence,
        noProgressCount: 0,
        pendingCalls: {},
    };
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
function toolResultTexts(data) {
    const message = record(data.message);
    const blocks = Array.isArray(message?.content) ? message.content : [];
    const texts = [];
    for (const value of blocks) {
        const block = record(value);
        if (block?.type !== "tool-result")
            continue;
        const content = Array.isArray(block.content) ? block.content : [];
        for (const item of content) {
            const child = record(item);
            if (child?.type === "text" && typeof child.text === "string")
                texts.push(child.text);
        }
    }
    return texts;
}
function businessRejectionFingerprint(toolName, data) {
    for (const text of toolResultTexts(data)) {
        try {
            const parsed = record(JSON.parse(text));
            if (parsed?.outcome === "rejected") {
                return stableSha256({ toolName, result: parsed });
            }
        }
        catch {
            // Free-form text and SDK errors are not stable product rejection evidence.
        }
    }
    return undefined;
}
function resetForBoundary(checkpoint, observation, keepPendingCalls) {
    const seenCompletionEvidence = normalizeCompletionEvidence([
        ...checkpoint.seenCompletionEvidence,
        ...observation.completionEvidence,
    ]);
    return {
        version: 1,
        phase: observation.phase,
        phaseEpoch: observation.phaseEpoch,
        pageRevisionFingerprint: observation.pageRevisionFingerprint.toLowerCase(),
        completionEvidenceFingerprint: observation.completionEvidenceFingerprint.toLowerCase(),
        seenCompletionEvidence,
        noProgressCount: 0,
        pendingCalls: keepPendingCalls ? checkpoint.pendingCalls : {},
        ...(keepPendingCalls && checkpoint.pendingCallSteps
            ? { pendingCallSteps: checkpoint.pendingCallSteps }
            : {}),
    };
}
function budgetTrip(checkpoint, config) {
    const planning = checkpoint.phase === "planning";
    const limit = planning ? config.planningNoProgressLimit : config.productionNoProgressLimit;
    if (checkpoint.noProgressCount < limit)
        return undefined;
    return {
        code: planning ? PLANNING_NO_PROGRESS_BUDGET_CODE : PRODUCTION_NO_PROGRESS_BUDGET_CODE,
        phase: checkpoint.phase,
        phaseEpoch: checkpoint.phaseEpoch,
        pageRevisionFingerprint: checkpoint.pageRevisionFingerprint,
        count: checkpoint.noProgressCount,
        limit,
        detail: planning
            ? `规划阶段连续 ${checkpoint.noProgressCount} 个工具结果未产生新的持久完成证据，已达到有界预算。`
            : `生产阶段连续 ${checkpoint.noProgressCount} 个工具结果未产生新的持久完成证据，已达到有界预算。`,
    };
}
/**
 * Pure, replayable reducer for product-level no-progress detection. It does not
 * replace the SDK INVALID_ARGS guard: those failures never enter the business
 * rejection fingerprint, but still spend the broader phase no-progress budget.
 */
export function reduceProductProgress(current, observation, options = {}) {
    assertBoundary(observation.phaseEpoch, observation.pageRevisionFingerprint, observation.completionEvidenceFingerprint);
    if (observation.completionEvidenceFingerprint.toLowerCase() !==
        completionEvidenceFingerprint(observation.completionEvidence)) {
        throw new Error("completion evidence does not match its fingerprint");
    }
    const config = parseConfig(options);
    const data = record(observation.event.data);
    const phaseChanged = current.phase !== observation.phase;
    let checkpoint = phaseChanged
        ? resetForBoundary(current, observation, false)
        : current.phaseEpoch !== observation.phaseEpoch
            ? { ...current, phaseEpoch: observation.phaseEpoch, pendingCalls: {}, pendingCallSteps: undefined }
            : current;
    const unseenCompletionEvidence = observation.completionEvidence.filter((milestone) => !checkpoint.seenCompletionEvidence.includes(milestone));
    const persistentProgressChanged = (value) => value.pageRevisionFingerprint !== observation.pageRevisionFingerprint.toLowerCase() ||
        unseenCompletionEvidence.length > 0;
    const synchronizeEvidenceFingerprint = (value) => value.completionEvidenceFingerprint ===
        observation.completionEvidenceFingerprint.toLowerCase()
        ? value
        : { ...value, completionEvidenceFingerprint: observation.completionEvidenceFingerprint.toLowerCase() };
    if (observation.event.type === "tool/call") {
        if (persistentProgressChanged(checkpoint))
            checkpoint = resetForBoundary(checkpoint, observation, true);
        const callId = typeof data?.callId === "string" ? data.callId : "";
        const toolName = typeof data?.name === "string" ? data.name : "";
        if (!callId || !toolName)
            return { checkpoint: synchronizeEvidenceFingerprint(checkpoint) };
        const step = typeof data?.step === "number" && Number.isFinite(data.step) ? data.step : undefined;
        return {
            checkpoint: {
                ...synchronizeEvidenceFingerprint(checkpoint),
                pendingCalls: { ...checkpoint.pendingCalls, [callId]: toolName },
                ...(step !== undefined
                    ? { pendingCallSteps: { ...checkpoint.pendingCallSteps, [callId]: step } }
                    : {}),
            },
        };
    }
    if (observation.event.type !== "tool/result" || !data) {
        return {
            checkpoint: persistentProgressChanged(checkpoint)
                ? resetForBoundary(checkpoint, observation, true)
                : synchronizeEvidenceFingerprint(checkpoint),
        };
    }
    const callId = callIdFromResult(data);
    const toolName = callId ? checkpoint.pendingCalls[callId] : undefined;
    if (!callId || !toolName)
        return { checkpoint: synchronizeEvidenceFingerprint(checkpoint) };
    const pendingCalls = { ...checkpoint.pendingCalls };
    delete pendingCalls[callId];
    const issuedStep = checkpoint.pendingCallSteps?.[callId] ??
        (typeof data.step === "number" && Number.isFinite(data.step) ? data.step : undefined);
    let pendingCallSteps = checkpoint.pendingCallSteps;
    if (pendingCallSteps && callId in pendingCallSteps) {
        const remaining = { ...pendingCallSteps };
        delete remaining[callId];
        pendingCallSteps = remaining;
    }
    if (persistentProgressChanged(checkpoint)) {
        return {
            checkpoint: {
                ...resetForBoundary(checkpoint, observation, true),
                pendingCalls,
                pendingCallSteps,
            },
        };
    }
    const error = record(data.error);
    if (error?.code === "INVALID_ARGS") {
        // The SDK ToolArgsError carries only name+code; the validation detail lives
        // in the tool-result text, so the streak signature must read from there.
        const message = (typeof error.message === "string" && error.message.trim())
            ? error.message
            : toolResultTexts(data).join("; ") || "invalid arguments";
        const signature = stableSha256(`${toolName}:${message}`);
        const streak = checkpoint.invalidArgsStreak;
        const sameStreak = streak?.toolName === toolName && streak.signature === signature;
        // Only a call issued after the model could have seen the previous identical
        // failure (a later step) is a retry. Parallel siblings emitted in one reply
        // are a single decision, as in the SDK tool-loop guard; counting each of
        // them would trip before the model ever sees the error it could fix.
        const sameDecision = sameStreak && issuedStep !== undefined &&
            streak.lastStep !== undefined && issuedStep <= streak.lastStep;
        const invalidArgsStreak = {
            toolName,
            signature,
            count: sameStreak ? (sameDecision ? streak.count : streak.count + 1) : 1,
            ...(issuedStep !== undefined ? { lastStep: issuedStep } : {}),
        };
        let next = {
            ...synchronizeEvidenceFingerprint(checkpoint),
            pendingCalls,
            pendingCallSteps,
            noProgressCount: sameDecision ? checkpoint.noProgressCount : checkpoint.noProgressCount + 1,
            rejectionStreak: undefined,
            invalidArgsStreak,
        };
        // Identical malformed calls are a degenerate loop the model is not
        // self-correcting; stop it long before the generic phase budget.
        let trip;
        if (invalidArgsStreak.count >= config.repeatedInvalidArgsLimit) {
            const snippet = message.length > 80 ? `${message.slice(0, 80)}…` : message;
            trip = {
                code: REPEATED_INVALID_ARGS_CODE,
                phase: next.phase,
                phaseEpoch: next.phaseEpoch,
                pageRevisionFingerprint: next.pageRevisionFingerprint,
                count: invalidArgsStreak.count,
                limit: config.repeatedInvalidArgsLimit,
                toolName,
                detail: `连续 ${invalidArgsStreak.count} 次 ${toolName} 参数无效（${snippet}），已达到熔断阈值。`,
            };
        }
        else {
            trip = budgetTrip(next, config);
        }
        if (next.trippedCode || !trip)
            return { checkpoint: next };
        next = { ...next, trippedCode: trip.code };
        return { checkpoint: next, trip };
    }
    const rejectionFingerprint = businessRejectionFingerprint(toolName, data);
    let rejectionStreak = checkpoint.rejectionStreak;
    if (rejectionFingerprint) {
        rejectionStreak = rejectionStreak?.toolName === toolName &&
            rejectionStreak.rejectionFingerprint === rejectionFingerprint
            ? { ...rejectionStreak, count: rejectionStreak.count + 1 }
            : { toolName, rejectionFingerprint, count: 1 };
    }
    else if (!config.readOnlyTools.has(toolName)) {
        rejectionStreak = undefined;
    }
    let next = {
        ...synchronizeEvidenceFingerprint(checkpoint),
        pendingCalls,
        pendingCallSteps,
        noProgressCount: checkpoint.noProgressCount + 1,
        ...(rejectionStreak ? { rejectionStreak } : { rejectionStreak: undefined }),
        invalidArgsStreak: undefined,
    };
    let trip;
    if (rejectionStreak &&
        rejectionStreak.count >= config.repeatedBusinessRejectionLimit) {
        trip = {
            code: REPEATED_BUSINESS_REJECTION_CODE,
            phase: next.phase,
            phaseEpoch: next.phaseEpoch,
            pageRevisionFingerprint: next.pageRevisionFingerprint,
            count: rejectionStreak.count,
            limit: config.repeatedBusinessRejectionLimit,
            toolName,
            rejectionFingerprint,
            detail: `连续 ${rejectionStreak.count} 次 ${toolName} 业务拒绝具有相同指纹，且持久页面修订未变化。`,
        };
    }
    else {
        trip = budgetTrip(next, config);
    }
    if (next.trippedCode || !trip)
        return { checkpoint: next };
    next = { ...next, trippedCode: trip.code };
    return { checkpoint: next, trip };
}
/** Stateful adapter for the DSH session event stream; the decision logic above
 * remains a pure reducer and every checkpoint is JSON-serializable. */
export class ProductProgressSessionGuard {
    checkpoints = new Map();
    config;
    sample;
    constructor(options = {}) {
        this.config = options.config ?? {};
        this.sample = options.sample ?? readPersistentProductSnapshot;
    }
    reset(sessionId) {
        this.checkpoints.delete(sessionId);
    }
    checkpoint(sessionId) {
        return this.checkpoints.get(sessionId);
    }
    observe(sessionId, projectRoot, event) {
        const data = record(event.data);
        const turn = typeof data?.turn === "number" && Number.isFinite(data.turn)
            ? data.turn
            : undefined;
        if (event.type === "turn/start") {
            const snapshot = this.sample(projectRoot);
            const phaseEpoch = `turn:${turn ?? "unknown"}`;
            this.checkpoints.set(sessionId, createProductProgressCheckpoint({
                phase: snapshot.phase,
                phaseEpoch,
                pageRevisionFingerprint: snapshot.pageRevisionFingerprint,
                completionEvidenceFingerprint: snapshot.completionEvidenceFingerprint,
                completionEvidence: snapshot.completionEvidence,
            }));
            return undefined;
        }
        if (event.type === "turn/end") {
            this.reset(sessionId);
            return undefined;
        }
        if (event.type !== "tool/call" && event.type !== "tool/result")
            return undefined;
        const snapshot = this.sample(projectRoot);
        const current = this.checkpoints.get(sessionId) ?? createProductProgressCheckpoint({
            phase: snapshot.phase,
            phaseEpoch: `turn:${turn ?? "unknown"}`,
            pageRevisionFingerprint: snapshot.pageRevisionFingerprint,
            completionEvidenceFingerprint: snapshot.completionEvidenceFingerprint,
            completionEvidence: snapshot.completionEvidence,
        });
        const reduced = reduceProductProgress(current, {
            event,
            phase: snapshot.phase,
            phaseEpoch: turn == null ? current.phaseEpoch : `turn:${turn}`,
            pageRevisionFingerprint: snapshot.pageRevisionFingerprint,
            completionEvidenceFingerprint: snapshot.completionEvidenceFingerprint,
            completionEvidence: snapshot.completionEvidence,
        }, this.config);
        this.checkpoints.set(sessionId, reduced.checkpoint);
        return reduced.trip;
    }
}
//# sourceMappingURL=product-progress-guard.js.map