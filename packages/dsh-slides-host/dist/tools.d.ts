import { type ToolDefinition, type ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { CapabilitySnapshot, ModelInputModality, PresentationRun } from "@open-slidestudio/presentation-run";
import { type WritePageOutcome } from "./protocol.js";
import { SliceSessionStore } from "./slice-session.js";
import type { AgentFaults } from "./agent-fault.js";
export type SliceAttachments = {
    saveImage(input: {
        data: Uint8Array;
        mediaType: "image/png" | "image/jpeg";
        name?: string;
    }): Promise<{
        attachmentId: string;
        mediaType: string;
        bytes: number;
        width: number;
        height: number;
        name?: string;
    }>;
};
export type SliceToolDeps = {
    store: SliceSessionStore;
    presentation: PresentationRun;
    workspaceRoot: string;
    editorBaseUrl: string;
    faults: AgentFaults;
    provider: {
        providerId: string;
        modelId: string;
        ready?: boolean;
        modelInputModalities?: readonly ModelInputModality[];
    };
    reasoningEffort?: string;
    attachments?: SliceAttachments;
    /** Re-bind the live xAI oauth token before hosted generate/search. */
    ensureGrokImageEnv?: () => void;
};
type ToolDeps = SliceToolDeps;
export declare function withProductToolArgumentContract(definition: ToolDefinition): ToolDefinition;
export declare function sliceToolGuard(allowed: ReadonlySet<string>): (exec: {
    name: string;
}) => string | undefined;
export declare function produceToolAllowlist(caps: CapabilitySnapshot): ReadonlySet<string>;
export declare function sessionProduceCapabilities(deps: Pick<ToolDeps, "store" | "provider">, sessionId?: string): CapabilitySnapshot;
export declare function sessionProduceToolAllowlist(deps: Pick<ToolDeps, "store" | "provider">, sessionId?: string): ReadonlySet<string>;
export declare function registerSliceTools(tools: ToolRuntime, deps: ToolDeps, options?: {
    readonly exclude?: ReadonlySet<string>;
}): () => void;
type RenderCommandReceipt = {
    ok: boolean;
    detail: string;
    payload: Record<string, unknown>;
};
export declare function autoRenderWriteOutcome(outcome: Extract<WritePageOutcome, {
    outcome: "written" | "skipped-identical" | "replayed";
}>, pageId: string, render: (pageId: string) => Promise<RenderCommandReceipt>): Promise<WritePageOutcome>;
export declare function formatWritePageOutcome(value: unknown): string;
/**
 * Read the exact, currently persisted PPTD v2 page body for a bound project.
 *
 * This deliberately does not use `replayOrRun`: recording a receipt would turn
 * a read into a filesystem mutation. The returned body is intentionally shaped
 * as a `write_page` baseline (`id`, `pageType`, `elements`, plus every other
 * persisted page field), so an agent can preserve user edits when changing one
 * element instead of reconstructing the entire page from memory.
 */
export declare function readPageFromProject(projectRoot: string, pageId: string): Record<string, unknown>;
/**
 * The editor creates this short-lived lock before asking the agent to revise
 * one selected element. This early check gives the agent a precise conflict;
 * presentation-run repeats the compare-and-swap inside its project write lock.
 */
export declare function aiReviewPageVersionConflict(projectRoot: string, pageId: string, expectedPageSha256: unknown): string | undefined;
export declare function attachPageRasterImage(opts: {
    readonly deps: ToolDeps;
    readonly projectRoot: string;
    readonly visionMode: string;
    readonly pageId: string;
    readonly pngBytes?: Buffer;
    readonly deliveryToken?: string;
    readonly exec: {
        agent?: {
            id: string;
        };
        callId?: string;
        signal: AbortSignal;
    };
}): Promise<Record<string, unknown> | undefined>;
export declare function searchImageTool(deps: ToolDeps): ToolDefinition;
export declare function generateImageTool(deps: ToolDeps): ToolDefinition;
export declare function webSearchTool(deps: ToolDeps): ToolDefinition;
export {};
//# sourceMappingURL=tools.d.ts.map