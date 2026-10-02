/**
 * Hosted xAI produce tools for signed-in Grok (pi-xai).
 * MiniMax / OpenRouter keep env-port search and image URLs; they must not call this.
 */
import type { ImageSearchHit, ImageSearchNone, ImageSearchPort } from "./image-search-port.js";
export declare const XAI_RESPONSES_PATH: "/responses";
export declare const XAI_API_BASE: "https://api.x.ai/v1";
export declare const GROK_SEARCH_MODEL: "grok-4.6";
export type GrokWebSearchResult = {
    readonly query: string;
    readonly text: string;
    readonly facts: readonly string[];
    readonly citations: readonly string[];
    readonly source: "pi-xai-hosted";
};
export type GrokHostedPortConfig = {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly model?: string;
    readonly timeoutMs?: number;
};
export type GrokHostedPortDeps = {
    readonly fetch?: typeof fetch;
    readonly abortSignal?: AbortSignal;
};
export declare function grokWebSearch(query: string, cfg?: GrokHostedPortConfig, deps?: GrokHostedPortDeps, env?: NodeJS.ProcessEnv): Promise<GrokWebSearchResult>;
export declare function createGrokImageSearchPort(cfg?: GrokHostedPortConfig, deps?: GrokHostedPortDeps, env?: NodeJS.ProcessEnv): ImageSearchPort;
export type { ImageSearchHit, ImageSearchNone };
//# sourceMappingURL=grok-hosted.d.ts.map