import { type ToolExecution } from "./agent-tools.js";
export declare const DOMAIN_TOOL_NAMES: readonly ["think", "list_references", "read_reference", "write_todo", "write_page", "render_page", "review_page", "review_pages", "compose_deck", "delete_pages", "reorder_pages", "update_deck"];
export type DomainToolName = (typeof DOMAIN_TOOL_NAMES)[number];
export type DomainRuntime = {
    brief: string;
    categoryId?: string;
    designSystemId?: string;
    editorBaseUrl?: string;
    designDirection?: "self-directed" | "user-design" | "preset";
    strictExecution?: boolean;
};
export declare function writeDomainRuntime(root: string, runtime: DomainRuntime): void;
export declare function hasExplicitUserDesign(brief: string): boolean;
export declare function initializeRunLedger(root: string): void;
export declare function runDomainHand(name: string, args: Record<string, unknown>, root: string): Promise<ToolExecution>;
export type SkillStackEvidence = {
    ok: boolean;
    outline: boolean;
    pageWrites: number;
    renderPages: number;
    renderCoverage: boolean;
    visualOrReview: boolean;
    review: boolean;
    compose: boolean;
    oneShotDump: boolean;
    reason: string;
};
export declare const HANDS_LOG_REL: string;
export declare function skillStackFromHandsLog(root: string): SkillStackEvidence;
export declare function mergeSkillStackEvidence(timed: Array<{
    event: string;
}>, root?: string, extra?: {
    compose?: boolean;
}): SkillStackEvidence;
/** `--skill` flags vs produce tools that actually executed. */
export declare function skillsExecutionMode(timed: Array<{
    event: string;
}>): "agent-tools" | "flags-only";
export declare function skillStackEvidence(timed: Array<{
    event: string;
}>): SkillStackEvidence;
//# sourceMappingURL=domain-hands.d.ts.map