import type { CapabilitySnapshot, InspectCapabilitiesInput, ModelInputModality } from "./types.js";
/** Same id as dsh-oauth-login / Hub connection.providerId. */
export declare const GROK_PROVIDER_ID: "pi-xai";
/** Grok imagine credentials bound into process.env must not look like a MiniMax image port. */
export declare function envLooksLikeGrokImagine(env: NodeJS.ProcessEnv): boolean;
export declare function inspectCapabilities(envOrInput?: NodeJS.ProcessEnv | InspectCapabilitiesInput): CapabilitySnapshot;
export declare function inspectProjectCapabilities(projectRoot: string, env?: NodeJS.ProcessEnv): CapabilitySnapshot;
/**
 * Write the Hub session provider onto disk SSOT so inspect_capabilities,
 * domain-hands ports, and Hub chips stay one object. Missing binding files
 * are left alone; createAgent / presentation.open still mint them.
 */
export declare function persistPresentationRunProvider(projectRoot: string, provider: {
    readonly providerId: string;
    readonly modelId: string;
    readonly ready?: boolean;
    readonly modelInputModalities?: readonly ModelInputModality[];
}): boolean;
/** MiniMax text is not a visual review. Pass only if a vision path is actually on. */
export declare function visualReviewIsClaimable(envOrInput?: NodeJS.ProcessEnv | InspectCapabilitiesInput): boolean;
export declare function hostedProduceToolNames(snapshot: CapabilitySnapshot): readonly string[];
//# sourceMappingURL=capabilities.d.ts.map