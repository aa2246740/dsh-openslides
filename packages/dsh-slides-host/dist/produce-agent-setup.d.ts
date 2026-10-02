import type { Context } from "@deepseek-ai/cordis";
import { type AgentSetup, type ModelSelection, type ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRuntime } from "@deepseek-ai/dsh-tools";
import { type SliceToolDeps } from "./tools.js";
import { type SlidesAgentPlaneDeps } from "./agent-plane.js";
/** Keep Agent-owned tools on the same provider/model as its mutable live selection. */
export declare function bindToolProviderToModelSelection(deps: SliceToolDeps, selection: ModelSelectionRef, resolveProvider: (selected: ModelSelection) => SliceToolDeps["provider"]): SliceToolDeps;
/**
 * Product tools that write `media/` for PPTD.
 * Grok search and conversational image generation are dsh-oauth native hosted
 * tools (`{ type: "web_search" }`, `{ type: "x_search" }`, `{ type: "image_generation" }`).
 * Do not own-layer-register function `web_search` — that fights the plugin and
 * previously required a host-forced sidecar that aborted the generate.
 */
export declare function hostedProduceToolDefinitions(deps: SliceToolDeps): ToolDefinition[];
export declare function registerHostedProduceTools(tools: ToolRuntime, deps: SliceToolDeps): () => void;
/**
 * Wrap the assemble waterfall as the outermost listener (`prepend`).
 * Strip leaked function-calling `web_search` so dsh-oauth can attach hosted
 * `{ type: "web_search" }` / `{ type: "x_search" }` / `{ type: "image_generation" }`.
 * Do not delete the native-tools guidance sentence.
 *
 * The listener stays tagged to the caller's scope — never `global: true` — so
 * a produce agent's assembly patch can no longer leak into every other agent's
 * assembled model request. Install on the `slides` preset generation scope
 * (see `attachSlidesAgentPlane`) to cover every bound agent.
 */
export declare function attachProduceAssemblePatch(ctx: Context, allowed?: () => ReadonlySet<string>): () => void;
/**
 * Produce create/resume setup. Apiproxy mounts presets; Hub `/api/generate`
 * did not, so the complete slides persona never applied and global `web_search`
 * was name-denied as a DSH native tool.
 */
export declare function createSlidesProduceSetup(hostCtx: Context, deps: SlidesAgentPlaneDeps, modelSelection?: ModelSelectionRef, planeDeps?: SlidesAgentPlaneDeps): AgentSetup;
//# sourceMappingURL=produce-agent-setup.d.ts.map