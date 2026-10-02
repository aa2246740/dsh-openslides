import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { classifyAgentError, recordAgentError, readAgentError, readCurrentAgentError, AgentFaults } from "./agent-fault.js";
import { assertExpectedAttempt, beginAttempt, parseExpectedAttemptId, parseModelSelection, SessionTransitionConflict, withSessionTransition, } from "./session-transition.js";
function tempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-attempt-"));
    fs.mkdirSync(path.join(root, "_agent"));
    return root;
}
test("modelSelection and expectedAttemptId are validated before any session change", () => {
    assert.deepEqual(parseModelSelection({ provider: "pi-xai", model: "grok-4.6" }), {
        provider: "pi-xai", model: "grok-4.6",
    });
    assert.throws(() => parseModelSelection({ provider: "pi-xai" }));
    assert.equal(parseExpectedAttemptId(undefined), undefined);
    assert.throws(() => parseExpectedAttemptId(12));
});
test("an expected attempt must match the current durable attempt", () => {
    const root = tempRoot();
    const attempt = beginAttempt(root);
    assertExpectedAttempt(root, attempt.attemptId);
    assert.throws(() => assertExpectedAttempt(root, "other-attempt"), (error) => error instanceof SessionTransitionConflict && error.status === 409);
});
test("retry keeps the original fault and only marks it recovering", () => {
    const root = tempRoot();
    const first = beginAttempt(root);
    recordAgentError(root, { code: "provider-rate-limit", detail: "429", attemptId: first.attemptId });
    const second = beginAttempt(root, readAgentError(root));
    const stored = readAgentError(root);
    assert.equal(stored?.code, "provider-rate-limit");
    assert.equal(stored?.recovering, true);
    assert.equal(stored?.attemptId, first.attemptId);
    assert.equal(second.recoveringFrom, first.attemptId);
    assert.notEqual(second.attemptId, first.attemptId);
    assert.equal(readCurrentAgentError(root), undefined);
    const faults = new AgentFaults();
    faults.note("session", { code: "provider-rate-limit", detail: "429", attemptId: second.attemptId }, root);
    assert.equal(readCurrentAgentError(root)?.attemptId, second.attemptId);
    beginAttempt(root, readAgentError(root));
    faults.settle("session", root, "page-ready");
    assert.equal(readCurrentAgentError(root), undefined, "an old in-memory fault cannot poison a new turn");
});
test("settle on complete clears only stale bounded-guard markers, never provider faults", () => {
    const root = tempRoot();
    const faults = new AgentFaults();
    // A guard trip whose cancel never landed leaves a stale pause marker; the
    // turn finished cleanly, so the marker is dead weight.
    faults.note("session", { code: "tool-invalid-args-loop", detail: "tripped" }, root);
    faults.settle("session", root, "complete");
    assert.equal(readAgentError(root), undefined, "stale bounded-trip pause clears on complete");
    // A provider fault on an already-finished deck is a real failed edit — the
    // pause must survive so the run does not read as silently complete.
    faults.note("session", { code: "provider-auth", detail: "401" }, root);
    faults.settle("session", root, "complete");
    assert.equal(readAgentError(root)?.code, "provider-auth", "provider fault survives complete");
    faults.note("session", { code: "operator-stop", detail: "user stopped" }, root);
    faults.settle("session", root, "complete");
    assert.equal(readAgentError(root)?.code, "operator-stop", "operator stop survives complete");
});
test("same-session transitions do not overlap", async () => {
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    const first = withSessionTransition("sess", async () => {
        order.push("first-enter");
        await firstGate;
        order.push("first-leave");
    });
    const second = withSessionTransition("sess", async () => {
        order.push("second");
    });
    await Promise.resolve();
    assert.deepEqual(order, ["first-enter"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first-enter", "first-leave", "second"]);
});
test("serialization faults record a path and type without payload values", () => {
    const fault = classifyAgentError({
        message: "session event \"assistant/chunk\" carries non-JSON-serializable data at data.delta typeof object",
    });
    assert.equal(fault.code, "serialization-error");
    assert.match(fault.detail, /data\.delta/);
    assert.match(fault.detail, /object/);
    assert.doesNotMatch(fault.detail, /assistant\/chunk carries/);
    assert.doesNotMatch(fault.detail, /pi-xai|minimax|api key/i);
    assert.match(fault.detail, /were not recorded/);
});
//# sourceMappingURL=session-transition.test.js.map