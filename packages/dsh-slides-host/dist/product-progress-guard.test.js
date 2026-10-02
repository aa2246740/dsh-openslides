import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, listComposedPage, saveProject, } from "@open-slidestudio/pptd-v2";
import { PLANNING_NO_PROGRESS_BUDGET_CODE, PRODUCTION_NO_PROGRESS_BUDGET_CODE, REPEATED_BUSINESS_REJECTION_CODE, EMPTY_COMPLETION_EVIDENCE_FINGERPRINT, createProductProgressCheckpoint, persistentPageRevisionFingerprint, readPersistentProductSnapshot, reduceProductProgress, ProductProgressSessionGuard, } from "./product-progress-guard.js";
import { isPauseFault } from "./agent-fault.js";
import { stableSha256 } from "@open-slidestudio/presentation-run";
const sha = (character) => character.repeat(64);
function appendReferenceChunk(root, input) {
    const file = path.join(root, "_agent", "run-ledger.v1.json");
    const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
    const at = new Date().toISOString();
    ledger.updatedAt = at;
    ledger.facts.push({
        type: "reference.chunk-returned",
        factId: `reference.chunk-returned:test:${ledger.facts.length}`,
        at,
        ...input,
    });
    fs.writeFileSync(file, `${JSON.stringify(ledger)}\n`);
}
function appendLedgerFact(root, fact) {
    const file = path.join(root, "_agent", "run-ledger.v1.json");
    const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
    ledger.updatedAt = new Date().toISOString();
    ledger.facts.push(fact);
    fs.writeFileSync(file, `${JSON.stringify(ledger)}\n`);
}
function writeSourceReceiptState(root, state, toolCallId) {
    fs.writeFileSync(path.join(root, "_agent", "presentation-receipts.v1.json"), `${JSON.stringify({
        version: 1,
        receipts: [{ sourceId: "fixture-source", state, toolCallId }],
    })}\n`);
}
function evidenceFingerprint(evidence) {
    return stableSha256({ schemaVersion: 1, evidence: [...new Set(evidence)].sort() });
}
function persistentProjectFixture(name) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
    const project = createEmptyProject(root, { title: name });
    listComposedPage(project, "pages/01_cover.page", {
        pageType: "cover",
        elements: [{
                elementId: "title",
                elementType: "text",
                bounds: [80, 180, 800, 80],
                content: { text: "Durable title" },
            }],
    });
    saveProject(project);
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "_agent", "run-ledger.v1.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId: `run-${name}`,
        createdAt: "2026-09-07T00:00:00.000Z",
        updatedAt: "2026-09-07T00:00:00.000Z",
        sourcePack: {
            manifestSha256: sha("1"),
            requirementsId: sha("2"),
            requirements: [],
            executionPolicy: {
                currentRenderedLayoutRequired: true,
                structuralReviewRequired: false,
            },
        },
        facts: [],
    })}\n`);
    const pageSha256 = readPersistentProductSnapshot(root).diskPages[0].pageSha256;
    appendLedgerFact(root, {
        type: "page.revision-committed",
        factId: `page.revision-committed:${name}`,
        at: "2026-09-07T00:00:01.000Z",
        contextEpochId: "context-1",
        pageId: "1_cover",
        revision: 1,
        pageSha256,
    });
    return { root, pageSha256 };
}
const pageFingerprint = (revision = 1, pageSha256 = sha("a"), pageId = "01_cover") => persistentPageRevisionFingerprint([{ pageId, revision, pageSha256 }]);
const call = (callId, name, step = 1) => ({
    type: "tool/call",
    data: { turn: 3, step, callId, name, arguments: {} },
});
const result = (callId, payload, error, step = 1) => ({
    type: "tool/result",
    data: {
        turn: 3,
        step,
        message: {
            source: { kind: "tool", callId },
            content: [{
                    type: "tool-result",
                    toolCallId: callId,
                    isError: Boolean(error),
                    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
                }],
        },
        ...(error ? { error } : {}),
    },
});
function observe(harness, event, options = {}) {
    const observation = {
        event,
        phase: options.phase ?? harness.checkpoint.phase,
        phaseEpoch: options.phaseEpoch ?? harness.checkpoint.phaseEpoch,
        pageRevisionFingerprint: options.pageRevisionFingerprint ?? harness.checkpoint.pageRevisionFingerprint,
        completionEvidenceFingerprint: options.completionEvidenceFingerprint ?? harness.checkpoint.completionEvidenceFingerprint,
        completionEvidence: options.completionEvidence ?? harness.checkpoint.seenCompletionEvidence,
    };
    const reduced = reduceProductProgress(harness.checkpoint, observation, options.config);
    harness.checkpoint = reduced.checkpoint;
    if (reduced.trip)
        harness.trips.push(reduced.trip);
}
function complete(harness, callId, name, payload, options = {}) {
    const { pageRevisionFingerprint: _afterResult, completionEvidenceFingerprint: _afterEvidenceFingerprint, completionEvidence: _afterEvidence, ...callOptions } = options;
    observe(harness, call(callId, name), callOptions);
    observe(harness, result(callId, payload), options);
}
function harness(phase = "production", fingerprint = pageFingerprint()) {
    return {
        checkpoint: createProductProgressCheckpoint({
            phase,
            phaseEpoch: "turn-3",
            pageRevisionFingerprint: fingerprint,
        }),
        trips: [],
    };
}
function assertNoTrips(state) {
    assert.deepEqual(state.trips, []);
}
function assertNoRejectionStreak(state) {
    assert.equal(state.checkpoint.rejectionStreak, undefined);
}
describe("persistent page revision fingerprint", () => {
    it("is order independent and changes with a durable revision or body sha", () => {
        const first = [
            { pageId: "02_body", revision: 2, pageSha256: sha("b") },
            { pageId: "01_cover", revision: 1, pageSha256: sha("a") },
        ];
        const reverse = [...first].reverse();
        assert.equal(persistentPageRevisionFingerprint(first), persistentPageRevisionFingerprint(reverse));
        assert.notEqual(persistentPageRevisionFingerprint(first), persistentPageRevisionFingerprint([{ ...first[0], revision: 3 }, first[1]]));
        assert.notEqual(persistentPageRevisionFingerprint(first), persistentPageRevisionFingerprint([{ ...first[0], pageSha256: sha("c") }, first[1]]));
    });
    it("rejects ambiguous or invalid durable revision rows", () => {
        assert.throws(() => persistentPageRevisionFingerprint([
            { pageId: "same", revision: 1, pageSha256: sha("a") },
            { pageId: "same", revision: 2, pageSha256: sha("b") },
        ]), /duplicate pageId/);
        assert.throws(() => persistentPageRevisionFingerprint([{ pageId: "p", revision: 0, pageSha256: sha("a") }]), /positive integer/);
        assert.throws(() => persistentPageRevisionFingerprint([{ pageId: "p", revision: 1, pageSha256: "claimed" }]), /64-character sha256/);
    });
    it("samples the current disk pages and latest run-ledger revisions together", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "product-progress-snapshot-"));
        const project = createEmptyProject(root, { title: "Snapshot" });
        fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
        const ledgerPath = path.join(root, "_agent", "run-ledger.v1.json");
        const ledger = {
            schemaVersion: 1,
            runId: "run-snapshot",
            createdAt: "2026-09-06T00:00:00.000Z",
            updatedAt: "2026-09-06T00:00:00.000Z",
            sourcePack: { manifestSha256: sha("1"), requirementsId: sha("2"), requirements: [] },
            facts: [],
        };
        fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`);
        const empty = readPersistentProductSnapshot(root);
        assert.equal(empty.phase, "planning");
        assert.equal(empty.pageCount, 0);
        listComposedPage(project, "pages/01_cover.page", {
            pageType: "cover",
            elements: [{
                    elementId: "title",
                    elementType: "text",
                    bounds: [80, 180, 800, 80],
                    content: { text: "Durable title" },
                }],
        });
        saveProject(project);
        const diskOnly = readPersistentProductSnapshot(root);
        assert.equal(diskOnly.phase, "production");
        assert.equal(diskOnly.pageCount, 1);
        assert.notEqual(diskOnly.pageRevisionFingerprint, empty.pageRevisionFingerprint);
        ledger.facts.push({
            type: "page.revision-committed",
            factId: "page.revision-committed:test",
            at: "2026-09-06T00:00:01.000Z",
            contextEpochId: "epoch-1",
            pageId: "1_cover",
            revision: 1,
            pageSha256: diskOnly.diskPages[0].pageSha256,
        });
        fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`);
        const both = readPersistentProductSnapshot(root);
        assert.equal(both.ledgerRevisions[0]?.revision, 1);
        assert.equal(both.diskPages[0]?.pageId, "1_cover");
        assert.notEqual(both.pageRevisionFingerprint, diskOnly.pageRevisionFingerprint);
    });
});
describe("plugin-facing persistent progress", () => {
    it("resets production no-progress for each new durable reference chunk after pages are complete", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "product-progress-reference-recovery-"));
        const project = createEmptyProject(root, { title: "Reference recovery" });
        listComposedPage(project, "pages/01_cover.page", {
            pageType: "cover",
            elements: [{
                    elementId: "title",
                    elementType: "text",
                    bounds: [80, 180, 800, 80],
                    content: { text: "Durable title" },
                }],
        });
        saveProject(project);
        fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
        fs.writeFileSync(path.join(root, "_agent", "run-ledger.v1.json"), `${JSON.stringify({
            schemaVersion: 1,
            runId: "run-reference-recovery",
            createdAt: "2026-09-07T00:00:00.000Z",
            updatedAt: "2026-09-07T00:00:00.000Z",
            sourcePack: {
                manifestSha256: sha("1"),
                requirementsId: sha("2"),
                requirements: [{
                        sourceId: "openkimi:SKILL.md",
                        fileSha256: sha("a"),
                        chunkIndexes: [0, 1],
                        reason: "skill",
                    }],
            },
            facts: [],
        })}\n`);
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 2 } });
        guard.observe("session-reference-recovery", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-reference-recovery", root, call("read-skill-0", "read_reference"));
        appendReferenceChunk(root, {
            contextEpochId: "context-1",
            sourceId: "openkimi:SKILL.md",
            fileSha256: sha("a"),
            chunkIndex: 0,
            chunkSha256: sha("b"),
        });
        assert.equal(guard.observe("session-reference-recovery", root, result("read-skill-0", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-reference-recovery")?.noProgressCount, 0);
        guard.observe("session-reference-recovery", root, call("read-skill-1", "read_reference"));
        appendReferenceChunk(root, {
            contextEpochId: "context-1",
            sourceId: "openkimi:SKILL.md",
            fileSha256: sha("a"),
            chunkIndex: 1,
            chunkSha256: sha("c"),
        });
        assert.equal(guard.observe("session-reference-recovery", root, result("read-skill-1", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-reference-recovery")?.noProgressCount, 0);
        guard.observe("session-reference-recovery", root, call("repeat-skill-0", "read_reference"));
        appendReferenceChunk(root, {
            contextEpochId: "context-2",
            sourceId: "openkimi:SKILL.md",
            fileSha256: sha("a"),
            chunkIndex: 0,
            chunkSha256: sha("b"),
        });
        assert.equal(guard.observe("session-reference-recovery", root, result("repeat-skill-0", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-reference-recovery")?.noProgressCount, 1);
        guard.observe("session-reference-recovery", root, call("repeat-skill-1", "read_reference"));
        appendReferenceChunk(root, {
            contextEpochId: "context-3",
            sourceId: "openkimi:SKILL.md",
            fileSha256: sha("a"),
            chunkIndex: 1,
            chunkSha256: sha("c"),
        });
        const repeated = guard.observe("session-reference-recovery", root, result("repeat-skill-1", { ok: true }));
        assert.equal(repeated?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
    it("does not refresh the budget by alternating pass and revise on the same current review", () => {
        const { root, pageSha256 } = persistentProjectFixture("review-status");
        const rasterSha256 = sha("d");
        appendLedgerFact(root, {
            type: "page.raster-committed",
            factId: "raster:review-status",
            at: "2026-09-07T00:00:02.000Z",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            src: "_agent/renders/1.png",
            width: 960,
            height: 540,
            layoutGateVersion: "rendered-layout-gate-v8",
            layoutStatus: "pass",
            layoutIssues: [],
        });
        appendLedgerFact(root, {
            type: "page.image-content-emitted",
            factId: "image:review-status",
            at: "2026-09-07T00:00:03.000Z",
            contextEpochId: "context-1",
            commandId: "render-1",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            deliveryToken: "delivery-1",
        });
        appendLedgerFact(root, {
            type: "page.visual-review-recorded",
            factId: "review:revise-1",
            at: "2026-09-07T00:00:04.000Z",
            contextEpochId: "context-1",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            deliveryToken: "delivery-1",
            verdict: "revise",
            issues: ["contrast"],
        });
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 2 } });
        guard.observe("session-review-status", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-review-status", root, call("review-pass", "review_page"));
        appendLedgerFact(root, {
            type: "page.visual-review-recorded",
            factId: "review:pass",
            at: "2026-09-07T00:00:05.000Z",
            contextEpochId: "context-2",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            deliveryToken: "delivery-1",
            verdict: "pass",
            issues: [],
        });
        assert.equal(guard.observe("session-review-status", root, result("review-pass", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-review-status")?.noProgressCount, 0);
        guard.observe("session-review-status", root, call("review-revise", "review_page"));
        appendLedgerFact(root, {
            type: "page.visual-review-recorded",
            factId: "review:revise-2",
            at: "2026-09-07T00:00:06.000Z",
            contextEpochId: "context-3",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            deliveryToken: "delivery-1",
            verdict: "revise",
            issues: ["same current page"],
        });
        assert.equal(guard.observe("session-review-status", root, result("review-revise", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-review-status")?.noProgressCount, 1);
        guard.observe("session-review-status", root, call("review-pass-again", "review_page"));
        appendLedgerFact(root, {
            type: "page.visual-review-recorded",
            factId: "review:pass-again",
            at: "2026-09-07T00:00:07.000Z",
            contextEpochId: "context-4",
            pageId: "1_cover",
            revision: 1,
            pageSha256,
            rasterSha256,
            deliveryToken: "delivery-1",
            verdict: "pass",
            issues: [],
        });
        assert.equal(guard.observe("session-review-status", root, result("review-pass-again", { ok: true }))?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
    it("counts the first todo milestone but not changed todo text or arbitrary web searches", () => {
        const { root } = persistentProjectFixture("non-completion-facts");
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 2 } });
        guard.observe("session-non-completion", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-non-completion", root, call("todo-1", "write_todo"));
        appendLedgerFact(root, {
            type: "todo.committed",
            factId: "todo:first",
            at: "2026-09-07T00:00:02.000Z",
            contextEpochId: "context-1",
            todoSha256: sha("3"),
            itemCount: 1,
        });
        assert.equal(guard.observe("session-non-completion", root, result("todo-1", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-non-completion")?.noProgressCount, 0);
        guard.observe("session-non-completion", root, call("todo-2", "write_todo"));
        appendLedgerFact(root, {
            type: "todo.committed",
            factId: "todo:changed-copy",
            at: "2026-09-07T00:00:03.000Z",
            contextEpochId: "context-2",
            todoSha256: sha("4"),
            itemCount: 9,
        });
        assert.equal(guard.observe("session-non-completion", root, result("todo-2", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-non-completion")?.noProgressCount, 1);
        guard.observe("session-non-completion", root, call("search", "web_search"));
        appendLedgerFact(root, {
            type: "web-search.executed",
            factId: "search:arbitrary",
            at: "2026-09-07T00:00:04.000Z",
            contextEpochId: "context-3",
            commandId: "search",
            queries: ["different query"],
            factCount: 10,
            source: "pi-xai-hosted",
            ok: true,
        });
        assert.equal(guard.observe("session-non-completion", root, result("search", { ok: true }))?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
    it("counts current compose and a verified export artifact as separate durable milestones", () => {
        const { root, pageSha256 } = persistentProjectFixture("compose-export");
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 2 } });
        guard.observe("session-compose-export", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-compose-export", root, call("compose", "compose_deck"));
        appendLedgerFact(root, {
            type: "deck.composed",
            factId: "deck:composed",
            at: "2026-09-07T00:00:02.000Z",
            contextEpochId: "context-1",
            title: "Complete",
            deckSha256: sha("5"),
            pageRevisions: { "1_cover": pageSha256 },
        });
        assert.equal(guard.observe("session-compose-export", root, result("compose", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-compose-export")?.noProgressCount, 0);
        guard.observe("session-compose-export", root, call("export", "export_deck"));
        const exportDir = path.join(root, "_agent", "export");
        fs.mkdirSync(exportDir, { recursive: true });
        fs.writeFileSync(path.join(exportDir, "deck.pptx"), "editable-pptx-test");
        fs.writeFileSync(path.join(exportDir, "export-report.json"), JSON.stringify({
            ok: true,
            src: "_agent/export/deck.pptx",
            bytes: 18,
            slideCount: 1,
            nativeCoverage: 1,
        }));
        assert.equal(guard.observe("session-compose-export", root, result("export", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-compose-export")?.noProgressCount, 0);
    });
    it("requires a pass for the current page revision rather than a stale historical pass", () => {
        const { root, pageSha256 } = persistentProjectFixture("stale-review");
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 1 } });
        guard.observe("session-stale-review", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-stale-review", root, call("stale-pass", "review_page"));
        appendLedgerFact(root, {
            type: "page.visual-review-recorded",
            factId: "review:stale-pass",
            at: "2026-09-07T00:00:02.000Z",
            contextEpochId: "context-stale",
            pageId: "1_cover",
            revision: 0,
            pageSha256: sha("0"),
            rasterSha256: sha("9"),
            deliveryToken: "stale-delivery",
            verdict: "pass",
            issues: [],
        });
        assert.equal(guard.observe("session-stale-review", root, result("stale-pass", { ok: true }))?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
        assert.equal(readPersistentProductSnapshot(root).diskPages[0]?.pageSha256, pageSha256);
    });
    it("counts each source receipt rank once and cannot refresh by downgrading then restoring it", () => {
        const { root } = persistentProjectFixture("source-receipt-rank");
        writeSourceReceiptState(root, "consulted", "consult-1");
        const guard = new ProductProgressSessionGuard({ config: { productionNoProgressLimit: 2 } });
        guard.observe("session-source-rank", root, { type: "turn/start", data: { turn: 1 } });
        guard.observe("session-source-rank", root, call("adopt", "commit_design"));
        writeSourceReceiptState(root, "adopted", "adopt-1");
        assert.equal(guard.observe("session-source-rank", root, result("adopt", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-source-rank")?.noProgressCount, 0);
        guard.observe("session-source-rank", root, call("downgrade", "commit_design"));
        writeSourceReceiptState(root, "consulted", "consult-2");
        assert.equal(guard.observe("session-source-rank", root, result("downgrade", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-source-rank")?.noProgressCount, 1);
        guard.observe("session-source-rank", root, call("restore", "commit_design"));
        writeSourceReceiptState(root, "adopted", "adopt-2");
        assert.equal(guard.observe("session-source-rank", root, result("restore", { ok: true }))?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
});
describe("product no-progress reducer", () => {
    it("trips on the third identical business rejection across successful reads", () => {
        const state = harness();
        const rejected = {
            ok: false,
            outcome: "rejected",
            code: "layout_overlap",
            detail: "el-03 overlaps el-04",
        };
        complete(state, "w1", "write_page", rejected);
        complete(state, "r1", "read_page", { ok: true, page: { id: "01_cover" } });
        complete(state, "w2", "write_page", rejected);
        complete(state, "r2", "read_reference", { ok: true, text: "layout rules" });
        complete(state, "w3", "write_page", rejected);
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0]?.code, REPEATED_BUSINESS_REJECTION_CODE);
        assert.equal(state.trips[0]?.toolName, "write_page");
        assert.equal(state.trips[0]?.count, 3);
        assert.match(state.trips[0]?.rejectionFingerprint ?? "", /^[a-f0-9]{64}$/);
        assert.equal(state.checkpoint.rejectionStreak?.count, 3);
    });
    it("requires an exact canonical rejection and keeps SDK INVALID_ARGS out of its streak", () => {
        const state = harness();
        complete(state, "w1", "write_page", { outcome: "rejected", detail: "overlap A" });
        complete(state, "w2", "write_page", { outcome: "rejected", detail: "overlap B" });
        complete(state, "w3", "write_page", { ok: false, detail: "overlap B" });
        observe(state, call("bad", "write_page"));
        observe(state, result("bad", "Error: missing required property id", { code: "INVALID_ARGS" }));
        complete(state, "w4", "write_page", { outcome: "rejected", detail: "overlap B" });
        assertNoTrips(state);
        assert.equal(state.checkpoint.rejectionStreak?.count, 1);
        assert.equal(state.checkpoint.noProgressCount, 5);
    });
    it("trips early when the model retries an identical INVALID_ARGS call after seeing it fail", () => {
        const state = harness();
        for (let index = 0; index < 8; index += 1) {
            const callId = `w-${index}`;
            const step = index + 1;
            observe(state, call(callId, "write_page", step));
            observe(state, result(callId, "Error: invalid arguments: $.elements is required", { code: "INVALID_ARGS" }, step));
        }
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0]?.code, "repeated-invalid-args");
        assert.equal(state.trips[0]?.toolName, "write_page");
        assert.equal(state.trips[0]?.count, 8);
        assert.match(state.trips[0]?.detail ?? "", /参数无效/);
        assert.equal(state.checkpoint.noProgressCount, 8);
        assert.equal(isPauseFault({ code: "repeated-invalid-args", detail: state.trips[0].detail }), true);
    });
    it("counts identical INVALID_ARGS siblings from one model step as one decision", () => {
        // grok-4.6 sometimes emits hundreds of identical write_page calls in one
        // reply. The model has seen none of their errors yet, so the batch is one
        // mistake, not hundreds of retries; it must reach the next step to recover.
        const state = harness();
        const message = "Error: invalid arguments: $.elements is required";
        for (let index = 0; index < 490; index += 1) {
            const callId = `burst-${index}`;
            observe(state, call(callId, "write_page", 6));
        }
        for (let index = 0; index < 490; index += 1) {
            observe(state, result(`burst-${index}`, message, { code: "INVALID_ARGS" }, 6));
        }
        assertNoTrips(state);
        assert.equal(state.checkpoint.invalidArgsStreak?.count, 1);
        assert.equal(state.checkpoint.noProgressCount, 1);
        // Repeating the same mistake after seeing it still trips at the limit.
        for (let step = 7; step <= 13; step += 1) {
            observe(state, call(`retry-${step}`, "write_page", step));
            observe(state, result(`retry-${step}`, message, { code: "INVALID_ARGS" }, step));
        }
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0]?.code, "repeated-invalid-args");
        assert.equal(state.trips[0]?.count, 8);
    });
    it("does not streak INVALID_ARGS results with different signatures or tools", () => {
        const state = harness();
        for (let index = 0; index < 12; index += 1) {
            const callId = `w-${index}`;
            observe(state, call(callId, "write_page"));
            observe(state, result(callId, `Error: invalid arguments: $.field${index} missing`, { code: "INVALID_ARGS" }));
        }
        assert.equal(state.trips.length, 0);
        assert.equal(state.checkpoint.invalidArgsStreak?.count, 1);
        for (let index = 0; index < 4; index += 1) {
            const callId = `alt-${index}`;
            const toolName = index % 2 === 0 ? "write_page" : "render_page";
            observe(state, call(callId, toolName));
            observe(state, result(callId, "Error: invalid arguments: $.elements is required", { code: "INVALID_ARGS" }));
        }
        assert.equal(state.trips.length, 0);
        assert.equal(state.checkpoint.invalidArgsStreak?.count, 1);
    });
    it("clears the INVALID_ARGS streak on the next non-error result from that tool", () => {
        const state = harness();
        for (let index = 0; index < 4; index += 1) {
            const callId = `w-${index}`;
            const step = index + 1;
            observe(state, call(callId, "write_page", step));
            observe(state, result(callId, "Error: invalid arguments: $.elements is required", { code: "INVALID_ARGS" }, step));
        }
        assert.equal(state.checkpoint.invalidArgsStreak?.count, 4);
        complete(state, "ok-1", "write_page", { outcome: "rejected", detail: "missing_media" });
        assert.equal(state.checkpoint.invalidArgsStreak, undefined);
    });
    it("bounds alternating INVALID_ARGS tools at the default production and planning budgets", () => {
        const production = harness("production");
        for (let index = 0; index < 32; index += 1) {
            const callId = `prod-${index}`;
            const toolName = index % 2 === 0 ? "write_page" : "render_page";
            observe(production, call(callId, toolName));
            observe(production, result(callId, "Error: invalid arguments", { code: "INVALID_ARGS" }));
        }
        assert.equal(production.trips.length, 1);
        assert.equal(production.trips[0]?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
        assert.equal(production.trips[0]?.count, 32);
        assert.equal(production.checkpoint.rejectionStreak, undefined);
        const planning = harness("planning");
        for (let index = 0; index < 64; index += 1) {
            const callId = `plan-${index}`;
            const toolName = index % 2 === 0 ? "read_reference" : "write_todo";
            observe(planning, call(callId, toolName));
            observe(planning, result(callId, "Error: invalid arguments", { code: "INVALID_ARGS" }));
        }
        assert.equal(planning.trips.length, 1);
        assert.equal(planning.trips[0]?.code, PLANNING_NO_PROGRESS_BUDGET_CODE);
        assert.equal(planning.trips[0]?.count, 64);
        assert.equal(planning.checkpoint.rejectionStreak, undefined);
    });
    it("uses the persisted page fingerprint instead of a claimed written outcome", () => {
        const config = { productionNoProgressLimit: 2 };
        const state = harness();
        complete(state, "w1", "write_page", { ok: true, outcome: "written" }, { config });
        assert.equal(state.trips.length, 0);
        complete(state, "w2", "write_page", { ok: true, outcome: "written" }, { config });
        assert.equal(state.trips[0]?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
        const changed = pageFingerprint(2, sha("b"));
        complete(state, "w3", "write_page", { ok: true, outcome: "written" }, {
            config,
            pageRevisionFingerprint: changed,
        });
        assert.equal(state.checkpoint.pageRevisionFingerprint, changed);
        assert.equal(state.checkpoint.noProgressCount, 0);
        assert.equal(state.checkpoint.trippedCode, undefined);
    });
    it("bounds cross-tool no-progress separately for planning and production", () => {
        const config = {
            planningNoProgressLimit: 4,
            productionNoProgressLimit: 2,
        };
        const state = harness("planning");
        for (const [callId, toolName] of [
            ["p1", "inspect_capabilities"],
            ["p2", "list_references"],
            ["p3", "read_reference"],
        ]) {
            complete(state, callId, toolName, { ok: true }, { config });
        }
        assertNoTrips(state);
        complete(state, "p4", "read_page", { ok: true }, { config });
        assert.equal(state.trips[0]?.code, PLANNING_NO_PROGRESS_BUDGET_CODE);
        assert.equal(state.trips[0]?.count, 4);
        observe(state, { type: "turn/note", data: {} }, {
            config,
            phase: "production",
            phaseEpoch: "produce-1",
        });
        assert.equal(state.checkpoint.noProgressCount, 0);
        assert.equal(state.checkpoint.trippedCode, undefined);
        complete(state, "x1", "render_page", { ok: true }, { config });
        complete(state, "x2", "review_page", { ok: true }, { config });
        assert.equal(state.trips.at(-1)?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
    it("treats a phase epoch switch during a result as a fresh boundary", () => {
        const state = harness("planning");
        observe(state, call("late", "write_page"));
        observe(state, result("late", { outcome: "written" }), {
            phase: "production",
            phaseEpoch: "produce-2",
        });
        assert.equal(state.checkpoint.phase, "production");
        assert.equal(state.checkpoint.phaseEpoch, "produce-2");
        assert.equal(state.checkpoint.noProgressCount, 0);
        assert.deepEqual(state.checkpoint.pendingCalls, {});
    });
    it("does not refresh the same-phase budget when only the context epoch changes", () => {
        const config = { productionNoProgressLimit: 2 };
        const state = harness("production");
        complete(state, "read-1", "read_page", { ok: true }, { config });
        assert.equal(state.checkpoint.noProgressCount, 1);
        observe(state, call("read-2", "read_reference"), { config, phaseEpoch: "context-churn-2" });
        observe(state, result("read-2", { ok: true }), { config, phaseEpoch: "context-churn-2" });
        assert.equal(state.trips.at(-1)?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
        assert.equal(state.trips.at(-1)?.count, 2);
    });
    it("remembers already-seen milestones when current evidence disappears and returns", () => {
        const config = { productionNoProgressLimit: 2 };
        const state = harness("production");
        const milestone = "review:current-pass";
        complete(state, "pass", "review_page", { ok: true }, {
            config,
            completionEvidence: [milestone],
            completionEvidenceFingerprint: evidenceFingerprint([milestone]),
        });
        assert.equal(state.checkpoint.noProgressCount, 0);
        complete(state, "revise", "review_page", { ok: true }, {
            config,
            completionEvidence: [],
            completionEvidenceFingerprint: evidenceFingerprint([]),
        });
        assert.equal(state.checkpoint.noProgressCount, 1);
        observe(state, call("pass-again", "review_page"), {
            config,
            completionEvidence: [],
            completionEvidenceFingerprint: evidenceFingerprint([]),
        });
        observe(state, result("pass-again", { ok: true }), {
            config,
            completionEvidence: [milestone],
            completionEvidenceFingerprint: evidenceFingerprint([milestone]),
        });
        assert.equal(state.trips.at(-1)?.code, PRODUCTION_NO_PROGRESS_BUDGET_CODE);
    });
    it("resets a rejection streak on durable progress and non-read work", () => {
        const state = harness();
        const rejected = { outcome: "rejected", detail: "same overlap" };
        complete(state, "w1", "write_page", rejected);
        complete(state, "w2", "write_page", rejected);
        complete(state, "review", "review_page", { ok: true, verdict: "revise" });
        assertNoRejectionStreak(state);
        complete(state, "w3", "write_page", rejected);
        const changed = pageFingerprint(2, sha("b"));
        complete(state, "w4", "write_page", rejected, { pageRevisionFingerprint: changed });
        assertNoRejectionStreak(state);
        complete(state, "w5", "write_page", rejected, { pageRevisionFingerprint: changed });
        assert.equal(state.checkpoint.rejectionStreak?.count, 1);
        assertNoTrips(state);
    });
    it("replays deterministically from a JSON checkpoint using real event shapes", () => {
        const config = { repeatedBusinessRejectionLimit: 3, productionNoProgressLimit: 20 };
        const events = [
            call("w1", "write_page"),
            result("w1", { outcome: "rejected", detail: "same" }),
            call("r1", "read_page"),
            result("r1", { ok: true }),
            call("w2", "write_page"),
            result("w2", { outcome: "rejected", detail: "same" }),
            call("w3", "write_page"),
            result("w3", { outcome: "rejected", detail: "same" }),
        ];
        const uninterrupted = harness();
        for (const event of events)
            observe(uninterrupted, event, { config });
        const resumed = harness();
        for (const event of events.slice(0, 4))
            observe(resumed, event, { config });
        resumed.checkpoint = JSON.parse(JSON.stringify(resumed.checkpoint));
        for (const event of events.slice(4))
            observe(resumed, event, { config });
        assert.deepEqual(resumed.checkpoint, uninterrupted.checkpoint);
        assert.deepEqual(resumed.trips, uninterrupted.trips);
        assert.equal(resumed.trips[0]?.code, REPEATED_BUSINESS_REJECTION_CODE);
    });
    it("ignores an unpaired tool result rather than spending a budget", () => {
        const state = harness();
        observe(state, result("unknown", { outcome: "rejected", detail: "same" }), {
            config: { productionNoProgressLimit: 1 },
        });
        assert.equal(state.checkpoint.noProgressCount, 0);
        assertNoTrips(state);
    });
    it("adapts one checkpoint per session and gives a human-started new turn a fresh budget", () => {
        let current = {
            phase: "planning",
            pageCount: 0,
            pageRevisionFingerprint: pageFingerprint(),
            completionEvidenceFingerprint: EMPTY_COMPLETION_EVIDENCE_FINGERPRINT,
            completionEvidence: [],
            ledgerRevisions: [],
            diskPages: [],
        };
        const guard = new ProductProgressSessionGuard({
            config: { planningNoProgressLimit: 2 },
            sample: () => current,
        });
        guard.observe("session-a", "/unused", { type: "turn/start", data: { turn: 7 } });
        guard.observe("session-a", "/unused", call("read-1", "read_reference"));
        assert.equal(guard.observe("session-a", "/unused", result("read-1", { ok: true })), undefined);
        guard.observe("session-a", "/unused", call("read-2", "read_page"));
        const trip = guard.observe("session-a", "/unused", result("read-2", { ok: true }));
        assert.equal(trip?.code, PLANNING_NO_PROGRESS_BUDGET_CODE);
        assert.equal(isPauseFault({ code: trip.code, detail: trip.detail }), true);
        current = {
            phase: "planning",
            pageCount: 0,
            pageRevisionFingerprint: pageFingerprint(2, sha("b")),
            completionEvidenceFingerprint: EMPTY_COMPLETION_EVIDENCE_FINGERPRINT,
            completionEvidence: [],
            ledgerRevisions: [],
            diskPages: [],
        };
        guard.observe("session-a", "/unused", { type: "turn/end", data: { turn: 7 } });
        assert.equal(guard.checkpoint("session-a"), undefined);
        guard.observe("session-a", "/unused", { type: "turn/start", data: { turn: 8 } });
        guard.observe("session-a", "/unused", call("resumed-read", "read_reference"));
        assert.equal(guard.observe("session-a", "/unused", result("resumed-read", { ok: true })), undefined);
        assert.equal(guard.checkpoint("session-a")?.noProgressCount, 1);
        assert.equal(guard.checkpoint("session-a")?.trippedCode, undefined);
    });
    it("classifies every product no-progress trip as paused", () => {
        for (const code of [
            REPEATED_BUSINESS_REJECTION_CODE,
            PLANNING_NO_PROGRESS_BUDGET_CODE,
            PRODUCTION_NO_PROGRESS_BUDGET_CODE,
        ]) {
            assert.equal(isPauseFault({ code, detail: "bounded no progress" }), true);
        }
    });
});
//# sourceMappingURL=product-progress-guard.test.js.map