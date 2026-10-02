#!/usr/bin/env node
/**
 * Real generation CLI:
 *   node scripts/generate-pptx.mjs "核聚变商业化研究" -o ./out/fusion.pptx
 *
 * Uses XAI/OpenAI env keys, or ~/.grok/auth.json via Grok CLI proxy.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const promptParts = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "-o" || a === "--out" || a === "--model") {
    i++;
    continue;
  }
  if (a.startsWith("-")) continue;
  promptParts.push(a);
}
const prompt = promptParts.join(" ").trim();
const outPath =
  arg("-o") ||
  arg("--out") ||
  path.join(root, "output", `deck-${Date.now()}.pptx`);
const model = arg("--model");

if (!prompt) {
  console.error('Usage: node scripts/generate-pptx.mjs "your brief" -o out.pptx');
  process.exit(1);
}

const agentCore = await import(
  pathToFileURL(path.join(root, "packages/agent-core/dist/index.js")).href
);
const agentNode = await import(
  pathToFileURL(path.join(root, "packages/agent-core/dist/node.js")).href
);
const agent = { ...agentCore, ...agentNode };
const exp = await import(
  pathToFileURL(path.join(root, "packages/exporter-pptx/dist/index.js")).href
);

if (!agent.hasLlmCredentials()) {
  console.error(
    "No LLM credentials. Set XAI_API_KEY / OPENAI_API_KEY, or run `grok login`.",
  );
  process.exit(2);
}

const creds = agent.resolveLlmCredentials(model);
console.log(`LLM: ${creds.model} (source=${creds.source})`);
console.log(`Prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}`);

const provider = new agent.RealLlmProvider({
  credentials: creds,
  model: model || creds.model,
});

const run = agent.createAgentRun(
  { prompt, mockSpeed: 0, modelId: creds.model },
  { provider, autoStart: true },
);

run.subscribe((ev) => {
  if (ev.type === "tool_started") {
    process.stdout.write(`→ ${ev.label}${ev.target ? ` ${ev.target}` : ""}… `);
  } else if (ev.type === "tool_completed") {
    console.log(ev.summary || "ok");
  } else if (ev.type === "tool_failed") {
    console.log("FAILED:", ev.error);
  }
});

const result = await run.wait();
console.log(`\nDeck: ${result.deck.title}`);
console.log(`Slides: ${result.deck.slides.length} · ${result.versionLabel}`);
console.log(result.summary);

const exported = await exp.exportDeckToArrayBuffer(result.deck, {
  filename: path.basename(outPath),
});
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(exported.data));
console.log(`\nWrote ${outPath} (${Buffer.from(exported.data).byteLength} bytes)`);
console.log(
  `Export: nativeCoverage=${Math.round((exported.report.nativeCoverage || 0) * 100)}% degradations=${exported.report.degradations?.length || 0}`,
);
