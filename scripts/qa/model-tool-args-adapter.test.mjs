import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import LlmRuntime, { createUserMessage } from "@deepseek-ai/dsh-llm";
import LocalCredentialProvider from "@deepseek-ai/dsh-credentials-local";
import * as PiAiPlugin from "@deepseek-ai/dsh-llm-pi-ai";

const SYNTHETIC_TOOL = {
  name: "write_page",
  description: "Synthetic contract fixture. No SlideStudio product prompt is used.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      elements: { type: "array" },
    },
    required: ["id", "elements"],
  },
};

const CASES = [
  { name: "flat", raw: '{"id":"probe","elements":[]}' },
  { name: "one envelope", raw: '{"arguments":{"id":"probe","elements":[]}}' },
  {
    name: "eight envelopes",
    raw: `${'{"arguments":'.repeat(8)}{"id":"probe","elements":[]}${"}".repeat(8)}`,
  },
];

function syntheticSse(raw) {
  const first = {
    id: "chatcmpl-synthetic",
    object: "chat.completion.chunk",
    created: 1,
    model: "probe-model",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        tool_calls: [{
          index: 0,
          id: "call_synthetic",
          type: "function",
          function: { name: "write_page", arguments: raw },
        }],
      },
      finish_reason: null,
    }],
  };
  const finish = {
    id: "chatcmpl-synthetic",
    object: "chat.completion.chunk",
    created: 1,
    model: "probe-model",
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  };
  return `data: ${JSON.stringify(first)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`;
}

test("simulated provider: real DSH/pi-ai path preserves raw tool arguments byte-for-byte", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slides-tool-args-adapter-"));
  const previousKey = process.env.PROBE_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.PROBE_API_KEY = "synthetic-test-key";
  const requests = [];
  let responseRaw = "";
  globalThis.fetch = async (_input, init = {}) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response(syntheticSse(responseRaw), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  const ctx = new Context();
  const fibers = [];
  try {
    fibers.push(await ctx.plugin(LlmRuntime, {}));
    fibers.push(await ctx.plugin(LocalCredentialProvider, {
      path: path.join(temp, ".credentials.yaml"),
      dshHome: temp,
      watch: false,
    }));
    fibers.push(await ctx.plugin(PiAiPlugin, {
      providers: {
        probe: {
          displayName: "Synthetic provider",
          apiKeyEnv: "PROBE_API_KEY",
          api: "openai-completions",
          baseURL: "https://provider.invalid/v1",
          models: [{
            id: "probe-model",
            name: "Probe model",
            input: ["text"],
            contextWindow: 8192,
            maxTokens: 2048,
            reasoningEfforts: { off: "none", low: "low" },
          }],
        },
      },
    }));

    for (const fixture of CASES) {
      responseRaw = fixture.raw;
      const prepared = await ctx.llm.prepareCall({
        provider: "probe",
        model: "probe-model",
        reasoningEffort: "off",
        maxTokens: 256,
      });
      let deltaRaw = "";
      let completedRaw;
      let finishKind;
      for await (const chunk of prepared.stream({
        ...prepared.config,
        system: "Synthetic system prompt.",
        messages: [createUserMessage({
          content: [{ type: "text", text: "Emit the synthetic write_page call." }],
          source: { kind: "user" },
        })],
        tools: [SYNTHETIC_TOOL],
      })) {
        if (chunk.type === "tool-call-delta") deltaRaw += chunk.argumentsDelta;
        if (chunk.type === "block-end" && chunk.block.type === "tool-call") {
          assert.equal(chunk.block.name, "write_page", fixture.name);
          completedRaw = chunk.block.arguments;
        }
        if (chunk.type === "finish") finishKind = chunk.reason.kind;
      }
      assert.equal(deltaRaw, fixture.raw, `${fixture.name}: DSH deltas`);
      assert.equal(completedRaw, fixture.raw, `${fixture.name}: completed DSH block`);
      assert.deepEqual(JSON.parse(completedRaw), JSON.parse(fixture.raw), `${fixture.name}: parsed object`);
      assert.equal(finishKind, "tool-calls", `${fixture.name}: finish`);
      const wire = requests.at(-1);
      assert.equal(wire.model, "probe-model", fixture.name);
      assert.equal(wire.tools[0].function.name, "write_page", fixture.name);
      assert.deepEqual(wire.tools[0].function.parameters, SYNTHETIC_TOOL.parameters, fixture.name);
    }
    assert.equal(requests.length, CASES.length);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.PROBE_API_KEY;
    else process.env.PROBE_API_KEY = previousKey;
    for (const fiber of fibers.reverse()) await fiber.dispose();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
