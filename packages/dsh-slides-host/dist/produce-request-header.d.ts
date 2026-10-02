/**
 * Live produce `request/header` serialization.
 *
 * Grok search and conversational image generation are dsh-oauth native hosted
 * tools on the provider request. Do not re-inject function-calling `web_search`
 * or delete the native-tools guidance — that fight caused host-forced sidecar
 * search (session 3612938f: `hosted web_search failed: This operation was aborted`).
 */
import { type EpochHeader } from "@deepseek-ai/dsh-session";
import type { LlmCallConfig, ToolSchema } from "@deepseek-ai/dsh-llm";
export declare const NATIVE_WEB_FORBID_SENTENCE = "Do not call web_search or web_fetch \u2014 those DSH tools are not available on this route.";
export declare const PRODUCE_WEB_SEARCH_NAME = "web_search";
export declare const PRODUCE_SEARCH_IMAGE_NAME = "search_image";
export declare const PRODUCE_GENERATE_IMAGE_NAME = "generate_image";
export declare const CAPABILITY_FILTERED_PRODUCE_TOOL_NAMES: readonly ["edit_elements", "edit_page_background", "delete_pages", "reorder_pages", "update_deck", "review_page", "search_image", "generate_image"];
export declare const PRODUCE_WEB_SEARCH_DESCRIPTION = "Search the web for current information. Provide 1\u20134 queries in the required queries array. Use a one-item array for a single search. Returns facts and source URLs. First-class produce tool via xAI when inspect_capabilities.research.configured. Assistant prose is not a search.";
/** Official dsh-tool-web / grok-4.6 shape: `queries[]`, not a lone `query` string. */
export declare const PRODUCE_WEB_SEARCH_SCHEMA: ToolSchema;
export type ProducePromptSection = {
    name: string;
    text: string;
};
export type ProduceAssembly = {
    sections: ProducePromptSection[];
    contexts?: Array<{
        name: string;
        text: string;
    }>;
    tools: ToolSchema[];
    variables?: Record<string, string | undefined>;
};
export declare function stripNativeWebForbid(text: string): string;
/** Drop leaked function-calling `web_search` so dsh-oauth hosted tools own the route. */
export declare function stripProductWebSearchTools(tools: readonly ToolSchema[]): ToolSchema[];
export declare function filterUnavailableProduceTools(tools: readonly ToolSchema[], allowed?: ReadonlySet<string>): ToolSchema[];
export declare function patchProduceAssembly<T extends {
    sections: readonly ProducePromptSection[];
    tools: readonly ToolSchema[];
}>(assembly: T, allowed?: ReadonlySet<string>): T;
export declare function renderProduceSystem(assembly: ProduceAssembly): string;
export type ProduceRequestHeaderConfig = Pick<LlmCallConfig, "provider" | "model"> & Partial<LlmCallConfig>;
/**
 * Same JSON shape the agent loop appends as `request/header` (`canonicalHeader`).
 */
export declare function serializeProduceRequestHeader(assembly: ProduceAssembly, config: ProduceRequestHeaderConfig): EpochHeader;
export declare function requestHeaderHasWebSearch(header: EpochHeader): boolean;
export declare function assemblyForbidsNativeWeb(assembly: ProduceAssembly): boolean;
//# sourceMappingURL=produce-request-header.d.ts.map