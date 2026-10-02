import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_TRACE_DETAIL_MAX, traceRowsFromSessionEvent } from "./agent-trace.js";

describe("agent produce trace", () => {
  it("keeps real reasoning and message deltas distinct with stable block ids", () => {
    const reasoning = traceRowsFromSessionEvent({
      type: "assistant/chunk",
      seq: 4,
      time: Date.parse("2026-09-06T10:00:00.000Z"),
      data: {
        turn: 1,
        step: 1,
        chunk: { type: "reasoning-delta", index: 0, text: "先检查\n  页面结构" },
      },
    });
    const message = traceRowsFromSessionEvent({
      type: "assistant/chunk",
      seq: 5,
      time: Date.parse("2026-09-06T10:00:00.010Z"),
      data: {
        turn: 1,
        step: 1,
        chunk: { type: "text-delta", index: 1, text: "封面已经写入。" },
      },
    });
    assert.deepEqual(
      [reasoning[0]?.kind, message[0]?.kind],
      ["reasoning", "message"],
    );
    assert.equal(reasoning[0]?.id, "assistant:1:1:0:reasoning");
    assert.equal(reasoning[0]?.detail, "先检查\n  页面结构");
    assert.equal(reasoning[0]?.detailMode, "append");
    assert.equal(reasoning[0]?.status, "running");
    assert.equal(reasoning[0]?.at, "2026-09-06T10:00:00.000Z");

    const settled = traceRowsFromSessionEvent({
      type: "assistant/message",
      seq: 8,
      time: Date.parse("2026-09-06T10:00:01.000Z"),
      data: {
        turn: 1,
        step: 1,
        message: {
          content: [
            { type: "reasoning", text: "先检查\n  页面结构" },
            { type: "text", text: "封面已经写入。" },
          ],
        },
      },
    });
    assert.equal(settled[0]?.id, reasoning[0]?.id);
    assert.equal(settled[0]?.status, "complete");
    assert.equal(settled[0]?.detailMode, "replace");
    assert.equal(settled[1]?.id, message[0]?.id);
  });

  it("pairs tool calls and results by exact callId and redacts unsafe payloads", () => {
    const call = traceRowsFromSessionEvent({
      type: "tool/call",
      seq: 9,
      time: 1,
      data: {
        turn: 1,
        step: 1,
        callId: "call-17",
        name: "generate_image",
        arguments: JSON.stringify({
          pageId: "cover",
          prompt: "first line\nsecond line",
          apiKey: "sk-example-secret-value",
          image: "data:image/png;base64,AAAAAAAA",
        }),
      },
    });
    assert.equal(call[0]?.id, "tool:call-17");
    assert.equal(call[0]?.callId, "call-17");
    assert.equal(call[0]?.name, "generate_image");
    assert.equal(call[0]?.pageId, "cover");
    assert.equal(call[0]?.status, "running");
    assert.match(call[0]?.detail ?? "", /first line\\nsecond line/);
    assert.match(call[0]?.detail ?? "", /\[redacted\]/);
    assert.match(call[0]?.detail ?? "", /\[redacted binary data\]/);
    assert.doesNotMatch(call[0]?.detail ?? "", /example-secret-value/);

    const result = traceRowsFromSessionEvent({
      type: "tool/result",
      seq: 10,
      time: 2,
      data: {
        turn: 1,
        step: 1,
        message: {
          source: { kind: "tool", callId: "call-17" },
          content: [{
            type: "tool-result",
            toolCallId: "call-17",
            isError: false,
            content: [{
              type: "text",
              text: JSON.stringify({ ok: true, outcome: "generated", accessToken: "private-token" }),
            }],
          }],
        },
      },
    });
    assert.equal(result[0]?.id, "result:call-17");
    assert.equal(result[0]?.callId, call[0]?.callId);
    assert.equal(result[0]?.status, "complete");
    assert.match(result[0]?.detail ?? "", /"outcome": "generated"/);
    assert.doesNotMatch(result[0]?.detail ?? "", /private-token/);

    const rejected = traceRowsFromSessionEvent({
      type: "tool/result",
      seq: 11,
      time: 3,
      data: {
        message: {
          source: { kind: "tool", callId: "call-18" },
          content: [{
            type: "tool-result",
            toolCallId: "call-18",
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ ok: false, outcome: "rejected" }) }],
          }],
        },
      },
    });
    assert.equal(rejected[0]?.status, "failed");
  });

  it("projects failure, cancellation, and turn lifecycle without inventing completion", () => {
    const started = traceRowsFromSessionEvent({
      type: "turn/start",
      seq: 0,
      time: 1,
      data: { turn: 3 },
    });
    const failed = traceRowsFromSessionEvent({
      type: "turn/end",
      seq: 7,
      time: 2,
      data: {
        turn: 3,
        reason: { kind: "error", error: { code: "PROVIDER", message: "Bearer secret-value failed" } },
      },
    });
    assert.equal(started[0]?.id, failed[0]?.id);
    assert.equal(started[0]?.status, "running");
    assert.equal(failed[0]?.status, "failed");
    assert.doesNotMatch(failed[0]?.detail ?? "", /secret-value/);

    const cancelled = traceRowsFromSessionEvent({
      type: "turn/end",
      seq: 8,
      time: 3,
      data: { turn: 4, reason: { kind: "aborted", reason: { kind: "user" } } },
    });
    assert.equal(cancelled[0]?.status, "cancelled");
    assert.match(cancelled[0]?.detail ?? "", /user/);
  });

  it("marks bounded multiline detail as truncated", () => {
    const rows = traceRowsFromSessionEvent({
      type: "assistant/message",
      seq: 20,
      time: 4,
      data: {
        turn: 2,
        step: 3,
        message: { content: [{ type: "reasoning", text: `line one\n${"x".repeat(AGENT_TRACE_DETAIL_MAX)}` }] },
      },
    });
    assert.equal(rows[0]?.truncated, true);
    assert.equal(rows[0]?.detail?.length, AGENT_TRACE_DETAIL_MAX);
    assert.match(rows[0]?.detail ?? "", /^line one\n/);
  });
});
