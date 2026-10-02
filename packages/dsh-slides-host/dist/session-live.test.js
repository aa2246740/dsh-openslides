import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { attachSessionLive, closeSessionLive, publishSessionLive, sessionLiveSubscriberCount } from "./session-live.js";
// Real HTTP sockets: a unit-only response double concealed request-close bugs.
async function readUntil(reader, marker) {
    let text = "";
    while (!text.includes(marker)) {
        const chunk = await reader.read();
        if (chunk.done)
            break;
        text += new TextDecoder().decode(chunk.value);
    }
    return text;
}
test("SSE connects, sends native snapshots, replays on reconnect and releases sockets", { timeout: 8000 }, async () => {
    const server = createServer((req, res) => attachSessionLive(req.url.slice(1), req, res));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const controller = new AbortController();
    const second = new AbortController();
    try {
        const res = await fetch(`${base}/one`, { signal: controller.signal });
        assert.match(res.headers.get("content-type"), /text\/event-stream/);
        const reader = res.body.getReader();
        const initial = new TextDecoder().decode((await reader.read()).value);
        assert.match(initial, /connected/);
        assert.equal(sessionLiveSubscriberCount("one"), 1);
        publishSessionLive("one", [{ id: "a", at: "now", kind: "reasoning", status: "running", detail: "prefix",
                detailMode: "replace", stream: { attemptId: "one:1", revision: 2, index: 0 } }]);
        const next = await readUntil(reader, "prefix");
        assert.match(next, /prefix/);
        assert.match(next, /"sessionId":"one"/);
        assert.equal(sessionLiveSubscriberCount("other"), 0);
        controller.abort();
        await reader.cancel().catch(() => { });
        const reconnected = await fetch(`${base}/one`, { signal: second.signal });
        const replay = await readUntil(reconnected.body.getReader(), "prefix");
        assert.match(replay, /"snapshot":true/);
        assert.match(replay, /prefix/);
    }
    finally {
        controller.abort();
        second.abort();
        closeSessionLive();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve()));
    }
    assert.equal(sessionLiveSubscriberCount("one"), 0);
});
//# sourceMappingURL=session-live.test.js.map