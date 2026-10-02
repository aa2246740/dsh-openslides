import { randomUUID } from "node:crypto";
const epoch = randomUUID();
const listeners = new Map();
// Bounded, process-local prefixes for refresh/reconnect. Durable history remains on disk.
const retained = new Map();
const MAX_SESSIONS = 32;
const MAX_ROWS = 64;
const MAX_PENDING_BYTES = 1_048_576;
function drop(sessionId, res) {
    const set = listeners.get(sessionId);
    set?.delete(res);
    if (!set?.size)
        listeners.delete(sessionId);
}
function send(sessionId, res, message) {
    if (res.destroyed || res.writableEnded || res.writableLength > MAX_PENDING_BYTES) {
        drop(sessionId, res);
        res.destroy(); // A slow/dead viewer must never stall generation.
        return;
    }
    try {
        res.write(`id: ${epoch}:${message.cursor}\ndata: ${JSON.stringify(message)}\n\n`);
    }
    catch {
        drop(sessionId, res);
        res.destroy();
    }
}
/** Publish scoped public facts; live text snapshots are retained for late viewers. */
export function publishSessionLive(sessionId, rows) {
    if (!sessionId || !rows.length)
        return;
    const state = retained.get(sessionId) ?? { cursor: 0, rows: new Map() };
    state.cursor += 1;
    for (const row of rows) {
        if (!row.stream && !state.rows.has(row.id))
            continue;
        state.rows.delete(row.id);
        state.rows.set(row.id, row);
    }
    while (state.rows.size > MAX_ROWS)
        state.rows.delete(state.rows.keys().next().value);
    retained.delete(sessionId);
    retained.set(sessionId, state);
    while (retained.size > MAX_SESSIONS)
        retained.delete(retained.keys().next().value);
    const message = { version: 1, sessionId, epoch, cursor: state.cursor, rows };
    for (const res of listeners.get(sessionId) ?? [])
        send(sessionId, res, message);
}
export function sessionLiveSubscriberCount(sessionId) {
    return listeners.get(sessionId)?.size ?? 0;
}
/** Caller must authorize the product session before attaching. */
export function attachSessionLive(sessionId, req, res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(": connected\n\n");
    const set = listeners.get(sessionId) ?? new Set();
    listeners.set(sessionId, set);
    set.add(res);
    const state = retained.get(sessionId);
    send(sessionId, res, {
        version: 1, sessionId, epoch, cursor: state?.cursor ?? 0,
        snapshot: true, rows: [...(state?.rows.values() ?? [])],
    });
    const ping = setInterval(() => {
        if (res.destroyed || res.writableEnded) {
            cleanup();
            return;
        }
        try {
            res.write(": ping\n\n");
        }
        catch {
            cleanup();
            res.destroy();
        }
    }, 15_000);
    ping.unref?.();
    const cleanup = () => { clearInterval(ping); drop(sessionId, res); };
    req.once("aborted", cleanup);
    res.once("close", cleanup);
    res.once("error", cleanup);
}
export function closeSessionLive() {
    for (const set of listeners.values())
        for (const res of set)
            res.end();
    listeners.clear();
    retained.clear();
}
//# sourceMappingURL=session-live.js.map