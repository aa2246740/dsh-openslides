import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGrokImageSearchPort, grokWebSearch, XAI_API_BASE, XAI_RESPONSES_PATH } from "./grok-hosted.js";
const TINY_PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082", "hex");
describe("Grok hosted xAI tools", () => {
    it("calls xAI Responses web_search and returns facts", async () => {
        const calls = [];
        const result = await grokWebSearch("Starship latest flight", { apiKey: "test-xai-key", baseUrl: XAI_API_BASE, model: "grok-4.6" }, {
            fetch: async (url, init) => {
                const parsed = JSON.parse(String(init?.body ?? "{}"));
                calls.push({ url: String(url), body: parsed });
                return new Response(JSON.stringify({
                    output_text: "- Starship flew a test in 2026.\nSee [NASA](https://www.nasa.gov/starship).",
                }), { status: 200, headers: { "Content-Type": "application/json" } });
            },
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, `${XAI_API_BASE}${XAI_RESPONSES_PATH}`);
        const body = calls[0]?.body;
        assert.equal(body.model, "grok-4.6");
        assert.deepEqual(body.tools, [{ type: "web_search" }]);
        assert.ok(result.facts.some((fact) => /Starship/.test(fact)));
        assert.ok(result.citations.includes("https://www.nasa.gov/starship"));
        assert.equal(result.source, "pi-xai-hosted");
    });
    it("calls xAI web_search with enable_image_search and persists image bytes", async () => {
        const toolsSeen = [];
        const port = createGrokImageSearchPort({ apiKey: "test-xai-key", baseUrl: XAI_API_BASE }, {
            fetch: async (url, init) => {
                if (String(url).includes(XAI_RESPONSES_PATH)) {
                    toolsSeen.push(JSON.parse(String(init?.body ?? "{}")).tools);
                    return new Response(JSON.stringify({
                        output_text: "Cover texture: ![bg](https://cdn.example.test/cover.png)",
                    }), { status: 200 });
                }
                assert.match(String(url), /cover\.png/);
                return new Response(TINY_PNG, { status: 200 });
            },
        });
        const hit = await port.search("navy cover background");
        assert.deepEqual(toolsSeen[0], [{ type: "web_search", enable_image_search: true }]);
        assert.equal("kind" in hit && hit.kind === "none", false);
        const found = hit;
        assert.ok(found.bytes.length >= 64);
        assert.equal(found.mime, "image/png");
    });
    it("maps abort to a timeout or cancel error instead of This operation was aborted", async () => {
        const abort = new AbortController();
        abort.abort();
        await assert.rejects(() => grokWebSearch("Starship latest flight", { apiKey: "test-xai-key", baseUrl: XAI_API_BASE, timeoutMs: 50 }, { abortSignal: abort.signal, fetch: async () => new Response("nope", { status: 500 }) }), (error) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /cancelled|timed out/);
            assert.doesNotMatch(error.message, /This operation was aborted/);
            return true;
        });
    });
});
//# sourceMappingURL=grok-hosted.test.js.map