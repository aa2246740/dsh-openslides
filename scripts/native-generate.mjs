#!/usr/bin/env node
/**
 * Development/fixture CLI: explicitly selected brain → PPTD project → optional PPTX.
 * Not the product path. Hub generate is DSH POST /slides/sessions.
 * Usage:
 *   node scripts/native-generate.mjs "brief" -o ./output/demo
 *   --design consulting/pine-green-strategy
 *   --category analysis-decision
 *   --brain playbook|mock|pi|agent
 * LLM (optional, OOP-20): SLIDESTUDIO_LLM_BASE_URL / _API_KEY / _MODEL
 * Pi RPC (optional): SLIDESTUDIO_PI_BIN / _MODEL / _PROVIDER / _TIMEOUT_MS
 *   --pi-model openai-codex/gpt-5.3-codex-spark
 */
import path from "node:path";
import {
  runGenerateAsync,
  mockBrain,
  createPlaybookBrain,
  createAgentBrain,
  createPiBrain,
  createLlmPort,
  llmConfigFromEnv,
  createHttpResearchPort,
  researchConfigFromEnv,
  createImagePort,
  createImageSearchPort,
  imageSearchConfigured,
  createPageRasterPort,
  detectCapabilities,
} from "../packages/agent-harness/dist/index.js";

const args = process.argv.slice(2);
let out = "./output/native-demo";
let brief = "示例：经营复盘与下周动作";
let doExport = true;
let brainName = "playbook";
let design = "consulting/pine-green-strategy";
let category = "analysis-decision";
let piModel;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" && args[i + 1]) {
    out = args[++i];
  } else if (args[i] === "--no-export") {
    doExport = false;
  } else if (args[i] === "--export") {
    doExport = true;
  } else if (args[i] === "--brain" && args[i + 1]) {
    brainName = args[++i];
  } else if (args[i] === "--design" && args[i + 1]) {
    design = args[++i];
  } else if (args[i] === "--category" && args[i + 1]) {
    category = args[++i];
  } else if (args[i] === "--pi-model" && args[i + 1]) {
    piModel = args[++i];
  } else if (!args[i].startsWith("-")) {
    brief = args[i];
  }
}

let brain;
let llmUsed = false;
const researchCfg = researchConfigFromEnv();
const research = researchCfg ? createHttpResearchPort(researchCfg) : undefined;
if (brainName === "mock") {
  brain = mockBrain;
} else if (brainName === "playbook") {
  const cfg = llmConfigFromEnv();
  if (cfg) {
    llmUsed = true;
    const raster = createPageRasterPort();
    brain = createAgentBrain({
      designSystemId: design,
      categoryId: category,
      llm: createLlmPort(cfg),
      research,
      image: createImagePort(),
      imageSearch: imageSearchConfigured() ? createImageSearchPort() : undefined,
      raster,
      capability: detectCapabilities({
        rasterAvailable: raster.available,
        runtimeKind: "agent-loop",
      }),
    });
  } else {
    brain = createPlaybookBrain({
      designSystemId: design,
      categoryId: category,
    });
  }
} else if (brainName === "agent") {
  const cfg = llmConfigFromEnv();
  if (!cfg) {
    console.error("agent brain needs SLIDESTUDIO_LLM_BASE_URL");
    process.exit(1);
  }
  llmUsed = true;
  const raster = createPageRasterPort();
  brain = createAgentBrain({
    designSystemId: design,
    categoryId: category,
    llm: createLlmPort(cfg),
    research,
    image: createImagePort(),
    imageSearch: imageSearchConfigured() ? createImageSearchPort() : undefined,
    raster,
    capability: detectCapabilities({
      rasterAvailable: raster.available,
      runtimeKind: "agent-loop",
    }),
  });
} else if (brainName === "pi") {
  let model = piModel;
  let provider;
  if (model && model.includes("/")) {
    const slash = model.indexOf("/");
    provider = model.slice(0, slash);
    model = model.slice(slash + 1);
  }
  brain = createPiBrain({
    designSystemId: design,
    categoryId: category,
    model,
    provider,
    fallback: false,
    editorBaseUrl: process.env.SLIDESTUDIO_EDITOR_URL,
  });
} else {
  console.error(`unknown --brain ${brainName} (use playbook|agent|mock|pi)`);
  process.exit(2);
}

const root = path.resolve(out);
const result = await runGenerateAsync({
  projectRoot: root,
  brief,
  brain,
  exportPptx: doExport,
});
console.log(
  JSON.stringify(
    {
      status: result.status,
      brain: brainName,
      design,
      category,
      llmUsed,
      usedPi: Boolean(brain?.usedPi),
      composeSource: result.composeSource,
      fallbackReason: result.fallbackReason,
      steps: result.steps,
      versionLabel: result.versionLabel,
      pptxPath: result.pptxPath,
      exportBytes: result.exportBytes,
    },
    null,
    2,
  ),
);
if (result.status !== "ready") process.exit(1);
