#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Context } from "@deepseek-ai/cordis";
import LlmRuntime, { createUserMessage } from "@deepseek-ai/dsh-llm";
import LocalCredentialProvider from "@deepseek-ai/dsh-credentials-local";
import * as PiAiPlugin from "@deepseek-ai/dsh-llm-pi-ai";
import { WRITE_PAGE_PARAMETER_SPEC } from "@open-slidestudio/pptd-v2";
import YAML from "yaml";
import {
  classifyToolArguments,
  extractWireToolEvidence,
  redactValue,
  sanitizeWireRequest,
  sha256,
} from "./model-tool-args-lib.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "../..");
const DEFAULT_DSH_HOME = "/Users/wu/orca/projects/openkimi-slides/.dsh/home";
const FIXTURE = path.join(HERE, "fixtures/model-tool-args/product-header.json");
const DEFAULT_OUT = path.join(REPO, "output/model-tool-args/matrix-report.json");
const DEFAULT_MODELS = [
  "amd/DeepSeek-V4-Flash-Vision-Exp",
  "amd/Qwen3.8-Flash-Next",
  "minimax-cn/MiniMax-M3",
];
const DEFAULT_CONTEXTS = ["clean", "product-header"];
const BASELINE_TASK = [
  "只调用一次 write_page，创建一个最小页面，不要解释，也不要调用其他工具。",
  "参数必须严格使用工具声明字段，直接放在顶层，绝对不要放进 arguments 包裹。",
  "id 为 probe-page，pageType 为 cover，elements 只含一个元素：",
  "id=title，elementType=text，bounds=[80,80,500,80]，content.text=参数契约探针。",
].join("\n");
const CANONICAL_TASK = [
  "只调用一次 write_page，创建一个最小页面，不要解释，也不要调用其他工具。",
  "参数必须严格使用工具声明字段，直接放在顶层，绝对不要放进 arguments 包裹。",
  "id 为 probe-page，pageType 为 cover，elements 只含一个元素：",
  "elementId=title，elementType=text，bounds=[80,80,500,80]，content.text=参数契约探针，content.fontSize=50。",
].join("\n");
const BASELINE_CLEAN_SYSTEM = [
  "You are a tool-call contract probe.",
  "Return exactly one write_page tool call and no prose.",
  "Pass every declared field directly at the top level. Never wrap fields in an arguments object.",
].join("\n");
const CANONICAL_CLEAN_SYSTEM = [
  BASELINE_CLEAN_SYSTEM,
  "Use elementId for element identity, and put fontSize directly on content.",
].join("\n");

function parseArgs(argv) {
  const result = {
    repetitions: 2,
    maxTokens: 1500,
    timeoutMs: 90_000,
    dshHome: process.env.SLIDES_DSH_HOME || DEFAULT_DSH_HOME,
    out: DEFAULT_OUT,
    models: DEFAULT_MODELS,
    contexts: DEFAULT_CONTEXTS,
    schemaMode: "baseline",
    compatNoDeveloper: [],
    canonicalToolReport: undefined,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const found = argv[++index];
      if (!found) throw new Error(`missing value after ${value}`);
      return found;
    };
    if (value === "--repetitions") result.repetitions = Number(next());
    else if (value === "--max-tokens") result.maxTokens = Number(next());
    else if (value === "--timeout-ms") result.timeoutMs = Number(next());
    else if (value === "--dsh-home") result.dshHome = path.resolve(next());
    else if (value === "--out") result.out = path.resolve(next());
    else if (value === "--models") result.models = next().split(",").filter(Boolean);
    else if (value === "--contexts") result.contexts = next().split(",").filter(Boolean);
    else if (value === "--schema") result.schemaMode = next();
    else if (value === "--compat-no-developer") result.compatNoDeveloper = next().split(",").filter(Boolean);
    else if (value === "--canonical-tool-report") result.canonicalToolReport = path.resolve(next());
    else if (value === "--dry-run") result.dryRun = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!Number.isInteger(result.repetitions) || result.repetitions < 1 || result.repetitions > 3) {
    throw new Error("--repetitions must be 1..3");
  }
  if (!Number.isFinite(result.maxTokens) || result.maxTokens < 128 || result.maxTokens > 8_192) {
    throw new Error("--max-tokens must be 128..8192");
  }
  if (!new Set(["baseline", "canonical"]).has(result.schemaMode)) {
    throw new Error("--schema must be baseline or canonical");
  }
  return result;
}

function loadProductHeader() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const writePage = fixture.header.tools.find((tool) => tool.name === "write_page");
  if (!writePage) throw new Error("fixture has no write_page schema");
  return { fixture, writePage };
}

function compileAuthorSchemaNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const { required: _required, properties, items, oneOf, ...rest } = node;
  if (properties && typeof properties === "object") {
    const compiledProperties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, compileAuthorSchemaNode(value)]),
    );
    const required = Object.entries(properties)
      .filter(([, value]) => value?.required === true)
      .map(([key]) => key);
    return {
      ...rest,
      properties: compiledProperties,
      ...(required.length ? { required } : {}),
    };
  }
  return {
    ...rest,
    ...(items === undefined ? {} : { items: compileAuthorSchemaNode(items) }),
    ...(oneOf === undefined ? {} : { oneOf: oneOf.map(compileAuthorSchemaNode) }),
  };
}

function writePageFromReport(file) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const run of report.runs ?? []) {
    for (const call of run.wireCalls ?? []) {
      const found = (call.request?.tools ?? []).find((tool) =>
        (tool.function?.name ?? tool.name) === "write_page");
      if (found?.function) {
        return {
          name: found.function.name,
          description: found.function.description,
          parameters: found.function.parameters,
        };
      }
      if (found?.input_schema) {
        return { name: found.name, description: found.description, parameters: found.input_schema };
      }
    }
  }
  throw new Error(`no captured write_page schema in ${file}`);
}

function canonicalWritePageTool(baseline, canonicalToolReport) {
  if (canonicalToolReport) return writePageFromReport(canonicalToolReport);
  return {
    name: baseline.name,
    description: baseline.description,
    parameters: {
      ...compileAuthorSchemaNode({
        type: "object",
        properties: WRITE_PAGE_PARAMETER_SPEC,
        additionalProperties: false,
      }),
      additionalProperties: false,
    },
  };
}

function taskFor(schemaMode) {
  return schemaMode === "canonical" ? CANONICAL_TASK : BASELINE_TASK;
}

function loadProviderConfig(dshHome, selectedRoutes, compatNoDeveloper = []) {
  const settingsPath = path.join(dshHome, "settings.yaml");
  const settings = YAML.parse(fs.readFileSync(settingsPath, "utf8"));
  const available = settings?.["llm-pi-ai"]?.providers ?? {};
  const providers = {};
  for (const route of selectedRoutes) {
    if (!available[route]) throw new Error(`route ${route} is absent from ${settingsPath}`);
    const profile = structuredClone(available[route]);
    profile.models = (profile.models ?? []).map((model) =>
      compatNoDeveloper.includes(`${route}/${model.id}`)
        ? { ...model, compat: { ...model.compat, supportsDeveloperRole: false } }
        : model);
    providers[route] = profile;
  }
  return providers;
}

function messageForTask(schemaMode) {
  return createUserMessage({ content: [{ type: "text", text: taskFor(schemaMode) }], source: { kind: "user" } });
}

function requestFor(contextId, header, writePage, schemaMode) {
  if (contextId === "clean") {
    const system = schemaMode === "canonical" ? CANONICAL_CLEAN_SYSTEM : BASELINE_CLEAN_SYSTEM;
    return { system, tools: [writePage], messages: [messageForTask(schemaMode)] };
  }
  if (contextId === "product-header") {
    const tools = header.tools.map((tool) => tool.name === "write_page" ? writePage : tool);
    return { system: header.system, tools, messages: [messageForTask(schemaMode)] };
  }
  throw new Error(`unsupported context: ${contextId}`);
}

function createWireRecorder() {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const pending = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    let bodyText = typeof init.body === "string" ? init.body : undefined;
    if (bodyText === undefined && typeof Request !== "undefined" && input instanceof Request) {
      try { bodyText = await input.clone().text(); } catch { bodyText = undefined; }
    }
    let parsedBody;
    try { parsedBody = bodyText === undefined ? undefined : JSON.parse(bodyText); } catch { parsedBody = undefined; }
    const parsedUrl = new URL(url);
    const record = {
      endpoint: { protocol: parsedUrl.protocol, host: parsedUrl.host, path: parsedUrl.pathname },
      requestBodyBytes: bodyText === undefined ? 0 : Buffer.byteLength(bodyText),
      request: parsedBody === undefined ? { unparsedBodyBytes: Buffer.byteLength(bodyText ?? "") } : sanitizeWireRequest(parsedBody),
      response: undefined,
    };
    calls.push(record);
    const response = await originalFetch(input, init);
    const capture = (async () => {
      const reader = response.clone().body?.getReader();
      if (!reader) return;
      const chunks = [];
      let bytes = 0;
      const limit = 1_048_576;
      while (bytes < limit) {
        const item = await reader.read();
        if (item.done) break;
        const remaining = limit - bytes;
        const piece = item.value.subarray(0, remaining);
        chunks.push(piece);
        bytes += piece.byteLength;
        if (piece.byteLength < item.value.byteLength) break;
      }
      const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
      record.response = {
        status: response.status,
        capturedBytes: bytes,
        truncated: bytes >= limit,
        ...extractWireToolEvidence(raw),
      };
    })().catch((error) => {
      record.response = { captureError: error instanceof Error ? error.message : String(error) };
    });
    pending.push(capture);
    return response;
  };
  return {
    calls,
    async restore() {
      globalThis.fetch = originalFetch;
      await Promise.allSettled(pending);
    },
  };
}

function verdictFor(run) {
  if (run.thrown) return `thrown:${run.thrown.code ?? run.thrown.name}`;
  if (run.finish?.kind === "error" || run.finish?.kind === "aborted") {
    return `${run.finish.kind}:${run.finish.failure?.code ?? "unknown"}`;
  }
  if (run.completedToolCalls.length === 0) {
    return run.finish?.kind === "max-tokens" ? "inconclusive:max-tokens" : "no-tool-call";
  }
  const writes = run.completedToolCalls.filter((call) => call.name === "write_page");
  if (writes.length !== 1 || run.completedToolCalls.length !== 1) return "wrong-tool-selection";
  return writes[0].classification.kind;
}

function markdownReport(report) {
  const lines = [
    "# Model tool-argument matrix",
    "",
    `Generated: ${report.createdAt}`,
    "",
    "| Model | Context | Rep | Verdict | Finish | Output | Reasoning | Time |",
    "| --- | --- | ---: | --- | --- | ---: | ---: | ---: |",
  ];
  for (const run of report.runs) {
    lines.push(
      `| ${run.target} | ${run.context} | ${run.repetition} | ${run.verdict} | ${run.finish?.kind ?? "-"} | ${run.usage?.outputTokens ?? "-"} | ${run.usage?.reasoningTokens ?? "-"} | ${run.elapsedMs}ms |`,
    );
  }
  lines.push(
    "",
    "Provider-unavailable, timeout, transport, and max-token outcomes are operational or inconclusive; they are not counted as model contract failures.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function persistReport(report, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = out.replace(/\.json$/i, ".md");
  fs.writeFileSync(markdownPath === out ? `${out}.md` : markdownPath, markdownReport(report));
}

async function runOne(ctx, target, contextId, request, options) {
  const [provider, ...modelParts] = target.split("/");
  const model = modelParts.join("/");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("probe timeout"), options.timeoutMs);
  const recorder = createWireRecorder();
  const startedAt = new Date().toISOString();
  const began = performance.now();
  const toolDeltas = new Map();
  const completedToolCalls = [];
  let usage;
  let finish;
  let thrown;
  let assistantText = "";
  let assistantTextTruncated = false;
  try {
    const requestedConfig = {
      provider,
      model,
      reasoningEffort: "off",
      maxTokens: options.maxTokens,
    };
    const prepared = await ctx.llm.prepareCall(requestedConfig, controller.signal);
    for await (const chunk of prepared.stream({
      ...prepared.config,
      ...request,
      signal: controller.signal,
    })) {
      if (chunk.type === "tool-call-delta") {
        const current = toolDeltas.get(chunk.index) ?? { id: chunk.id, name: "", arguments: "" };
        if (chunk.name) current.name = chunk.name;
        current.arguments += chunk.argumentsDelta;
        toolDeltas.set(chunk.index, current);
      } else if (chunk.type === "text-delta" && typeof chunk.text === "string") {
        const remaining = 4096 - assistantText.length;
        if (remaining > 0) assistantText += chunk.text.slice(0, remaining);
        if (chunk.text.length > remaining) assistantTextTruncated = true;
      } else if (chunk.type === "block-end" && chunk.block.type === "tool-call") {
        completedToolCalls.push({
          id: String(chunk.block.id),
          name: chunk.block.name,
          arguments: redactValue(chunk.block.arguments),
          classification: classifyToolArguments(chunk.block.arguments),
        });
      } else if (chunk.type === "usage") usage = chunk.usage;
      else if (chunk.type === "finish") finish = redactValue(chunk.reason);
    }
  } catch (error) {
    thrown = {
      name: error instanceof Error ? error.name : "Error",
      code: typeof error?.code === "string" ? error.code : undefined,
      message: redactValue(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timer);
    await recorder.restore();
  }
  const assembledDeltas = [...toolDeltas.values()].map((tool) => ({
    ...tool,
    arguments: redactValue(tool.arguments),
    classification: classifyToolArguments(tool.arguments),
  }));
  return {
    target,
    context: contextId,
    startedAt,
    elapsedMs: Math.round(performance.now() - began),
    requestFacts: {
      systemChars: request.system.length,
      systemSha256: sha256(request.system),
      toolCount: request.tools.length,
      toolNames: request.tools.map((tool) => tool.name),
      schemaMode: options.schemaMode,
      taskChars: taskFor(options.schemaMode).length,
      taskSha256: sha256(taskFor(options.schemaMode)),
      maxTokens: options.maxTokens,
      reasoningEffort: "off",
    },
    usage,
    finish,
    thrown,
    ...(assistantText
      ? { assistantText: redactValue(assistantText), assistantTextTruncated }
      : {}),
    adapterToolDeltas: assembledDeltas,
    completedToolCalls,
    wireCalls: recorder.calls,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { fixture, writePage: baselineWritePage } = loadProductHeader();
  const writePage = options.schemaMode === "canonical"
    ? canonicalWritePageTool(baselineWritePage, options.canonicalToolReport)
    : baselineWritePage;
  const routes = [...new Set(options.models.map((target) => target.split("/")[0]))];
  const providers = loadProviderConfig(options.dshHome, routes, options.compatNoDeveloper);
  const plan = options.models.flatMap((model) =>
    options.contexts.flatMap((context) =>
      Array.from({ length: options.repetitions }, (_, index) => ({ model, context, repetition: index + 1 })),
    ),
  );
  const report = {
    schemaVersion: 1,
    schemaMode: options.schemaMode,
    createdAt: new Date().toISOString(),
    harness: {
      adapter: "@deepseek-ai/dsh-llm-pi-ai",
      adapterVersion: JSON.parse(fs.readFileSync(path.join(REPO, "node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json"), "utf8")).version,
      entry: "LlmRuntime.prepareCall().stream() -> PiAiAdapter -> Models.streamSimple()",
      credentials: { source: path.join(options.dshHome, ".credentials.yaml"), valuesLogged: false },
      compatNoDeveloper: options.compatNoDeveloper,
    },
    fixture: fixture.provenance,
    plan,
    modelMetadata: [],
    runs: [],
  };
  const ctx = new Context();
  const fibers = [];
  try {
    fibers.push(await ctx.plugin(LlmRuntime, {}));
    fibers.push(await ctx.plugin(LocalCredentialProvider, {
      path: path.join(options.dshHome, ".credentials.yaml"),
      dshHome: options.dshHome,
      watch: false,
    }));
    fibers.push(await ctx.plugin(PiAiPlugin, { providers }));
    for (const target of options.models) {
      const [provider, ...modelParts] = target.split("/");
      const model = modelParts.join("/");
      const info = await ctx.llm.resolveModelInfo(provider, model);
      report.modelMetadata.push(redactValue(info));
    }
    if (options.dryRun) {
      process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, plan, modelMetadata: report.modelMetadata, writePage }, null, 2)}\n`);
      return;
    }
    for (const cell of plan) {
      const request = requestFor(cell.context, fixture.header, writePage, options.schemaMode);
      process.stderr.write(`[probe] ${cell.model} ${cell.context} ${cell.repetition}/${options.repetitions}\n`);
      const run = await runOne(ctx, cell.model, cell.context, request, options);
      const row = { repetition: cell.repetition, ...run };
      row.verdict = verdictFor(row);
      report.runs.push(row);
      persistReport(report, options.out);
    }
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose();
  }
  process.stdout.write(`${JSON.stringify({ ok: true, out: options.out, runs: report.runs.length }, null, 2)}\n`);
}

await main();
