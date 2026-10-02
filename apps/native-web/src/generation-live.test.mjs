import assert from "node:assert/strict";
import { test } from "node:test";
import { createGenerationLiveBuffer } from "../public/generation-live.js";
const message = (cursor, detail, status = "running", more = {}) => ({
  version: 1, sessionId: "s", epoch: "e", cursor,
  rows: [{ id: "r", kind: "reasoning", at: "now", detail, status, detailMode: "replace" }], ...more,
});
test("native text snapshots grow once, and replay never duplicates", () => {
  const b = createGenerationLiveBuffer("s");
  b.accept(message(1, "a")); b.accept(message(2, "ab"));
  b.accept(message(2, "ab", "running", { snapshot: true }));
  assert.equal(b.merge({}).events[0].detail, "ab");
  assert.equal(b.accept(message(1, "a")), false);
  b.accept(message(3, "corrected", "complete"));
  assert.equal(b.merge({}).events[0].detail, "corrected");
});
test("late viewer gets the whole in-flight prefix without a replay animation", () => {
  const b = createGenerationLiveBuffer("s");
  b.accept(message(19, "already emitted prefix", "running", { snapshot: true }));
  assert.equal(b.merge({ events: [] }).events[0].detail, "already emitted prefix");
});
test("poll cannot erase a live prefix or choose text by length", () => {
  const b = createGenerationLiveBuffer("s");
  b.accept(message(1, "a long draft"));
  b.accept(message(2, "short", "complete"));
  const stale = { sessionId: "s", events: [{ id: "r", detail: "longer stale value", status: "running" }] };
  assert.equal(b.merge(stale).events[0].detail, "short");
  assert.equal(b.merge(stale).events.length, 1);
});
test("fallback polling can settle a missed final frame", () => {
  const b = createGenerationLiveBuffer("s");
  b.accept(message(1, "prefix"));
  const final = { events: [{ id: "r", detail: "final", status: "complete" }] };
  assert.equal(b.merge(final, { connected: false }).events[0].detail, "final");
});
test("foreign sessions are refused and new server epoch resets transport cursor", () => {
  const b = createGenerationLiveBuffer("s");
  assert.equal(b.accept(message(1, "foreign", "running", { sessionId: "other" })), false);
  b.accept(message(100, "old"));
  b.accept(message(1, "new", "running", { epoch: "restarted", snapshot: true }));
  assert.equal(b.merge({}).events[0].detail, "new");
});
