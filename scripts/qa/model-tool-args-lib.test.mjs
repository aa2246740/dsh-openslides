import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyToolArguments,
  extractWireToolEvidence,
  sanitizeWireRequest,
} from "./model-tool-args-lib.mjs";

test("classifies exact and nested write_page arguments without normalizing them", () => {
  assert.equal(classifyToolArguments('{"id":"p","elements":[]}').kind, "exact");
  assert.equal(
    classifyToolArguments('{"arguments":{"arguments":{"id":"p","elements":[]}}}').kind,
    "arguments-envelope-2",
  );
  assert.equal(classifyToolArguments('{"arguments":').kind, "invalid-json");
});

test("wire capture preserves tool schemas and removes secrets and prose", () => {
  const clean = sanitizeWireRequest({
    model: "m",
    api_key: "never-log-me",
    messages: [{ role: "user", content: "one fixed prompt" }],
    tools: [{ type: "function", function: { name: "write_page", parameters: { type: "object" } } }],
  });
  assert.equal(clean.api_key, "[redacted]");
  assert.deepEqual(clean.messages[0].content.kind, "text");
  assert.equal(clean.messages[0].content.chars, 16);
  assert.equal(clean.messages[0].content.sha256.length, 64);
  assert.equal(clean.tools[0].function.name, "write_page");
});

test("extracts raw SSE argument deltas and native stop reason only", () => {
  const wire = [
    'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\\"arguments\\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\\"id\\\":\\\"p\\\"}"}}]},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
  ].join("\n");
  const evidence = extractWireToolEvidence(wire);
  assert.deepEqual(evidence.fragments.map((row) => row.fragment), [
    '{"arguments":',
    '{"id":"p"}',
  ]);
  assert.equal(evidence.assembledArguments[0].raw, '{"arguments":{"id":"p"}');
  assert.equal(evidence.assembledArguments[0].classification.kind, "invalid-json");
  assert.deepEqual(evidence.finishReasons, ["tool_calls"]);
});

test("extracts Anthropic input_json_delta fragments used by MiniMax", () => {
  const wire = [
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\\"id\\\":"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\\"p\\\",\\\"elements\\\":[]}"}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
  ].join("\n");
  const evidence = extractWireToolEvidence(wire);
  assert.equal(evidence.fragments[0].dialect, "anthropic");
  assert.equal(evidence.assembledArguments[0].raw, '{"id":"p","elements":[]}');
  assert.equal(evidence.assembledArguments[0].classification.kind, "exact");
  assert.deepEqual(evidence.finishReasons, ["tool_use"]);
});

test("records response roles and provider error structure without response prose", () => {
  const wire = [
    'data: {"choices":[{"delta":{"role":"assistant","content":"private prose"}}]}',
    'data: {"error":{"message":"Unexpected message role.","type":"BadRequest","code":"client_error","responseText":"private upstream body"}}',
  ].join("\n");
  const evidence = extractWireToolEvidence(wire);
  assert.deepEqual(evidence.roles, [{ path: "choices[0].delta.role", value: "assistant" }]);
  assert.deepEqual(evidence.errors, [{
    keys: ["message", "type", "code", "responseText"],
    type: "BadRequest",
    code: "client_error",
    message: "Unexpected message role.",
  }]);
  assert.equal(JSON.stringify(evidence).includes("private prose"), false);
  assert.equal(JSON.stringify(evidence).includes("private upstream body"), false);
});
