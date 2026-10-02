/**
 * Grok hosted `web_search` is a real produce tool/call, not assistant prose.
 * Official dsh-tool-web (and grok-4.6) take `queries: string[]`, not `query`.
 */
export declare const MISSING_HOSTED_WEB_SEARCH_RECEIPT = "web_search receipt missing; research.via is pi-xai-hosted";
export declare const EMPTY_HOSTED_WEB_SEARCH = "web_search returned no facts or citations";
/** User brief as `queries[]` for host-forced search. Not the director addendum. */
export declare const USER_BRIEF_QUERY_MAX_CHARS = 400;
export declare function briefNeedsLiveWebSearch(brief: string): boolean;
export declare function webSearchQueriesFromArgs(args: Record<string, unknown>): string[];
/** grok-4.6 calls official `web_search` when the schema has `queries[]`. */
export declare function toolSchemaHasQueriesArray(parameters: unknown): boolean;
export type GrokFacingTool = {
    readonly name?: string;
    readonly parameters?: unknown;
};
export type HostedWebSearchCall = {
    readonly name: "web_search";
    readonly args: {
        readonly queries: string[];
    };
};
export declare function liveWebSearchQueryForBrief(brief: string): string;
/** One-item `queries[]` from the user generate prompt. */
export declare function queriesFromUserBrief(brief: string): string[];
export declare function hostedWebSearchHasEvidence(payload: {
    readonly facts?: unknown;
    readonly citations?: unknown;
}): boolean;
/**
 * What grok-4.6 issues as a first tool/call for a hosted-research facts brief.
 * A `query`-only schema returns undefined — that is the 7ea4f151 miss.
 */
export declare function grok46WouldCallWebSearch(tools: readonly GrokFacingTool[], brief: string): HostedWebSearchCall | undefined;
export declare function ledgerHasSuccessfulWebSearch(ledger: {
    readonly facts: readonly {
        readonly type?: string;
        readonly ok?: boolean;
    }[];
} | undefined): boolean;
/**
 * Grok research is dsh-oauth native hosted search on the produce request,
 * not a function-call receipt. A missing `web_search` tool/call must not
 * block write_page or compose_deck (session 3612938f).
 */
export declare function hostedResearchNeedsWebSearchReceipt(_research: {
    readonly configured: boolean;
    readonly via: string;
}): boolean;
//# sourceMappingURL=hosted-web-search.d.ts.map