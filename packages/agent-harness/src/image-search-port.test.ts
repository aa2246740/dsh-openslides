import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createImageSearchPort, imageSearchConfigured } from "./image-search-port.js";

describe("image search port", () => {
  it("reports unconfigured when URL is missing", () => {
    assert.equal(imageSearchConfigured({}), false);
  });

  it("returns kind=none when no URL is set", async () => {
    const port = createImageSearchPort({ url: undefined });
    const hit = await port.search("浅草寺");
    assert.equal("kind" in hit && hit.kind === "none", true);
  });

  it("decodes a b64 search hit", async () => {
    const png = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.alloc(80, 3),
    ]);
    const port = createImageSearchPort(
      { url: "https://search.test/images" },
      {
        fetch: async () =>
          new Response(
            JSON.stringify({
              images: [{ b64_json: png.toString("base64"), width: 1, height: 1, attribution: "test" }],
            }),
            { status: 200 },
          ),
      },
    );
    const hit = await port.search("tokyo");
    assert.equal("kind" in hit, false);
    if ("kind" in hit) throw new Error("expected bytes");
    assert.ok(hit.bytes.length > 32);
    assert.equal(hit.attribution, "test");
  });

  it("returns none on HTTP error", async () => {
    const port = createImageSearchPort(
      { url: "https://search.test/images" },
      {
        fetch: async () => new Response("nope", { status: 503 }),
      },
    );
    const hit = await port.search("tokyo");
    assert.equal("kind" in hit && hit.kind === "none", true);
  });
});
