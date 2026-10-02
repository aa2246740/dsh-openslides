import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilities, formatCapabilityCard } from "./capability-card.js";

describe("capability card", () => {
  it("advertises no-image mode when no search or generate ports exist", () => {
    const card = detectCapabilities({
      env: {},
      rasterAvailable: false,
      pi: { available: false, bin: "pi", note: "not installed" },
      runtimeKind: "agent-loop",
    });
    assert.equal(card.imageSearch.configured, false);
    assert.equal(card.imageGenerate.configured, false);
    assert.equal(card.vision.mode, "none");
    assert.equal(card.pageRaster.mode, "unavailable");
    assert.equal(card.mediaPolicy, "optional");
    const text = formatCapabilityCard(card);
    assert.match(text, /CAPABILITY CARD/);
    assert.match(text, /imageSearch: NO/);
    assert.match(text, /imageGenerate: NO/);
    assert.match(text, /no-image mode/);
    assert.match(text, /Do not write src/);
  });

  it("does not treat a chat LLM URL as image generate", () => {
    const card = detectCapabilities({
      env: {
        SLIDESTUDIO_LLM_BASE_URL: "https://example.test/v1",
        SLIDESTUDIO_LLM_API_KEY: "k",
      },
      rasterAvailable: true,
      pi: { available: false, bin: "pi", note: "not installed" },
    });
    assert.equal(card.imageGenerate.configured, false);
    assert.equal(card.vision.mode, "main-model");
    assert.equal(card.pageRaster.mode, "native-slide");
  });

  it("opts into generate only with IMAGE_BASE_URL or IMAGE=1", () => {
    const explicit = detectCapabilities({
      env: { SLIDESTUDIO_IMAGE_BASE_URL: "https://img.test/v1" },
      rasterAvailable: false,
      pi: { available: false, bin: "pi", note: "x" },
    });
    assert.equal(explicit.imageGenerate.configured, true);
    const optIn = detectCapabilities({
      env: {
        SLIDESTUDIO_LLM_BASE_URL: "https://example.test/v1",
        SLIDESTUDIO_IMAGE: "1",
      },
      rasterAvailable: false,
      pi: { available: false, bin: "pi", note: "x" },
    });
    assert.equal(optIn.imageGenerate.configured, true);
  });

  it("advertises search and Pi when those facts are true", () => {
    const card = detectCapabilities({
      env: { SLIDESTUDIO_IMAGE_SEARCH_URL: "https://search.test/images" },
      rasterAvailable: true,
      pi: { available: true, bin: "pi", note: "on PATH" },
      runtimeKind: "pi",
    });
    assert.equal(card.imageSearch.configured, true);
    assert.equal(card.runtime.piAvailable, true);
    assert.equal(card.runtime.kind, "pi");
    assert.match(formatCapabilityCard(card), /imageSearch: YES/);
  });

  it("puts Pi /login auth on the card", () => {
    const card = detectCapabilities({
      env: {},
      rasterAvailable: false,
      pi: { available: true, bin: "pi", note: "bin" },
      piAuth: {
        ready: true,
        kind: "oauth",
        source: "auth.json",
        provider: "anthropic",
        note: "Pi /login OAuth (anthropic)",
      },
      runtimeKind: "pi",
    });
    assert.equal(card.runtime.piAuth?.kind, "oauth");
    assert.match(formatCapabilityCard(card), /Auth auth\.json \/ oauth/);
  });
});
