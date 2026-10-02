import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssistantStreamFrame } from "@deepseek-ai/dsh-agent";
import type { AgentTraceRow } from "./agent-trace.js";
import { AgentStreamBridge } from "./stream-bridge.js";

const start = (id = "attempt", revision = 1): AssistantStreamFrame => ({
  type: "start", attemptId: id, revision, turn: 1, step: 1,
} as AssistantStreamFrame);
const chunk = (revision: number, index: number, text: string, kind = "reasoning-delta", attemptId = "attempt"): AssistantStreamFrame => ({
  type: "chunk", attemptId, revision, index, time: 1,
  chunk: { type: kind, index: 0, text },
} as AssistantStreamFrame);
const end = (revision: number, index: number, committed: boolean): AssistantStreamFrame => ({
  type: "end", attemptId: "attempt", revision, index,
  outcome: committed ? { kind: "committed", eventType: "assistant/message", seq: 10 } : { kind: "abandoned" },
} as AssistantStreamFrame);
function harness() {
  const deliveries: { session: string; rows: readonly AgentTraceRow[] }[] = [];
  const bridge = new AgentStreamBridge((session, rows) => deliveries.push({ session, rows }));
  return { bridge, deliveries, rows: () => deliveries.flatMap(batch => batch.rows) };
}

test("native revision increments every frame; attempt identity stays stable", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "a"));
  h.bridge.flush();
  h.bridge.handleFrame("s", chunk(3, 1, "b"));
  h.bridge.flush();
  assert.deepEqual(h.rows().map(r => r.detail), ["a", "ab"]);
  assert.ok(h.rows().every(r => r.detailMode === "replace" && r.status === "running"));
  h.bridge.handleFrame("s", end(4, 2, true));
  assert.equal(h.rows().at(-1)?.detail, "ab");
  assert.equal(h.rows().at(-1)?.status, "complete");
  h.bridge.dispose();
});

test("all chunk frame indexes count, including non-text frames", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", { type: "chunk", attemptId: "attempt", revision: 2, index: 0, time: 1,
    chunk: { type: "block-start", index: 0, blockType: "reasoning" } } as AssistantStreamFrame);
  h.bridge.handleFrame("s", chunk(3, 1, "live"));
  h.bridge.flush();
  assert.equal(h.rows()[0]?.detail, "live");
  h.bridge.dispose();
});

test("interleaved sessions never share attempt state, even with equal attempt ids", () => {
  const h = harness();
  for (const s of ["a", "b"]) h.bridge.handleFrame(s, start());
  h.bridge.handleFrame("a", chunk(2, 0, "alpha"));
  h.bridge.handleFrame("b", chunk(2, 0, "beta"));
  h.bridge.flush();
  assert.deepEqual(h.deliveries.map(x => [x.session, x.rows[0]?.detail]), [["a", "alpha"], ["b", "beta"]]);
  h.bridge.dispose();
});

test("settlement flushes pending data before authoritative correction; no late running frame", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "long provisional"));
  const final = h.bridge.settle("s", [{ id: "assistant:1:1:0:reasoning", at: "now", turn: 1, step: 1,
    kind: "reasoning", status: "complete", detail: "short correction", detailMode: "replace" }]);
  h.deliveries.push({ session: "s", rows: final });
  h.bridge.handleFrame("s", end(3, 1, true));
  h.bridge.flush();
  assert.deepEqual(h.rows().map(r => [r.status, r.detail]), [["running", "long provisional"], ["complete", "short correction"]]);
  h.bridge.dispose();
});

test("abandonment preserves partial answer and its kind", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "answer", "text-delta"));
  h.bridge.handleFrame("s", end(3, 1, false));
  assert.equal(h.rows().at(-1)?.kind, "message");
  assert.equal(h.rows().at(-1)?.detail, "answer");
  assert.equal(h.rows().at(-1)?.status, "cancelled");
  h.bridge.dispose();
});

test("duplicates are ignored; missing frame abandons rather than inventing a prefix", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "a"));
  h.bridge.handleFrame("s", chunk(2, 0, "a"));
  h.bridge.handleFrame("s", chunk(4, 2, "c"));
  assert.equal(h.rows().at(-1)?.detail, "a");
  assert.equal(h.rows().at(-1)?.status, "cancelled");
  h.bridge.dispose();
});

test("retry/new lifecycle resets content even at the same turn/step", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "discarded"));
  h.bridge.handleFrame("s", start("retry", 3));
  h.bridge.handleFrame("s", chunk(4, 0, "new", "reasoning-delta", "retry"));
  h.bridge.flush();
  assert.equal(h.rows().at(-1)?.detail, "new");
  h.bridge.disposeSession("s");
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "after restart"));
  h.bridge.flush();
  assert.equal(h.rows().at(-1)?.detail, "after restart");
  h.bridge.dispose();
});

test("live publication uses public redaction and truncation boundary", () => {
  const h = harness();
  h.bridge.handleFrame("s", start());
  h.bridge.handleFrame("s", chunk(2, 0, "Bearer secret-token-test-only"));
  h.bridge.flush();
  assert.doesNotMatch(h.rows()[0]?.detail ?? "", /secret-token-test-only/);
  h.bridge.handleFrame("s", chunk(3, 1, " words".repeat(4000)));
  h.bridge.flush();
  assert.ok(h.rows().at(-1)?.truncated);
  assert.equal(h.rows().at(-1)?.detail?.length, 8192);
  h.bridge.dispose();
});
