import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText, streamText } from "./stream-text.js";

describe("stream-text", () => {
  it("flushes on newlines and chunk size", () => {
    assert.deepEqual(chunkText("abcd", 2), ["ab", "cd"]);
    assert.deepEqual(chunkText("一\n二\n", 8), ["一\n", "二\n"]);
  });

  it("emits growing prefixes even when pace is 0", async () => {
    const seen: string[] = [];
    await streamText("勾股定理", (partial) => seen.push(partial), { paceMs: 0, chunkSize: 2 });
    assert.ok(seen.length >= 2);
    for (let i = 1; i < seen.length; i++) {
      assert.ok(seen[i]!.startsWith(seen[i - 1]!));
      assert.ok(seen[i]!.length > seen[i - 1]!.length);
    }
    assert.equal(seen.at(-1), "勾股定理");
  });
});
