import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aspectFromSlot, createImagePort, grokImageConfigFromEnv, GROK_IMAGINE_MODEL } from "./image-port.js";
import { XAI_API_BASE } from "./grok-hosted.js";
const TINY_PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082", "hex");
describe("Grok hosted image generate", () => {
    it("maps a planned photo frame to the nearest API aspect", () => {
        assert.equal(aspectFromSlot(258, 344), "3:4");
        assert.equal(aspectFromSlot(960, 540), "16:9");
        assert.equal(aspectFromSlot(400, 400), "1:1");
        assert.equal(aspectFromSlot(800, 600), "4:3");
    });
    it("POSTs grok-imagine-image-2.0 with aspect_ratio, not OpenAI size", async () => {
        const calls = [];
        const port = createImagePort({
            enabled: true,
            baseUrl: XAI_API_BASE,
            apiKey: "test-xai-key",
            model: GROK_IMAGINE_MODEL,
        }, {
            fetch: async (url, init) => {
                calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
                return new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG.toString("base64") }] }), { status: 200, headers: { "Content-Type": "application/json" } });
            },
        });
        const image = await port.generate("navy cover background for a 2026 briefing", "16:9");
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, `${XAI_API_BASE}/images/generations`);
        const body = calls[0]?.body;
        assert.equal(body.model, GROK_IMAGINE_MODEL);
        assert.match(body.prompt, /navy cover/);
        assert.equal(body.aspect_ratio, "16:9");
        assert.equal(body.size, undefined);
        assert.equal(body.response_format, "b64_json");
        assert.equal(image.kind, "generated");
        assert.ok(image.bytes.length >= 64);
    });
    it("binds grok imagine config to api.x.ai even when only the oauth token is set", () => {
        const cfg = grokImageConfigFromEnv({
            SLIDESTUDIO_IMAGE_API_KEY: "oauth-access",
        });
        assert.equal(cfg.enabled, true);
        assert.equal(cfg.baseUrl, XAI_API_BASE);
        assert.equal(cfg.model, GROK_IMAGINE_MODEL);
        assert.equal(cfg.apiKey, "oauth-access");
    });
    it("fail-closes without writing bytes when generate is not configured", async () => {
        let called = 0;
        const port = createImagePort({ enabled: false }, {
            fetch: async () => {
                called += 1;
                return new Response("nope", { status: 500 });
            },
        });
        await assert.rejects(() => port.generate("should not write a placeholder"), /not configured/);
        assert.equal(called, 0);
    });
    it("fail-closes on HTTP error instead of returning a placeholder PNG", async () => {
        const port = createImagePort({
            enabled: true,
            baseUrl: XAI_API_BASE,
            apiKey: "test-xai-key",
            model: GROK_IMAGINE_MODEL,
        }, {
            fetch: async () => new Response("image API unavailable", { status: 503 }),
        });
        await assert.rejects(() => port.generate("cover"), /image HTTP 503/);
    });
    it("fail-closes when the oauth token is missing", async () => {
        const port = createImagePort({
            enabled: true,
            baseUrl: XAI_API_BASE,
            model: GROK_IMAGINE_MODEL,
        });
        await assert.rejects(() => port.generate("cover"), /no API key/);
    });
});
//# sourceMappingURL=image-port.test.js.map