import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @deepseek-ai/dsh-session 0.1.5-rc.2 dropped the official chunk-row codec, so the
// legacy packing is emulated here to keep the journal's expansion plumbing covered.
const legacyDecodeStorageRecord = (record) => {
  if (record?.type !== "reasoning-chunks" && record?.type !== "text-chunks") return [record];
  const { turn, step, index, dt = [], texts = [] } = record.data ?? {};
  let time = Number(record.time0 ?? 0);
  return texts.map((text, position) => {
    if (position > 0) time += Number(dt[position - 1] ?? 0);
    return {
      type: record.type === "reasoning-chunks" ? "reasoning/chunk" : "assistant/chunk",
      seq: Number(record.seq0 ?? 0) + position,
      time,
      data: { turn, step, index, chunk: { text } },
    };
  });
};
import { decodeJournalContent, readProjectSessionTrace } from "./session-trace-journal.mjs";

describe("read-only session trace journal", () => {
  it("expands legacy packed reasoning rows into exact Session events", () => {
    const content = [
      JSON.stringify({
        type: "session",
        version: 0,
        id: "session-a",
        createdAt: 1,
        delegationDepth: 0,
      }),
      JSON.stringify({
        type: "reasoning-chunks",
        seq0: 0,
        time0: 100,
        data: {
          turn: 1,
          step: 1,
          index: 0,
          dt: [2, 3],
          texts: ["one", "\n", "two"],
        },
      }),
      JSON.stringify({
        type: "turn/end",
        seq: 3,
        time: 110,
        data: { turn: 1, reason: { kind: "completed" } },
      }),
      "",
    ].join("\n");
    const events = decodeJournalContent(content, legacyDecodeStorageRecord);
    assert.deepEqual(events.map((event) => event.seq), [0, 1, 2, 3]);
    assert.deepEqual(
      events.slice(0, 3).map((event) => event.data.chunk.text),
      ["one", "\n", "two"],
    );
    assert.deepEqual(events.slice(0, 3).map((event) => event.time), [100, 102, 105]);
  });

  it("passes plain event rows through when the DSH codec is gone, and fails loud on a packed legacy row", () => {
    const header = JSON.stringify({ type: "session", version: 0, id: "session-b", createdAt: 1, delegationDepth: 0 });
    const plain = [header, JSON.stringify({ type: "turn/end", seq: 0, time: 5, data: { turn: 1, reason: { kind: "completed" } } }), ""].join("\n");
    // No codec: the installed DSH stores unpacked event rows, so they survive as-is.
    assert.deepEqual(decodeJournalContent(plain, undefined).map((event) => event.seq), [0]);

    const packed = [header, JSON.stringify({ type: "reasoning-chunks", seq0: 0, time0: 1, data: { texts: ["a", "b"], dt: [1] } }), ""].join("\n");
    // A compressed legacy row cannot be decoded without the codec; it must fail
    // loudly rather than silently drop or mislabel the run.
    assert.throws(() => decodeJournalContent(packed, undefined), /sequence mismatch/);
  });

  it("opens an isolated official reader without materializing a missing session", async () => {
    const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), "journal-reader-"));
    const dshHome = path.join(productRoot, ".dsh", "home");
    const sessionsRoot = path.join(dshHome, "sessions");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const before = fs.readdirSync(sessionsRoot);
    const rows = await readProjectSessionTrace({
      productRoot,
      dshHome,
      sessionId: "missing-session",
    });
    assert.deepEqual(rows, []);
    assert.deepEqual(fs.readdirSync(sessionsRoot), before);
  });

  it("returns the last successful projection when a later journal read is transiently unavailable", async () => {
    const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), "journal-cache-"));
    const dshHome = path.join(productRoot, ".dsh", "home");
    fs.mkdirSync(path.join(dshHome, "sessions"), { recursive: true });
    let fail = false;
    const readerFactory = async () => ({
      SessionId: (value) => value,
      decodeStorageRecord: (value) => [value],
      backend: {
        readStoredRevision: async () => fail ? "revision-2" : "revision-1",
        readRaw: async () => {
          if (fail) throw new Error("temporary incomplete frame");
          return {
            meta: { id: "session-cache", cwd: fs.realpathSync(productRoot) },
            content: [
              JSON.stringify({ type: "session", id: "session-cache" }),
              JSON.stringify({
                type: "assistant/chunk",
                seq: 0,
                time: 1,
                data: { turn: 1, step: 1, chunk: { type: "text-delta", index: 0, text: "kept" } },
              }),
              "",
            ].join("\n"),
          };
        },
      },
    });
    const traceModule = {
      traceRowsFromSessionEvent: (event) => [{ id: `event:${event.seq}`, detail: event.data.chunk.text }],
    };
    const args = { productRoot, dshHome, sessionId: "session-cache", readerFactory, traceModule };
    const first = await readProjectSessionTrace(args);
    fail = true;
    const fallback = await readProjectSessionTrace(args);
    assert.deepEqual(first, [{ id: "event:0", detail: "kept" }]);
    assert.deepEqual(fallback, first);
  });
});
