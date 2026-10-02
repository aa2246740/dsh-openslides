import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExclusiveSessionGate, WritePageSerialQueue } from "./write-page-serial.js";

describe("write_page serial queue", () => {
  it("runs two session tasks one after the other", async () => {
    const queue = new WritePageSerialQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstHold = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.enqueue("s1", async () => {
      order.push("first-start");
      await firstHold;
      order.push("first-end");
      return 1;
    });
    const second = queue.enqueue("s1", async () => {
      order.push("second-start");
      return 2;
    });
    await Promise.resolve();
    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    assert.equal(await first, 1);
    assert.equal(await second, 2);
    assert.deepEqual(order, ["first-start", "first-end", "second-start"]);
  });

  it("does not block a different session", async () => {
    const queue = new WritePageSerialQueue();
    let releaseA: () => void = () => undefined;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const a = queue.enqueue("a", async () => {
      await holdA;
      return "a";
    });
    const b = queue.enqueue("b", async () => "b");
    assert.equal(await b, "b");
    releaseA();
    assert.equal(await a, "a");
  });
});

describe("exclusive page step gate", () => {
  it("refuses a second acquire on the same session until release", () => {
    const gate = new ExclusiveSessionGate();
    const first = gate.tryAcquire("s1", "write_page");
    assert.equal(first.ok, true);
    const second = gate.tryAcquire("s1", "write_page");
    assert.equal(second.ok, false);
    if (second.ok === false) assert.equal(second.busyWith, "write_page");
    if (first.ok) first.release();
    const third = gate.tryAcquire("s1", "write_page");
    assert.equal(third.ok, true);
    if (third.ok) third.release();
  });

  it("allows two sessions at once", () => {
    const gate = new ExclusiveSessionGate();
    const a = gate.tryAcquire("a", "review_page");
    const b = gate.tryAcquire("b", "review_page");
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok) a.release();
    if (b.ok) b.release();
  });
});
