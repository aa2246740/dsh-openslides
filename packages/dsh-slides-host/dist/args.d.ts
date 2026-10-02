import type { XaiLoginSnapshot } from "./oauth-login.js";
import { type SlidesModelCatalog, type RuntimeModelCatalog } from "./local-models.js";
/** Models often wrap the plan as `{ items: [...] }` or MiniMax `{ items: { item: T } }`. */
export declare function coerceSlidePlan(raw: unknown): unknown[];
export declare const SLIDES_LLM_PROVIDER: "minimax-cn";
export declare const SLIDES_LLM_DEFAULT_MODEL: "MiniMax-M3";
export declare const SLIDES_LLM_FALLBACK_MODEL: "MiniMax-M2.7";
/** @deprecated Product generate is no longer MiniMax-only. Kept for old callers. */
export declare const SLIDES_LLM_ALLOWED_MODELS: readonly ["MiniMax-M3", "MiniMax-M2.7"];
export declare const SLIDES_LLM_API_KEY_ENV: "MINIMAX_CN_API_KEY";
export declare const SLIDES_LLM_CN_HOST: "api.minimaxi.com";
/** Personal Cloud Agent secret name (no underscore). Same key as MINIMAX_CN_API_KEY. */
export declare const SLIDES_LLM_CN_KEY_ENV_CLOUD: "MINIMAXCN_API_KEY";
export declare const SLIDES_LLM_CN_KEY_ENV_ALIAS: "MINIMAX_API_KEY";
export declare const OPENROUTER_PROVIDER: "openrouter";
export declare const OPENROUTER_API_KEY_ENV: "OPENROUTER_API_KEY";
export declare const OPENROUTER_FREE_API_KEY_ENV: "OPENROUTER_ONLYUSE_FREEMODEL_API_KEY";
export declare const OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1";
export declare const OPENROUTER_MINIMAX_FREE_MODEL: "minimax/minimax-m3:free";
export declare const OPENROUTER_MINIMAX_FREE_FALLBACK_MODEL: "minimax/minimax-m2.7:free";
export declare const MINIMAX_CN_KEY_ENV_NAMES: readonly ["MINIMAX_CN_API_KEY", "MINIMAXCN_API_KEY", "MINIMAX_API_KEY"];
export type SlidesLlmModel = string;
export type SlidesLlmRoute = {
    readonly provider: string;
    readonly model: string;
    readonly nativeTools?: true;
};
export type ResolveSlidesLlmRouteOpts = {
    readonly xai?: XaiLoginSnapshot;
    readonly home?: string;
    readonly catalog?: SlidesModelCatalog;
    /** Exact live adapter roster, supplied only by the shared Harness runtime. */
    readonly managedCatalog?: RuntimeModelCatalog;
    readonly provider?: string;
    readonly model?: string;
};
export type AgentGenerateOptions = {
    readonly provider: string;
    readonly model: string;
};
export declare function agentOptionsForRoute(route: SlidesLlmRoute): AgentGenerateOptions;
/** Process-local generate route flags. Failover no longer prefers OpenRouter free. */
export declare const generateRouteState: {
    minimaxCnAuthFailed: boolean;
    openrouterHardFailed: boolean;
    grokFailed: boolean;
};
export declare function resetGenerateRouteState(): void;
export declare function markGrokFailed(): void;
export declare function markMinimaxCnAuthFailed(): void;
export declare function markOpenRouterHardFailed(): void;
export declare class RejectedGenerateModelError extends Error {
    readonly name = "RejectedGenerateModelError";
    constructor(detail: string);
}
export declare function isForbiddenGenerateRoute(provider: string, model?: string): boolean;
export declare function resolveSlidesLlmRoute(env?: NodeJS.ProcessEnv, opts?: ResolveSlidesLlmRouteOpts): SlidesLlmRoute;
/** First nonempty MiniMax China key: MINIMAX_CN_API_KEY, MINIMAXCN_API_KEY, MINIMAX_API_KEY. */
export declare function readMinimaxCnKey(env?: NodeJS.ProcessEnv): string;
export declare function bindMinimaxCnKey(env?: NodeJS.ProcessEnv): void;
export declare function minimaxCnKeyPresent(env?: NodeJS.ProcessEnv): boolean;
export declare function openrouterKeyPresent(env?: NodeJS.ProcessEnv): boolean;
export declare function modelForRoute(route: SlidesLlmRoute, requested?: string): string;
export declare const MINIMAX_GENERATE_ENV_NAMES: readonly ["MINIMAX_CN_API_KEY", "MINIMAXCN_API_KEY", "MINIMAX_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_ONLYUSE_FREEMODEL_API_KEY", "AMD_API_KEY", "OP_CUSTOM_API_KEY", "SLIDESTUDIO_LLM_BASE_URL", "SLIDESTUDIO_LLM_API_KEY", "SLIDESTUDIO_LLM_MODEL", "SLIDESTUDIO_LLM_PROVIDER"];
export declare function assertSlidesGenerateReady(env?: NodeJS.ProcessEnv, opts?: ResolveSlidesLlmRouteOpts): SlidesLlmRoute;
/** @deprecated Use assertSlidesGenerateReady. */
export declare function assertMinimaxCnGenerateReady(env?: NodeJS.ProcessEnv): SlidesLlmRoute;
//# sourceMappingURL=args.d.ts.map