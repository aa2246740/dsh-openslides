import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RuntimeModelInfo } from "./local-models.js";
import { reasoningEffortForModel } from "./local-models.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  importLocalDshModels,
  isAntigravityId,
  loadSlidesModelCatalog,
  modelInputModalities,
  modelInputModalitiesFromHome,
} from "./local-models.js";

describe("local DSH model import", () => {
  it("recognizes Antigravity ids only", () => {
    assert.equal(isAntigravityId("agy-google-antigravity"), true);
    assert.equal(isAntigravityId("google-antigravity"), true);
    assert.equal(isAntigravityId("amd"), false);
    assert.equal(isAntigravityId("google"), false);
    assert.equal(isAntigravityId("minimax-cn"), false);
  });

  it("imports API-key providers, drops Antigravity, and never copies OAuth files", () => {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-src-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-dst-"));
    fs.writeFileSync(
      path.join(source, "settings.yaml"),
      [
        "agent-default-model:",
        "  provider: agy-google-antigravity",
        "  model: gemini-3.8-flash",
        "llm-pi-ai:",
        "  providers:",
        "    minimax-cn:",
        "      apiKeyEnv: MINIMAX_CN_API_KEY",
        "    amd:",
        "      displayName: AMD",
        "      apiKeyEnv: AMD_API_KEY",
        "      models:",
        "        - id: DeepSeek-V4-Flash",
        "          name: DeepSeek-V4-Flash",
        "          input: [text]",
        "        - id: DeepSeek-Vision-Exp",
        "          input: [text, image]",
        "    op-custom:",
        "      displayName: OpenCode Go",
        "      apiKeyEnv: OP_CUSTOM_API_KEY",
        "      models:",
        "        - id: muse-spark-1.3-contributor",
        "    agy-google-antigravity:",
        "      apiKeyEnv: ANTIGRAVITY_API_KEY",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(source, ".credentials.yaml"),
      [
        "version: 1",
        "refs:",
        "  MINIMAX_CN_API_KEY: sk-test-cn",
        "  AMD_API_KEY: sk-test-amd",
        "  OP_CUSTOM_API_KEY: sk-test-op",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(source, ".dsh-oauth-auth.json"),
      JSON.stringify({
        version: 1,
        credentials: {
          xai: { type: "oauth", access: "tok", refresh: "rfs", expires: 1 },
        },
      }),
    );

    const result = importLocalDshModels({
      sourceHome: source,
      destHome: dest,
      env: {},
    });
    assert.equal(result.catalog.defaultProvider, "amd");
    assert.equal(result.catalog.defaultModel, "DeepSeek-V4-Flash");
    assert.deepEqual(result.catalog.excluded, ["agy-google-antigravity"]);
    assert.deepEqual(result.catalog.oauthSkipped, ["xai"]);
    assert.equal(fs.existsSync(path.join(dest, ".dsh-oauth-auth.json")), false);
    assert.equal(fs.existsSync(path.join(dest, ".dsh-antigravity-oauth.json")), false);
    const settings = fs.readFileSync(path.join(dest, "settings.yaml"), "utf8");
    assert.match(settings, /provider: amd/);
    assert.match(settings, /DeepSeek-V4-Flash/);
    assert.doesNotMatch(settings, /antigravity/);
    assert.doesNotMatch(settings, /sk-test/);
    const creds = fs.readFileSync(path.join(dest, ".credentials.yaml"), "utf8");
    assert.match(creds, /AMD_API_KEY: sk-test-amd/);
    assert.doesNotMatch(creds, /refresh: rfs/);
    const loaded = loadSlidesModelCatalog(dest);
    assert.equal(loaded?.defaultProvider, "amd");
    assert.equal(loaded?.providers.some((row) => row.id === "amd"), true);
    assert.equal(loaded?.providers.some((row) => row.id === "agy-google-antigravity"), false);
    assert.equal(result.envBindings.AMD_API_KEY, "sk-test-amd");
    assert.deepEqual(
      modelInputModalitiesFromHome(dest, "amd", "DeepSeek-V4-Flash"),
      ["text"],
    );
    assert.deepEqual(
      modelInputModalitiesFromHome(dest, "amd", "DeepSeek-Vision-Exp"),
      ["text", "image"],
    );
    // DSH metadata is authoritative, even when it disagrees with local files.
    assert.equal(modelInputModalitiesFromHome(dest, "pi-xai", "grok-4.6"), undefined);
    const catalog = new Map<string, ReadonlyMap<string, RuntimeModelInfo>>([
      ["pi-xai", new Map([
        ["grok-4.6", { name: "Grok", inputModalities: ["text"] as const }],
        ["grok-4.7", { name: "Grok", inputModalities: [] }],
      ])],
      ["amd", new Map([["DeepSeek-V4-Flash", { name: "DeepSeek", inputModalities: ["text", "image"] as const }]])],
    ]);
    assert.deepEqual(modelInputModalities(dest, "pi-xai", "grok-4.6", catalog), ["text"]);
    assert.equal(modelInputModalities(dest, "pi-xai", "grok-4.7"), undefined);
    assert.deepEqual(modelInputModalities(dest, "amd", "DeepSeek-V4-Flash"), ["text"]);
    assert.equal(modelInputModalities(dest, "pi-xai", "unadvertised"), undefined);
    assert.deepEqual(modelInputModalities(dest, "pi-xai", "grok-4.7", catalog), []);
    assert.equal(modelInputModalities(dest, "pi-xai", "unadvertised", catalog), undefined);
    assert.deepEqual(
      modelInputModalities(dest, "amd", "DeepSeek-V4-Flash", catalog),
      ["text", "image"],
    );
    assert.equal(modelInputModalitiesFromHome(dest, "amd", "unknown"), undefined);
    const reasoningCatalog = new Map<string, ReadonlyMap<string, RuntimeModelInfo>>([
      ["amd", new Map([
        ["thinking", { name: "Thinking", inputModalities: ["text"], efforts: ["low"] }],
        ["plain", { name: "Plain", inputModalities: ["text"], efforts: [] }],
      ])],
    ]);
    assert.equal(reasoningEffortForModel(dest, "amd", "thinking", "low", reasoningCatalog), "low");
    assert.equal(reasoningEffortForModel(dest, "amd", "thinking", "high", reasoningCatalog), undefined);
    assert.equal(reasoningEffortForModel(dest, "amd", "plain", "low", reasoningCatalog), undefined);
    assert.equal(reasoningEffortForModel(dest, "amd", "unknown", "low", reasoningCatalog), undefined);
  });

  it("reapplies only the verified AMD Qwen developer-role override on every import", () => {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-src-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-dst-"));
    const sourceSettings = [
      "llm-pi-ai:",
      "  providers:",
      "    amd:",
      "      baseURL: https://developer.amd.com.cn/radeon/api/v1/",
      "      apiKeyEnv: AMD_API_KEY",
      "      models:",
      "        - id: DeepSeek-V4-Flash",
      "          compat:",
      "            supportsStore: false",
      "        - id: Qwen3.8-Flash-Next",
      "          compat:",
      "            supportsStrictMode: false",
      "    amd-other-route:",
      "      baseURL: https://example.invalid/v1",
      "      models:",
      "        - id: Qwen3.8-Flash-Next",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(source, "settings.yaml"), sourceSettings);

    const importModels = () =>
      importLocalDshModels({
        sourceHome: source,
        destHome: dest,
        env: { AMD_API_KEY: "sk-test-amd" },
      });
    importModels();

    const readProviders = (): Record<string, unknown> => {
      const settings = YAML.parse(fs.readFileSync(path.join(dest, "settings.yaml"), "utf8"));
      return settings["llm-pi-ai"].providers;
    };
    const model = (provider: Record<string, unknown>, id: string): Record<string, unknown> =>
      (provider.models as Record<string, unknown>[]).find((row) => row.id === id) ?? {};

    let providers = readProviders();
    const amd = providers.amd as Record<string, unknown>;
    assert.deepEqual(model(amd, "Qwen3.8-Flash-Next").compat, {
      supportsStrictMode: false,
      supportsDeveloperRole: false,
    });
    assert.deepEqual(model(amd, "DeepSeek-V4-Flash").compat, { supportsStore: false });
    const otherRouteQwen = model(
      providers["amd-other-route"] as Record<string, unknown>,
      "Qwen3.8-Flash-Next",
    );
    assert.equal(
      "supportsDeveloperRole" in ((otherRouteQwen.compat as Record<string, unknown> | undefined) ?? {}),
      false,
    );

    const destSettings = YAML.parse(fs.readFileSync(path.join(dest, "settings.yaml"), "utf8"));
    const destQwen = model(destSettings["llm-pi-ai"].providers.amd, "Qwen3.8-Flash-Next");
    destQwen.compat = { supportsDeveloperRole: true };
    fs.writeFileSync(path.join(dest, "settings.yaml"), YAML.stringify(destSettings));

    importModels();
    providers = readProviders();
    assert.equal(
      (model(providers.amd as Record<string, unknown>, "Qwen3.8-Flash-Next").compat as Record<
        string,
        unknown
      >).supportsDeveloperRole,
      false,
    );
    assert.equal(fs.readFileSync(path.join(source, "settings.yaml"), "utf8"), sourceSettings);

    const otherEndpointSource = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-src-"));
    const otherEndpointDest = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-dst-"));
    fs.writeFileSync(
      path.join(otherEndpointSource, "settings.yaml"),
      [
        "llm-pi-ai:",
        "  providers:",
        "    amd:",
        "      baseURL: https://example.invalid/v1",
        "      models:",
        "        - id: Qwen3.8-Flash-Next",
        "",
      ].join("\n"),
    );
    importLocalDshModels({ sourceHome: otherEndpointSource, destHome: otherEndpointDest, env: {} });
    const otherEndpointSettings = YAML.parse(
      fs.readFileSync(path.join(otherEndpointDest, "settings.yaml"), "utf8"),
    );
    assert.equal(
      model(otherEndpointSettings["llm-pi-ai"].providers.amd, "Qwen3.8-Flash-Next").compat,
      undefined,
    );
  });

  it("refuses to import onto the source DSH App home", () => {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-src-"));
    assert.throws(
      () => importLocalDshModels({ sourceHome: source, destHome: source, env: {} }),
      /onto itself/,
    );
  });
});
