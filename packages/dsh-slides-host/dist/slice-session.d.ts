import type { DesignDirective, SliceSessionBinding, SliceSessionSnapshot } from "./protocol.js";
export declare function bindingPath(projectRoot: string): string;
/**
 * Folder slug from a deck title.
 * Keep CJK so 勾股定理 stays 勾股定理. Never turn a²+b²=c² into a-b-c, and never
 * keep academic/paper-white-courseware from a brief that names a template it forbids.
 */
export declare function slugTitle(title: string): string;
/** Folder/display title. Do not slug the whole brief (it may name a template it forbids). */
export declare function deckTitleFromBrief(brief: string): string;
/** Inspect/chrome title. Do not surface a leaked “不要做成课件模板” brief as the deck name. */
export declare function displayDeckTitle(yamlTitle: string, brief: string): string;
export declare class SliceSessionStore {
    private readonly workspaceRoot;
    /** In-memory session→binding index; populated lazily and kept in sync on writes. */
    private bindings?;
    constructor(workspaceRoot: string);
    slicesRoot(): string;
    rebuild(): Map<string, SliceSessionBinding>;
    private index;
    bindingFor(dshSessionId: string): SliceSessionBinding | undefined;
    resolveRoot(binding: SliceSessionBinding): string;
    openProject(input: {
        dshSessionId: string;
        title: string;
        design: DesignDirective;
        provider: {
            providerId: string;
            modelId: string;
        };
        size?: readonly [number, number];
    }): {
        binding: SliceSessionBinding;
        created: boolean;
    };
    updateProvider(dshSessionId: string, provider: {
        providerId: string;
        modelId: string;
    }): void;
    inspect(dshSessionId: string): SliceSessionSnapshot;
    private derivePhase;
}
type RevisionFact = {
    type: "page.revision-committed";
    pageId: string;
    revision: number;
    pageSha256: string;
};
export declare function pickRasterFile(files: string[], pageId: string): string | undefined;
/** Exact page raster for GET /slides/raster/:sessionId/:pageId. Do not fall back to cover. */
export declare function pickRequestedRasterFile(files: string[], pageId: string): string | undefined;
export declare function pickCoverRevision(facts: ReadonlyArray<{
    type: string;
    pageId?: string;
    revision?: number;
    pageSha256?: string;
}>): RevisionFact | undefined;
export declare function yamlExistsForPage(projectRoot: string, pageId: string): boolean;
export {};
//# sourceMappingURL=slice-session.d.ts.map