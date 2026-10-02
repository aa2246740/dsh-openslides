#!/usr/bin/env node
/**
 * Refresh the OpenRouter model roster from OpenRouter's live catalog.
 *
 *   node scripts/sync-openrouter-models.mjs            # free models + curated flagships
 *   node scripts/sync-openrouter-models.mjs --all      # every text model with >=32k context
 *   node scripts/sync-openrouter-models.mjs --filter '^anthropic/'
 *
 * Writes three places that must agree:
 *   1. <home>/slides-providers.local.json  — durable operator provider
 *   2. <home>/settings.yaml                — the live kernel route (file is watched)
 *   3. the product roster row              — POST /slides/providers, so the picker updates
 * Never prints or stores a key; the key stays in credentials/openrouter.key.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const HOST = process.env.SLIDES_HOST || "http://127.0.0.1:13081";
const HOME = path.resolve(process.env.SLIDES_QA_HOME || path.join(process.cwd(), ".dsh/home-editor-qa"));
const REPO = path.resolve(process.cwd());
if (!HOME.startsWith(`${REPO}${path.sep}`)) {
  throw new Error(`refusing to write a provider home outside the repo: ${HOME}`);
}
const args = new Set(process.argv.slice(2));
const filterArg = process.argv.find((a) => a.startsWith("--filter="))?.slice("--filter=".length)
  || (args.has("--filter") ? process.argv[process.argv.indexOf("--filter") + 1] : "");

const CURATED = [
  "stealth/union-alpha",
  "anthropic/claude-sonnet-4.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5.1-mini",
  "google/gemini-2.5-pro", "google/gemini-2.5-flash", "deepseek/deepseek-v3.2", "deepseek/deepseek-chat",
  "qwen/qwen3-235b-a22b", "z-ai/glm-4.6", "x-ai/grok-4", "moonshotai/kimi-k2", "minimax/minimax-m3",
];

const catalog = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20000) })
  .then((r) => r.json());
const rows = catalog?.data || [];
if (!rows.length) throw new Error("OpenRouter returned no models");

const modalities = (row) => ((row.architecture?.input_modalities) || []).filter((m) => m === "text" || m === "image");
// Deck generation is entirely tool calls, so a model without tool support can
// only fail at the first write_page. Keep it out of the roster.
const supportsTools = (row) => (row.supported_parameters || []).includes("tools");
const usable = rows.filter((row) =>
  modalities(row).includes("text") && (row.context_length || 0) >= 32000 && supportsTools(row));

let selected;
if (filterArg) {
  const re = new RegExp(filterArg);
  selected = usable.filter((row) => re.test(row.id));
} else if (args.has("--all")) {
  selected = usable;
} else {
  const byId = new Map(usable.map((row) => [row.id, row]));
  const free = usable
    .filter((row) => row.id.endsWith(":free"))
    .sort((a, b) => (b.context_length || 0) - (a.context_length || 0) || a.id.localeCompare(b.id));
  selected = [...free, ...CURATED.map((id) => byId.get(id)).filter(Boolean)];
}
selected = [...new Map(selected.map((row) => [row.id, row])).values()];
if (!selected.length) throw new Error("selection is empty; relax the filter");

const models = selected.map((row) => ({
  id: row.id,
  name: row.name || row.id,
  input: modalities(row),
  contextWindow: row.context_length || 32768,
  maxTokens: Math.max(1024, Math.min(row.top_provider?.max_completion_tokens || 8192, row.context_length || 32768)),
  // Per model, because OpenRouter mixes reasoning and non-reasoning routes and
  // the kernel validates the effort against the model it resolved: a model that
  // supports none must say so, or the picker cannot hide it for that one model.
  reasoningEfforts: (row.supported_parameters || []).includes("reasoning")
    ? { low: "low", medium: "medium", high: "high" }
    : false,
}));

const profile = {
  id: "openrouter",
  displayName: "OpenRouter",
  apiKeyEnv: "OPENROUTER_API_KEY",
  api: "openai-completions",
  baseURL: "https://openrouter.ai/api/v1",
  models,
};

// 1. durable operator provider
const extrasFile = path.join(HOME, "slides-providers.local.json");
const extras = fs.existsSync(extrasFile) ? JSON.parse(fs.readFileSync(extrasFile, "utf8")) : [];
if (!Array.isArray(extras)) throw new Error("slides-providers.local.json must be an array");
fs.writeFileSync(extrasFile, `${JSON.stringify([...extras.filter((r) => r?.id !== "openrouter"), profile], null, 2)}\n`);

// 2. live kernel route
const settingsFile = path.join(HOME, "settings.yaml");
const settings = YAML.parse(fs.readFileSync(settingsFile, "utf8")) ?? {};
settings["llm-pi-ai"] = settings["llm-pi-ai"] ?? {};
settings["llm-pi-ai"].providers = settings["llm-pi-ai"].providers ?? {};
settings["llm-pi-ai"].providers.openrouter = profile;
fs.writeFileSync(settingsFile, YAML.stringify(settings));

// 3. product roster row (same shape the hub's custom provider form posts)
const res = await fetch(`${HOST}/slides/providers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: "openrouter", name: "OpenRouter", apiKeyEnv: "OPENROUTER_API_KEY",
    api: "openai-completions", baseURL: "https://openrouter.ai/api/v1",
    models: models.map((m) => m.id),
  }),
});
const payload = await res.json();
const row = (payload.providers || []).find((p) => p.id === "openrouter");

console.log(JSON.stringify({
  catalogTotal: rows.length,
  selectable: usable.length,
  roster: models.length,
  free: models.filter((m) => m.id.endsWith(":free")).length,
  rosterStatus: res.status,
  rosterReady: row?.ready,
  sample: models.slice(0, 5).map((m) => m.id),
}, null, 2));
