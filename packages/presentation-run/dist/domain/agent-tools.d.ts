import { type ComposeDeck } from "./compose-ir.js";
import { type ImagePort } from "./image-port.js";
import type { ImageSearchPort } from "./image-search-port.js";
import type { GrokWebSearchResult } from "./grok-hosted.js";
import { type LayoutReview, type TodoExhibitKind } from "./layout-qa.js";
import { type PageRasterPort, type PageRasterResult } from "./page-raster.js";
import type { PlaybookBundle } from "./playbook.js";
import { type SkillDeckInput, type SkillPageInput } from "./skill-pages.js";
type LlmToolSpec = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};
export declare const GENERATE_TOOLS: LlmToolSpec[];
export type AgentTodo = {
    pageId?: string;
    title: string;
    layoutFamily?: string;
    note?: string;
    /** Optional only for loading outlines created before the exhibit contract. */
    exhibits?: TodoExhibitKind[];
};
export type ResearchResult = {
    source: "attachment" | "classroom_common" | "intranet" | "pi-xai-hosted" | "none";
    citations: string[];
    facts: string[];
    note: string;
    gap?: string;
};
export declare function researchExecution(result: ResearchResult): ToolExecution;
export type ToolExecution = {
    name: string;
    ok: boolean;
    summary: string;
    detail: string;
    payload: unknown;
};
export type AgentToolState = {
    brief: string;
    requestedPageCount?: number;
    playbook: PlaybookBundle;
    referenceText?: string;
    todos: AgentTodo[];
    researchNotes: ResearchResult[];
    deck?: ComposeDeck;
    skillDeck?: SkillDeckInput;
    writtenPages?: SkillPageInput[];
    projectRoot?: string;
    image?: ImagePort;
    imageSearch?: ImageSearchPort;
    webSearch?: {
        search: (query: string) => Promise<GrokWebSearchResult>;
    };
    raster?: PageRasterPort;
    lastReview?: LayoutReview;
    lastRaster?: PageRasterResult & {
        pageId?: string;
        src?: string;
    };
    userExplicitPack?: boolean;
    /** Run ledger active: compose must not fall back to role+bullets IR. */
    strictLedger?: boolean;
};
/**
 * Persist by page id onto the matching file. Never remap by index, first
 * `*_final`, or leftover last. Never let a staler skillDeck wipe writtenPages.
 * Unmatched pages with copy append as `pages/{persistPageKey(id)}.page`.
 * Empty pages are not appended. A newly created project has zero composed
 * pages; the first write_page lists the agent id. Host does not paint leftover YAML.
 */
/**
 * Persist only the pages mutated by the current tool call when a scope is
 * supplied. Replaying hands-state's historical writtenPages would otherwise
 * overwrite an editor change to p1 while DSH is writing an unrelated p2.
 */
export declare function persistWrittenPages(state: AgentToolState, pageScope?: readonly SkillPageInput[], opts?: {
    expectedPageSha256?: string;
}): {
    ok: true;
} | {
    ok: false;
    error: "page_revision_required" | "page_revision_conflict" | "review_scope_violation";
    detail?: string;
    pageId: string;
    expectedPageSha256?: string;
    actualPageSha256?: string;
};
/** Whether the active editor lock is a full-deck rewrite. */
export declare function rewriteLockActive(projectRoot: string): boolean;
export declare function parseToolArgs(raw: string): Record<string, unknown>;
export declare function runResearch(query: string, brief: string, referenceText?: string): ResearchResult;
export declare function executeGenerateTool(name: string, args: Record<string, unknown>, state: AgentToolState): ToolExecution;
export declare function toolStepMeta(name: string): {
    tool: string;
    label: string;
};
export declare function executeGenerateToolAsync(name: string, args: Record<string, unknown>, state: AgentToolState): Promise<ToolExecution>;
export {};
//# sourceMappingURL=agent-tools.d.ts.map