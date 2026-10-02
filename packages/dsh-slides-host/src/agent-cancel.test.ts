import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cancelAgentOutsideAppend } from "./agent-cancel.js";

/**
 * Kernel contract under test: `session.append` throws
 * "session append cannot reenter while another append is being published"
 * while an event is inside its publish window — exactly where `session/event`
 * observers run. A synchronous `agent.cancel()` there dies inside
 * `inbox.clear()`'s nested `agent/inbox/spliced` append, before `phase.abort`
 * fires, and observer containment swallows the error. The deferred cancel must
 * therefore not touch the agent until the window has closed.
 */
describe("cancelAgentOutsideAppend", () => {
  it("does not call cancel synchronously, then lands it after the append boundary", async () => {
    let appending = true;
    let cancelledWith: unknown;
    const session = {
      append() {
        if (appending) {
          throw new Error("session append cannot reenter while another append is being published");
        }
      },
    };
    const agent = {
      cancel(cause: unknown) {
        // Mirrors the kernel path: inbox.clear() appends before aborting.
        session.append();
        cancelledWith = cause;
      },
    };
    cancelAgentOutsideAppend(agent, "sess-1", "tool-invalid-args-loop");
    assert.equal(cancelledWith, undefined);
    appending = false;
    await Promise.resolve();
    assert.deepEqual(cancelledWith, { kind: "hook", reason: "tool-invalid-args-loop" });
  });

  it("logs a cancel failure instead of throwing into the observer loop", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    try {
      cancelAgentOutsideAppend(
        { cancel: () => { throw new Error("already disposed"); } },
        "sess-2",
        "planning-no-progress-budget",
      );
      await Promise.resolve();
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /sess-2/);
    assert.match(warnings[0]!, /already disposed/);
  });
});
