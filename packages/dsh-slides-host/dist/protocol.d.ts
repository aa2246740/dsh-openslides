export declare const SLICE_TOOL_NAMES: readonly ["open_project", "inspect_capabilities", "list_references", "read_reference", "commit_design", "write_todo", "read_page", "edit_elements", "edit_page_background", "delete_pages", "reorder_pages", "update_deck", "write_page", "render_page", "review_page", "review_pages", "compose_deck", "export_deck", "web_search", "search_image", "generate_image"];
export type SliceToolName = (typeof SLICE_TOOL_NAMES)[number];
export type DesignDirective = {
    readonly kind: "self-directed";
} | {
    readonly kind: "explicit-style";
    readonly designSystemId: string;
};
export type SliceSessionBinding = {
    readonly version: 1;
    readonly dshSessionId: string;
    readonly projectRoot: string;
    readonly design: DesignDirective;
    readonly provider: {
        readonly providerId: string;
        readonly modelId: string;
    };
    readonly createdAt: string;
};
export type ProjectSummary = {
    readonly title: string;
    readonly pageCount: number;
    readonly deckSha256: string;
};
export type PageEvidence = {
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
    readonly rasterSha256: string;
    readonly rasterUrl: string;
    readonly reviewVerdict: "pass" | "revise" | "missing";
    readonly layoutStatus: "pass" | "fail" | "unavailable";
};
export type SliceError = {
    readonly code: string;
    readonly detail: string;
    readonly attemptId?: string;
    readonly recovering?: boolean;
};
export type SlicePhase = {
    readonly kind: "awaiting-project";
} | {
    readonly kind: "generating";
    readonly lastTool: string;
} | {
    readonly kind: "page-ready";
    readonly cover: PageEvidence;
} | {
    readonly kind: "complete";
    readonly cover: PageEvidence;
    readonly pageCount: number;
} | {
    readonly kind: "paused";
    readonly detail: string;
} | {
    readonly kind: "failed";
    readonly error: SliceError;
};
export type RateLimitWait = {
    readonly attempt: number;
    readonly waitMs: number;
    readonly nextRetryAt: number;
    readonly code: string;
};
export type SliceSessionSnapshot = {
    readonly binding: SliceSessionBinding;
    readonly project: ProjectSummary;
    readonly phase: SlicePhase;
    readonly rateLimitWait?: RateLimitWait;
};
type WritePageRenderEvidence = {
    readonly layoutStatus?: "pass" | "fail" | "unavailable";
    readonly layoutIssues?: readonly unknown[];
    readonly renderNote?: string;
};
export type WritePageOutcome = ({
    readonly outcome: "written";
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
    readonly fontNotes?: readonly string[];
} & WritePageRenderEvidence) | ({
    readonly outcome: "skipped-identical";
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
} & WritePageRenderEvidence) | ({
    readonly outcome: "replayed";
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
} & WritePageRenderEvidence) | {
    readonly outcome: "conflict";
    readonly toolCallId: string;
    readonly detail: string;
} | {
    readonly outcome: "revise-requires-change";
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
} | {
    readonly outcome: "rejected";
    readonly detail: string;
    readonly error?: string;
    readonly painted?: false;
};
export type WritePageDecision = {
    readonly action: "write";
    readonly pageId: string;
    readonly pageSha256: string;
} | {
    readonly action: "skip";
    readonly outcome: Extract<WritePageOutcome, {
        outcome: "skipped-identical";
    }>;
} | {
    readonly action: "reject";
    readonly outcome: Extract<WritePageOutcome, {
        outcome: "revise-requires-change" | "rejected";
    }>;
};
export type SliceRuntimePayload = {
    readonly brief: string;
    readonly design: DesignDirective;
    readonly editorBaseUrl: string;
    readonly strictExecution: true;
};
export {};
//# sourceMappingURL=protocol.d.ts.map