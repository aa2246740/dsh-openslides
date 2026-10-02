import { it } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleSlidesRequest, type SlidesHostRuntime } from "./routes.js";

/** Only the request guard runs before an unknown path answers 404. */
function invoke(headers: Record<string, string>, body = ""): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(body)] : []) as IncomingMessage;
    req.method = "POST";
    req.url = "/slides/sessions/guard-probe/unknown-action";
    req.headers = { host: "127.0.0.1:13080", ...headers };
    const res = {
      statusCode: 0,
      headersSent: false,
      writeHead(status: number) { this.statusCode = status; this.headersSent = true; },
      setHeader() {},
      end(chunk?: unknown) {
        try {
          resolve({ status: this.statusCode, json: chunk == null ? {} : JSON.parse(String(chunk)) as Record<string, unknown> });
        } catch (error) {
          reject(error);
        }
      },
    };
    handleSlidesRequest({ workspaceRoot: process.cwd() } as unknown as SlidesHostRuntime, req, res as unknown as ServerResponse);
  });
}

it("lets a bodyless POST through: browsers send Content-Length: 0 on stop", async () => {
  const result = await invoke({ "content-length": "0" });
  assert.notEqual(result.json.error, "mutating requests require application/json");
  assert.notEqual(result.status, 403);
});

it("still rejects a mutating body that is not JSON", async () => {
  const plain = await invoke({ "content-type": "text/plain", "content-length": "5" }, "hello");
  assert.equal(plain.status, 403);
  assert.equal(plain.json.error, "mutating requests require application/json");
  const untyped = await invoke({ "content-length": "5" }, "hello");
  assert.equal(untyped.status, 403);
  const chunked = await invoke({ "transfer-encoding": "chunked" }, "hello");
  assert.equal(chunked.status, 403);
});
