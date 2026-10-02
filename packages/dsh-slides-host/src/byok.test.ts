import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseByokUpsert,
  readByokProviders,
  removeByokProvider,
  upsertByokProvider,
} from "./byok.js";
import { bindHomeKeys, saveHomeKey, slidesProviders } from "./providers.js";

describe("BYOK provider file", () => {
  it("upserts a custom OpenAI-compatible provider and binds its key", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "oss-byok-"));
    const prev = process.env.ACME_API_KEY;
    try {
      const provider = parseByokUpsert({
        id: "acme-gateway",
        name: "Acme Gateway",
        apiKeyEnv: "ACME_API_KEY",
        baseURL: "https://acme.example/v1",
        models: ["acme-1"],
      });
      upsertByokProvider(home, provider);
      saveHomeKey(home, "acme-gateway", "sk-acme");
      delete process.env.ACME_API_KEY;
      bindHomeKeys(home);
      assert.equal(process.env.ACME_API_KEY, "sk-acme");
      const row = slidesProviders(home).find((item) => item.id === "acme-gateway");
      assert.equal(row?.userAdded, true);
      assert.equal(row?.ready, true);
      assert.equal(row?.name, "Acme Gateway");
    } finally {
      if (prev === undefined) delete process.env.ACME_API_KEY;
      else process.env.ACME_API_KEY = prev;
    }
  });

  it("accepts a preset id and rejects antigravity", () => {
    const fromPreset = parseByokUpsert({ preset: "openai" });
    assert.equal(fromPreset.id, "openai");
    assert.equal(fromPreset.baseURL, "https://api.openai.com/v1");
    assert.throws(() => parseByokUpsert({ id: "agy-google-antigravity", name: "x", apiKeyEnv: "A", baseURL: "https://x.example/v1" }), /invalid/);
  });

  it("removes a user-added provider from disk", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "oss-byok-rm-"));
    upsertByokProvider(home, parseByokUpsert({ preset: "deepseek" }));
    assert.equal(readByokProviders(home).some((row) => row.id === "deepseek"), true);
    assert.equal(removeByokProvider(home, "deepseek"), true);
    assert.equal(readByokProviders(home).length, 0);
    assert.equal(removeByokProvider(home, "deepseek"), false);
  });

  it("rejects apiKeyEnv names that could hijack reserved process env slots", () => {
    for (const apiKeyEnv of [
      "NODE_OPTIONS",
      "DSH_TOKEN",
      "SLIDESTUDIO_LLM_API_KEY",
      "LD_PRELOAD",
      "not-an-env",
      "ACME_TOKEN",
    ]) {
      assert.throws(
        () =>
          parseByokUpsert({
            id: "acme-gateway",
            name: "Acme",
            apiKeyEnv,
            baseURL: "https://acme.example/v1",
            models: ["acme-1"],
          }),
        /invalid BYOK provider/,
        `${apiKeyEnv} must be rejected`,
      );
    }
    const ok = parseByokUpsert({
      id: "acme-gateway",
      name: "Acme",
      apiKeyEnv: "ACME_API_KEY",
      baseURL: "https://acme.example/v1",
      models: ["acme-1"],
    });
    assert.equal(ok.apiKeyEnv, "ACME_API_KEY");
  });
});
