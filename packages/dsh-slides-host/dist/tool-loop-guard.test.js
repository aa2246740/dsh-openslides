import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOOL_INVALID_ARGS_LOOP_CODE, ToolInvalidArgsLoopGuard, } from "./tool-loop-guard.js";
import { isPauseFault } from "./agent-fault.js";
const call = (turn, callId, name = "write_page", step = 1) => ({
    type: "tool/call",
    data: { turn, step, callId, name, arguments: "{}" },
});
const result = (turn, callId, options = {}) => ({
    type: "tool/result",
    data: {
        turn,
        step: options.step ?? 1,
        message: {
            source: { kind: "tool", callId },
            content: [{
                    type: "tool-result",
                    toolCallId: callId,
                    isError: options.invalid === true,
                    content: [{
                            type: "text",
                            text: options.invalid
                                ? options.omitErrorText
                                    ? ""
                                    : options.invalidText ?? "Error: invalid arguments: missing required property id"
                                : JSON.stringify({ ok: options.ok ?? true, outcome: options.ok === false ? "rejected" : "written" }),
                        }],
                }],
        },
        ...(options.invalid
            ? {
                error: {
                    name: "ToolArgsError",
                    code: "INVALID_ARGS",
                    ...(options.errorMessage ? { message: options.errorMessage } : {}),
                },
            }
            : {}),
    },
});
describe("repeated tool argument guard", () => {
    it("trips once on the third same-tool, same-error INVALID_ARGS result", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-a", { type: "turn/start", data: { turn: 4 } });
        let trip;
        for (const [index, callId] of ["call-1", "call-2", "call-3", "call-4"].entries()) {
            guard.observe("session-a", call(4, callId, "write_page", index + 1));
            const next = guard.observe("session-a", result(4, callId, { invalid: true, step: index + 1 }));
            if (next) {
                assert.equal(trip, undefined);
                trip = next;
            }
        }
        assert.equal(trip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        assert.equal(trip?.toolName, "write_page");
        assert.equal(trip?.count, 3);
        assert.match(trip?.detail ?? "", /连续 3 次.*已暂停/);
        assert.equal(isPauseFault({ code: trip.code, detail: trip.detail }), true);
    });
    it("does not trip on the fresh MiniMax sequence after the model fixes each error category", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-fresh", { type: "turn/start", data: { turn: 1 } });
        const messages = [
            "Error: invalid arguments: $.elements[21].content.text must be a string; $.elements[22].content.text must be a string; $.elements[23].content.text must be a string",
            "Error: invalid arguments: $.elements[12].content.text must be a string; $.elements[16].content.text must be a string; $.elements[20].content.text must be a string",
            "Error: invalid arguments: $.elements[3].viewBox must contain exactly 2 numbers; $.elements[4].viewBox must contain exactly 2 numbers; $.elements[5].viewBox must contain exactly 2 numbers",
        ];
        for (const [index, invalidText] of messages.entries()) {
            const callId = `fresh-${index}`;
            const step = index + 1;
            guard.observe("session-fresh", call(1, callId, "write_page", step));
            assert.equal(guard.observe("session-fresh", result(1, callId, { invalid: true, invalidText, step })), undefined);
        }
    });
    it("normalizes element indices and duplicate copies of the same issue before counting", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-normalized", { type: "turn/start", data: { turn: 1 } });
        const messages = [
            "Error: invalid arguments: $.elements[21].content.text must be a string; $.elements[22].content.text must be a string; $.elements[23].content.text must be a string",
            "Error: invalid arguments: $.elements[7].content.text must be a string",
            "Error: invalid arguments: $.elements[99].content.text must be a string; $.elements[2].content.text must be a string",
        ];
        let trip;
        for (const [index, invalidText] of messages.entries()) {
            const callId = `normalized-${index}`;
            const step = index + 1;
            guard.observe("session-normalized", call(1, callId, "write_page", step));
            trip = guard.observe("session-normalized", result(1, callId, { invalid: true, invalidText, step })) ?? trip;
        }
        assert.equal(trip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        assert.equal(trip?.count, 3);
    });
    it("sorts different normalized issues before fingerprinting", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-sorted", { type: "turn/start", data: { turn: 1 } });
        const textIssue = (index) => `$.elements[${index}].content.text must be a string`;
        const boundsIssue = (index) => `$.elements[${index}].bounds must be an array`;
        const messages = [
            `Error: invalid arguments: ${textIssue(2)}; ${boundsIssue(5)}`,
            `Error: invalid arguments: ${boundsIssue(18)}; ${textIssue(9)}`,
            `Error: invalid arguments: ${textIssue(30)}; ${boundsIssue(11)}`,
        ];
        let trip;
        for (const [index, invalidText] of messages.entries()) {
            const callId = `sorted-${index}`;
            const step = index + 1;
            guard.observe("session-sorted", call(1, callId, "write_page", step));
            trip = guard.observe("session-sorted", result(1, callId, { invalid: true, invalidText, step })) ?? trip;
        }
        assert.equal(trip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        assert.equal(trip?.count, 3);
    });
    it("uses data.error.message when present and a stable code fallback when no message exists", () => {
        const direct = new ToolInvalidArgsLoopGuard();
        direct.observe("session-direct", { type: "turn/start", data: { turn: 1 } });
        let directTrip;
        for (const [order, index] of [1, 8, 20].entries()) {
            const callId = `direct-${index}`;
            const step = order + 1;
            direct.observe("session-direct", call(1, callId, "write_page", step));
            directTrip = direct.observe("session-direct", result(1, callId, {
                invalid: true,
                omitErrorText: true,
                step,
                errorMessage: `Invalid arguments: $.elements[${index}].content.text must be a string`,
            })) ?? directTrip;
        }
        assert.equal(directTrip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        const fallback = new ToolInvalidArgsLoopGuard();
        fallback.observe("session-fallback", { type: "turn/start", data: { turn: 1 } });
        let fallbackTrip;
        for (const [index, callId] of ["fallback-1", "fallback-2", "fallback-3"].entries()) {
            const step = index + 1;
            fallback.observe("session-fallback", call(1, callId, "write_page", step));
            fallbackTrip = fallback.observe("session-fallback", result(1, callId, { invalid: true, omitErrorText: true, step })) ?? fallbackTrip;
        }
        assert.equal(fallbackTrip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        assert.equal(fallbackTrip?.count, 3);
    });
    it("resets on success, ordinary business rejection, another tool, and a new turn", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-b", { type: "turn/start", data: { turn: 1 } });
        let step = 0;
        const invalid = (callId, name = "write_page") => {
            step += 1;
            guard.observe("session-b", call(1, callId, name, step));
            return guard.observe("session-b", result(1, callId, { invalid: true, step }));
        };
        const nonInvalid = (callId, name = "write_page", ok = true) => {
            step += 1;
            guard.observe("session-b", call(1, callId, name, step));
            return guard.observe("session-b", result(1, callId, { ok, step }));
        };
        assert.equal(invalid("a"), undefined);
        assert.equal(nonInvalid("success"), undefined);
        assert.equal(invalid("b"), undefined);
        assert.equal(nonInvalid("business", "write_page", false), undefined);
        assert.equal(invalid("c"), undefined);
        assert.equal(invalid("other", "render_page"), undefined);
        assert.equal(invalid("d"), undefined);
        guard.observe("session-b", { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } });
        guard.observe("session-b", { type: "turn/start", data: { turn: 2 } });
        for (const [index, callId] of ["n1", "n2"].entries()) {
            const turnTwoStep = index + 1;
            guard.observe("session-b", call(2, callId, "write_page", turnTwoStep));
            assert.equal(guard.observe("session-b", result(2, callId, { invalid: true, step: turnTwoStep })), undefined);
        }
    });
    it("does not trip when four identical INVALID_ARGS arrive from one parallel tool batch", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-parallel", { type: "turn/start", data: { turn: 1 } });
        for (const callId of ["p1", "p2", "p3", "p4"]) {
            guard.observe("session-parallel", call(1, callId));
        }
        let trip;
        for (const callId of ["p1", "p2", "p3", "p4"]) {
            trip = guard.observe("session-parallel", result(1, callId, { invalid: true })) ?? trip;
        }
        assert.equal(trip, undefined);
    });
    it("still trips after the model retries the same INVALID_ARGS after seeing the parallel batch", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-after-batch", { type: "turn/start", data: { turn: 1 } });
        for (const callId of ["p1", "p2", "p3", "p4"]) {
            guard.observe("session-after-batch", call(1, callId));
        }
        for (const callId of ["p1", "p2", "p3", "p4"]) {
            assert.equal(guard.observe("session-after-batch", result(1, callId, { invalid: true })), undefined);
        }
        guard.observe("session-after-batch", call(1, "retry-1", "write_page", 2));
        assert.equal(guard.observe("session-after-batch", result(1, "retry-1", { invalid: true, step: 2 })), undefined);
        guard.observe("session-after-batch", call(1, "retry-2", "write_page", 3));
        const trip = guard.observe("session-after-batch", result(1, "retry-2", { invalid: true, step: 3 }));
        assert.equal(trip?.code, TOOL_INVALID_ARGS_LOOP_CODE);
        assert.equal(trip?.count, 3);
    });
    it("shares one count across a chunked parallel batch journaled as call/result interleave", () => {
        // maxParallelToolCalls caps in-flight dispatches, so one model message's
        // calls land in the journal as chunks interleaved with results:
        //   [results 1-7] [calls 8-17] [results 8-17] [calls 18-27] [results 18-27]
        // Chunk-N calls carry issuedSeq > lastResultSeq, but they are still one
        // model decision — the step number is the retry boundary, not journal seq.
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-chunked", { type: "turn/start", data: { turn: 1 } });
        const events = [];
        let produced = 0;
        for (let chunk = 0; chunk < 20; chunk += 1) {
            const ids = Array.from({ length: 10 }, () => `chunked-${produced++}`);
            for (const callId of ids)
                events.push(call(1, callId, "write_page", 10));
            for (const callId of ids) {
                events.push(result(1, callId, { invalid: true, step: 10 }));
            }
        }
        let trip;
        for (const event of events) {
            trip = guard.observe("session-chunked", event) ?? trip;
        }
        assert.equal(trip, undefined);
    });
    it("does not classify isError or ok false without the stable INVALID_ARGS code", () => {
        const guard = new ToolInvalidArgsLoopGuard();
        guard.observe("session-c", { type: "turn/start", data: { turn: 1 } });
        for (const callId of ["x1", "x2", "x3", "x4"]) {
            guard.observe("session-c", call(1, callId));
            const event = result(1, callId, { ok: false });
            event.data.message.content[0].isError = true;
            assert.equal(guard.observe("session-c", event), undefined);
        }
    });
});
it("re-reading a page cannot reset repeated invalid writes", () => {
    const guard = new ToolInvalidArgsLoopGuard();
    guard.observe("reread", { type: "turn/start", data: { turn: 1 } });
    let trip;
    for (const i of [1, 2, 3]) {
        const step = i * 2 - 1;
        guard.observe("reread", call(1, `write-${i}`, "write_page", step));
        trip = guard.observe("reread", result(1, `write-${i}`, { invalid: true, step }));
        guard.observe("reread", call(1, `read-${i}`, "read_page", step + 1));
        guard.observe("reread", result(1, `read-${i}`, { step: step + 1 }));
    }
    assert.equal(trip?.count, 3);
});
//# sourceMappingURL=tool-loop-guard.test.js.map