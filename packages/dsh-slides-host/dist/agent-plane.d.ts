import type { Context } from "@deepseek-ai/cordis";
import type { AssistantQuestions } from "./assistant-questions.js";
import { type SliceToolDeps } from "./tools.js";
export declare const SLIDES_PRESET_ID = "slides";
export type SlidesAgentPlaneDeps = SliceToolDeps & {
    questions?: AssistantQuestions;
};
/**
 * The subset of the `agentPresets` service the plane needs. Accessed through
 * the service (not by importing the registry's module state): a Host can load
 * a second copy of `@deepseek-ai/dsh-agent-preset-registry` for its own
 * bundles, and a module-level `standingMountFor` would then read an empty
 * mount set forever. The service always resolves mounts in its own copy.
 */
export interface AgentPresetProbe {
    composedPreset?: (ctx: Context) => string | undefined;
}
interface AgentLike {
    ctx: Context;
    id?: unknown;
    meta?: {
        agentPreset?: unknown;
    };
    session?: {
        header?: {
            agentPreset?: unknown;
        };
    };
}
interface SessionProjectionProbe {
    stateOf?: (session: unknown, key: string) => string | null | undefined;
}
/**
 * Everything the slides preset exposes to an owning agent: the product tool
 * set plus its guard, the ask_user_question waterfall interceptor, and the
 * produce assemble patch.
 *
 * The registrations are scope-tagged to whatever context installs them:
 * installing on the agent's own scoped context makes them visible only to
 * that agent; a generation scope would work the same way, but only the agent
 * ctx is reachable without the registry's module state. Nothing here is
 * `global: true` — an unrelated agent's tools, question routing and
 * assembled request must stay untouched, including one carrying a stale
 * store binding.
 */
export declare function attachSlidesAgentPlane(ctx: Context, deps: SlidesAgentPlaneDeps): () => void;
export declare function wireSlidesAgentPlane(ctx: Context, deps: SlidesAgentPlaneDeps): void;
export declare function unwireSlidesAgentPlane(ctx: Context): void;
/**
 * Resolve the preset an agent currently stands on. `agentPresets` answers
 * through the registry service's own module, so its view of mounted
 * generations is always current. When the registry service is absent (very
 * old Hosts) fall back to the session projection, then the session/agent
 * header — the creation-time declaration. A persisted store binding is
 * deliberately not consulted: it is not ownership evidence.
 */
export declare function agentPresetId(agent: AgentLike, presets?: AgentPresetProbe | null, projections?: SessionProjectionProbe | null): string | undefined;
/**
 * Wire an agent's own scope when that agent stands on the `slides` preset.
 * Returns false for every other agent — an ordinary, Creator or
 * differently-preset agent never reaches the slides plane, so a persisted
 * store binding by itself can no longer mark ownership.
 */
export declare function wireSlidesAgentPlaneForAgent(agent: AgentLike, deps: SlidesAgentPlaneDeps, presets?: AgentPresetProbe | null, projections?: SessionProjectionProbe | null): boolean;
/**
 * Re-evaluate an agent after an `agent-preset/selected` event: wire the
 * plane when the agent moved onto `slides`, dispose it when it moved away.
 * Returns true when the agent now stands on the slides plane.
 */
export declare function reconcileSlidesAgentPlane(agent: AgentLike, deps: SlidesAgentPlaneDeps, presets?: AgentPresetProbe | null, projections?: SessionProjectionProbe | null): boolean;
export {};
//# sourceMappingURL=agent-plane.d.ts.map